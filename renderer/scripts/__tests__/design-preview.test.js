const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Readable } = require('node:stream');
const { validateDesignPreview, fulfillDesignResource, renderDesignPreview, handleDesignPreview } = require('../design-preview');
const { fetchPublic } = require('../reference-web');

const valid = { html: '<!doctype html><html><head></head><body><p>Approved copy</p></body></html>', width: 800, height: 600 };
test('preview only accepts bounded HTML and known canvas dimensions', () => {
  assert.deepEqual(validateDesignPreview(valid), valid);
  for (const change of [{ html: '' }, { html: 'x'.repeat(5 * 1024 * 1024 + 1) }, { width: 0 }, { height: 3841 }, { width: 800.5 }]) {
    assert.throws(() => validateDesignPreview({ ...valid, ...change }));
  }
});
test('preview renderer requires a user session for remote or production requests', async () => {
  for (const [address, origin, environment] of [
    ['8.8.8.8', undefined, {}], ['127.0.0.1', 'https://public.example', {}],
    ['127.0.0.1', 'http://localhost:5173', { NODE_ENV: 'production' }],
  ]) {
    const request = Readable.from([]); request.socket = { remoteAddress: address }; request.headers = { origin };
    let status; const response = { writeHead: value => { status = value; }, end: () => {} };
    await handleDesignPreview(request, response, { env: environment }); assert.equal(status, 401);
  }
});
function resource(url, type = 'image', navigation = false) {
  let aborted = false, continued = false, fulfilled;
  return { url: () => url, resourceType: () => type, isNavigationRequest: () => navigation,
    abort: async () => { aborted = true; }, continue: async () => { continued = true; }, respond: async value => { fulfilled = value; },
    result: () => ({ aborted, continued, fulfilled }) };
}
test('only passive HTTPS resources use the pinned fetcher; navigation and scripts never connect', async () => {
  const fetched = [], fetcher = async (url, budget) => { fetched.push([url, budget]); return { status: 200, headers: { 'content-type': 'image/png', 'set-cookie': 'secret' }, body: Buffer.from('PNG') }; };
  for (const [url, type, navigation] of [['https://example.com/private', 'document', true], ['https://example.com/code.js', 'script', false]]) {
    const request = resource(url, type, navigation); await fulfillDesignResource(request, { requests: 0, bytes: 0 }, fetcher);
    assert.equal(request.result().aborted, true);
  }
  assert.equal(fetched.length, 0);
  const image = resource('https://example.com/asset.png'), budget = { requests: 0, bytes: 0 };
  await fulfillDesignResource(image, budget, fetcher);
  assert.deepEqual(fetched, [['https://example.com/asset.png', budget]]);
  assert.equal(image.result().fulfilled.headers['set-cookie'], undefined);
  for (const url of ['file:///etc/passwd', 'http://example.com/pixel', 'blob:unsafe']) {
    await assert.rejects(fulfillDesignResource(resource(url), budget, fetcher));
  }
  await assert.rejects(fulfillDesignResource(resource('https://169.254.169.254/latest/meta-data'), budget, fetchPublic), /privadas/);
});
test('real Chromium renders diagnostics at exact dimensions without running scripts or contacting private origins', async () => {
  const fetched = [];
  const result = await renderDesignPreview({ ...valid, html: '<!doctype html><html><head><style>body{margin:0}</style></head><body><p data-copy-id="copy-1" style="position:absolute;left:780px;white-space:nowrap">Approved paragraph</p><script>document.querySelector("p").remove()</script><img src="https://127.0.0.1/private.png" width="30" height="30"></body></html>' }, {
    fetchPublic: async (url, budget) => { fetched.push(url); return fetchPublic(url, budget); },
  });
  const png = Buffer.from(result.pngBase64, 'base64');
  assert.equal(png.readUInt32BE(16), 800); assert.equal(png.readUInt32BE(20), 600);
  assert.ok(result.diagnostics.issues.some(issue => issue.code === 'text_outside_canvas' && issue.element === 'copy-1'));
  assert.ok(result.diagnostics.issues.some(issue => issue.code === 'blocked_resource'));
  assert.deepEqual(fetched, ['https://127.0.0.1/private.png']);
});
