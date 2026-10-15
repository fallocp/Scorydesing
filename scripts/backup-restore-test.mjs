// Restore test of a local backup WITHOUT touching the live data (Phase 8). Node 22, no dependencies.
//   npm run backup:restore-test                       latest backup in BACKUP_DIR (default E:\scorydesign-backups)
//   npm run backup:restore-test -- --backup <folder>
// 1. sha256 of database.dump and storage.tar.gz == manifest.
// 2. Database: CREATE DATABASE scorydesign_restore_test in the local container, pg_restore of the dump there, then
//    rows + md5 per in-scope table (and auth/storage/ledger counts) compared with the live database, then
//    DROP DATABASE scorydesign_restore_test (only that name; the live "postgres" database is only read).
// 3. Storage: storage.tar.gz is extracted inside a throwaway container (postgres:17, --network none, --rm, no
//    volume) and its files (count, bytes, sha256) are compared with the live /mnt, which is only read.
// Evidence: <backup>\restore-test.json.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ALL_TABLES, sqlIdent, sqlLiteral } from './shared-migration/common.mjs';

const ROOT = process.env.BACKUP_DIR ?? 'E:\\scorydesign-backups';
const DB = 'supabase_db_scorydesign';
const STORAGE = 'supabase_storage_scorydesign';
const LIVE_DB = 'postgres';
const TEST_DB = 'scorydesign_restore_test';
const IMAGE = process.env.SCORY_PG_IMAGE ?? 'postgres:17';
const FOLDER = /^\d{4}-\d{2}-\d{2}_\d{4}$/;
const log = (message) => console.log(`${new Date().toISOString()} ${message}`);

const argIndex = process.argv.indexOf('--backup');
const backup = argIndex > 0 ? process.argv[argIndex + 1]
  : readdirSync(ROOT).filter((n) => FOLDER.test(n) && existsSync(join(ROOT, n, 'manifest.json'))).sort().map((n) => join(ROOT, n)).pop();
if (!backup || !existsSync(join(backup, 'manifest.json'))) throw new Error(`No backup with manifest found (${backup ?? ROOT}).`);
const manifest = JSON.parse(readFileSync(join(backup, 'manifest.json'), 'utf8'));
const dumpFile = join(backup, 'database.dump');
const storageFile = join(backup, 'storage.tar.gz');

function docker(args, input) {
  const result = spawnSync('docker', args, { encoding: 'utf8', input, maxBuffer: 512 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`docker ${args.slice(0, 3).join(' ')} failed: ${(result.stderr || result.error?.message || '').trim()}`);
  return result.stdout;
}
const psql = (database, sql) => docker(['exec', '-i', DB, 'psql', '-U', 'supabase_admin', '-d', database, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-F', '\t'], sql)
  .split('\n').filter((l) => l.length > 0).map((l) => l.split('\t'));

// Streams a file into `docker ...` stdin and returns stdout/stderr.
function fileToDocker(args, file) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    let stderr = '';
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout: Buffer.concat(out).toString('utf8'), stderr }));
    // An early stdin close is judged by the exit code and the comparisons below.
    pipeline(createReadStream(file), child.stdin).catch((error) => { if (!['EOF', 'EPIPE'].includes(error.code)) reject(error); });
  });
}
async function sha256(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

// Rows + order-independent md5 per table, with fixed output settings.
const SETTINGS = "SET TimeZone = 'UTC'; SET DateStyle = 'ISO, MDY'; SET IntervalStyle = 'postgres'; SET extra_float_digits = 1; SET bytea_output = 'hex';";
function tableStats(database) {
  const sql = [SETTINGS,
    ...ALL_TABLES.map((t) => `SELECT ${sqlLiteral(`public.${t}`)}, count(*), coalesce(md5(string_agg(h, E'\\n' ORDER BY h)), 'empty') FROM (SELECT md5(x::text) h FROM public.${sqlIdent(t)} x) z;`),
    ...['auth.users', 'auth.identities', 'storage.buckets', 'storage.objects', 'supabase_migrations.schema_migrations'].map((t) => {
      const [schema, table] = t.split('.');
      return `SELECT ${sqlLiteral(t)}, count(*), coalesce(md5(string_agg(h, E'\\n' ORDER BY h)), 'empty') FROM (SELECT md5(x::text) h FROM ${sqlIdent(schema)}.${sqlIdent(table)} x) z;`;
    }),
  ].join('\n');
  return Object.fromEntries(psql(database, sql).map(([t, rows, md5]) => [t, { rows: Number(rows), md5 }]));
}

function dropTestDb() {
  if (TEST_DB !== 'scorydesign_restore_test' || TEST_DB === LIVE_DB) throw new Error('refusing to drop an unexpected database');
  psql(LIVE_DB, `DROP DATABASE IF EXISTS ${sqlIdent(TEST_DB)} WITH (FORCE);`);
}

const result = { backup, startedAt: new Date().toISOString() };

// 1. Files match the manifest.
for (const [name, file] of [['database.dump', dumpFile], ['storage.tar.gz', storageFile]]) {
  result[`${name}_sha256_ok`] = (await sha256(file)) === manifest.files[name].sha256;
  if (!result[`${name}_sha256_ok`]) throw new Error(`${name}: sha256 differs from the manifest`);
}
log(`sha256 de los archivos == manifest (${backup})`);

// 2. Database restore into a separate database.
const existing = psql(LIVE_DB, `SELECT datname FROM pg_database WHERE datname = ${sqlLiteral(TEST_DB)};`);
if (existing.length) dropTestDb(); // leftover of an interrupted test run
psql(LIVE_DB, `CREATE DATABASE ${sqlIdent(TEST_DB)};`);
try {
  const started = Date.now();
  const restore = await fileToDocker(['exec', '-i', DB, 'pg_restore', '-U', 'supabase_admin', '-d', TEST_DB, '--no-owner'], dumpFile);
  const errorLines = restore.stderr.split('\n').filter((l) => /^pg_restore: error:/.test(l));
  result.database = {
    pg_restore_exit: restore.code,
    pg_restore_errors: errorLines.length,
    pg_restore_error_kinds: [...new Set(errorLines.map((l) => l.replace(/"[^"]*"/g, '"…"').replace(/\d+/g, 'N').slice(0, 160)))].slice(0, 20),
    seconds: Math.round((Date.now() - started) / 1000),
  };
  log(`pg_restore en ${TEST_DB}: exit ${restore.code}, ${errorLines.length} errores, ${result.database.seconds} s`);
  const live = tableStats(LIVE_DB);
  const restored = tableStats(TEST_DB);
  const tables = Object.keys(live).map((t) => ({ table: t, live_rows: live[t].rows, restored_rows: restored[t]?.rows, equal: restored[t]?.rows === live[t].rows && restored[t]?.md5 === live[t].md5 }));
  const inScope = tables.filter((t) => t.table.startsWith('public.'));
  Object.assign(result.database, {
    in_scope_tables_equal: inScope.filter((t) => t.equal).length,
    in_scope_tables: inScope.length,
    in_scope_rows: inScope.reduce((a, t) => a + t.live_rows, 0),
    system_tables: tables.filter((t) => !t.table.startsWith('public.')),
    different: tables.filter((t) => !t.equal),
  });
  log(`Tablas en alcance iguales (filas + md5): ${result.database.in_scope_tables_equal}/${inScope.length}; sistema: ${tables.length - inScope.length - result.database.different.filter((t) => !t.table.startsWith('public.')).length}/${tables.length - inScope.length}`);
} finally {
  dropTestDb();
  result.database = { ...result.database, test_db_dropped: psql(LIVE_DB, `SELECT count(*) FROM pg_database WHERE datname = ${sqlLiteral(TEST_DB)};`)[0][0] === '0' };
  log(`DROP DATABASE ${TEST_DB}: ${result.database.test_db_dropped ? 'OK' : 'FALLÓ'}`);
}

// 3. Storage restore inside a throwaway container (no volume, no network, removed on exit).
const parseFiles = (text) => {
  const [hashes, sizes] = text.split('__SIZES__\n');
  const hashList = hashes.split('\n').filter(Boolean).map((l) => l.slice(0, 64)).sort();
  const sizeList = sizes.split('\n').filter(Boolean).map(Number);
  return { files: sizeList.length, bytes: sizeList.reduce((a, b) => a + b, 0), hashes: hashList };
};
const started = Date.now();
const extracted = await fileToDocker(['run', '--rm', '-i', '--network', 'none', IMAGE, 'sh', '-c',
  'mkdir -p /restore && tar -xzf - -C /restore && cd /restore && find . -type f -exec sha256sum {} + && echo __SIZES__ && find . -type f -exec stat -c %s {} +'], storageFile);
if (extracted.code !== 0) throw new Error(`storage extract failed: ${extracted.stderr.trim()}`);
const restoredFiles = parseFiles(extracted.stdout);
const liveFiles = parseFiles(docker(['exec', STORAGE, 'sh', '-c', 'cd /mnt && find . -type f -exec sha256sum {} + && echo __SIZES__ && find . -type f -exec stat -c %s {} +']));
const objects = psql(LIVE_DB, "SELECT count(*), coalesce(sum((metadata->>'size')::bigint), 0) FROM storage.objects;")[0].map(Number);
result.storage = {
  restored_files: restoredFiles.files,
  restored_bytes: restoredFiles.bytes,
  live_mnt_files: liveFiles.files,
  live_mnt_bytes: liveFiles.bytes,
  manifest_mnt_files: manifest.files['storage.tar.gz'].mntFiles,
  manifest_mnt_bytes: manifest.files['storage.tar.gz'].mntBytes,
  storage_objects: objects[0],
  storage_objects_bytes: objects[1],
  sha256_equal_to_live: restoredFiles.hashes.length === liveFiles.hashes.length && restoredFiles.hashes.every((h, i) => h === liveFiles.hashes[i]),
  seconds: Math.round((Date.now() - started) / 1000),
  where: `${IMAGE} --rm --network none (container filesystem, removed on exit)`,
};
log(`Storage: ${restoredFiles.files} archivos / ${restoredFiles.bytes} bytes restaurados; live ${liveFiles.files} / ${liveFiles.bytes}; sha256 iguales: ${result.storage.sha256_equal_to_live}`);

result.finishedAt = new Date().toISOString();
result.ok = result.database.in_scope_tables_equal === result.database.in_scope_tables && result.database.test_db_dropped
  && result.storage.sha256_equal_to_live && result.storage.restored_files === manifest.files['storage.tar.gz'].mntFiles
  && result.storage.restored_bytes === manifest.files['storage.tar.gz'].mntBytes;
writeFileSync(join(backup, 'restore-test.json'), JSON.stringify(result, null, 2));
log(`Restore test ${result.ok ? 'OK' : 'CON DIFERENCIAS'}: ${join(backup, 'restore-test.json')}`);
if (!result.ok) process.exitCode = 1;
