const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { authorizeRendererRequest, trustedLocalRequest } = require('../renderer-access');
const { handleDesignPreview } = require('../design-preview');

const business = '00000000-0000-4000-8000-000000000001';
const request = (headers = { authorization: 'Bearer actual-user-session' }, address = '8.8.8.8') => ({ socket: { remoteAddress: address }, headers });
const environment = { NODE_ENV: 'production', VITE_SUPABASE_URL: 'https://project.example', VITE_SUPABASE_ANON_KEY: 'public-project-key' };

test('native local requests need no new configuration and cannot be disguised public/proxied requests', async () => {
  const local = request({ origin: 'http://localhost:5173' }, '127.0.0.1');
  assert.deepEqual(await authorizeRendererRequest(local, undefined, { env: {} }), { local: true });
  assert.equal(trustedLocalRequest(local, { NODE_ENV: 'production' }), false);
  assert.equal(trustedLocalRequest(request({ origin: 'https://app.example' }, '127.0.0.1'), {}), false);
  assert.equal(trustedLocalRequest(request({ 'x-forwarded-for': '8.8.8.8' }, '127.0.0.1'), {}), false);
});
test('public requests validate the actual user through the existing active-business role RPC', async () => {
  const calls = [];
  const fetcher = async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(calls.length === 1 ? { id: 'actor-a' } : 'editor')); };
  assert.deepEqual(await authorizeRendererRequest(request(), business, { env: environment, fetch: fetcher }), { actorId: 'actor-a', businessId: business });
  assert.equal(calls.length, 2); assert.equal(calls[0].url, 'https://project.example/auth/v1/user');
  assert.equal(calls[1].url, 'https://project.example/rest/v1/rpc/desaing_business_role');
  assert.equal(calls[1].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].options.body), { p_business_id: business });
  assert.deepEqual(calls[0].options.headers, { apikey: 'public-project-key', Authorization: 'Bearer actual-user-session' });
  assert.deepEqual(calls[1].options.headers, { apikey: 'public-project-key', Authorization: 'Bearer actual-user-session', 'Content-Type': 'application/json' });
});
test('missing/invalid sessions and foreign tenants are refused before expensive rendering', async () => {
  await assert.rejects(authorizeRendererRequest(request({}), business, { env: environment }), error => error.status === 401);
  await assert.rejects(authorizeRendererRequest(request(), business, { env: environment, fetch: async () => new Response('{}', { status: 401 }) }), error => error.status === 401);
  let calls = 0;
  await assert.rejects(authorizeRendererRequest(request(), business, { env: environment,
    fetch: async () => new Response(JSON.stringify(++calls === 1 ? { id: 'actor-a' } : null)) }), error => error.status === 403);
  await assert.rejects(authorizeRendererRequest(request(), business, { env: {} }), error => error.status === 503 && error.code === 'renderer_configuration_missing');
});
test('accepts only membership roles; missing, inactive and unexpected RPC results are denied', async () => {
  for (const role of ['owner', 'admin', 'editor', 'viewer', null, '', 'service_role', 'authenticated', {}, ['owner']]) {
    let calls = 0;
    const result = authorizeRendererRequest(request(), business, { env: environment,
      fetch: async () => new Response(JSON.stringify(++calls === 1 ? { id: 'actor-a' } : role)) });
    if (['owner', 'admin', 'editor', 'viewer'].includes(role)) await result;
    else await assert.rejects(result, error => error.status === 403);
  }
});
test('preview route enforces tenant authorization and preserves working native loopback mode', async () => {
  const payload = { business_id: business, html: '<html>Private copy</html>', width: 1920, height: 1080 };
  const execute = async (local, denied) => {
    const incoming = Readable.from([Buffer.from(JSON.stringify(payload))]); Object.assign(incoming, request(local ? { origin: 'http://localhost:5173' } : undefined, local ? '127.0.0.1' : '8.8.8.8'));
    let status, rendered = 0, calls = 0;
    await handleDesignPreview(incoming, { writeHead(value) { status = value; }, end() {} }, { env: local ? {} : environment,
      fetch: async () => new Response(JSON.stringify(++calls === 1 ? { id: 'actor-a' } : denied ? null : 'viewer')),
      render: async input => { rendered++; assert.deepEqual(input, { html: payload.html, width: 1920, height: 1080 }); return { pngBase64: 'fixture', diagnostics: { issues: [] } }; } });
    return { status, rendered, calls };
  };
  assert.deepEqual(await execute(false, true), { status: 403, rendered: 0, calls: 2 });
  assert.deepEqual(await execute(false, false), { status: 200, rendered: 1, calls: 2 });
  assert.deepEqual(await execute(true, false), { status: 200, rendered: 1, calls: 0 });
});
