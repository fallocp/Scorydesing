import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { presentationServerPlugin } from './experiments/presentations/serverPlugin';

/** Isolated administrative fixtures. Comparison images use the local simulated provider. */
export default defineConfig({
  cacheDir: 'node_modules/.vite/prompt-admin-test',
  envDir: path.resolve(__dirname, 'experiments/presentations'), envPrefix: 'PRESENTATIONS_TEST_PUBLIC_',
  define: Object.fromEntries(['GENERATION', 'EXPLORATION', 'DURABLE_EXPLORATION', 'WORKSPACE', 'PROMPT_ADMIN']
    .map(key => [`import.meta.env.PRESENTATIONS_TEST_PUBLIC_${key}`, JSON.stringify('true')])),
  plugins: [{ name: 'prompt-admin-test-routes', configureServer(server) { server.middlewares.use((req, _res, next) => {
    if (req.url?.split('?')[0] === '/prompt-admin' && req.headers.accept?.includes('text/html')) req.url = '/experiments/presentations/';
    next();
  }); } }, presentationServerPlugin({ promptAdmin: true }), react()],
  server: { host: '127.0.0.1', port: 3022, strictPort: true },
  resolve: { alias: [
    { find: /^@\/integrations\/supabase\/client$/, replacement: path.resolve(__dirname, 'experiments/presentations/workspaceSupabase.ts') },
    { find: /^@\/hooks\/useActiveBusiness$/, replacement: path.resolve(__dirname, 'experiments/presentations/mockActiveBusiness.ts') },
    { find: '@', replacement: path.resolve(__dirname, 'src') },
  ] },
});
