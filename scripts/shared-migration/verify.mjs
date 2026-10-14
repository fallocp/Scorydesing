// Step 6 (ADR-0005): verify local == origin BEFORE rewriting URLs.
// - Per table: rows and checksum, fresh read of the shared DB (new snapshot) vs local.
// - Writes during the copy: rows and max(updated_at/created_at) of the fresh read vs the export snapshot.
// - Per bucket: objects and bytes (metadata.size) shared vs local; per object: size, mimetype, cacheControl,
//   owner/owner_id/user_metadata/created_at/updated_at, and the sha256 re-download check of the manifest.
// Report: <SCORY_PHASE5_DIR>/verify-report.json (or --out <name>).
import { ALL_TABLES, BUCKETS, arg, localSql, log, opsPath, owner, readJson, sharedSql, sqlLiteral, writeJson } from './common.mjs';
import { checksumSql, localCatalog, parseChecksums } from './catalog.mjs';

const own = owner();
const catalog = await localCatalog();
const exported = readJson(opsPath('export', 'source-checksums.json'));
const [shared, local] = await Promise.all([
  sharedSql(checksumSql(catalog, own.id, ALL_TABLES)).then(parseChecksums),
  localSql(checksumSql(catalog, own.id, ALL_TABLES)).then(parseChecksums),
]);
const tables = ALL_TABLES.map((t) => ({
  table: t,
  source_rows: shared[t].rows, local_rows: local[t].rows,
  rows_equal: shared[t].rows === local[t].rows, checksum_equal: shared[t].checksum === local[t].checksum,
  written_during_copy: exported ? !(exported.tables[t].rows === shared[t].rows && exported.tables[t].checksum === shared[t].checksum
    && exported.tables[t].maxUpdated === shared[t].maxUpdated && exported.tables[t].maxCreated === shared[t].maxCreated) : null,
}));

const objSql = `SELECT json_build_object('bucket', bucket_id, 'name', name, 'size', (metadata->>'size')::bigint, 'mimetype', metadata->>'mimetype',
  'cacheControl', metadata->>'cacheControl', 'eTag', metadata->>'eTag', 'owner', owner, 'owner_id', owner_id, 'user_metadata', user_metadata,
  'created_at', created_at, 'updated_at', updated_at)::text FROM storage.objects WHERE bucket_id IN (${BUCKETS.map(sqlLiteral).join(',')});`;
const parse = (text) => new Map(text.split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((o) => [`${o.bucket}/${o.name}`, o]));
const [sObj, lObj] = await Promise.all([sharedSql(objSql).then(parse), localSql(objSql).then(parse)]);
const manifest = readJson(opsPath('storage-manifest.json'), { objects: {} });
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const ts = (a, b) => (a == null && b == null) || (a != null && b != null && new Date(a).getTime() === new Date(b).getTime());
const buckets = {};
const objectIssues = [];
for (const b of BUCKETS) {
  const src = [...sObj.values()].filter((o) => o.bucket === b);
  const loc = [...lObj.values()].filter((o) => o.bucket === b);
  let shaOk = 0;
  let fieldsOk = 0;
  let etagEqual = 0;
  for (const o of src) {
    const k = `${o.bucket}/${o.name}`;
    const l = lObj.get(k);
    const m = manifest.objects[k];
    if (m?.local_verified && m.size === o.size && l?.size === o.size) shaOk++;
    if (l && l.size === o.size && l.mimetype === o.mimetype && l.cacheControl === o.cacheControl && l.owner === o.owner && l.owner_id === o.owner_id
      && same(l.user_metadata, o.user_metadata) && ts(l.created_at, o.created_at) && ts(l.updated_at, o.updated_at)) fieldsOk++;
    else objectIssues.push({ bucket: b, missing_local: !l, size: l?.size === o.size, mimetype: l?.mimetype === o.mimetype, cacheControl: l?.cacheControl === o.cacheControl });
    if (l?.eTag === o.eTag) etagEqual++;
  }
  const extra = loc.filter((o) => !sObj.has(`${o.bucket}/${o.name}`)).length;
  buckets[b] = {
    source_objects: src.length, local_objects: loc.length,
    source_bytes: src.reduce((a, o) => a + o.size, 0), local_bytes: loc.reduce((a, o) => a + o.size, 0),
    sha256_verified: shaOk, fields_equal: fieldsOk, etag_equal: etagEqual, extra_local: extra,
  };
  buckets[b].equal = buckets[b].source_objects === buckets[b].local_objects && buckets[b].source_bytes === buckets[b].local_bytes
    && shaOk === src.length && fieldsOk === src.length && extra === 0;
}

const report = {
  finished: new Date().toISOString(),
  tables_ok: tables.filter((t) => t.rows_equal && t.checksum_equal).length, tables_total: tables.length,
  tables_written_during_copy: tables.filter((t) => t.written_during_copy).map((t) => t.table),
  buckets_ok: Object.values(buckets).filter((b) => b.equal).length, buckets_total: BUCKETS.length,
  buckets, object_issues: objectIssues.slice(0, 50), tables,
  local_checksums: local,
};
writeJson(opsPath(arg('out', 'verify-report.json')), report);
log(`tables ${report.tables_ok}/${report.tables_total} equal; written during copy: ${report.tables_written_during_copy.length ? report.tables_written_during_copy.join(', ') : 'none'}`);
for (const [b, v] of Object.entries(buckets)) log(`bucket ${b}: objects ${v.local_objects}/${v.source_objects}, bytes ${v.local_bytes}/${v.source_bytes}, sha256 ${v.sha256_verified}, fields ${v.fields_equal}, eTag ${v.etag_equal}, extra ${v.extra_local} -> ${v.equal ? 'OK' : 'DIFF'}`);
for (const t of tables.filter((x) => !(x.rows_equal && x.checksum_equal))) log('DIFF', t);
if (report.tables_ok !== report.tables_total || report.buckets_ok !== report.buckets_total) process.exit(1);
