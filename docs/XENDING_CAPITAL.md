# Xending Capital — qué comparte y qué no

Documento de trabajo. Recoge lo que hoy distingue a Xending Capital de Xending dentro de este mismo proyecto, para pulirlo antes de armarle su banco de copys.

La decisión de fondo ya está tomada: **Capital no se separa del sistema.** Se trabaja desde aquí, con la misma identidad visual y el mismo pipeline. Lo único propio es el producto: crédito y financiamiento.

Última revisión: 2026-08-09. Todo lo marcado como *verificado* se leyó del código o de las migraciones; lo marcado como *pendiente de confirmar* necesita una consulta a la base.

---

## 1. Lo que comparte con Xending

Todo esto ya funciona igual para las dos marcas y no hay que duplicarlo:

| Capa | Estado |
|---|---|
| Tipografía (Montserrat / Poppins / Inter / Fraunces) | Verificado, ya alineado |
| Paleta coral + turquesa | Verificado |
| Sistema visual (`XENDING_VISUAL_SYSTEM_v1.md`) | Verificado |
| 50 templates del renderer | Verificado, sin lógica por marca |
| `generate-design-html`, `generate-design-image` | Verificado, resuelven la marca por tenant |
| Design Studio, banco de copys v2, carruseles | Verificado, `copy_bank_items` lleva `business_id` |
| Calendario de contenido | Verificado, `content_calendar` lleva `business_id` |

La tipografía de Capital quedó cubierta por la migración `20260809_brand_typography_montserrat.sql` sin trabajo extra: el `UPDATE` de `business_tenants` filtra por el valor viejo y no por tenant, así que los dos pasaron de Fraunces/Inter a Montserrat/Poppins.

---

## 2. Lo que es propio de Capital

### Tenant

```
id     a0000000-0000-0000-0000-000000000002
slug   xending_capital
accent #1A2332  (navy más oscuro que el de Xending, #0F1419)
```

### Términos prohibidos

```json
"forbidden_terms": ["tipo de cambio", "FX", "conversión de divisas",
                    "casa de cambio", "cambio de moneda"]
"required_qualifiers": ["sujeto a aprobación", "condiciones aplican"]
"max_values": { "plazo_maximo": "45 días" }
```

Esto tiene una consecuencia que conviene tener presente y que **no es un problema, es una protección**: un copy de coberturas o de costos cambiarios no puede salir bajo la marca Capital, porque esas ramas viven precisamente de las palabras prohibidas. Si algún día se quiere hablar de tipo de cambio con la marca Capital, primero hay que decidir si eso es legalmente admisible para una SOFOM, no solo quitar el término de la lista.

### Textos legales

- **Completo:** Xending Capital es una marca operada por Xending Technologies S.A.P.I. de C.V. Los servicios de financiamiento son proporcionados a través de socios regulados y están sujetos a aprobación crediticia. Las condiciones mostradas son indicativas y pueden variar según el perfil del solicitante.
- **Corto:** Sujeto a aprobación. Condiciones aplican.

Ojo: en `src/utils/xendingDesign/brandConfig.ts` hay un disclaimer distinto y hardcodeado que menciona **Lemad Capital SAPI de CV SOFOM ENR**, líneas hasta $500,000 USD y plazos hasta 45 días. El de la base menciona Xending Technologies y no da cifras. **Son dos textos legales incompatibles para la misma marca.** Hay que decidir cuál es el vigente antes de publicar nada de Capital. → *decisión abierta, punto 5.1*

### Ramas comerciales (5)

```
capital-de-trabajo             Capital de Trabajo
financiamiento-importadores    Financiamiento para Importadores
liquidez-temporada-alta
no-pierdas-la-compra
pagos-operativos
```

### Momentos de mercado

`temporadas-criticas` — cierre fiscal, cosecha, Buen Fin, Navidad, inicio de año.

Y disparadores compartidos con Xending: `Banxico`, `inflacion`, `tasas`, `usdmxn`, `volatilidad`. Vale revisar si `usdmxn` y `volatilidad` deberían aplicar a Capital, dado que sus términos prohibidos excluyen el lenguaje cambiario.

### Números aprobados

```
línea máxima     $500,000 USD   (siempre como "hasta")
plazo máximo     45 días
pre-aprobación   minutos
aprobación       desde 48 horas hábiles
```

---

## 3. Lo que falta para que Capital funcione como Xending

Xending tiene tres ramas con banco de copys (`velocidad`, `costos-ahorro`, `coberturas`): 240 copys aprobados, kits editoriales y prompts de generación. **Capital no tiene nada de eso.**

Para llegar al mismo punto hace falta, por rama:

1. Un contexto maestro en `docs/prompts/copy-banks/_contexto-maestro.<rama>.md`
2. Bancos fuente en el formato que lee `scripts/parse-copy-banks.mjs`
3. Un kit en `supabase/functions/_shared/copy-kits/<rama>.json`
4. Reglas de ángulo en `scripts/classify-copy-banks.mjs` (tabla `BRANCHES`)
5. Alta en `copyKitRegistry.ts`, `src/types/copy-bank.ts` y `KIT_SLUGS` del smoke test

El procedimiento completo, con los seis puntos de declaración, quedó documentado al agregar `coberturas`. Ese es el molde a seguir.

---

## 4. Pendiente conocido

**El master prompt de Capital no tiene la tipografía alineada.** *Pendiente de confirmar.*

El seed `seed_20260501_xending_capital_tenant.sql` sí trae un bloque `## Tipografía` que ya quedó en Montserrat/Poppins. Pero la fila que hay en la base no coincidió con la migración: salió `tiene_montserrat = false` y `quedo_fraunces = false`, o sea que su texto no es ni el viejo ni el nuevo. Lo más probable es que se editara desde la UI.

Para ver qué dice:

```sql
select id, prompt_type,
       substring(prompt_text from position('## Tipograf' in prompt_text) for 260) as bloque
from public.master_prompts
where business_id = 'a0000000-0000-0000-0000-000000000002';
```

Si devuelve vacío, ese prompt no tiene bloque de tipografía y hay que agregárselo en lugar de reemplazarlo.

---

## 5. Decisiones abiertas

### 5.1 Cuál es el texto legal vigente

`brandConfig.ts` dice Lemad Capital SOFOM ENR con cifras; la base dice Xending Technologies sin cifras. Hay que elegir uno y borrar el otro. Es lo primero, porque bloquea publicar.

### 5.2 Si Capital comparte los disparadores cambiarios

`usdmxn` y `volatilidad` están dados de alta, pero los términos prohibidos impiden hablar de tipo de cambio. O se retiran esos disparadores para Capital, o se define cómo se habla de volatilidad sin nombrar la divisa.

### 5.3 Qué ramas de Capital llevan banco de copys

Son cinco. No todas necesitan 60 copys. Conviene empezar por una o dos y medir, como se hizo con `velocidad`.

### 5.4 Si el navy más oscuro cambia algo

Capital usa `#1A2332` como acento y Xending `#0F1419`. Los templates del renderer traen el navy de Xending fijo en `:root`. Si el de Capital importa, hay que parametrizarlo; si no, se documenta que ese campo no se usa en piezas.

---

## 6. Riesgo latente, no urgente

Existe una fila en `master_prompts` con `prompt_type = 'image'` para el tenant de Xending que está **desactualizada y dormida**. Hoy no se lee, porque `MASTER_IMAGE_PROMPT_SOURCE` tiene default `code`. Pero si algún día se pone ese secret en `database`, esa fila reemplaza el prompt de imagen completo y se pierde el bloque de tipografía de marca:

```ts
const promptTemplate = databasePrompt ?? selectedCodePrompt;
```

Antes de habilitar ese modo, hay que actualizar o borrar esa fila. Aplica igual si algún día Capital recibe su propia fila `image`.
