/** Mount the original generated PNG into the reserved region of the editable pilot slide. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifacts = path.join(root, 'artifacts', 'desaing-lab');
const options = {};
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 2) {
  const option = args[index], value = args[index + 1];
  assert(['--image', '--output'].includes(option) && value && !(option in options),
    'Usage: node scripts/desaing/pilot-mount.mjs --image artifacts/desaing-lab/image.png --output artifacts/desaing-lab/slide.html');
  options[option] = value;
}
assert(options['--image'] && options['--output'], 'Both --image and --output are required.');
const imagePath = path.resolve(root, options['--image']);
const outputPath = path.resolve(root, options['--output']);
assert.equal(path.extname(imagePath).toLowerCase(), '.png');
assert.equal(path.extname(outputPath).toLowerCase(), '.html');
assert(outputPath.startsWith(`${artifacts}${path.sep}`), 'HTML output must be inside artifacts/desaing-lab.');
await mkdir(path.dirname(outputPath), { recursive: true });
const parent = await realpath(path.dirname(outputPath));
const artifactRoot = await realpath(artifacts);
assert(parent === artifactRoot || parent.startsWith(`${artifactRoot}${path.sep}`), 'Output directory resolves outside artifacts/desaing-lab.');
const existing = await lstat(outputPath).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
assert(!existing || existing.isFile() && !existing.isSymbolicLink(), 'HTML output must be a regular file.');

const bytes = await readFile(imagePath);
assert(bytes.length >= 33 && bytes.length <= 8388608, 'PNG must be between 33 bytes and 8 MiB.');
assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Invalid PNG signature.');
assert.equal(bytes.readUInt32BE(8), 13, 'Invalid PNG IHDR length.');
assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', 'PNG must begin with IHDR.');
assert.equal(bytes.readUInt32BE(16), 1024, 'Pilot asset must be 1024 pixels wide.');
assert.equal(bytes.readUInt32BE(20), 1024, 'Pilot asset must be 1024 pixels high.');

const reference = await readFile(path.join(root, 'experiments', 'pilot', 'reference.html'), 'utf8');
const target = /(<div\b[^>]*\bdata-pilot-asset="airplane"[^>]*>)\s*(<\/div>)/g;
const matches = [...reference.matchAll(target)];
assert.equal(matches.length, 1, 'Expected exactly one empty airplane destination.');
assert(matches[0][1].includes('data-region="430,100,330,300"'), 'Pilot region changed.');
const img = `<img src="data:image/png;base64,${bytes.toString('base64')}" width="1024" height="1024" alt="Avión generado para la portada" draggable="false">`;
const html = reference.replace(target, `$1${img}$2`);
assert.equal(html.replace(img, ''), reference, 'Mounting must preserve all original markup, text and CSS.');
await writeFile(outputPath, html, 'utf8');
process.stdout.write(`${JSON.stringify({
  image: path.relative(root, imagePath), output: path.relative(root, outputPath),
  image_bytes: bytes.length, image_sha256: createHash('sha256').update(bytes).digest('hex'),
  dimensions: { width: 1024, height: 1024 }, region: { x: 430, y: 100, width: 330, height: 300 },
  fit: 'contain', original_bitmap_preserved: true, editable_html_preserved: true,
}, null, 2)}\n`);
