import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Starts only missing services. Never kills a pre-existing renderer or Vite.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// `--mode localsupabase` (npm run dev:local) points Vite at the local Supabase; without it, Vite uses .env.
const modeAt = process.argv.indexOf('--mode');
const viteMode = modeAt > 0 && process.argv[modeAt + 1] ? ['--mode', process.argv[modeAt + 1]] : [];
const children = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
function launch(file, cwd, args = [], env = {}) {
  const child = spawn(process.execPath, [file, ...args], { cwd, env: { ...process.env, ...env }, stdio: 'inherit', windowsHide: true });
  children.add(child);
  child.once('error', error => { console.error(error.message); stop(1); });
  child.once('exit', code => { children.delete(child); if (!stopping && code) stop(code); });
  return child;
}
async function read(url) {
  try { return await fetch(url, { signal: AbortSignal.timeout(1500) }); } catch { return null; }
}
const compatible = value => value?.capabilities?.includes('design-preview') && value.capabilities.includes('reference-import');
async function main() {
  const renderer = await read('http://localhost:3333/health');
  if (renderer) {
    const health = await renderer.json().catch(() => null);
    if (!renderer.ok || !compatible(health)) throw Error('El puerto 3333 tiene un renderizador anterior. Cierra su terminal o detén únicamente ese proceso y vuelve a ejecutar npm run dev:local.');
    console.log('Renderizador local actualizado: http://localhost:3333');
  } else {
    launch(path.join(root, 'renderer/scripts/render-server.js'), path.join(root, 'renderer'), [], { NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '3333',
      // Local Supabase mode: the design preview may read public Storage images from the local API (loopback, HTTP).
      ...(viteMode[1] === 'localsupabase' ? { SCORY_LOCAL_SUPABASE_URL: 'http://127.0.0.1:55321' } : {}) });
    let ready = false;
    for (let attempt = 0; attempt < 30 && !stopping; attempt++) {
      const response = await read('http://localhost:3333/health');
      if (response?.ok && compatible(await response.json().catch(() => null))) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    if (!ready) throw Error('El renderizador no pudo iniciar. Comprueba las dependencias con npm --prefix renderer install.');
  }
  const app = await read('http://localhost:3000/');
  if (app) {
    if (!app.ok || !(await app.text()).includes('/@vite/client')) throw Error('El puerto 3000 está ocupado por otra aplicación. Libéralo antes de iniciar ScoryDesign.');
    console.log('ScoryDesign ya está abierto: http://localhost:3000');
  } else {
    launch(path.join(root, 'node_modules/vite/bin/vite.js'), root, ['--host', '127.0.0.1', '--port', '3000', '--strictPort', ...viteMode]);
  }
  console.log('Diseños, capturas y referencias usan el renderizador de esta computadora. Para PowerPoint, mantén Docker Desktop abierto.');
}
main().catch(error => { console.error(error.message); stop(1); });
