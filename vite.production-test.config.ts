import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { presentationServerPlugin } from './experiments/presentations/serverPlugin';

/** Local production-source fixtures; real credentials and external provider transports are not used. */
export default defineConfig({
  envDir: path.resolve(__dirname, 'experiments/presentations'), envPrefix: 'PRESENTATIONS_TEST_PUBLIC_',
  define: Object.fromEntries(['GENERATION', 'EXPLORATION', 'DURABLE_EXPLORATION', 'WORKSPACE', 'PRODUCTION']
    .map(key => [`import.meta.env.PRESENTATIONS_TEST_PUBLIC_${key}`, JSON.stringify('true')])),
  plugins: [{ name: 'production-test-routes', configureServer(server) { server.middlewares.use((req, _res, next) => {
    if (req.url?.split('?')[0] === '/production' && req.headers.accept?.includes('text/html')) req.url = '/experiments/presentations/';
    next();
  }); } }, presentationServerPlugin({ production: true }), react()],
  server: { host: '127.0.0.1', port: 3021, strictPort: true },
  resolve: { alias: [
    { find: /^@\/integrations\/supabase\/client$/, replacement: path.resolve(__dirname, 'experiments/presentations/workspaceSupabase.ts') },
    { find: /^@\/hooks\/useActiveBusiness$/, replacement: path.resolve(__dirname, 'experiments/presentations/mockActiveBusiness.ts') },
    { find: '@', replacement: path.resolve(__dirname, 'src') },
  ] },
});
