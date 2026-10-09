const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { dockerDocumentArgs, runLocalDocumentContainer, DEFAULT_DOCUMENT_IMAGE } = require('./local-document-container');
const execute = promisify(execFile);
const MAX_PDF_BYTES = 32 * 1024 * 1024;
const DEFAULT_PPTX_IMAGE = DEFAULT_DOCUMENT_IMAGE;

// Fixed program: no path, file text, shell command or image name comes from the uploaded deck.
const DOCKER_CONVERT = `const fs=require('node:fs');const{execFileSync}=require('node:child_process');
fs.mkdirSync('/tmp/profile/user',{recursive:true});
fs.writeFileSync('/tmp/profile/user/registrymodifications.xcu','<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>');
execFileSync('soffice',['-env:UserInstallation=file:///tmp/profile','--headless','--norestore','--nodefault','--convert-to','pdf:impress_pdf_Export','--outdir','/tmp','/input/source.pptx'],{timeout:55000,maxBuffer:1048576,stdio:'pipe'});
const file='/tmp/source.pdf';if(fs.statSync(file).size>33554432)throw Error('PDF too large');
const pdf=fs.readFileSync(file);if(pdf.subarray(0,5).toString()!=='%PDF-')throw Error('Invalid PDF');process.stdout.write(pdf.toString('base64'));`;

function dockerConversionArgs(directory, image, name, identity = {}) {
  return dockerDocumentArgs(directory, image, name, DOCKER_CONVERT, [], identity);
}

async function convertPptx(source, directory, profile, pdf, dependencies = {}) {
  const run = dependencies.execute || execute, env = dependencies.env || process.env;
  try {
    await run(env.LIBREOFFICE_BIN || 'soffice', [`-env:UserInstallation=${pathToFileURL(profile).href}`,
      '--headless', '--norestore', '--nodefault', '--convert-to', 'pdf:impress_pdf_Export', '--outdir', directory, source],
    { timeout: 55000, maxBuffer: 1024 * 1024, windowsHide: true, env });
    return;
  } catch (error) {
    // Damaged documents and conversion timeouts are not retried in another engine.
    if (error.code !== 'ENOENT') throw error;
  }
  const stdout = await runLocalDocumentContainer(directory, DOCKER_CONVERT, [], 'pptx', dependencies);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(stdout)) throw new Error('La conversión local devolvió un PDF inválido.');
  const bytes = Buffer.from(stdout, 'base64');
  if (!bytes.length || bytes.length > MAX_PDF_BYTES || bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('La conversión local devolvió un PDF inválido.');
  await fs.writeFile(pdf, bytes, { mode: 0o600 });
}

module.exports = { convertPptx, dockerConversionArgs, DEFAULT_PPTX_IMAGE };
