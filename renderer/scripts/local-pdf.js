const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { requestedPages } = require('./reference-web');
const { runLocalDocumentContainer } = require('./local-document-container');
const execute = promisify(execFile);
const MAX_PNG_BYTES = 8 * 1024 * 1024;

// This fixed program uses only the read-only source PDF and validated numeric page options.
function renderContainerPdf() {
  const fs = require('node:fs'), { execFileSync } = require('node:child_process');
  const input = JSON.parse(process.argv[1]);
  const stdout = execFileSync('pdfinfo', ['/input/source.pdf'], { timeout: 10000, maxBuffer: 1048576, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
  const pageCount = Number(stdout.match(/^Pages:\s*(\d+)/m)?.[1]);
  if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 100) throw Error('Invalid page count');
  const numbers = input.pages || Array.from({ length: Math.min(6, pageCount) }, (_, index) => index + 1);
  if (!numbers.length || numbers.length > (input.preview ? 6 : 3) || new Set(numbers).size !== numbers.length
    || numbers.some(number => !Number.isSafeInteger(number) || number < 1 || number > pageCount)) throw Error('Invalid pages');
  const pages = []; let bytes = 0;
  for (const number of numbers) {
    const prefix = `/tmp/page-${number}`;
    execFileSync('pdftoppm', ['-f', String(number), '-l', String(number), '-singlefile', '-scale-to', input.preview ? '480' : '1920',
      '-png', '/input/source.pdf', prefix], { timeout: 20000, maxBuffer: 1048576, stdio: 'pipe' });
    const size = fs.statSync(`${prefix}.png`).size; bytes += size;
    if (size > 8388608 || bytes > 33554432) throw Error('Page too complex');
    const pngBase64 = fs.readFileSync(`${prefix}.png`).toString('base64');
    fs.unlinkSync(`${prefix}.png`); pages.push({ number, pngBase64 });
  }
  process.stdout.write(JSON.stringify({ pageCount, pages }));
}
const DOCKER_RENDER_PDF = `(${renderContainerPdf.toString()})()`;

function validatePageCount(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) throw new Error('Usa un documento de entre 1 y 100 páginas.');
  return value;
}

function validatePng(png) {
  if (png.length > MAX_PNG_BYTES) throw new Error('La página es demasiado compleja. Exporta una imagen de menor tamaño.');
  if (png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('No se pudo generar la vista previa de la página.');
  }
}

async function renderPdfPages(pdf, directory, input, dependencies = {}) {
  const run = dependencies.execute || execute, env = dependencies.env || process.env;
  try {
    const { stdout } = await run(env.PDFINFO_BIN || 'pdfinfo', [pdf],
      { timeout: 10000, maxBuffer: 1048576, windowsHide: true, env: { ...env, LC_ALL: 'C' } });
    const pageCount = validatePageCount(Number(stdout.match(/^Pages:\s*(\d+)/m)?.[1]));
    const pages = [];
    for (const number of requestedPages(input, pageCount)) {
      const prefix = path.join(directory, `page-${number}`);
      await run(env.PDFTOPPM_BIN || 'pdftoppm', ['-f', String(number), '-l', String(number), '-singlefile',
        '-scale-to', input.preview ? '480' : '1920', '-png', pdf, prefix], { timeout: 20000, maxBuffer: 1048576, windowsHide: true, env });
      const png = await fs.readFile(`${prefix}.png`); validatePng(png);
      pages.push({ number, pngBase64: png.toString('base64') });
    }
    return { pageCount, pages };
  } catch (error) {
    // Only missing native executables switch engines; invalid documents/timeouts remain errors.
    if (error.code !== 'ENOENT' || error.syscall && !error.syscall.startsWith('spawn')) throw error;
  }
  const stdout = await runLocalDocumentContainer(directory, DOCKER_RENDER_PDF,
    [JSON.stringify({ preview: input.preview, pages: input.pages })], 'pdf', dependencies);
  let result;
  try { result = JSON.parse(stdout); } catch { throw new Error('La conversión local devolvió una vista previa inválida.'); }
  const pageCount = validatePageCount(result?.pageCount), numbers = requestedPages(input, pageCount);
  if (!Array.isArray(result.pages) || result.pages.length !== numbers.length) throw new Error('La conversión local devolvió páginas incompletas.');
  const pages = result.pages.map((page, index) => {
    if (page?.number !== numbers[index] || typeof page.pngBase64 !== 'string' || page.pngBase64.length > Math.ceil(MAX_PNG_BYTES * 4 / 3)
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(page.pngBase64)) throw new Error('La conversión local devolvió una página inválida.');
    validatePng(Buffer.from(page.pngBase64, 'base64'));
    return { number: page.number, pngBase64: page.pngBase64 };
  });
  return { pageCount, pages };
}

module.exports = { renderPdfPages };
