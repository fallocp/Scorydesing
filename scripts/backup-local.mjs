// Daily backup of the local Supabase of ScoryDesign (Windows task "scorydesign-backup", or by hand with
// `npm run backup:local`). Node 22, no dependencies. Same layout as agents-finmarket:
//   <root>\YYYY-MM-DD_HHmm\database.dump    pg_dump -Fc --no-owner of the whole local database (public, auth,
//                                            storage, the migration ledger, ...), verified with pg_restore --list
//   <root>\YYYY-MM-DD_HHmm\storage.tar.gz   /mnt of the Storage container (object files), streamed to disk
//   <root>\YYYY-MM-DD_HHmm\manifest.json    sha256 and bytes per file, row counts, objects/bytes per bucket, restore steps
// The folder is written as <name>.partial and renamed only when everything is OK. Retention (BACKUP_KEEP_DAYS, 30)
// only removes dated folders inside the root that hold a valid manifest, never the one just created.
// The backup holds every local row (auth included) and every object: keep it on this machine.
// Restore test without touching the live data: npm run backup:restore-test (docs/ROLLBACK.md).
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ALL_TABLES, BUCKETS, sqlIdent, sqlLiteral } from './shared-migration/common.mjs';

const ROOT = process.env.BACKUP_DIR ?? 'E:\\scorydesign-backups';
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS ?? 30);
const DB = 'supabase_db_scorydesign';
const STORAGE = 'supabase_storage_scorydesign';
const FOLDER = /^\d{4}-\d{2}-\d{2}_\d{4}$/;

const stamp = new Intl.DateTimeFormat('sv-SE', { day: '2-digit', hour: '2-digit', hour12: false, minute: '2-digit', month: '2-digit', timeZone: 'America/Mexico_City', year: 'numeric' })
  .format(new Date()).replace(' ', '_').replace(':', '');
const log = (message) => console.log(`${new Date().toISOString()} ${message}`);

function docker(args, input) {
  const result = spawnSync('docker', args, { encoding: 'utf8', input, maxBuffer: 256 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`docker ${args.slice(0, 3).join(' ')} failed: ${(result.stderr || result.error?.message || '').trim()}`);
  return result.stdout.trim();
}
const psql = (sql) => docker(['exec', '-i', DB, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-F', '\t'], sql)
  .split('\n').filter((l) => l.length > 0).map((l) => l.split('\t'));

// Streams `docker exec ...` stdout into a file (binary safe).
async function dockerToFile(args, file) {
  const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const exited = new Promise((resolve) => child.on('close', resolve));
  await pipeline(child.stdout, createWriteStream(file));
  const code = await exited;
  if (code !== 0) throw new Error(`docker ${args.slice(0, 3).join(' ')} exited ${code}: ${stderr.trim()}`);
}

// Streams a file into `docker exec -i ...` stdin and returns stdout/stderr.
function fileToDocker(args, file) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    let stderr = '';
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout: Buffer.concat(out).toString('utf8'), stderr }));
    // pg_restore --list reads only the table of contents and may close stdin early: the exit code decides.
    pipeline(createReadStream(file), child.stdin).catch((error) => { if (!['EOF', 'EPIPE'].includes(error.code)) reject(error); });
  });
}

async function sha256(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

function validManifest(folder) {
  try {
    const manifest = JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8'));
    return manifest.schemaVersion === 1 && Boolean(manifest.files?.['database.dump']?.sha256);
  } catch {
    return false;
  }
}

for (const container of [DB, STORAGE]) {
  let running = 'false';
  try { running = docker(['inspect', '-f', '{{.State.Running}}', container]); } catch { /* missing container */ }
  if (running !== 'true') throw new Error(`${container} is not running (open Docker Desktop and run npm run supabase:start).`);
}

mkdirSync(ROOT, { recursive: true });
const target = join(ROOT, stamp);
if (existsSync(target)) throw new Error(`${target} already exists (one backup per minute).`);
const partial = `${target}.partial`;
rmSync(partial, { force: true, recursive: true });
mkdirSync(partial);

log(`Respaldo en ${target}`);
const dumpFile = join(partial, 'database.dump');
await dockerToFile(['exec', DB, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '-Fc', '--no-owner', '--quote-all-identifiers'], dumpFile);
// The dump must be readable by pg_restore (catalog of its entries).
const listing = await fileToDocker(['exec', '-i', DB, 'pg_restore', '--list'], dumpFile);
if (listing.code !== 0) throw new Error(`pg_restore --list rejected the dump: ${listing.stderr.trim()}`);
const entries = listing.stdout.split('\n').filter((line) => line.trim() !== '' && !line.startsWith(';'));
const dataSchemas = new Set(entries.map((line) => line.match(/ TABLE DATA "?([^" ]+)"? /)?.[1]).filter(Boolean));
const schemasInDump = ['public', 'auth', 'storage', 'supabase_migrations'].filter((schema) => dataSchemas.has(schema));
if (schemasInDump.length !== 4) throw new Error(`the dump has no table data for: ${['public', 'auth', 'storage', 'supabase_migrations'].filter((s) => !dataSchemas.has(s)).join(', ')}`);
log(`Base: ${(statSync(dumpFile).size / 1024 / 1024).toFixed(1)} MB, ${entries.length} entradas verificadas (${schemasInDump.join(', ')})`);

const storageFile = join(partial, 'storage.tar.gz');
await dockerToFile(['exec', STORAGE, 'tar', '-czf', '-', '-C', '/mnt', '.'], storageFile);
const mntSizes = docker(['exec', STORAGE, 'sh', '-c', 'find /mnt -type f -exec stat -c %s {} +']).split('\n').filter(Boolean).map(Number);
log(`Archivos: ${(statSync(storageFile).size / 1024 / 1024).toFixed(1)} MB (${mntSizes.length} archivos en /mnt)`);

const rowCounts = Object.fromEntries(psql([
  ...ALL_TABLES.map((t) => `SELECT ${sqlLiteral(`public.${t}`)}, count(*) FROM public.${sqlIdent(t)};`),
  "SELECT 'auth.users', count(*) FROM auth.users;",
  "SELECT 'storage.buckets', count(*) FROM storage.buckets;",
  "SELECT 'storage.objects', count(*) FROM storage.objects;",
  "SELECT 'supabase_migrations.schema_migrations', count(*) FROM supabase_migrations.schema_migrations;",
].join('\n')).map(([key, value]) => [key, Number(value)]));
const buckets = Object.fromEntries(BUCKETS.map((b) => [b, { objects: 0, bytes: 0 }]));
for (const [bucket, objects, bytes] of psql("SELECT bucket_id, count(*), coalesce(sum((metadata->>'size')::bigint), 0) FROM storage.objects GROUP BY 1 ORDER BY 1;")) {
  buckets[bucket] = { objects: Number(objects), bytes: Number(bytes) };
}
const ledger = psql('SELECT version FROM supabase_migrations.schema_migrations ORDER BY 1;').map(([v]) => v);

writeFileSync(join(partial, 'manifest.json'), JSON.stringify({
  createdAt: new Date().toISOString(),
  files: {
    'database.dump': { bytes: statSync(dumpFile).size, format: 'pg_dump custom (-Fc --no-owner), whole postgres database', pgRestoreEntries: entries.length, schemasListed: schemasInDump, sha256: await sha256(dumpFile) },
    'storage.tar.gz': { bytes: statSync(storageFile).size, contents: `${STORAGE}:/mnt`, mntFiles: mntSizes.length, mntBytes: mntSizes.reduce((a, b) => a + b, 0), sha256: await sha256(storageFile) },
  },
  migrationLedger: ledger,
  rowCounts,
  storageBuckets: buckets,
  restore: [
    'Test first without touching live data: npm run backup:restore-test -- --backup <this folder>.',
    'Stop the app (Ctrl+C on npm run dev:local). Keep the stack up (npm run supabase:start).',
    'Take a fresh backup of the current state first: npm run backup:local.',
    'Database: docker exec -i supabase_db_scorydesign pg_restore -U supabase_admin -d postgres --clean --if-exists --no-owner < database.dump',
    'Files: docker exec -i supabase_storage_scorydesign sh -c "tar -xzf - -C /mnt" < storage.tar.gz',
    'Restart the services: npm run supabase:stop, then npm run supabase:start (never --no-backup).',
    'Check: npm run smoke:local and npm run dev:local (login, images).',
  ],
  schemaVersion: 1,
}, null, 2));
renameSync(partial, target);

// Retention: only dated backup folders inside the root with a valid manifest, never the new one.
const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
let removed = 0;
for (const name of readdirSync(ROOT)) {
  const path = join(ROOT, name);
  if (!FOLDER.test(name) || path === target || !validManifest(path)) continue;
  if (statSync(path).mtimeMs < cutoff) { rmSync(path, { force: true, recursive: true }); removed += 1; }
}
const totalRows = ALL_TABLES.reduce((sum, t) => sum + rowCounts[`public.${t}`], 0);
log(`Listo. ${totalRows} filas en ${ALL_TABLES.length} tablas, ${rowCounts['storage.objects']} objetos. Respaldos borrados por antigüedad (> ${KEEP_DAYS} días): ${removed}.`);
