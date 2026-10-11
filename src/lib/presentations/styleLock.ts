import { classifyTextRoles, TYPE_ROLE_LABELS, type BoxSample, type StyleSamples, type TextSample, type TypeRole } from './styleSpec';
import type { StyleUnlock } from '../../../supabase/functions/_shared/desaing/explorationContracts';

/** «Candado de estilo» without AI: the output keeps the base's measured style for
 * every property the user did not unlock. Pure comparison and CSS; the caller
 * supplies the browser measurement and the structural (render) check. */
export type LockProperty = 'font-family' | 'font-size' | 'font-weight' | 'color' | 'background-color' | 'border-radius' | 'box-shadow';
export interface StyleDifference {
  /** Selector restored in the output (the output's own selector when paired by role). */
  target: string; property: LockProperty; base: string; output: string; label: string; matched: 'selector' | 'role';
}
export interface StyleLockReport {
  /** none = no unrequested difference; reported = listed only (no unlock); restored = base values applied; overflow = size lock removed because it did not fit. */
  status: 'none' | 'reported' | 'restored' | 'overflow';
  differences: string[];
  question?: string;
}
export const STYLE_LOCK_ID = 'scory-style-lock';
/** Which unlock frees each locked property. */
const UNLOCKED_BY: Record<LockProperty, StyleUnlock[]> = { 'font-family': ['typography'], 'font-size': ['typography'], 'font-weight': ['typography'],
  color: ['colors'], 'background-color': ['colors', 'components'], 'border-radius': ['components'], 'box-shadow': ['components'] };
const PROPERTY_LABELS: Record<LockProperty, string> = { 'font-family': 'familia', 'font-size': 'tamaño', 'font-weight': 'peso', color: 'color',
  'background-color': 'fondo', 'border-radius': 'radio', 'box-shadow': 'sombra' };
const TEXT_PROPERTIES: LockProperty[] = ['font-family', 'font-size', 'font-weight', 'color'];
const BOX_PROPERTIES: LockProperty[] = ['background-color', 'border-radius', 'box-shadow'];
const SELECTOR = /^[#.]-?[A-Za-z_][\w-]*$/;
const SAFE_VALUE = /^[\w\s#().,%/-]+$/;
const MAX_DIFFERENCES = 30;

const hex = (value: string) => {
  const match = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/i.exec(value.trim());
  if (!match) return value.trim().toLowerCase();
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (alpha === 0) return 'transparent';
  if (alpha < 1) return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${Number(alpha.toFixed(2))})`;
  return `#${[match[1], match[2], match[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('')}`;
};
function textValue(sample: TextSample, property: LockProperty): string {
  return property === 'font-family' ? sample.family : property === 'font-size' ? `${Math.round(sample.size)}px`
    : property === 'font-weight' ? String(sample.weight) : hex(sample.color);
}
function boxValue(box: BoxSample, property: LockProperty): string {
  return property === 'background-color' ? hex(box.background) : property === 'border-radius' ? `${Math.round(box.radius)}px` : box.shadow || 'none';
}
const mode = (values: string[]) => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
};
/** ±1 px is rendering noise, not a style change. */
const differs = (property: LockProperty, base: string, output: string) => property === 'font-size' || property === 'border-radius'
  ? Math.abs(parseFloat(base) - parseFloat(output)) > 1 : base !== output;

/** Compares base and output by selector; texts without a shared selector are paired by role and order. */
export function compareStyleSamples(base: StyleSamples, output: StyleSamples): StyleDifference[] {
  const result: StyleDifference[] = [], compared = new Set<string>();
  const bySelector = <T extends { selector?: string }>(items: T[]) => items.reduce((map, item) => item.selector
    ? map.set(item.selector, [...(map.get(item.selector) ?? []), item]) : map, new Map<string, T[]>());
  const pushAll = <T>(baseItems: Map<string, T[]>, outputItems: Map<string, T[]>, properties: LockProperty[], value: (item: T, property: LockProperty) => string) => {
    for (const [selector, items] of baseItems) {
      const after = outputItems.get(selector);
      if (!after) continue;
      compared.add(selector);
      for (const property of properties) {
        const before = mode(items.map(item => value(item, property)))!, now = mode(after.map(item => value(item, property)))!;
        if (differs(property, before, now)) result.push({ target: selector, property, base: before, output: now, label: selector, matched: 'selector' });
      }
    }
  };
  pushAll(bySelector(base.texts), bySelector(output.texts), TEXT_PROPERTIES, textValue);
  pushAll(bySelector(base.boxes), bySelector(output.boxes), BOX_PROPERTIES, boxValue);
  // Fallback: a rewrite renamed the classes. Compare each role's dominant style and
  // restore it on the output selectors of that role that were not compared above.
  const roles = (samples: StyleSamples) => classifyTextRoles(samples).reduce((map, { sample, role }) =>
    map.set(role, [...(map.get(role) ?? []), sample]), new Map<TypeRole, TextSample[]>());
  const before = roles(base), after = roles(output);
  for (const [role, items] of before) {
    const now = (after.get(role) ?? []).filter(item => !item.selector || !compared.has(item.selector));
    const targets = [...new Set(now.map(item => item.selector).filter((selector): selector is string => !!selector))];
    if (!now.length || !targets.length || items.every(item => item.selector && compared.has(item.selector))) continue;
    for (const property of TEXT_PROPERTIES) {
      const was = mode(items.map(item => textValue(item, property)))!, is = mode(now.map(item => textValue(item, property)))!;
      if (differs(property, was, is)) for (const target of targets)
        result.push({ target, property, base: was, output: is, label: `${TYPE_ROLE_LABELS[role]} (${target})`, matched: 'role' });
    }
  }
  return result.slice(0, MAX_DIFFERENCES);
}

export const isUnlocked = (property: LockProperty, unlocked: readonly StyleUnlock[]) => UNLOCKED_BY[property].some(item => unlocked.includes(item));
export const describeStyleDifference = (difference: StyleDifference) =>
  `${difference.label}: ${PROPERTY_LABELS[difference.property]} ${difference.base} → ${difference.output}`;

const familyValue = (value: string) => /^[\w\s-]+$/.test(value) ? `"${value}"` : '';
/** One rule per line, tagged with the property, so later turns can release a category. */
export function buildStyleLockCss(differences: readonly StyleDifference[], unlocked: readonly StyleUnlock[], options: { skipSize?: boolean } = {}): string {
  const lines = new Set<string>();
  for (const item of differences) {
    if (!SELECTOR.test(item.target) || isUnlocked(item.property, unlocked) || options.skipSize && item.property === 'font-size') continue;
    const value = item.property === 'font-family' ? familyValue(item.base) : item.base;
    if (!value || item.property !== 'font-family' && !SAFE_VALUE.test(value)) continue;
    lines.add(`/*lock:${item.property}*/${item.target}{${item.property}:${value}!important}`);
  }
  return [...lines].join('\n');
}
const LOCK_STYLE = new RegExp(`<style\\b[^>]*\\bid\\s*=\\s*["']${STYLE_LOCK_ID}["'][^>]*>([\\s\\S]*?)<\\/style\\s*>`, 'gi');
const LOCK_RULE = /\/\*lock:([\w-]+)\*\/([^{\n]+)\{([\w-]+):([^}\n]*)!important\}/g;
function lockRules(html: string): Array<{ property: LockProperty; target: string; line: string }> {
  const rules: Array<{ property: LockProperty; target: string; line: string }> = [];
  for (const style of html.matchAll(LOCK_STYLE)) for (const rule of style[1].matchAll(LOCK_RULE))
    if (rule[1] in UNLOCKED_BY) rules.push({ property: rule[1] as LockProperty, target: rule[2], line: rule[0] });
  return rules;
}
function writeLock(html: string, lines: string[]): string {
  const clean = html.replace(LOCK_STYLE, '');
  if (!lines.length) return clean;
  const style = `<style id="${STYLE_LOCK_ID}">\n${lines.join('\n')}\n</style>`;
  return /<\/head\s*>/i.test(clean) ? clean.replace(/<\/head\s*>/i, match => `${style}${match}`) : `${style}${clean}`;
}
/** Merges new rules with the pins already in the output; a new rule replaces the same selector and property. */
export function applyStyleLock(html: string, css: string): string {
  const fresh = [...css.matchAll(LOCK_RULE)].map(rule => ({ key: `${rule[2]}|${rule[1]}`, line: rule[0] }));
  const keys = new Set(fresh.map(rule => rule.key));
  const kept = lockRules(html).filter(rule => !keys.has(`${rule.target}|${rule.property}`)).map(rule => rule.line);
  return writeLock(html, [...new Set([...kept, ...fresh.map(rule => rule.line)])]);
}
/** Before a turn that unlocks a category, previous pins of that category stop applying. */
export function releaseStyleLock(html: string, unlocked: readonly StyleUnlock[]): string {
  if (!unlocked.length || !lockRules(html).length) return html;
  return writeLock(html, lockRules(html).filter(rule => !isUnlocked(rule.property, unlocked)).map(rule => rule.line));
}

/** What the user's own words unlock, added to the planner's unlock so a requested change is never reverted. */
export function inferStyleUnlocks(text: string): StyleUnlock[] {
  const plain = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), found = new Set<StyleUnlock>();
  if (/\b(?:fuentes?|tipografias?|letras?|tamanos?|negritas?|peso|mas grandes?|mas pequen[oa]s?|mas chic[oa]s?|px\b)/.test(plain)) found.add('typography');
  if (/\b(?:colou?r(?:es)?|paleta|azul(?:es)?|rojo|roja|verde|turquesa|coral|naranja|amarill[oa]|negr[oa]|blanc[oa]|gris|morad[oa]|rosa|fondo)\b/.test(plain)) found.add('colors');
  if (/\b(?:sombras?|bordes?|radio|esquinas?|redondead[oa]s?|estilo de (?:las |los )?(?:tarjetas?|cuadros?|cajas?)|tarjetas? (?:planas?|blancas?))\b/.test(plain)) found.add('components');
  if (/\b(?:horizontal(?:es)?|vertical(?:es)?|acomodo|columnas?|filas?|posicion|izquierda|derecha|orientacion|distribucion|reacomoda)\b/.test(plain)) found.add('layout');
  if (/\bestilo de (?:la |esta |esa |mi )?(?:referencia|imagen)|\bcomo (?:la|mi|esta|esa) (?:referencia|imagen)\b/.test(plain)) {
    found.add('colors'); found.add('components'); found.add('typography');
  }
  return [...found];
}

/** Lock pipeline: measure, compare, restore what was not unlocked and check it still fits.
 * Without `unlock` (older planner) it only reports. If restoring sizes overflows, the size
 * pin is dropped and the user is asked instead of shrinking or overflowing silently. */
export async function enforceStyleLock(input: {
  base: string; output: string; unlock?: readonly StyleUnlock[];
  measure(html: string): Promise<StyleSamples>;
  fits(before: string, after: string): Promise<'fits' | 'overflow' | 'unverified'>;
}): Promise<{ html: string; report: StyleLockReport }> {
  const [base, output] = await Promise.all([input.measure(input.base), input.measure(input.output)]);
  const all = compareStyleSamples(base, output);
  const unrequested = input.unlock ? all.filter(item => !isUnlocked(item.property, input.unlock!)) : all;
  const differences = unrequested.map(describeStyleDifference);
  if (!unrequested.length) return { html: input.output, report: { status: 'none', differences: [] } };
  if (!input.unlock) return { html: input.output, report: { status: 'reported', differences } };
  const css = buildStyleLockCss(unrequested, input.unlock);
  if (!css) return { html: input.output, report: { status: 'reported', differences } };
  const locked = applyStyleLock(input.output, css);
  const size = unrequested.find(item => item.property === 'font-size');
  if (!size || await input.fits(input.output, locked) !== 'overflow') return { html: locked, report: { status: 'restored', differences } };
  const reduced = buildStyleLockCss(unrequested, input.unlock, { skipSize: true });
  return { html: reduced ? applyStyleLock(input.output, reduced) : input.output, report: { status: 'overflow', differences,
    question: `No cabe con el tamaño original; ¿reacomodo o reduzco a ${Math.round(parseFloat(size.output))} px?` } };
}

export function describeStyleLock(report?: StyleLockReport): string {
  if (!report) return '';
  if (report.status === 'none') return 'Diferencias de estilo: ninguna.';
  const list = report.differences.slice(0, 6).join('; ') + (report.differences.length > 6 ? `; y ${report.differences.length - 6} más` : '');
  if (report.status === 'reported') return `Diferencias de estilo: ${list}.`;
  if (report.status === 'restored') return `Diferencias de estilo corregidas a la base: ${list}.`;
  return `Diferencias de estilo corregidas a la base, salvo el tamaño: ${list}. ${report.question ?? ''}`.trim();
}
