// Steps 3-5 (ADR-0005): load the export into the LOCAL DB in a single transaction.
//   --mode rehearsal   BEGIN ... ROLLBACK (checksums computed inside the transaction)
//   --mode commit      BEGIN ... COMMIT   (refuses to run if in-scope tables already have rows, unless --truncate)
//   --truncate         TRUNCATE the 62 in-scope local tables first (allowed only before Phase 7, while the app
//                      does not write to the local DB yet).
// Load session: SET LOCAL session_replication_role = replica (no triggers, no FK checks, updated_at untouched),
// then back to origin; FK orphans, sequences and checksums are checked before ROLLBACK/COMMIT.
import fs from 'node:fs';
import { ALL_TABLES, IDP_TABLES, arg, fail, localSql, localTool, log, opsPath, owner, readJson, rows, sqlIdent, workPath, writeJson } from './common.mjs';
import { checksumSql, columnList, fkOrphanSql, localCatalog, parseChecksums, sequenceFixSql } from './catalog.mjs';

const mode = arg('mode', 'rehearsal');
if (!['rehearsal', 'commit'].includes(mode)) fail('--mode must be rehearsal or commit');
const truncate = arg('truncate', false) === true;
const own = owner();
const source = readJson(opsPath('export', 'source-checksums.json'));
if (!source) fail('export/source-checksums.json missing: run migrate:shared:export first');
if (!fs.existsSync(opsPath('export', 'data.sql'))) fail('export/data.sql missing');

const catalog = await localCatalog();
const existing = rows(await localSql(ALL_TABLES.map((t) => `SELECT ${`'${t}'`}, count(*) FROM public.${sqlIdent(t)};`).join('\n'))).filter(([, c]) => Number(c) > 0);
if (mode === 'commit' && existing.length > 0 && !truncate) fail(`local tables already have rows (${existing.map(([t]) => t).join(', ')}); re-run with --truncate (only before Phase 7)`);
const authUser = (await localSql(`SELECT count(*) FROM auth.users WHERE id = '${own.id}'::uuid;`)).trim();
if (authUser !== '1') fail('local owner user missing: run migrate:shared:owner first');

const fk = await fkOrphanSql();
const seq = await sequenceFixSql();
const idpOrder = ['business_tenants', 'profiles', 'user_business_memberships', 'user_roles', 'extended_user_roles'];
const script = [
  '\\set ON_ERROR_STOP 1',
  'SET client_min_messages = warning;',
  'BEGIN;',
  'SET LOCAL session_replication_role = replica;',
  truncate || mode === 'rehearsal' ? `TRUNCATE ${ALL_TABLES.map((t) => `public.${sqlIdent(t)}`).join(', ')};` : '',
  ...idpOrder.map((t) => `\\copy public.${sqlIdent(t)} (${columnList(catalog[t])}) FROM '${workPath('export', 'idp', `${t}.copy`)}'`),
  `\\i ${workPath('export', 'data.sql')}`,
  'SET LOCAL session_replication_role = origin;',
  '\\echo __SEQ__',
  seq.sql,
  '\\echo __CHECKSUMS__',
  checksumSql(catalog, own.id, ALL_TABLES),
  '\\echo __FK__',
  fk.sql,
  '\\echo __END__',
  mode === 'commit' ? 'COMMIT;' : 'ROLLBACK;',
].filter(Boolean).join('\n');
const scriptName = `load-${mode}.sql`;
fs.writeFileSync(opsPath(scriptName), script);

const t0 = Date.now();
const r = await localTool('psql', ['-X', '-q', '-At', '-F', '\t', '-f', workPath(scriptName)]);
if (r.code !== 0) fail(`local load failed (transaction rolled back): ${r.stderr}`);
const seconds = Math.round((Date.now() - t0) / 1000);
const section = (name, next) => r.stdout.split(`__${name}__`)[1].split(`__${next}__`)[0];
const local = parseChecksums(section('CHECKSUMS', 'FK'));
const orphans = rows(section('FK', 'END')).map(([name, c]) => ({ name, orphans: Number(c) })).filter((x) => x.orphans > 0);

const tables = ALL_TABLES.map((t) => {
  const s = source.tables[t];
  const l = local[t];
  return { table: t, idp: IDP_TABLES.includes(t), source_rows: s.rows, local_rows: l?.rows, rows_equal: s.rows === l?.rows, checksum_equal: s.checksum === l?.checksum };
});
const ok = tables.filter((t) => t.rows_equal && t.checksum_equal).length;
const report = {
  mode, truncate, finished: new Date().toISOString(), seconds, source_snapshot: source.started,
  tables_ok: ok, tables_total: tables.length,
  rows_source: tables.reduce((a, t) => a + t.source_rows, 0), rows_local: tables.reduce((a, t) => a + (t.local_rows ?? 0), 0),
  fk_checked: fk.count, fk_orphans: orphans, sequences_fixed: seq.count,
  committed: mode === 'commit', previous_local_tables_with_rows: existing.length,
  tables,
  local_checksums: local,
};
writeJson(opsPath(`load-${mode}-report.json`), report);
log(`load ${mode}: ${ok}/${tables.length} tables equal (rows+checksum), rows ${report.rows_local}/${report.rows_source}, FKs ${fk.count} with ${orphans.length} orphan sets, sequences ${seq.count}, ${seconds} s, ${mode === 'commit' ? 'COMMITTED' : 'ROLLED BACK'}`);
for (const t of tables.filter((x) => !(x.rows_equal && x.checksum_equal))) log('DIFF', t);
if (ok !== tables.length || orphans.length > 0) process.exit(1);
