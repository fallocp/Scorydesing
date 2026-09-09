/**
 * Parser de los cinco MD de Xending USA.
 *
 * Extrae los registros de copy con su ficha interna. Es la base del seed del
 * banco (`copy_bank_items`) y del chequeo de kit contra banco.
 *
 * FORMATO DE UN REGISTRO
 *
 *   ### FX-01
 *   **Estado ES:** APROBADO␠␠
 *   **Estado EN-US:** POR REVISAR — ...␠␠
 *   ...
 *   #### Español
 *   **Titular:** ...
 *   **Apoyo:** ...
 *   **CTA:** ...
 *   #### English — US · pendiente de aprobación
 *   **Headline:** ...
 *   **Supporting copy:** ...
 *   **CTA:** ...
 *   #### Ficha interna
 *   | Campo | Valor |
 *   |---|---|
 *   | Rama actual | ... |
 *   ...
 *
 * Detalles que muerden, y por eso están explícitos aquí:
 *
 *  - Los `**Campo:**` de estado terminan en DOS ESPACIOS (salto de línea
 *    markdown). Hay que recortarlos o el estado nunca hace match con 'APROBADO'.
 *  - El bloque inglés trae `**CTA:**` igual que el español, así que el segundo
 *    `**CTA:**` del registro es el inglés. Se distinguen por la sección
 *    `#### Español` / `#### English` en la que caen.
 *  - `—` en la ficha significa VACÍO, no el carácter literal.
 *  - El bloque EN-US puede faltar por completo.
 *  - Hay un `<details>` de auditoría con el EN-US ANTERIOR. Ese texto NO es la
 *    propuesta vigente y hay que ignorarlo: viene después de la ficha y contiene
 *    líneas con formato parecido.
 */
import { readFileSync } from 'node:fs';

/** `—` y variantes significan campo vacío. */
function fichaValue(raw) {
  const v = raw.trim();
  if (v === '' || v === '—' || v === '-' || v === '–') return null;
  return v;
}

/**
 * Estado ES del MD → `copy_bank_items.status`.
 *
 * APROBADO es el único que entra como `seed`, que es el status que
 * `analyzeCopyBank` cuenta como banco bueno junto con `approved`. Todo lo demás
 * entra como propuesta o archivado, nunca como referencia positiva (§11).
 */
export function mapStatus(estadoEs) {
  if (!estadoEs) return 'proposed';
  const e = estadoEs.toUpperCase();
  if (e.startsWith('APROBADO')) return 'seed';
  if (e.includes('DESCARTA') || e.includes('HISTORIAL')) return 'archived';
  return 'proposed';
}

export function parseUsaMd(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);

  // Front matter: branch_id, contadores y scope.
  const meta = {};
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length && lines[i].trim() !== '---'; i++) {
      const m = lines[i].match(/^(\w+):\s*(.*)$/);
      if (m) meta[m[1]] = m[2].replace(/^"|"$/g, '');
    }
  }

  const records = [];
  let cur = null;
  let section = null; // 'es' | 'en' | 'ficha' | 'audit' | null

  const push = () => {
    if (cur) records.push(cur);
    cur = null;
  };

  for (const line of lines) {
    const idMatch = line.match(/^### ([A-Z]+-\d+)\s*$/);
    if (idMatch) {
      push();
      cur = { legacy_id: idMatch[1], ficha: {} };
      section = null;
      continue;
    }
    if (!cur) continue;

    if (/^#### Español/.test(line)) { section = 'es'; continue; }
    if (/^#### English/.test(line)) { section = 'en'; continue; }
    if (/^#### Ficha interna/.test(line)) { section = 'ficha'; continue; }
    // El <details> de auditoría trae el EN-US anterior. No es la propuesta vigente.
    if (/^<details>/.test(line)) { section = 'audit'; continue; }
    if (/^<\/details>/.test(line)) { section = null; continue; }
    if (/^#### /.test(line)) { section = null; continue; }
    if (section === 'audit') continue;

    // Estados y metadatos del encabezado del registro. Ojo: dos espacios finales.
    let m = line.match(/^\*\*Estado ES:\*\*\s*(.+?)\s*$/);
    if (m) { cur.estado_es = m[1]; continue; }
    m = line.match(/^\*\*Estado EN-US:\*\*\s*(.+?)\s*$/);
    if (m) { cur.estado_en = m[1]; continue; }
    m = line.match(/^\*\*Tratamiento:\*\*\s*(.+?)\s*$/);
    if (m) { cur.tratamiento = m[1]; continue; }

    if (section === 'es') {
      m = line.match(/^\*\*Titular:\*\*\s*(.+?)\s*$/);
      if (m) { cur.headline = m[1]; continue; }
      m = line.match(/^\*\*Apoyo:\*\*\s*(.+?)\s*$/);
      if (m) { cur.subcopy = m[1]; continue; }
      m = line.match(/^\*\*CTA:\*\*\s*(.+?)\s*$/);
      if (m) { cur.cta = m[1]; continue; }
    }

    if (section === 'en') {
      m = line.match(/^\*\*Headline:\*\*\s*(.+?)\s*$/);
      if (m) { cur.headline_en = m[1]; continue; }
      m = line.match(/^\*\*Supporting copy:\*\*\s*(.+?)\s*$/);
      if (m) { cur.subcopy_en = m[1]; continue; }
      m = line.match(/^\*\*CTA:\*\*\s*(.+?)\s*$/);
      if (m) { cur.cta_en = m[1]; continue; }
    }

    if (section === 'ficha') {
      m = line.match(/^\|\s*(.+?)\s*\|\s*(.*?)\s*\|$/);
      if (m && m[1] !== 'Campo' && !/^-+$/.test(m[1])) {
        cur.ficha[m[1]] = fichaValue(m[2]);
      }
    }
  }
  push();

  return { meta, records };
}

/** Sólo los registros con Estado ES APROBADO. */
export function approvedOnly(records) {
  return records.filter((r) => mapStatus(r.estado_es) === 'seed');
}
