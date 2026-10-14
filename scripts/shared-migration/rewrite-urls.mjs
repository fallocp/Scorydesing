// Step 7 (ADR-0003): rewrite stored Storage URLs in the LOCAL DB, after verify.mjs passed.
//   --from <url>   origin base URL (default: https://<shared ref>.supabase.co from the credentials)
//   --to <url>     target base URL (default: SCORY_LOCAL_API_URL, http://127.0.0.1:55321)
//   --dry-run      count only (transaction rolled back)
// Signed URLs of PUBLIC buckets (/storage/v1/object/sign/<bucket>/<path>?token=...) become
// /storage/v1/object/public/<bucket>/<path> without token (origin tokens do not validate locally).
// /render/image/ URLs are kept as they are (host only). text, varchar, json, jsonb and text[] columns are
// rewritten on their text form and cast back. One transaction, session_replication_role = replica (updated_at kept).
// Reusable for a later move to a server: run again with --from <local url> --to <server url>.
import { ALL_TABLES, LOCAL_API_URL, arg, addSecret, fail, fetchRetry, localKeys, localSql, log, opsPath, owner, rows, shared, sqlIdent, sqlLiteral, writeJson } from './common.mjs';
import { checksumSql, localCatalog, parseChecksums } from './catalog.mjs';

const from = String(arg('from', '') || shared().apiUrl).replace(/\/$/, '');
const to = String(arg('to', '') || LOCAL_API_URL).replace(/\/$/, '');
addSecret(from);
const dryRun = arg('dry-run', false) === true;
const own = owner();
const catalog = await localCatalog();
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const publicBuckets = rows(await localSql('SELECT id FROM storage.buckets WHERE public ORDER BY id;')).map((r) => r[0]);
const TYPES = /^(text|character varying|json|jsonb|text\[\]|character varying\[\])$/;
const cols = [];
for (const t of ALL_TABLES) for (const c of catalog[t].columns) if (TYPES.test(c.type)) cols.push({ table: t, col: c.col, type: c.type });

const fromRe = reEsc(from);
const signRe = `${fromRe}/storage/v1/object/sign/(${publicBuckets.map(reEsc).join('|')})/([^?"\\\\\\s]*)\\?token=[A-Za-z0-9._-]+`;
const countExpr = (e, pattern) => `COALESCE(sum(regexp_count(${e}, ${sqlLiteral(pattern)})), 0)`;
const parts = [];
for (const { table, col, type } of cols) {
  const e = `x.${sqlIdent(col)}::text`;
  const where = `${e} LIKE ${sqlLiteral(`%${from}%`)}`;
  parts.push(`SELECT 'B', ${sqlLiteral(table)}, ${sqlLiteral(col)}, count(*), ${countExpr(e, fromRe)}, ${countExpr(e, signRe)}, ${countExpr(e, `${fromRe}/storage/v1/render/image/`)} FROM public.${sqlIdent(table)} x WHERE ${where};`);
  const expr = `regexp_replace(regexp_replace(${sqlIdent(col)}::text, ${sqlLiteral(signRe)}, ${sqlLiteral(`${to}/storage/v1/object/public/\\1/\\2`)}, 'g'), ${sqlLiteral(fromRe)}, ${sqlLiteral(to)}, 'g')::${type}`;
  parts.push(`UPDATE public.${sqlIdent(table)} SET ${sqlIdent(col)} = ${expr} WHERE ${sqlIdent(col)}::text LIKE ${sqlLiteral(`%${from}%`)};`);
}
const leftover = ALL_TABLES.map((t) => `SELECT 'L', ${sqlLiteral(t)}, count(*) FROM public.${sqlIdent(t)} x WHERE x::text LIKE ${sqlLiteral(`%${from}%`)};`).join('\n');
const sql = `BEGIN;
SET LOCAL session_replication_role = replica;
${parts.join('\n')}
SET LOCAL session_replication_role = origin;
${leftover}
SELECT 'S', count(*) FROM storage.objects WHERE COALESCE(metadata::text, '') || COALESCE(user_metadata::text, '') LIKE ${sqlLiteral(`%${from}%`)};
SELECT 'A', count(*) FROM auth.users WHERE COALESCE(raw_user_meta_data::text, '') || COALESCE(raw_app_meta_data::text, '') LIKE ${sqlLiteral(`%${from}%`)};
${dryRun ? 'ROLLBACK' : 'COMMIT'};`;
const out = rows(await localSql(sql));
const before = out.filter((r) => r[0] === 'B' && Number(r[3]) > 0).map(([, table, col, rowsN, occ, signed, render]) => ({ table, column: col, rows: Number(rowsN), occurrences: Number(occ), signed_to_public: Number(signed), render_image: Number(render) }));
const leftovers = out.filter((r) => r[0] === 'L' && Number(r[2]) > 0).map(([, t, c]) => ({ table: t, rows: Number(c) }));
const storageLeft = Number(out.find((r) => r[0] === 'S')[1]);
const authLeft = Number(out.find((r) => r[0] === 'A')[1]);
const total = before.reduce((a, b) => a + b.occurrences, 0);
const byTable = {};
for (const b of before) byTable[b.table] = (byTable[b.table] ?? 0) + b.occurrences;

const report = {
  finished: new Date().toISOString(), dry_run: dryRun, to,
  replaced_total: total, signed_to_public: before.reduce((a, b) => a + b.signed_to_public, 0), render_image: before.reduce((a, b) => a + b.render_image, 0),
  tables: Object.keys(byTable).length, by_table: byTable, by_column: before,
  leftover_rows_with_origin_host: leftovers, storage_objects_with_origin_host: storageLeft, auth_users_with_origin_host: authLeft,
};

if (!dryRun) {
  // Sample of 20 rewritten public URLs must answer 200 locally (includes former signed URLs when present).
  const { anon } = localKeys();
  const urlRe = `${reEsc(to)}/storage/v1/object/public/[^"'\\\\\\s<>)]+`;
  const sampleSql = cols.map(({ table, col }) => `SELECT m[1] FROM public.${sqlIdent(table)} x, regexp_matches(x.${sqlIdent(col)}::text, ${sqlLiteral(`(${urlRe})`)}, 'g') m`).join(' UNION ALL\n');
  const urls = [...new Set(rows(await localSql(`SELECT DISTINCT u COLLATE "C" FROM (${sampleSql}) z(u) ORDER BY 1;`)).map((r) => r[0]))];
  const brand = urls.filter((u) => u.includes('/object/public/Brand/'));
  const others = urls.filter((u) => !u.includes('/object/public/Brand/'));
  const pick = (list, n) => Array.from({ length: Math.min(n, list.length) }, (_, i) => list[Math.floor((i * list.length) / Math.min(n, list.length))]);
  const sample = [...pick(brand, 5), ...pick(others, 20 - Math.min(5, brand.length))];
  const results = [];
  for (const u of sample) {
    const res = await fetchRetry(u, { headers: { apikey: anon } });
    await res.arrayBuffer();
    results.push(res.status);
  }
  report.sample = { distinct_public_urls: urls.length, checked: sample.length, ok_200: results.filter((s) => s === 200).length, statuses: results };
  const post = parseChecksums(await localSql(checksumSql(catalog, own.id, ALL_TABLES)));
  writeJson(opsPath('post-rewrite-checksums.json'), { finished: new Date().toISOString(), tables: post });
  report.post_rewrite_checksums = 'post-rewrite-checksums.json';
}
// A re-run finds 0 URLs: it is written as a re-check and does not overwrite the report of the real rewrite.
writeJson(opsPath(dryRun ? 'rewrite-dry-run-report.json' : total > 0 ? 'rewrite-report.json' : 'rewrite-recheck-report.json'), report);
log(`rewrite ${dryRun ? '(dry run) ' : ''}: ${total} URLs in ${report.tables} tables (${report.signed_to_public} signed -> public, ${report.render_image} render/image); leftovers: ${leftovers.length} tables, storage ${storageLeft}, auth ${authLeft}`);
for (const [t, n] of Object.entries(byTable)) log(`  ${t}: ${n}`);
if (report.sample) log('sample', report.sample);
if (leftovers.length || storageLeft || authLeft) fail('origin host still present after rewrite');
if (report.sample && report.sample.ok_200 !== report.sample.checked) process.exit(1);
