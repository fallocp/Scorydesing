// Steps 2-3 (ADR-0005): read-only export of the shared data in ONE snapshot.
// - A REPEATABLE READ READ ONLY session exports its snapshot.
// - pg_dump --data-only --snapshot=<that snapshot> of the 57 ScoryDesign tables.
// - In the same session: \copy of the IdP snapshot (owner + the owner's businesses) and the per-table
//   checksums (rows, md5, max(updated_at), max(created_at)).
// Output (outside the repo): <SCORY_PHASE5_DIR>/export/{data.sql, idp/*.copy, source-checksums.json}.
import fs from 'node:fs';
import { DATA_TABLES, IDP_TABLES, ALL_TABLES, fail, log, opsPath, owner, sharedSession, sharedTool, sqlIdent, workPath, writeJson } from './common.mjs';
import { checksumSql, columnList, idpFilter, localCatalog, parseChecksums } from './catalog.mjs';

const own = owner();
const catalog = await localCatalog();
fs.mkdirSync(opsPath('export', 'idp'), { recursive: true });

const started = new Date().toISOString();
const session = sharedSession();
try {
  await session.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;');
  const snapshot = (await session.query('SELECT pg_export_snapshot();')).trim();
  if (!/^[0-9A-F-]+$/i.test(snapshot)) fail('could not export snapshot');
  log('snapshot exported');

  const t0 = Date.now();
  const dump = await sharedTool('pg_dump', [
    '--data-only', '--no-owner', '--no-privileges', `--snapshot=${snapshot}`, '--file', workPath('export', 'data.sql'),
    ...DATA_TABLES.flatMap((t) => ['--table', `public.${t}`]),
  ]);
  if (dump.code !== 0) fail(`pg_dump failed: ${dump.stderr}`);
  if (dump.stderr.trim()) log('pg_dump notes:', dump.stderr.trim());
  log(`pg_dump done in ${Math.round((Date.now() - t0) / 1000)} s, ${fs.statSync(opsPath('export', 'data.sql')).size} bytes`);

  for (const table of IDP_TABLES) {
    const t = catalog[table];
    await session.query(`\\copy (SELECT ${t.columns.map((c) => `x.${sqlIdent(c.col)}`).join(', ')} FROM public.${sqlIdent(table)} x WHERE ${idpFilter(table, own.id)}) TO '${workPath('export', 'idp', `${table}.copy`)}'`);
  }
  log('IdP snapshot copied');

  const t1 = Date.now();
  const checksums = parseChecksums(await session.query(checksumSql(catalog, own.id, ALL_TABLES)));
  log(`source checksums computed in ${Math.round((Date.now() - t1) / 1000)} s`);
  if (Object.keys(checksums).length !== ALL_TABLES.length) fail('missing checksum rows');
  writeJson(opsPath('export', 'source-checksums.json'), { started, finished: new Date().toISOString(), tables: checksums });
  writeJson(opsPath('export', 'columns.json'), Object.fromEntries(IDP_TABLES.map((t) => [t, columnList(catalog[t])])));
  const total = Object.values(checksums).reduce((a, c) => a + c.rows, 0);
  log(`export ok: ${ALL_TABLES.length} tables, ${total} rows`);
} finally {
  await session.close();
}
