const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { renderPdfPages } = require('../local-pdf');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR2kAAAAASUVORK5CYII=', 'base64');
const missing = () => Object.assign(new Error('missing'), { code: 'ENOENT', syscall: 'spawn pdfinfo' });

test('PDF prefers native Poppler and uses requested page and full resolution', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'scory-local-pdf-test-')), calls = [];
  try {
    const result = await renderPdfPages(path.join(directory, 'source.pdf'), directory, { preview: false, pages: [2] }, {
      env: {}, execute: async (file, args) => {
        calls.push([file, args]);
        if (file === 'pdfinfo') return { stdout: 'Pages: 2\n' };
        await fs.writeFile(`${args.at(-1)}.png`, png); return { stdout: '' };
      },
    });
    assert.equal(result.pageCount, 2); assert.deepEqual(result.pages.map(page => page.number), [2]);
    assert.deepEqual(calls.map(([file]) => file), ['pdfinfo', 'pdftoppm']);
    assert.equal(calls[1][1][calls[1][1].indexOf('-scale-to') + 1], '1920');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('PDF missing either Poppler executable uses the local image with exact page selection', async () => {
  for (const absent of ['pdfinfo', 'pdftoppm']) {
    const calls = [];
    const result = await renderPdfPages('/tmp/source.pdf', '/tmp', { preview: true, pages: [2] }, {
      env: { DOCKER_HOST: 'unix:///var/run/docker.sock' }, execute: async (file, args) => {
        calls.push([file, args]);
        if (file === absent) throw missing();
        if (file === 'pdfinfo') return { stdout: 'Pages: 2\n' };
        if (args.includes('inspect')) return { stdout: 'linux' };
        if (args.includes('run')) return { stdout: JSON.stringify({ pageCount: 2, pages: [{ number: 2, pngBase64: png.toString('base64') }] }) };
        return { stdout: '' };
      },
    });
    assert.equal(result.pages[0].number, 2);
    const args = calls.find(([, args]) => args.includes('run'))[1];
    assert.deepEqual(JSON.parse(args.at(-1)), { preview: true, pages: [2] });
    assert.ok(args.includes('--pull=never')); assert.equal(args[args.indexOf('--network') + 1], 'none');
    assert.ok(calls.at(-1)[1].includes('--force'));
  }
});

test('PDF errors and missing output files do not trigger a Docker retry', async () => {
  for (const error of [Object.assign(new Error('bad pdf'), { code: 1 }), Object.assign(new Error('missing output'), { code: 'ENOENT', syscall: 'open' })]) {
    let calls = 0;
    await assert.rejects(renderPdfPages('/tmp/source.pdf', '/tmp', { preview: true }, {
      env: {}, execute: async () => { calls++; throw error; },
    }), new RegExp(error.message));
    assert.equal(calls, 1);
  }
});

test('PDF rejects malformed or mismatched container page results after container cleanup', async () => {
  for (const pages of [[], [{ number: 1, pngBase64: png.toString('base64') }], [{ number: 2, pngBase64: Buffer.from('not an image').toString('base64') }]]) {
    let cleaned = false;
    await assert.rejects(renderPdfPages('/tmp/source.pdf', '/tmp', { preview: true, pages: [2] }, {
      env: { DOCKER_HOST: 'unix:///var/run/docker.sock' }, execute: async (file, args) => {
        if (file === 'pdfinfo') throw missing();
        if (args.includes('inspect')) return { stdout: 'linux' };
        if (args.includes('run')) return { stdout: JSON.stringify({ pageCount: 2, pages }) };
        cleaned = args.includes('--force'); return { stdout: '' };
      },
    }));
    assert.ok(cleaned);
  }
});
