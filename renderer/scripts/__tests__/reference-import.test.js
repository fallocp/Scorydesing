const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { publicAddress, publicUrl, requestedPages, fetchPublic } = require('../reference-web');
const { validateInput, validatePptx, renderDocument, handleReferenceImport } = require('../reference-import');

test('web capture refuses private, mapped, metadata, credential and non-web destinations', async () => {
  for (const ip of ['0.0.0.0', '10.1.1.1', '127.0.0.1', '169.254.169.254', '172.16.5.1', '192.168.1.1', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2002:7f00:1::']) assert.equal(publicAddress(ip), false, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(publicAddress(ip), true, ip);
  for (const value of ['http://127.1', 'http://2130706433', 'https://[::1]', 'http://metadata.internal', 'http://localhost', 'file:///etc/passwd', 'https://user:pass@example.com', 'http://example.com:8080']) assert.throws(() => publicUrl(value), undefined, value);
  await assert.rejects(fetchPublic('http://169.254.169.254/latest/meta-data', { requests: 0, bytes: 0 }), /privadas/);
  assert.equal(publicUrl('https://example.com/brand').hostname, 'example.com');
});

test('selected pages are bounded, unique and within the complete document', () => {
  assert.deepEqual(requestedPages({ preview: true }, 2), [1, 2]);
  assert.deepEqual(requestedPages({ preview: false, pages: [2, 45, 100] }, 100), [2, 45, 100]);
  for (const pages of [[0], [101], [1, 1], [1, 2, 3, 4], [1.5]]) assert.throws(() => requestedPages({ preview: false, pages }, 100));
  assert.throws(() => validateInput({ kind: 'pdf', preview: true, name: 'a.pdf', base64: 'invalid!' }));
});

test('public fetch validates every DNS answer and revalidates redirects before any private connection', async context => {
  const dns = require('node:dns/promises'), http = require('node:http');
  const { EventEmitter } = require('node:events'), { Readable } = require('node:stream');
  let answers = [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }], calls = 0;
  context.mock.method(dns, 'lookup', async () => answers);
  context.mock.method(http, 'get', (_url, options, callback) => {
    calls++;
    options.lookup('example.com', {}, (error, address) => { assert.equal(error, null); assert.equal(address, '8.8.8.8'); });
    const request = new EventEmitter(); request.destroy = () => {};
    const response = Readable.from([Buffer.from('redirect')]); response.statusCode = 302;
    response.headers = { location: 'http://127.0.0.1/private' };
    process.nextTick(() => callback(response)); return request;
  });
  await assert.rejects(fetchPublic('http://example.com', { requests: 0, bytes: 0 }), /pública/);
  assert.equal(calls, 0);
  answers = [{ address: '8.8.8.8', family: 4 }];
  await assert.rejects(fetchPublic('http://example.com', { requests: 0, bytes: 0 }), /privadas/);
  assert.equal(calls, 1);
});

function zip(entries) {
  const local = [], directory = []; let offset = 0;
  for (const [name, value] of entries) {
    const filename = Buffer.from(name), bytes = Buffer.from(value), header = Buffer.alloc(30), central = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50); header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(filename.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    local.push(header, filename, bytes); directory.push(central, filename); offset += header.length + filename.length + bytes.length;
  }
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(Buffer.concat(directory).length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...directory, end]);
}

test('PPTX rejects active and external resources before invoking LibreOffice', () => {
  const presentation = ['ppt/presentation.xml', '<p:presentation/>'];
  assert.doesNotThrow(() => validatePptx(zip([presentation])));
  assert.doesNotThrow(() => validatePptx(zip([presentation, ['ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Type="x/hyperlink" Target="https://example.com" TargetMode="External"/></Relationships>']])));
  for (const entry of [['ppt/vbaProject.bin', 'macro'], ['ppt/presentation.xml', '<!DOCTYPE xml SYSTEM "file:///etc/passwd">'],
    ['ppt/_rels/presentation.xml.rels', '<Relationships><r:Relationship Type="x/image" Target="http://169.254.169.254" TargetMode="External"/></Relationships>']]) {
    assert.throws(() => validatePptx(zip([presentation, entry])));
  }
  assert.throws(() => validatePptx(Buffer.from('not zip')));
});

test('PPTX relationship parsing detects encoded attributes, namespace aliases and quote delimiters', () => {
  const presentation = ['ppt/presentation.xml', '<p:presentation/>'];
  for (const attributes of [
    'Type="x/image" Target="image.png" TargetMode="&#69;xternal"',
    'Type="x/image" Target="image.png" TargetMode="&#x45;xternal"',
    'Type="x/image" Target="&#104;ttp://169.254.169.254"',
    'Type="x/image" Target="image.png" a:TargetMode="&#69;xternal"',
    'Type="x/image" Other=">" Target="https://example.com/a.png"',
    'Type="x/hyperlink" a:Type="x/image" TargetMode="External" Target="https://example.com"',
    'Type="x/image" Target="&unknown;"',
  ]) assert.throws(() => validatePptx(zip([presentation, ['ppt/_rels/presentation.xml.rels', `<Relationships><custom-prefix:Relationship ${attributes}/></Relationships>`]])), undefined, attributes);
  assert.doesNotThrow(() => validatePptx(zip([presentation, ['ppt/_rels/presentation.xml.rels',
    '<?xml version="1.0"?><!-- ordinary link --><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="x/hyperlink" Target="https://example.com?a=1&amp;b=2" TargetMode="&#69;xternal"/></Relationships>']])));
});

test('PPTX ZIP view rejects duplicate aliases, traversal, hidden entries and mismatched local headers', () => {
  const presentation = ['ppt/presentation.xml', '<p:presentation/>'];
  for (const name of ['ppt/presentation.xml', 'PPT/PRESENTATION.XML', 'ppt\\..\\outside.xml', '../outside.xml', '/outside.xml', 'ppt/%2e%2e/outside.xml', 'ppt/C:outside.xml']) {
    assert.throws(() => validatePptx(zip([presentation, [name, '<xml/>']])));
  }
  for (const mutate of [
    bytes => { bytes[30] = 0x78; }, // Same-length local name differs from directory.
    bytes => { bytes.writeUInt16LE(8, 6); }, // Local flags differ.
    bytes => { bytes.writeUInt16LE(8, 8); }, // Local compression method differs.
    bytes => { bytes.writeUInt32LE(999, 18); }, // Local compressed size differs.
    bytes => { bytes.writeUInt32LE(1, bytes.length - 22 + 16); }, // Directory points into local data.
  ]) { const bytes = zip([presentation]); mutate(bytes); assert.throws(() => validatePptx(bytes)); }
  const withHidden = zip([presentation, ['ppt/hidden.xml', '<hidden/>']]);
  const end = withHidden.length - 22, directory = withHidden.readUInt32LE(end + 16), firstCentralSize = 46 + Buffer.byteLength(presentation[0]);
  const hidden = Buffer.concat([withHidden.subarray(0, directory + firstCentralSize), withHidden.subarray(end)]);
  const hiddenEnd = hidden.length - 22;
  hidden.writeUInt16LE(1, hiddenEnd + 8); hidden.writeUInt16LE(1, hiddenEnd + 10); hidden.writeUInt32LE(firstCentralSize, hiddenEnd + 12);
  assert.throws(() => validatePptx(hidden), /válida|ocultas/);
});

test('import route requires remote authentication even when legacy renderer is open', async () => {
  const results = [];
  const response = { writeHead(status) { results.push(status); }, end() {} };
  await handleReferenceImport({ socket: { remoteAddress: '198.51.100.2' }, headers: {} }, response, { authToken: null });
  await handleReferenceImport({ socket: { remoteAddress: '127.0.0.1' }, headers: { origin: 'https://evil.example' } }, response, { authToken: null });
  await handleReferenceImport({ socket: { remoteAddress: '127.0.0.1' }, headers: {} }, response, { env: { NODE_ENV: 'production' } });
  assert.deepEqual(results, [401, 401, 401]);
});

let hasPoppler = true;
try { execFileSync(process.env.PDFINFO_BIN || 'pdfinfo', ['-v'], { stdio: 'ignore', windowsHide: true }); } catch { hasPoppler = false; }
test('real PDF pages render separately and preserve page dimensions', { skip: !hasPoppler }, async () => {
  const { PDFDocument, rgb } = require('pdf-lib');
  const pdf = await PDFDocument.create();
  for (const color of [rgb(1, 0, 0), rgb(0, 0, 1)]) {
    const page = pdf.addPage([960, 540]); page.drawRectangle({ x: 0, y: 0, width: 960, height: 540, color });
  }
  const base64 = Buffer.from(await pdf.save()).toString('base64');
  const previews = await renderDocument({ kind: 'pdf', name: 'sample.pdf', base64, preview: true });
  assert.equal(previews.pageCount, 2); assert.deepEqual(previews.pages.map(page => page.number), [1, 2]);
  assert.notEqual(previews.pages[0].pngBase64, previews.pages[1].pngBase64);
  const full = await renderDocument({ kind: 'pdf', name: 'sample.pdf', base64, preview: false, pages: [2] });
  const png = Buffer.from(full.pages[0].pngBase64, 'base64');
  assert.equal(png.readUInt32BE(16), 1920); assert.equal(png.readUInt32BE(20), 1080);
});
