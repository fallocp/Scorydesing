const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const puppeteer = require('puppeteer');
const { captureWeb } = require('./reference-web');
const { convertPptx } = require('./local-pptx');
const { renderPdfPages } = require('./local-pdf');
const { authorizeRendererRequest, assertRendererSessionHeader } = require('./renderer-access');
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_BODY_BYTES = Math.ceil(MAX_FILE_BYTES * 4 / 3) + 16384;
let active = 0;

function validateInput(input) {
  if (!input || typeof input !== 'object' || typeof input.preview !== 'boolean') throw new Error('Solicitud de importación inválida.');
  if (input.kind === 'web') {
    if (typeof input.url !== 'string') throw new Error('Indica el enlace de la página.');
  } else {
    if (!['pdf', 'pptx'].includes(input.kind) || typeof input.base64 !== 'string' || !input.base64.length
      || input.base64.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)
      || typeof input.name !== 'string' || input.name.length > 240) throw new Error('Usa un PDF o PPTX de hasta 16 MB.');
  }
  if (input.pages !== undefined && (!Array.isArray(input.pages) || !input.pages.length
    || input.pages.length > (input.preview ? 6 : 3) || input.pages.some(page => !Number.isSafeInteger(page) || page < 1 || page > 100))) {
    throw new Error('Selecciona hasta seis vistas previas o tres páginas de referencia.');
  }
  return input;
}

function decodeXmlAttribute(value) {
  // Only XML's predefined entities and scalar character references are valid without a DTD.
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
  return value.replace(/&([^;]*);|&/g, (match, entity) => {
    if (Object.hasOwn(entities, entity)) return entities[entity];
    if (!/^#(?:\d+|x[\da-f]+)$/i.test(entity || '')) throw new Error('El PPTX contiene atributos XML no compatibles. Exporta una copia a PDF.');
    const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    if (!Number.isSafeInteger(number) || number <= 0 || number > 0x10ffff || number >= 0xd800 && number <= 0xdfff) throw new Error('El PPTX contiene atributos XML inválidos.');
    return String.fromCodePoint(number);
  });
}

function validateRelationships(xml) {
  const clean = xml.replace(/<!--(?:[^-]|-(?!->))*-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
  let offset = 0, root = false; const stack = [];
  while (offset < clean.length) {
    if (/\s/.test(clean[offset])) { offset++; continue; }
    const head = /^<(\/)?([A-Za-z_][\w.:-]*)/.exec(clean.slice(offset));
    if (!head) throw new Error('El PPTX contiene relaciones XML no compatibles. Exporta una copia a PDF.');
    const localName = head[2].split(':').pop().toLowerCase();
    if (!['relationships', 'relationship'].includes(localName)) throw new Error('El PPTX contiene relaciones XML no compatibles.');
    let position = offset + head[0].length, quote = null;
    for (; position < clean.length; position++) {
      const character = clean[position];
      if (quote) { if (character === quote) quote = null; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === '>') break;
      else if (character === '<') throw new Error('El PPTX contiene relaciones XML inválidas.');
    }
    if (position >= clean.length || quote) throw new Error('El PPTX contiene relaciones XML inválidas.');
    let rest = clean.slice(offset + head[0].length, position);
    const selfClosing = /\/\s*$/.test(rest); if (selfClosing) rest = rest.replace(/\/\s*$/, '');
    const attributes = Object.create(null), names = new Set();
    while (rest.trim()) {
      const attribute = /^\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/.exec(rest);
      if (!attribute) throw new Error('El PPTX contiene atributos XML inválidos.');
      const name = attribute[1].split(':').pop().toLowerCase();
      if (names.has(name)) throw new Error('El PPTX contiene atributos XML duplicados.');
      names.add(name); attributes[name] = decodeXmlAttribute(attribute[2] ?? attribute[3]); rest = rest.slice(attribute[0].length);
    }
    if (head[1]) {
      if (selfClosing || names.size || stack.pop() !== head[2]) throw new Error('El PPTX contiene relaciones XML inválidas.');
    } else {
      if (localName === 'relationships') { if (root || stack.length) throw new Error('El PPTX contiene relaciones XML inválidas.'); root = true; }
      else {
        if (!stack.length || stack[stack.length - 1].split(':').pop().toLowerCase() !== 'relationships') throw new Error('El PPTX contiene relaciones XML inválidas.');
        const type = (attributes.type || '').trim(), target = (attributes.target || '').trim(), mode = (attributes.targetmode || '').trim();
        const external = /^external$/i.test(mode) || /^[a-z][\w+.-]*:|^[\\/]{2}/i.test(target) || /[\0-\x1f\\]/.test(target);
        if (/vbaproject|oleobject|activex|\/package$/i.test(type) || external && !/\/hyperlink$/i.test(type)) {
          throw new Error('El PPTX contiene recursos externos. Incrústalos o exporta una copia a PDF.');
        }
      }
      if (!selfClosing) stack.push(head[2]);
    }
    offset = position + 1;
  }
  if (!root || stack.length) throw new Error('El PPTX contiene relaciones XML inválidas.');
}

function validateZipExtra(bytes) {
  for (let offset = 0; offset < bytes.length;) {
    if (offset + 4 > bytes.length) throw new Error('El archivo PPTX está dañado.');
    const tag = bytes.readUInt16LE(offset), length = bytes.readUInt16LE(offset + 2);
    // ZIP64 and alternate Unicode names can give the converter a different directory view.
    if ([0x0001, 0x7075, 0x6375, 0x9901].includes(tag) || offset + 4 + length > bytes.length) throw new Error('El contenedor PPTX no es compatible. Exporta una copia a PDF.');
    offset += 4 + length;
  }
}

// Every local ZIP entry must match the directory and be accounted for exactly once.
// External embedded resources/macros are not accepted; ordinary hyperlink relationships are inert.
function validatePptx(bytes) {
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) { end = offset; break; }
  }
  if (end < 0) throw new Error('El archivo PPTX está dañado.');
  const count = bytes.readUInt16LE(end + 10), directoryStart = bytes.readUInt32LE(end + 16), directorySize = bytes.readUInt32LE(end + 12);
  let offset = directoryStart, total = 0, hasPresentation = false;
  const seen = new Set(), ranges = [];
  if (count > 10000 || count === 0 || count !== bytes.readUInt16LE(end + 8) || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)
    || directoryStart + directorySize !== end || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length) throw new Error('El archivo PPTX no es compatible.');
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('El archivo PPTX está dañado.');
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20), size = bytes.readUInt32LE(offset + 24), nameSize = bytes.readUInt16LE(offset + 28);
    const extraSize = bytes.readUInt16LE(offset + 30), commentSize = bytes.readUInt16LE(offset + 32);
    if (offset + 46 + nameSize + extraSize + commentSize > end || bytes.readUInt16LE(offset + 34)) throw new Error('El archivo PPTX está dañado.');
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameSize), name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes);
    let canonical;
    try { canonical = decodeURIComponent(name).normalize('NFC').toLowerCase(); } catch { throw new Error('El archivo PPTX contiene nombres inválidos.'); }
    const local = bytes.readUInt32LE(offset + 42); total += size;
    if (flags & 1 || ![0, 8].includes(method) || size > 32 * 1024 * 1024 || total > 128 * 1024 * 1024
      || /vbaproject|activex|embeddings\//i.test(canonical) || !canonical || /[\\:\0-\x1f]/.test(canonical)
      || canonical.startsWith('/') || canonical.split('/').some((part, index, parts) => part === '.' || part === '..' || !part && index !== parts.length - 1)
      || seen.has(canonical)) throw new Error('El PPTX contiene elementos incrustados no compatibles, rutas duplicadas o es demasiado grande. Exporta una copia a PDF.');
    seen.add(canonical);
    validateZipExtra(bytes.subarray(offset + 46 + nameSize, offset + 46 + nameSize + extraSize));
    if (local + 30 > directoryStart || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 6) !== flags
      || bytes.readUInt16LE(local + 8) !== method || bytes.readUInt16LE(local + 26) !== nameSize) throw new Error('El archivo PPTX tiene cabeceras inconsistentes.');
    const localExtraSize = bytes.readUInt16LE(local + 28), start = local + 30 + nameSize + localExtraSize;
    if (start + compressed > directoryStart || !bytes.subarray(local + 30, local + 30 + nameSize).equals(nameBytes)) throw new Error('El archivo PPTX tiene cabeceras inconsistentes.');
    validateZipExtra(bytes.subarray(local + 30 + nameSize, start));
    const crc = bytes.readUInt32LE(offset + 16);
    for (const [localIndex, expected] of [[14, crc], [18, compressed], [22, size]]) {
      const actual = bytes.readUInt32LE(local + localIndex);
      if (actual !== expected && (!(flags & 8) || actual !== 0)) throw new Error('El archivo PPTX tiene tamaños inconsistentes.');
    }
    let dataEnd = start + compressed;
    if (flags & 8) {
      if (dataEnd + 12 > directoryStart) throw new Error('El archivo PPTX está dañado.');
      const descriptor = dataEnd + (bytes.readUInt32LE(dataEnd) === 0x08074b50 ? 4 : 0);
      if (descriptor + 12 > directoryStart || bytes.readUInt32LE(descriptor) !== crc || bytes.readUInt32LE(descriptor + 4) !== compressed
        || bytes.readUInt32LE(descriptor + 8) !== size) throw new Error('El archivo PPTX tiene tamaños inconsistentes.');
      dataEnd = descriptor + 12;
    }
    ranges.push([local, dataEnd]);
    if (name === 'ppt/presentation.xml') hasPresentation = true;
    if (/\.(?:xml|rels)$/i.test(canonical)) {
      const data = bytes.subarray(start, start + compressed);
      const inflated = method === 8 ? zlib.inflateRawSync(data, { maxOutputLength: 32 * 1024 * 1024 }) : data;
      if (inflated.length !== size) throw new Error('El archivo PPTX está dañado.');
      const xml = inflated.toString('utf8');
      if (/\0|<!DOCTYPE|<!ENTITY/i.test(xml)) {
        throw new Error('El PPTX contiene recursos externos. Incrústalos o exporta una copia a PDF.');
      }
      if (/\.rels$/i.test(canonical)) validateRelationships(xml);
    }
    offset += 46 + nameSize + extraSize + commentSize;
  }
  ranges.sort((a, b) => a[0] - b[0]); let next = 0;
  for (const [start, finish] of ranges) { if (start !== next) throw new Error('El archivo PPTX tiene entradas ocultas o superpuestas.'); next = finish; }
  if (!hasPresentation || offset !== end || next !== directoryStart) throw new Error('El archivo no es una presentación PPTX válida.');
}

async function renderDocument(input) {
  const bytes = Buffer.from(input.base64, 'base64');
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error('Usa un archivo de hasta 16 MB.');
  if (input.kind === 'pdf' && bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('El archivo no es un PDF válido.');
  if (input.kind === 'pptx') validatePptx(bytes);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'scory-reference-'));
  try {
    const source = path.join(directory, `source.${input.kind}`), pdf = path.join(directory, 'source.pdf');
    await fs.writeFile(source, bytes, { mode: 0o600 });
    if (input.kind === 'pptx') {
      const profile = path.join(directory, 'profile');
      await fs.mkdir(path.join(profile, 'user'), { recursive: true });
      await fs.writeFile(path.join(profile, 'user', 'registrymodifications.xcu'),
        '<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>');
      await convertPptx(source, directory, profile, pdf);
      try { await fs.access(pdf); } catch { throw new Error('No se pudo convertir el PPTX. Revisa que no tenga contraseña o exporta una copia a PDF.'); }
    }
    const { pageCount, pages } = await renderPdfPages(pdf, directory, input);
    return { name: input.name, pageCount, pages, notice: input.kind === 'pptx'
      ? 'Revisa las vistas previas: las fuentes no instaladas y algunos efectos de PowerPoint pueden variar. Un PDF exportado conserva mejor la apariencia.' : undefined };
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Falta Poppler en el equipo. Configura pdfinfo y pdftoppm para abrir las páginas del documento.');
    if (error.killed) throw new Error('La conversión tardó demasiado. Prueba con menos páginas o exporta el archivo a PDF.');
    if (error.code && error.stderr) throw new Error('No se pudo leer el documento. Comprueba que no esté dañado ni protegido con contraseña.');
    throw error;
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

async function handleReferenceImport(req, res, dependencies = {}) {
  const respond = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  try { assertRendererSessionHeader(req, dependencies.env); } catch (error) { respond(error.status, { error: error.code, message: error.message }); return; }
  if (active >= 2) { respond(429, { error: 'import_busy', message: 'El importador está ocupado. Intenta de nuevo en unos segundos.' }); return; }
  active++;
  try {
    req.setTimeout?.(30000, () => req.destroy());
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { respond(413, { error: 'file_too_large', message: 'Usa un archivo de hasta 16 MB.' }); return; }
      chunks.push(chunk);
    }
    req.setTimeout?.(0);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    await authorizeRendererRequest(req, body?.business_id, dependencies);
    const input = validateInput(body);
    const result = input.kind === 'web' ? await captureWeb(input, puppeteer) : await renderDocument(input);
    respond(200, result);
  } catch (error) {
    respond(error.status || 400, { error: error.code || 'reference_import_failed', message: error instanceof SyntaxError ? 'Solicitud de importación inválida.' : error.message });
  } finally { active--; }
}

module.exports = { handleReferenceImport, validateInput, validatePptx, renderDocument, MAX_FILE_BYTES, getActiveReferenceImports: () => active };
