/** One administrative pilot request. No retry, credential output, or automatic follow-up. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { appendFile, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifacts = path.join(root, 'artifacts', 'desaing-lab');
const endpoint = 'https://gdfhytvjnzdovjfovqfv.supabase.co/functions/v1/desaing-pilot';
const maxBytes = 12 * 1024 * 1024;
const options = {};
let token = '', action = null, operationKey = null, httpStatus = null, requestSent = false, intentWritten = false;
const invocationId = randomUUID();
let output, logPath, startedAt;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeText = value => typeof value === 'string' ? redactString(value).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200) : null;
const redactString = value => token ? value.replaceAll(token, '[secret omitted]') : value;
function withoutSecrets(value) {
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (record(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    /(?:b64|base64|authorization|token|api[_-]?key|secret)/i.test(key) && !/(?:tokens|token_usage)/i.test(key)
      ? '[omitted]' : withoutSecrets(item)]));
  return value;
}
const inside = (base, candidate) => candidate === base || candidate.startsWith(`${base}${path.sep}`);
async function artifactPath(value) {
  const destination = path.resolve(root, value);
  assert(inside(artifacts, destination) && destination !== artifacts, 'Output must be inside artifacts/desaing-lab.');
  await mkdir(path.dirname(destination), { recursive: true });
  const parent = await realpath(path.dirname(destination));
  assert(inside(await realpath(artifacts), parent), 'Output directory resolves outside the artifact directory.');
  const existing = await lstat(destination).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  assert(!existing || existing.isFile() && !existing.isSymbolicLink(), 'Output must be a regular file.');
  return destination;
}
async function event(details) {
  await appendFile(logPath, `${JSON.stringify(withoutSecrets({ at: new Date().toISOString(), invocation_id: invocationId,
    action, operation_key: operationKey, ...details }))}\n`, { encoding: 'utf8', flush: true });
}
function summary(body) {
  const jobs = body?.state?.jobs?.jobs;
  return withoutSecrets({ http_status: httpStatus, action, operation_key: operationKey,
    error: safeText(body?.error), reused: body?.reused, execution: body?.execution, models: body?.models,
    limits: body?.limits, quota: body?.quota, expired: body?.expired, expires_at: body?.expires_at,
    revision: body?.revision, asset: body?.asset,
    jobs: Array.isArray(jobs) ? jobs.map(job => ({ operation_key: job.operation_key,
      calls: job.calls?.map(call => ({ call_key: call.call_key, state: call.state, error_code: call.error_code,
        reserved_micro_usd: call.reserved_micro_usd, settlement: call.settlement,
        outputs: call.receipt?.outputs, usage: call.receipt?.usage, response_usage: call.receipt?.response_usage,
        http_status: call.receipt?.http_status, duration_ms: call.receipt?.duration_ms })) })) : undefined,
    output: output ? path.relative(root, output) : undefined });
}

try {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index], value = args[index + 1];
    assert(['--request', '--output', '--asset-output', '--auth'].includes(option) && value && !(option in options),
      'Usage: node scripts/desaing/pilot-request.mjs --request request.json [--output artifacts/desaing-lab/response.json] [--asset-output artifacts/desaing-lab/image.png] [--auth none|wrong]');
    options[option] = value;
  }
  assert(options['--request'], 'A request JSON file is required.');
  assert(options['--auth'] === undefined || ['none', 'wrong'].includes(options['--auth']), 'Auth override must be none or wrong.');
  const authMode = options['--auth'] ?? 'correct';
  if (authMode === 'correct') {
    // No process.env fallback: this dedicated local file is the only token source.
    const env = await readFile(path.join(root, '.env.desaing-pilot.local'), 'utf8');
    const values = env.split(/\r?\n/).map(line => /^\s*(?:export\s+)?DESAING_PILOT_TOKEN\s*=\s*(.*?)\s*$/.exec(line)).filter(Boolean);
    assert.equal(values.length, 1, 'The local pilot file must contain one DESAING_PILOT_TOKEN.');
    const raw = values[0][1];
    token = /^(['"]).*\1$/.test(raw) ? raw.slice(1, -1) : raw.replace(/\s+#.*$/, '');
    assert(token.length >= 32 && token.length <= 8192 && !/[\x00-\x20\x7f]/.test(token), 'Invalid local pilot token format.');
  }
  const requestBytes = await readFile(path.resolve(root, options['--request']));
  assert(requestBytes.length > 0 && requestBytes.length <= maxBytes, 'Request exceeds the 12 MiB local limit.');
  const request = JSON.parse(requestBytes.toString('utf8'));
  assert(record(request) && typeof request.action === 'string', 'Request requires an action.');
  action = safeText(request.action);
  operationKey = safeText(request.operation?.operation_key ?? request.operation_key);
  const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${invocationId.slice(0, 8)}`;
  output = await artifactPath(options['--output'] ?? `artifacts/desaing-lab/pilot-response-${stamp}.json`);
  assert.equal(path.extname(output).toLowerCase(), '.json', 'Response output must use .json.');
  const assetOutput = options['--asset-output'] || action === 'read_asset'
    ? await artifactPath(options['--asset-output'] ?? `artifacts/desaing-lab/pilot-asset-${stamp}.png`) : null;
  if (assetOutput) assert.equal(path.extname(assetOutput).toLowerCase(), '.png', 'Asset output must use .png.');
  logPath = await artifactPath('artifacts/desaing-lab/pilot-requests.jsonl');
  startedAt = Date.now();
  await event({ event: 'intent', endpoint, auth_mode: authMode, request_bytes: requestBytes.length,
    request_sha256: createHash('sha256').update(requestBytes).digest('hex') });
  intentWritten = true;
  const headers = { 'Content-Type': 'application/json' };
  if (authMode !== 'none') headers.Authorization = `Bearer ${authMode === 'wrong' ? 'invalid-pilot-token-for-authentication-check' : token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  let body;
  try {
    requestSent = true;
    const response = await fetch(endpoint, { method: 'POST', headers, body: requestBytes,
      redirect: 'error', signal: controller.signal });
    httpStatus = response.status;
    const reader = response.body?.getReader();
    assert(reader, 'Pilot response had no body.');
    const chunks = [];
    let length = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > maxBytes) { await reader.cancel(); throw new Error('Pilot response exceeds the 12 MiB local limit.'); }
      chunks.push(part.value);
    }
    body = JSON.parse(Buffer.concat(chunks, length).toString('utf8'));
    assert(record(body), 'Pilot response must be a JSON object.');
  } finally { clearTimeout(timer); }
  const saved = withoutSecrets(body);
  if (typeof body.b64_json === 'string') {
    assert(action === 'read_asset' && assetOutput, 'Unexpected image payload: not saved as JSON.');
    assert(body.mime_type === 'image/png' && body.b64_json.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(body.b64_json), 'Invalid PNG payload.');
    const bytes = Buffer.from(body.b64_json, 'base64');
    assert(bytes.length >= 24 && bytes.length <= 8388608 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Invalid PNG signature or size.');
    if (/^[a-f0-9]{64}$/i.test(body.asset?.version_id ?? '')) {
      assert.equal(createHash('sha256').update(bytes).digest('hex'), body.asset.version_id.toLowerCase(), 'Asset SHA-256 differs from its version.');
    }
    await writeFile(assetOutput, bytes);
    delete saved.b64_json;
    saved.local_asset = { path: path.relative(root, assetOutput), bytes: bytes.length,
      width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  await writeFile(output, `${JSON.stringify(saved, null, 2)}\n`, 'utf8');
  const result = { ...summary(body), ...(saved.local_asset ? { local_asset: saved.local_asset } : {}) };
  await event({ event: 'outcome', duration_ms: Date.now() - startedAt, ...result });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (httpStatus < 200 || httpStatus >= 300) process.exitCode = 1;
} catch (error) {
  const failure = { http_status: httpStatus, action, operation_key: operationKey,
    error: error.name === 'AbortError' ? 'pilot_request_timeout' : 'pilot_request_failed',
    // Parser and transport messages can quote request/response bytes; never echo them.
    failure_type: safeText(error.name), request_sent: requestSent, outcome_unknown: requestSent,
    automatic_retries: 0, output: output ? path.relative(root, output) : undefined };
  if (intentWritten) await event({ event: 'outcome', duration_ms: Date.now() - startedAt, ...failure }).catch(() => {});
  process.stderr.write(`${JSON.stringify(failure, null, 2)}\n`);
  process.exitCode = 1;
}
