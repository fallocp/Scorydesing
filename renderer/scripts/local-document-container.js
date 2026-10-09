const { randomUUID } = require('node:crypto');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const execute = promisify(execFile);
const DEFAULT_DOCUMENT_IMAGE = 'scory-render-service:local';

// The program and arguments are internal constants/validated page numbers, never shell text.
function dockerDocumentArgs(directory, image, name, program, programArgs = [], identity = {}) {
  if (!/^[a-z0-9][a-z0-9._/:@-]{0,239}$/i.test(image)) throw new Error('El nombre de PPTX_RENDER_IMAGE no es válido.');
  if (!/^scory-(?:pptx|pdf)-[a-f0-9-]+$/.test(name)) throw new Error('Identificador de conversión inválido.');
  const sourceField = `"source=${directory.replace(/"/g, '""')}"`;
  return ['run', '--rm', '--pull=never', '--name', name, '--network', 'none', '--read-only', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges', '--memory', '512m', '--cpus', '1', '--pids-limit', '128',
    '--tmpfs', '/tmp:rw,nosuid,size=384m', '--mount', `type=bind,${sourceField},target=/input,readonly`,
    ...(Number.isInteger(identity.uid) && Number.isInteger(identity.gid) ? ['--user', `${identity.uid}:${identity.gid}`] : []),
    image, 'node', '-e', program, ...programArgs];
}

async function runLocalDocumentContainer(directory, program, programArgs, kind, dependencies = {}) {
  const run = dependencies.execute || execute, env = dependencies.env || process.env;
  const image = env.PPTX_RENDER_IMAGE ?? DEFAULT_DOCUMENT_IMAGE;
  const dependency = kind === 'pptx' ? 'LibreOffice' : 'Poppler';
  if (!image || image === 'off') throw new Error(`Para importar ${kind.toUpperCase()}, instala ${dependency} o habilita la imagen local de conversión.`);
  const name = `scory-${kind}-${randomUUID()}`, options = { timeout: 10000, maxBuffer: 1024 * 1024, windowsHide: true };
  let host = env.DOCKER_HOST;
  try {
    if (!host) host = (await run('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { ...options, env })).stdout.trim();
  } catch { throw new Error(`No se encontró ${dependency}. Abre Docker Desktop con la imagen local de conversión para importar ${kind.toUpperCase()}.`); }
  if (!/^(?:npipe:\/\/|unix:\/\/)/.test(host || '')) throw new Error('La conversión requiere Docker local; no se enviará el documento a un equipo remoto.');
  const dockerEnv = { ...env, DOCKER_HOST: '', DOCKER_CONTEXT: '' }, prefix = ['--host', host];
  const args = dockerDocumentArgs(directory, image, name, program, programArgs, { uid: process.getuid?.(), gid: process.getgid?.() });
  try {
    const inspected = await run('docker', [...prefix, 'image', 'inspect', image, '--format', '{{.Os}}'], { ...options, env: dockerEnv });
    if (inspected.stdout.trim() !== 'linux') throw new Error('linux_image_required');
  } catch { throw new Error(`Abre Docker Desktop y prepara la imagen local ${image} para importar documentos. No se descargará automáticamente.`); }
  try {
    const { stdout } = await run('docker', [...prefix, ...args], { ...options, timeout: 75000, maxBuffer: Math.ceil(32 * 1024 * 1024 * 4 / 3) + 16384, env: dockerEnv });
    return stdout;
  } catch (error) {
    if (error.killed) throw new Error('La conversión local tardó demasiado. Prueba con menos páginas.');
    throw new Error(`No se pudo leer el ${kind.toUpperCase()} en el equipo. Comprueba que Docker Desktop esté abierto y que el archivo no esté dañado ni tenga contraseña.`);
  } finally {
    // Killing a timed-out Docker CLI does not itself stop its container.
    await run('docker', [...prefix, 'rm', '--force', name], { ...options, timeout: 5000, env: dockerEnv }).catch(() => {});
  }
}

module.exports = { dockerDocumentArgs, runLocalDocumentContainer, DEFAULT_DOCUMENT_IMAGE };
