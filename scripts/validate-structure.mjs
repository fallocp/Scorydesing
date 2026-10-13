// Structure validator for the own local Supabase of ScoryDesign (Phase 4).
// Node 22, no dependencies. Run with: npm run validate:structure
import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const errors = [];
const read = (path) => readFile(resolve(root, path), 'utf8');
const exists = async (path) => access(resolve(root, path)).then(() => true, () => false);
const ADRS = [
  'docs/decisions/0001_local_supabase.md',
  'docs/decisions/0002_schema_migration_ownership.md',
  'docs/decisions/0003_storage.md',
  'docs/decisions/0004_phased_login_single_user.md',
  'docs/decisions/0005_data_migration.md',
  'docs/decisions/0006_edge_functions_scope.md',
];

// 1. Migrations: YYYYMMDDXXX_description.sql, valid date, sequence 000.. without gaps or duplicates per day.
try {
  const entries = await readdir(resolve(root, 'supabase/migrations'), { withFileTypes: true });
  const pattern = /^(\d{4})(\d{2})(\d{2})(\d{3})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
  const byDate = new Map();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === 'README.md') continue;
    if (/^seed[_.-]/i.test(entry.name)) {
      errors.push(`Seeds are not allowed in supabase/migrations: ${entry.name}`);
      continue;
    }
    const match = entry.name.match(pattern);
    if (!match) {
      errors.push(`Invalid migration filename: ${entry.name}; expected YYYYMMDDXXX_description.sql (snake_case).`);
      continue;
    }
    const [, y, m, d, seq] = match;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() + 1 !== Number(m) || date.getUTCDate() !== Number(d)) {
      errors.push(`Invalid migration date: ${entry.name}`);
      continue;
    }
    const key = `${y}${m}${d}`;
    byDate.set(key, [...(byDate.get(key) ?? []), { name: entry.name, seq: Number(seq) }]);
  }
  for (const [key, list] of byDate) {
    const seen = new Set();
    for (const item of list) {
      if (seen.has(item.seq)) errors.push(`Duplicate migration sequence for ${key}: ${item.name}`);
      seen.add(item.seq);
    }
    [...seen].sort((a, b) => a - b).forEach((seq, expected) => {
      if (seq !== expected) errors.push(`Gap in migration sequence for ${key}: found ${String(seq).padStart(3, '0')}, expected ${String(expected).padStart(3, '0')}`);
    });
  }
} catch (error) {
  errors.push(`Unable to validate supabase/migrations: ${error.message}`);
}

// 2. supabase/config.toml
try {
  const config = (await read('supabase/config.toml')).replace(/\r\n/g, '\n');
  const section = (name) => {
    const match = config.match(new RegExp(`^\\[${name.replace(/[.[\]]/g, '\\$&')}\\]\\n([\\s\\S]*?)(?=^\\[|(?![\\s\\S]))`, 'm'));
    return match ? match[1] : null;
  };
  const value = (sec, key) => section(sec)?.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'))?.[1].trim();
  if (!/^project_id\s*=\s*"scorydesign"\s*$/m.test(config)) errors.push('config.toml: project_id must be "scorydesign".');
  for (const line of config.split('\n')) {
    const port = line.match(/^\s*([a-z_]*port)\s*=\s*(\d+)\s*$/);
    if (port && (Number(port[2]) < 55320 || Number(port[2]) > 55329)) errors.push(`config.toml: ${port[1]} = ${port[2]} is outside 55320-55329.`);
  }
  if (value('analytics', 'enabled') !== 'false') errors.push('config.toml: [analytics] must be disabled.');
  if (/^\[inbucket\]/m.test(config)) errors.push('config.toml: deprecated [inbucket] section must not exist (use [local_smtp]).');
  if (value('edge_runtime', 'enabled') !== 'true') errors.push('config.toml: [edge_runtime] must be enabled.');
  if (value('db', 'major_version') !== '17') errors.push('config.toml: db.major_version must be 17.');
  if (value('db.seed', 'enabled') !== 'false') errors.push('config.toml: [db.seed] must stay disabled (data comes from Phase 5).');
} catch (error) {
  errors.push(`Unable to validate supabase/config.toml: ${error.message}`);
}

// 3. No link to any remote project at this stage.
for (const linked of ['supabase/.temp/project-ref', 'supabase/.temp/linked-project.json']) {
  if (await exists(linked)) errors.push(`${linked} exists: the repo must not be linked to any Supabase project.`);
}

// 4. No service role variables in .env*.example files.
try {
  const rootFiles = (await readdir(root)).filter((n) => /^\.env.*\.example$/.test(n)).map((n) => n);
  const fnFiles = (await readdir(resolve(root, 'supabase/functions')).catch(() => [])).filter((n) => /^\.env.*\.example$/.test(n)).map((n) => `supabase/functions/${n}`);
  for (const file of [...rootFiles, ...fnFiles]) {
    const lines = (await read(file)).split(/\r?\n/);
    lines.forEach((line, index) => {
      const variable = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]*SERVICE_ROLE[A-Za-z0-9_]*)\s*=/i);
      if (variable) errors.push(`${file}:${index + 1} lists ${variable[1]}; service role credentials are operator-only and never go in .example files.`);
    });
  }
} catch (error) {
  errors.push(`Unable to validate .env*.example files: ${error.message}`);
}

// 5. Accepted ADRs and audit marker.
for (const adr of ADRS) {
  try {
    const text = (await read(adr)).replace(/\*/g, '');
    if (!/Estado:\s*aceptada/.test(text)) errors.push(`${adr} must have 'Estado: aceptada'.`);
  } catch {
    errors.push(`Missing ADR: ${adr}`);
  }
}
try {
  if (!(await read('docs/DEPLOYED_SCHEMA_AUDIT.md')).includes('NO es baseline')) errors.push("docs/DEPLOYED_SCHEMA_AUDIT.md must state it is 'NO es baseline'.");
} catch {
  errors.push('Missing docs/DEPLOYED_SCHEMA_AUDIT.md');
}

// 6. Legacy migrations archived, not deleted.
if (!(await exists('supabase/legacy_shared_migrations'))) errors.push('supabase/legacy_shared_migrations must exist (archived legacy ledger).');

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Repository structure is valid (migrations, config.toml, no link, env examples, ADRs).');
}
