// Catalog of the in-scope tables, read from the LOCAL DB (schema parity with the shared one: Phase 4).
import { ALL_TABLES, IDP_TABLES, localSql, rows, sqlIdent, sqlLiteral } from './common.mjs';

export async function localCatalog() {
  const list = ALL_TABLES.map(sqlLiteral).join(',');
  const out = await localSql(`
SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod), a.attnum,
       COALESCE((SELECT k.i FROM pg_index i, unnest(i.indkey) WITH ORDINALITY k(n, i)
                   WHERE i.indrelid = c.oid AND i.indisprimary AND k.n = a.attnum), 0)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
 WHERE c.relkind = 'r' AND c.relname IN (${list})
 ORDER BY c.relname, a.attnum;`);
  const tables = {};
  for (const [table, col, type, attnum, pkPos] of rows(out)) {
    const t = (tables[table] ??= { columns: [], pk: [] });
    t.columns.push({ col, type, attnum: Number(attnum) });
    if (Number(pkPos) > 0) t.pk[Number(pkPos) - 1] = { col, type };
  }
  for (const t of ALL_TABLES) {
    if (!tables[t]) throw new Error(`table ${t} not found in local DB`);
    if (tables[t].pk.length === 0 || tables[t].pk.some((p) => !p)) throw new Error(`table ${t} has no usable primary key`);
  }
  return tables;
}

// IdP snapshot filters (ADR-0004): only the owner and the owner's businesses.
export function idpFilter(table, ownerId) {
  const o = sqlLiteral(ownerId);
  const biz = `(SELECT m.business_id FROM public.user_business_memberships m WHERE m.user_id = ${o}::uuid)`;
  switch (table) {
    case 'business_tenants': return `x.id IN ${biz}`;
    case 'user_business_memberships': return `x.user_id = ${o}::uuid`;
    case 'profiles': return `x.id = ${o}::uuid`;
    case 'user_roles':
    case 'extended_user_roles': return `x.user_id = ${o}::uuid`;
    default: return 'true';
  }
}

// Same output format on both sides: deterministic text of every row.
export const CHECKSUM_SETTINGS = `SET TimeZone = 'UTC'; SET DateStyle = 'ISO, MDY'; SET IntervalStyle = 'postgres'; SET extra_float_digits = 1; SET bytea_output = 'hex';`;

const TEXTY = /^(text|character varying|character)/;
function orderBy(t) {
  return t.pk.map((p) => `x.${sqlIdent(p.col)}${TEXTY.test(p.type) ? ' COLLATE "C"' : ''}`).join(', ');
}

export const columnList = (t) => t.columns.map((c) => sqlIdent(c.col)).join(', ');

// One line per table: table, rows, checksum, max(updated_at), max(created_at).
// checksum = md5 of the newline-joined md5(row text) ordered by PK. The row is built with the LOCAL column order on
// both sides, so it does not depend on attnum. Per-row md5 avoids 400 MB aggregates on the shared instance and
// detects the same differences as md5(string_agg(row::text)).
export function checksumSql(catalog, ownerId, tables, { countsOnly = false } = {}) {
  const parts = tables.map((table) => {
    const t = catalog[table];
    const cols = new Set(t.columns.map((c) => c.col));
    const maxU = cols.has('updated_at') ? 'max(x.updated_at)::text' : "''";
    const maxC = cols.has('created_at') ? 'max(x.created_at)::text' : "''";
    const where = IDP_TABLES.includes(table) ? idpFilter(table, ownerId) : 'true';
    const row = `ROW(${t.columns.map((c) => `x.${sqlIdent(c.col)}`).join(', ')})::text`;
    const ck = countsOnly ? "'-'" : `COALESCE(md5(string_agg(md5(${row}), E'\\n' ORDER BY ${orderBy(t)})), 'empty')`;
    return `SELECT ${sqlLiteral(table)}, count(*), ${ck}, COALESCE(${maxU}, ''), COALESCE(${maxC}, '') FROM public.${sqlIdent(table)} x WHERE ${where};`;
  });
  return `${CHECKSUM_SETTINGS}\n${parts.join('\n')}`;
}

// FK integrity: one query per FK of the in-scope tables, returning the number of orphan rows (MATCH SIMPLE).
export async function fkOrphanSql() {
  const list = ALL_TABLES.map(sqlLiteral).join(',');
  const out = await localSql(`
SELECT con.conname, c.relname, fn.nspname, f.relname,
       (SELECT string_agg(a.attname, ',' ORDER BY k.i) FROM unnest(con.conkey) WITH ORDINALITY k(n, i) JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n),
       (SELECT string_agg(a.attname, ',' ORDER BY k.i) FROM unnest(con.confkey) WITH ORDINALITY k(n, i) JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.n)
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid AND c.relnamespace = 'public'::regnamespace
  JOIN pg_class f ON f.oid = con.confrelid
  JOIN pg_namespace fn ON fn.oid = f.relnamespace
 WHERE con.contype = 'f' AND c.relname IN (${list})
 ORDER BY 2, 1;`);
  const fks = rows(out);
  const sql = fks.map(([name, child, pschema, parent, ccols, pcols]) => {
    const cc = ccols.split(',');
    const pc = pcols.split(',');
    const notNull = cc.map((c) => `c.${sqlIdent(c)} IS NOT NULL`).join(' AND ');
    const join = cc.map((c, i) => `p.${sqlIdent(pc[i])} = c.${sqlIdent(c)}`).join(' AND ');
    return `SELECT ${sqlLiteral(`${child}.${name}`)}, count(*) FROM public.${sqlIdent(child)} c WHERE ${notNull} AND NOT EXISTS (SELECT 1 FROM ${sqlIdent(pschema)}.${sqlIdent(parent)} p WHERE ${join});`;
  }).join('\n');
  return { count: fks.length, sql };
}

// Sequences owned by in-scope columns (the audit found none; kept generic for re-runs).
export async function sequenceFixSql() {
  const list = ALL_TABLES.map(sqlLiteral).join(',');
  const out = rows(await localSql(`
SELECT s.oid::regclass::text, c.relname, a.attname
  FROM pg_depend d
  JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
  JOIN pg_class c ON c.oid = d.refobjid AND c.relnamespace = 'public'::regnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = d.refobjsubid
 WHERE d.deptype IN ('a', 'i') AND c.relname IN (${list});`));
  return {
    count: out.length,
    sql: out.map(([seq, table, col]) => `SELECT setval(${sqlLiteral(seq)}, COALESCE((SELECT max(${sqlIdent(col)}) FROM public.${sqlIdent(table)}), 1), (SELECT max(${sqlIdent(col)}) IS NOT NULL FROM public.${sqlIdent(table)}));`).join('\n'),
  };
}

export function parseChecksums(text) {
  const out = {};
  for (const [table, count, checksum, maxUpdated, maxCreated] of rows(text)) out[table] = { rows: Number(count), checksum, maxUpdated, maxCreated };
  return out;
}
