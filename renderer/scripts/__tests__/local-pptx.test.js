const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { convertPptx, dockerConversionArgs, DEFAULT_PPTX_IMAGE } = require('../local-pptx');
const missing = () => Object.assign(new Error('missing'), { code: 'ENOENT' });

test('local conversion uses native LibreOffice first and never retries invalid documents', async () => {
  const calls = [];
  await convertPptx('/tmp/source.pptx', '/tmp', '/tmp/profile', '/tmp/source.pdf', { execute: async (file, args) => { calls.push([file, args]); }, env: {} });
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'soffice');
  await assert.rejects(convertPptx('/tmp/source.pptx', '/tmp', '/tmp/profile', '/tmp/source.pdf', {
    execute: async () => { throw Object.assign(new Error('bad document'), { code: 1 }); }, env: {} }), /bad document/);
});

test('container conversion has no network, writable host mount, shell or automatic pull', () => {
  const args = dockerConversionArgs('C:\\Users\\A, B\\Temp\\file', DEFAULT_PPTX_IMAGE, 'scory-pptx-abc-123');
  assert.ok(args.includes('--pull=never')); assert.ok(args.includes('--read-only')); assert.ok(args.includes('--rm'));
  assert.equal(args[args.indexOf('--network') + 1], 'none');
  assert.equal(args[args.indexOf('--mount') + 1], 'type=bind,"source=C:\\Users\\A, B\\Temp\\file",target=/input,readonly');
  assert.equal(args[args.indexOf(DEFAULT_PPTX_IMAGE) + 1], 'node');
  assert.equal(args.filter(value => value === '--mount').length, 1);
  assert.throws(() => dockerConversionArgs('/tmp', '--privileged image', 'scory-pptx-abc'), /nombre/);
});

test('missing native converter does not use a remote Docker context or download an image', async () => {
  const calls = [];
  await assert.rejects(convertPptx('/tmp/source.pptx', '/tmp', '/tmp/profile', '/tmp/source.pdf', {
    env: {}, execute: async (file, args) => { calls.push([file, args]); if (file === 'soffice') throw missing(); return { stdout: 'tcp://remote.example:2375' }; },
  }), /Docker local/);
  assert.equal(calls.length, 2);
  await assert.rejects(convertPptx('/tmp/source.pptx', '/tmp', '/tmp/profile', '/tmp/source.pdf', {
    env: { PPTX_RENDER_IMAGE: 'off' }, execute: async () => { throw missing(); },
  }), /LibreOffice/);
});

test('local fallback returns only the PDF and removes its own container after completion', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'scory-local-pptx-test-')), calls = [], pdf = path.join(directory, 'source.pdf');
  try {
    await convertPptx(path.join(directory, 'source.pptx'), directory, path.join(directory, 'profile'), pdf, {
      env: { DOCKER_HOST: 'npipe:////./pipe/dockerDesktopLinuxEngine' }, execute: async (file, args) => {
        calls.push([file, args]); if (file === 'soffice') throw missing();
        if (args.includes('inspect')) return { stdout: 'linux\n' };
        if (args.includes('run')) return { stdout: Buffer.from('%PDF-1.7\nlocal').toString('base64') };
        return { stdout: '' };
      },
    });
    assert.match(await fs.readFile(pdf, 'utf8'), /^%PDF-/);
    const run = calls.find(([, args]) => args.includes('run'))[1], remove = calls.at(-1)[1];
    assert.equal(remove.at(-1), run[run.indexOf('--name') + 1]); assert.ok(remove.includes('--force'));
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('a timed-out Docker conversion still removes its own container', async () => {
  const calls = [];
  await assert.rejects(convertPptx('/tmp/source.pptx', '/tmp', '/tmp/profile', '/tmp/source.pdf', {
    env: { DOCKER_HOST: 'unix:///var/run/docker.sock' }, execute: async (file, args) => {
      calls.push([file, args]); if (file === 'soffice') throw missing();
      if (args.includes('inspect')) return { stdout: 'linux' };
      if (args.includes('run')) throw Object.assign(new Error('timeout'), { killed: true });
      return { stdout: '' };
    },
  }), /tardó demasiado/);
  assert.ok(calls.at(-1)[1].includes('--force'));
});
