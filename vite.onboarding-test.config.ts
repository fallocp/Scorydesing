import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { presentationServerPlugin } from './experiments/presentations/serverPlugin';

/** Local SQL and actual adapters with injected fake transports; no deployment or provider credentials. */
export default defineConfig({
  envDir: path.resolve(__dirname, 'experiments/presentations'), envPrefix: 'PRESENTATIONS_TEST_PUBLIC_',
  define: Object.fromEntries(['GENERATION', 'EXPLORATION', 'DURABLE_EXPLORATION', 'WORKSPACE', 'MATERIALS', 'ONBOARDING']
    .map(key => [`import.meta.env.PRESENTATIONS_TEST_PUBLIC_${key}`, JSON.stringify('true')])),
  plugins: [{ name: 'onboarding-test-routes', configureServer(server) { server.middlewares.use((req, _res, next) => {
    if (['/onboarding', '/materials', '/free-design', '/presentations'].includes(req.url?.split('?')[0] ?? '') && req.headers.accept?.includes('text/html')) req.url = '/experiments/presentations/';
    next();
  }); } }, presentationServerPlugin({ onboarding: true }), react()],
  server: { host: '127.0.0.1', port: 3020, strictPort: true },
  resolve: { alias: [
    { find: /^@\/integrations\/supabase\/client$/, replacement: path.resolve(__dirname, 'experiments/presentations/workspaceSupabase.ts') },
    { find: /^@\/hooks\/useActiveBusiness$/, replacement: path.resolve(__dirname, 'experiments/presentations/mockActiveBusiness.ts') },
    { find: /^@\/hooks\/useBusinessTenants$/, replacement: path.resolve(__dirname, 'experiments/presentations/mockBusinessTenants.ts') },
    { find: '@', replacement: path.resolve(__dirname, 'src') },
  ] },
});
