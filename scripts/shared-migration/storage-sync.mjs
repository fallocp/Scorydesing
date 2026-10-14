// Step 4-5 (ADR-0003/0005): copy Storage objects shared -> local, keeping bucket and exact path.
//   --mode rehearsal  Brand, desaing-materials, desaing-conversation-references, brand-assets complete
//                     + 20 objects of design-images and 20 of desaing-assets
//   --mode full       every object of the 6 buckets
// Shared side: storage.objects listed read-only; objects downloaded with GET only (public buckets through
// /object/public/, private ones through /object/<bucket>/<path> with SHARED_SERVICE_ROLE_KEY).
// Local side: upload with x-upsert, content-type and cache-control of the origin, re-download and sha256 check,
// then owner/owner_id/user_metadata/created_at/updated_at aligned in storage.objects.
// Resumable: manifest at <SCORY_PHASE5_DIR>/storage-manifest.json (sha256 per object). Files stay in
// <SCORY_PHASE5_DIR>/storage/<bucket>/<path> as an extra copy.
import fs from 'node:fs';
import path from 'node:path';
import {
  BUCKETS, LOCAL_API_URL, arg, fail, fetchRetry, localKeys, localTool, log, opsPath, pool, readJson, sha256, shared,
  sharedSql, sqlLiteral, workPath, writeJson,
} from './common.mjs';

const mode = arg('mode', 'rehearsal');
if (!['rehearsal', 'full'].includes(mode)) fail('--mode must be rehearsal or full');
const concurrency = Number(arg('concurrency', 5));
const PUBLIC = new Set(['design-images', 'Brand']);
const SAMPLE = { 'design-images': 20, 'desaing-assets': 20 };

const s = shared();
if (!s.serviceKey) fail('SHARED_SERVICE_ROLE_KEY missing in the credentials file (needed for private buckets)');
const { service } = localKeys();

// 1. Listing (read-only).
const listing = (await sharedSql(`SELECT json_build_object('bucket', bucket_id, 'name', name, 'metadata', metadata, 'owner', owner, 'owner_id', owner_id,
  'user_metadata', user_metadata, 'created_at', created_at, 'updated_at', updated_at)::text
  FROM storage.objects WHERE bucket_id IN (${BUCKETS.map(sqlLiteral).join(',')}) ORDER BY bucket_id, name COLLATE "C";`))
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));
writeJson(opsPath('storage-source.json'), { listed_at: new Date().toISOString(), objects: listing });
const byBucket = Object.fromEntries(BUCKETS.map((b) => [b, listing.filter((o) => o.bucket === b)]));
log('source listing', Object.fromEntries(BUCKETS.map((b) => [b, byBucket[b].length])));

let selected;
if (mode === 'full') selected = listing;
else {
  selected = [];
  for (const b of BUCKETS) {
    const list = byBucket[b];
    if (!SAMPLE[b]) { selected.push(...list); continue; }
    const step = list.length / SAMPLE[b];
    for (let i = 0; i < Math.min(SAMPLE[b], list.length); i++) selected.push(list[Math.floor(i * step)]);
  }
}

const manifestFile = opsPath('storage-manifest.json');
const manifest = readJson(manifestFile, { objects: {} });
const key = (o) => `${o.bucket}/${o.name}`;
const enc = (name) => name.split('/').map(encodeURIComponent).join('/');
const fileOf = (o) => path.join(opsPath('storage', o.bucket), ...o.name.split('/'));
let dirty = 0;
const save = (force = false) => { if (force || ++dirty % 25 === 0) writeJson(manifestFile, manifest); };

async function download(o) {
  const urls = [];
  if (PUBLIC.has(o.bucket)) urls.push([`${s.apiUrl}/storage/v1/object/public/${o.bucket}/${enc(o.name)}`, {}]);
  urls.push([`${s.apiUrl}/storage/v1/object/${o.bucket}/${enc(o.name)}`, { headers: { apikey: s.serviceKey, Authorization: `Bearer ${s.serviceKey}` } }]);
  const expected = Number(o.metadata?.size);
  let last = '';
  for (const [url, init] of urls) {
    const res = await fetchRetry(url, { method: 'GET', ...init });
    const buf = Buffer.from(await res.arrayBuffer());
    if (res.status === 200 && buf.length === expected) return { buf, via: url.includes('/object/public/') ? 'public' : 'service' };
    last = `HTTP ${res.status}, ${buf.length} bytes (expected ${expected})`;
  }
  throw new Error(`download failed: ${last}`);
}

const failures = [];
let done = 0;
await pool(selected, concurrency, async (o) => {
  const k = key(o);
  const m = (manifest.objects[k] ??= {});
  try {
    const size = Number(o.metadata?.size);
    const file = fileOf(o);
    // Download (skip if the stored copy still matches size and sha256 of the manifest).
    let buf = null;
    if (m.sha256 && m.size === size && fs.existsSync(file)) {
      const b = fs.readFileSync(file);
      if (b.length === size && sha256(b) === m.sha256 && m.source_etag === o.metadata?.eTag) buf = b;
    }
    if (!buf) {
      const d = await download(o);
      buf = d.buf;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf);
      Object.assign(m, { size, sha256: sha256(buf), source_etag: o.metadata?.eTag ?? null, via: d.via, downloaded_at: new Date().toISOString(), uploaded_sha256: null, local_verified: false });
    }
    // Upload.
    if (m.uploaded_sha256 !== m.sha256) {
      const res = await fetchRetry(`${LOCAL_API_URL}/storage/v1/object/${o.bucket}/${enc(o.name)}`, {
        method: 'POST',
        headers: {
          apikey: service, Authorization: `Bearer ${service}`, 'x-upsert': 'true',
          'content-type': o.metadata?.mimetype || 'application/octet-stream',
          'cache-control': o.metadata?.cacheControl || 'no-cache',
        },
        body: buf,
      });
      const text = await res.text();
      if (res.status !== 200) throw new Error(`upload HTTP ${res.status}: ${text.slice(0, 200)}`);
      m.uploaded_sha256 = m.sha256;
      m.local_verified = false;
    }
    // Verify by re-downloading from local.
    if (!m.local_verified) {
      const res = await fetchRetry(`${LOCAL_API_URL}/storage/v1/object/authenticated/${o.bucket}/${enc(o.name)}`, { headers: { apikey: service, Authorization: `Bearer ${service}` } });
      const b = Buffer.from(await res.arrayBuffer());
      if (res.status !== 200 || sha256(b) !== m.sha256) throw new Error(`local verify failed: HTTP ${res.status}`);
      m.local_verified = true;
      m.verified_at = new Date().toISOString();
    }
    m.error = null;
  } catch (error) {
    m.error = String(error.message ?? error);
    failures.push(k);
  }
  save();
  if (++done % 100 === 0) log(`${done}/${selected.length}`);
});
save(true);

// 2. Align owner/owner_id/user_metadata/created_at/updated_at with the origin (local DB, triggers off).
const align = selected.filter((o) => manifest.objects[key(o)]?.local_verified).map((o) => JSON.stringify({ bucket: o.bucket, name: o.name, owner: o.owner, owner_id: o.owner_id, user_metadata: o.user_metadata, created_at: o.created_at, updated_at: o.updated_at }));
fs.writeFileSync(opsPath('storage-align.jsonl'), `${align.join('\n')}\n`);
const alignSql = `\\set ON_ERROR_STOP 1
BEGIN;
SET LOCAL session_replication_role = replica;
CREATE TEMP TABLE src (j jsonb) ON COMMIT DROP;
\\copy src FROM '${workPath('storage-align.jsonl')}' WITH (FORMAT csv, QUOTE E'\\x01', DELIMITER E'\\x02')
UPDATE storage.objects o SET owner = (s.j->>'owner')::uuid, owner_id = s.j->>'owner_id', user_metadata = s.j->'user_metadata',
       created_at = (s.j->>'created_at')::timestamptz, updated_at = (s.j->>'updated_at')::timestamptz
  FROM src s WHERE o.bucket_id = s.j->>'bucket' AND o.name = s.j->>'name';
SELECT count(*) FROM src s JOIN storage.objects o ON o.bucket_id = s.j->>'bucket' AND o.name = s.j->>'name'
 WHERE o.owner IS NOT DISTINCT FROM (s.j->>'owner')::uuid AND o.owner_id IS NOT DISTINCT FROM s.j->>'owner_id'
   AND o.user_metadata IS NOT DISTINCT FROM s.j->'user_metadata' AND o.created_at = (s.j->>'created_at')::timestamptz
   AND o.updated_at = (s.j->>'updated_at')::timestamptz;
COMMIT;
`;
fs.writeFileSync(opsPath('storage-align.sql'), alignSql);
const ar = await localTool('psql', ['-X', '-q', '-At', '-f', workPath('storage-align.sql')]);
if (ar.code !== 0) fail(`align failed: ${ar.stderr}`);
const aligned = Number(ar.stdout.trim().split('\n').pop());

const summary = {
  mode, finished: new Date().toISOString(), selected: selected.length,
  verified: selected.filter((o) => manifest.objects[key(o)]?.local_verified).length,
  failures: failures.length, aligned,
  by_bucket: Object.fromEntries(BUCKETS.map((b) => {
    const sel = selected.filter((o) => o.bucket === b);
    return [b, { source_objects: byBucket[b].length, selected: sel.length, verified: sel.filter((o) => manifest.objects[key(o)]?.local_verified).length }];
  })),
};
writeJson(opsPath(`storage-${mode}-report.json`), summary);
log('storage', summary);
if (failures.length) { log('failures (first 10):', failures.slice(0, 10).map((k) => manifest.objects[k].error)); process.exit(1); }
if (aligned !== align.length) { log(`aligned ${aligned} of ${align.length}`); process.exit(1); }
