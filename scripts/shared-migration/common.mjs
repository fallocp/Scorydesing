// Shared helpers for the shared -> local migration (Phase 5, ADR-0005). Node 22, no dependencies.
// Credentials never live in the repo: they are read from SCORY_SHARED_CREDENTIALS_FILE (outside the repo)
// and every log line goes through redact(). The shared project is only read (default_transaction_read_only=on,
// pg_dump, Storage GET).
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OPS_DIR = process.env.SCORY_PHASE5_DIR ?? 'F:\\ScoryDesign-ops\\phase5';
export const CREDENTIALS_FILE = process.env.SCORY_SHARED_CREDENTIALS_FILE ?? 'F:\\ScoryDesign-ops\\shared-readonly.env';
export const SHARED_REF_FILE = process.env.SCORY_SHARED_REF_FILE ?? 'F:\\ScoryDesign-ops\\supabase-temp-backup-20261011\\project-ref';
export const OWNER_LOGIN_FILE = process.env.SCORY_LOCAL_OWNER_LOGIN_FILE ?? 'F:\\ScoryDesign-ops\\local-owner-login.txt';
export const LOCAL_API_URL = (process.env.SCORY_LOCAL_API_URL ?? 'http://127.0.0.1:55321').replace(/\/$/, '');
export const LOCAL_DB_CONTAINER = process.env.SCORY_LOCAL_DB_CONTAINER ?? 'supabase_db_scorydesign';
export const LOCAL_DB_NETWORK = process.env.SCORY_LOCAL_DB_NETWORK ?? 'scorydesign-supabase-local';
export const PG_IMAGE = process.env.SCORY_PG_IMAGE ?? 'postgres:17';

// Tables in scope (docs/MIGRATION_SCOPE.md §2.1). IdP tables only get the owner snapshot (ADR-0004).
export const SCORY_OWNED = `brand_assets brand_disclaimers brand_onboarding_sessions compliance_messages compliance_rejected_suggestions compliance_rule_versions compliance_sessions copy_bank_items copy_kits creative_profiles desaing_audit desaing_brand_drafts desaing_brand_publications desaing_brand_revisions desaing_continuity desaing_explorations desaing_material_collections desaing_material_revisions desaing_policies desaing_production_receipts desaing_production_snapshots desaing_prompt_admin_drafts desaing_prompt_admin_grants desaing_prompt_admin_history desaing_prompt_admin_mutations desaing_prompt_admin_reviews desaing_prompt_admin_scopes desaing_prompt_admin_tests desaing_state design_feedback design_mockups design_sessions pipeline_pieces pipeline_runs pipeline_steps presentations promoters validation_disputes validation_history`.split(' ');
export const AMBIGUOUS = `business_angles business_channels campaign_categories commercial_branches content_calendar content_library design_campaigns design_images design_library design_pieces generated_ideas image_library industry_verticals market_moments master_prompts narrative_angles news_editions schema_versions`.split(' ');
export const DATA_TABLES = [...SCORY_OWNED, ...AMBIGUOUS];
export const IDP_TABLES = ['business_tenants', 'user_business_memberships', 'profiles', 'user_roles', 'extended_user_roles'];
export const ALL_TABLES = [...IDP_TABLES, ...DATA_TABLES];
export const BUCKETS = ['design-images', 'desaing-assets', 'Brand', 'desaing-conversation-references', 'desaing-materials', 'brand-assets'];

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------
const secrets = new Set();
export function addSecret(...values) {
  for (const v of values) if (typeof v === 'string' && v.length >= 4) secrets.add(v);
}
export function redact(input) {
  let text = String(input);
  for (const s of [...secrets].sort((a, b) => b.length - a.length)) text = text.split(s).join('<REDACTED>');
  return text
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '<JWT>')
    .replace(/sb_(secret|publishable)_[A-Za-z0-9_-]+/g, '<KEY>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
    .replace(/[a-z0-9]{20}\.supabase\.co/gi, '<shared-host>');
}
export const log = (...parts) => console.log(redact(parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')));
export const fail = (message) => {
  console.error(redact(message));
  process.exit(1);
};

// ---------------------------------------------------------------------------
// Shared credentials (outside the repo)
// ---------------------------------------------------------------------------
let sharedCache;
export function readEnvFile(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
  }
  return out;
}
export function shared() {
  if (sharedCache) return sharedCache;
  const env = readEnvFile(CREDENTIALS_FILE);
  const url = env.SHARED_DB_URL;
  if (!url) fail(`SHARED_DB_URL missing in credentials file`);
  const m = url.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^@:/]+):(\d+)\/([^?]+)/);
  if (!m) fail('SHARED_DB_URL has an unexpected format');
  const [, user, rawPass, host, port, database] = m;
  const password = /%[0-9A-Fa-f]{2}/.test(rawPass) ? decodeURIComponent(rawPass) : rawPass;
  const ref = (env.SHARED_PROJECT_REF ?? fs.readFileSync(SHARED_REF_FILE, 'utf8')).trim();
  const apiUrl = (env.SHARED_SUPABASE_URL ?? `https://${ref}.supabase.co`).replace(/\/$/, '');
  const serviceKey = env.SHARED_SERVICE_ROLE_KEY || null;
  addSecret(url, rawPass, password, host, user, ref, apiUrl, serviceKey);
  sharedCache = { user, password, host, port, database, ref, apiUrl, serviceKey };
  return sharedCache;
}

// ---------------------------------------------------------------------------
// Local keys (from `supabase status -o json`, kept in memory)
// ---------------------------------------------------------------------------
let localCache;
export function localKeys() {
  if (localCache) return localCache;
  let anon = process.env.SCORY_LOCAL_ANON_KEY;
  let service = process.env.SCORY_LOCAL_SERVICE_ROLE_KEY;
  if (!anon || !service) {
    const cli = path.join(REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'supabase.cmd' : 'supabase');
    const r = spawnSync(cli, ['status', '-o', 'json'], { cwd: REPO_ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
    const text = r.stdout ?? '';
    const start = text.indexOf('{');
    if (start < 0) fail('supabase status -o json returned no JSON (is the local stack up?)');
    const status = JSON.parse(text.slice(start, text.lastIndexOf('}') + 1));
    anon ??= status.ANON_KEY;
    service ??= status.SERVICE_ROLE_KEY;
  }
  if (!anon || !service) fail('Local anon/service_role keys not found');
  addSecret(anon, service);
  localCache = { anon, service };
  return localCache;
}

// ---------------------------------------------------------------------------
// Processes
// ---------------------------------------------------------------------------
export function run(cmd, args, { env = {}, input, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') }));
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

const PG_ENV_NAMES = ['PGUSER', 'PGPASSWORD', 'PGHOST', 'PGPORT', 'PGDATABASE', 'PGSSLMODE', 'PGOPTIONS'];

// Runs a postgres:17 client tool (psql / pg_dump) against the shared DB, read-only.
// The work dir (OPS_DIR) is mounted at /work. Secrets go through env, never through args.
export async function sharedTool(tool, args, { input } = {}) {
  const s = shared();
  fs.mkdirSync(OPS_DIR, { recursive: true });
  const env = {
    PGUSER: s.user,
    PGPASSWORD: s.password,
    PGHOST: s.host,
    PGPORT: s.port,
    PGDATABASE: s.database,
    PGSSLMODE: 'require',
    PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=0',
  };
  const dockerArgs = ['run', '--rm', '-i', ...PG_ENV_NAMES.flatMap((n) => ['-e', n]), '-v', `${OPS_DIR}:/work`, PG_IMAGE, tool, ...args];
  return run('docker', dockerArgs, { env, input });
}

// Same client image against the local DB, through the local Docker network.
// Loads use the local superuser (supabase_admin) so session_replication_role and RLS do not get in the way.
export async function localTool(tool, args, { input, user } = {}) {
  fs.mkdirSync(OPS_DIR, { recursive: true });
  const env = {
    PGUSER: user ?? process.env.SCORY_LOCAL_DB_USER ?? 'supabase_admin',
    PGPASSWORD: process.env.SCORY_LOCAL_DB_PASSWORD ?? 'postgres',
    PGHOST: LOCAL_DB_CONTAINER,
    PGPORT: '5432',
    PGDATABASE: 'postgres',
    PGSSLMODE: 'disable',
    PGOPTIONS: '-c statement_timeout=0',
  };
  const dockerArgs = ['run', '--rm', '-i', '--network', LOCAL_DB_NETWORK, ...PG_ENV_NAMES.flatMap((n) => ['-e', n]), '-v', `${OPS_DIR}:/work`, PG_IMAGE, tool, ...args];
  return run('docker', dockerArgs, { env, input });
}

// Long-lived read-only psql session against the shared DB (used to export a snapshot to pg_dump --snapshot).
export function sharedSession() {
  const s = shared();
  fs.mkdirSync(OPS_DIR, { recursive: true });
  const env = {
    ...process.env,
    PGUSER: s.user, PGPASSWORD: s.password, PGHOST: s.host, PGPORT: s.port, PGDATABASE: s.database, PGSSLMODE: 'require',
    PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=0 -c idle_in_transaction_session_timeout=0',
  };
  const child = spawn('docker', ['run', '--rm', '-i', ...PG_ENV_NAMES.flatMap((n) => ['-e', n]), '-v', `${OPS_DIR}:/work`, PG_IMAGE, 'psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-F', '\t'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '';
  let stderr = '';
  let pending = null;
  let n = 0;
  child.stdout.on('data', (d) => {
    buffer += d.toString('utf8');
    if (pending) {
      const i = buffer.indexOf(pending.marker);
      if (i >= 0) {
        const text = buffer.slice(0, i);
        buffer = buffer.slice(i + pending.marker.length).replace(/^\r?\n/, '');
        const p = pending;
        pending = null;
        p.resolve(text);
      }
    }
  });
  child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
  let closed = false;
  const closedPromise = new Promise((r) => child.on('close', r));
  child.on('close', (code) => {
    closed = true;
    if (pending) pending.reject(new Error(redact(`shared session closed (${code}): ${stderr}`)));
  });
  return {
    query(sql) {
      const marker = `__SCORY_END_${++n}__`;
      return new Promise((resolve, reject) => {
        pending = { marker, resolve, reject };
        child.stdin.write(`${sql}\n\\echo ${marker}\n`);
      });
    },
    async close() {
      if (!closed) child.stdin.end('ROLLBACK;\n\\q\n');
      await closedPromise;
    },
  };
}

// psql helpers: SQL on stdin, unaligned output, stop on first error.
const PSQL_ARGS = ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-F', '\t'];
export async function sharedSql(sql) {
  const r = await sharedTool('psql', PSQL_ARGS, { input: `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n${sql}\nROLLBACK;\n` });
  if (r.code !== 0) fail(`shared psql failed: ${r.stderr}`);
  return r.stdout;
}
export async function localSql(sql, { raw = false, user } = {}) {
  const r = await localTool('psql', PSQL_ARGS, { input: sql, user });
  if (r.code !== 0 && !raw) fail(`local psql failed: ${r.stderr}`);
  return raw ? r : r.stdout;
}
export const rows = (text) => text.split('\n').filter((l) => l.length > 0).map((l) => l.split('\t'));

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export const sqlLiteral = (v) => `'${String(v).replace(/'/g, "''")}'`;
export const sqlIdent = (v) => `"${String(v).replace(/"/g, '""')}"`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = process.argv[i + 1];
  return next === undefined || next.startsWith('--') ? true : next;
}
export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
export const opsPath = (...parts) => path.join(OPS_DIR, ...parts);
// Path inside the container for a file under OPS_DIR.
export const workPath = (...parts) => ['/work', ...parts].join('/');

// fetch with retries and exponential backoff (network errors, 429 and 5xx).
export async function fetchRetry(url, init = {}, { retries = 5, base = 500 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(300_000) });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      } else return res;
    } catch (error) {
      lastError = error;
    }
    if (attempt < retries) await sleep(base * 2 ** attempt + Math.floor(Math.random() * 250));
  }
  throw lastError;
}

export async function pool(items, concurrency, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

export function decodeJwtPayload(jwt) {
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
}

export function owner() {
  const o = readJson(opsPath('owner.json'));
  if (!o?.id) fail('owner.json missing: run migrate:shared:owner first');
  addSecret(o.id, o.email);
  return o;
}
