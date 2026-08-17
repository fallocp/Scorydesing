/**
 * Tests for the pure helpers in analyzeCopyBank.ts.
 *
 * These matter more than they look: this is the code that replaces v1's
 * "be diverse" instructions with an explicit assignment. If the deficit math is
 * wrong, the generator silently drifts back to whatever angle it likes.
 */

import { describe, it, expect } from "vitest";

import {
  assignTargetAngles,
  countBy,
  openingOf,
  saturatedOpenings,
  suggestCorridor,
} from "../supabase/functions/_shared/analyzeCopyBank.ts";

describe("openingOf", () => {
  it("toma las dos primeras palabras sin acentos ni mayúsculas", () => {
    expect(openingOf("Décimas que suman todo el año")).toBe("decimas que");
    expect(openingOf("El costo final se define al pagar")).toBe("el costo");
  });

  it("tolera headlines de una palabra", () => {
    expect(openingOf("Hoy")).toBe("hoy");
  });
});

describe("saturatedOpenings", () => {
  it("no marca nada con un banco vacío", () => {
    expect(saturatedOpenings([])).toEqual([]);
  });

  it("marca el arranque que pasa el umbral de conteo", () => {
    const headlines = [
      "El costo final se define al pagar",
      "El costo anual se construye pago a pago",
      "El costo no es solo el tipo de cambio",
      "El costo de pagar también importa",
      "Décimas que suman todo el año",
    ];
    expect(saturatedOpenings(headlines)).toContain("el costo");
    expect(saturatedOpenings(headlines)).not.toContain("decimas que");
  });

  it("no marca un arranque con 3 usos en un banco chico", () => {
    const headlines = ["El costo A", "El costo B", "El costo C"];
    // Under SATURATION_MIN_COUNT of 4.
    expect(saturatedOpenings(headlines)).toEqual([]);
  });
});

describe("assignTargetAngles", () => {
  const quota = {
    tipo_de_cambio_costo_importacion: 20,
    impacto_acumulado: 18,
    segunda_cotizacion: 14,
    diferencias_mercado: 11,
    comparacion_integral: 10,
    margen_importacion: 10,
    costumbre_proveedor: 7,
    simplificacion_cuentas: 7,
    ejemplo_numerico: 3,
  };

  it("sin cuota no asigna nada", () => {
    expect(assignTargetAngles(undefined, {}, 3)).toEqual([]);
  });

  it("con banco vacío sigue el orden de la cuota", () => {
    const out = assignTargetAngles(quota, {}, 3);
    expect(out.map((a) => a.angleTag)).toEqual([
      "tipo_de_cambio_costo_importacion",
      "impacto_acumulado",
      "segunda_cotizacion",
    ]);
    expect(out.every((a) => a.count === 1)).toBe(true);
  });

  it("asigna exactamente la cantidad pedida", () => {
    for (const q of [1, 3, 5, 9, 12]) {
      const out = assignTargetAngles(quota, { impacto_acumulado: 10 }, q);
      const total = out.reduce((a, b) => a + b.count, 0);
      expect(total, `quantity=${q}`).toBe(q);
    }
  });

  it("prioriza el ángulo con mayor déficit, no el de mayor cuota", () => {
    // tipo_de_cambio tiene la cuota más alta (20%) pero está sobre-representado.
    const angleCounts = {
      tipo_de_cambio_costo_importacion: 29,
      segunda_cotizacion: 16,
      comparacion_integral: 13,
      impacto_acumulado: 10,
      margen_importacion: 7,
      simplificacion_cuentas: 7,
      diferencias_mercado: 4,
      ejemplo_numerico: 2,
      costumbre_proveedor: 2,
    };
    const out = assignTargetAngles(quota, angleCounts, 3);
    const tags = out.map((a) => a.angleTag);

    expect(tags).not.toContain("tipo_de_cambio_costo_importacion");
    // impacto_acumulado (11% vs 18%) y diferencias_mercado (4% vs 11%) son los
    // déficits reales del banco medido.
    expect(tags).toContain("impacto_acumulado");
    expect(tags).toContain("diferencias_mercado");
  });

  it("reparte antes de apilar: no repite ángulo si hay otros en déficit", () => {
    const out = assignTargetAngles(quota, {}, 5);
    const unique = new Set(out.map((a) => a.angleTag));
    expect(unique.size).toBe(5);
  });

  it("apila solo cuando ya no hay ángulos en déficit", () => {
    const smallQuota = { a: 50, b: 50 };
    const out = assignTargetAngles(smallQuota, {}, 5);
    expect(out.reduce((s, x) => s + x.count, 0)).toBe(5);
    expect(out.length).toBe(2);
  });

  it("con todo sobre cuota sigue asignando algo", () => {
    // Un solo ángulo domina el banco: nada está en déficit salvo los demás.
    const out = assignTargetAngles({ a: 100 }, { a: 10 }, 2);
    expect(out.reduce((s, x) => s + x.count, 0)).toBe(2);
  });

  /**
   * Una tanda se revisa y se publica completa, así que N ángulos distintos se
   * leen como N ideas y dos copys del mismo ángulo se leen como una idea con una
   * variación.
   *
   * El caso real: el banco de costos tiene 32% en un solo ángulo, así que con la
   * cuota v3 solo 9 de 12 ángulos quedan en déficit. Antes, el décimo espacio de
   * una tanda de 10 repetía el ángulo más atrasado en vez de estrenar uno de los
   * que están sobre cuota.
   */
  it("estrena todos los ángulos antes de repetir, aunque estén sobre cuota", () => {
    const quotaV3 = {
      impacto_acumulado: 15,
      tipo_de_cambio_costo_importacion: 13,
      costo_velocidad: 10,
      simplificacion_cuentas: 10,
      segunda_cotizacion: 9,
      margen_importacion: 9,
      comparacion_integral: 7,
      diferencias_mercado: 7,
      diversificacion_proveedores: 6,
      proteccion_margen: 6,
      costumbre_proveedor: 5,
      ejemplo_numerico: 3,
    };
    // Banco real: tres ángulos sobre cuota, tres ángulos nuevos en cero.
    const banco = {
      tipo_de_cambio_costo_importacion: 29,
      segunda_cotizacion: 16,
      comparacion_integral: 13,
      impacto_acumulado: 10,
      margen_importacion: 7,
      simplificacion_cuentas: 7,
      diferencias_mercado: 4,
      costumbre_proveedor: 2,
      ejemplo_numerico: 2,
    };

    const diez = assignTargetAngles(quotaV3, banco, 10);
    expect(new Set(diez.map((a) => a.angleTag)).size).toBe(10);
    expect(diez.every((a) => a.count === 1)).toBe(true);

    // Con tantos espacios como ángulos, uno de cada uno y ninguno repetido.
    const doce = assignTargetAngles(quotaV3, banco, 12);
    expect(new Set(doce.map((a) => a.angleTag)).size).toBe(12);
    expect(doce.every((a) => a.count === 1)).toBe(true);

    // Recién al pedir más que el número de ángulos se apila.
    const trece = assignTargetAngles(quotaV3, banco, 13);
    expect(trece.reduce((s, x) => s + x.count, 0)).toBe(13);
    expect(new Set(trece.map((a) => a.angleTag)).size).toBe(12);
  });
});

describe("suggestCorridor", () => {
  const quota = {
    china_asia: 30,
    internacional_general: 25,
    industria: 35,
    institucional: 10,
  };
  const available = ["china_asia", "internacional_general", "industria", "institucional"];

  it("sin cuota devuelve null", () => {
    expect(suggestCorridor(undefined, {}, available)).toBeNull();
  });

  it("con banco vacío elige el de mayor cuota", () => {
    expect(suggestCorridor(quota, {}, available)).toBe("industria");
  });

  it("elige el de mayor déficit", () => {
    // industria ya está muy servido; institucional casi no existe.
    const counts = { china_asia: 30, internacional_general: 30, industria: 30, institucional: 0 };
    expect(suggestCorridor(quota, counts, available)).toBe("institucional");
  });

  it("ignora corredores que el kit no tiene", () => {
    const out = suggestCorridor(quota, {}, ["china_asia", "internacional_general"]);
    expect(out).toBe("china_asia");
  });
});

describe("countBy", () => {
  it("ignora nulos y vacíos", () => {
    const rows = [{ a: "x" }, { a: null }, { a: "x" }, { a: undefined }];
    expect(countBy(rows, (r) => r.a as string | null)).toEqual({ x: 2 });
  });
});
