import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { presentationServerPlugin } from './experiments/presentations/serverPlugin';
export default defineConfig({
  envDir: path.resolve(__dirname, 'experiments/presentations'), envPrefix: 'PRESENTATIONS_TEST_PUBLIC_',
  define: {
    'import.meta.env.PRESENTATIONS_TEST_PUBLIC_GENERATION': JSON.stringify('true'),
    'import.meta.env.PRESENTATIONS_TEST_PUBLIC_EXPLORATION': JSON.stringify('true'),
    'import.meta.env.PRESENTATIONS_TEST_PUBLIC_DURABLE_EXPLORATION': JSON.stringify('true'),
    'import.meta.env.PRESENTATIONS_TEST_PUBLIC_WORKSPACE': JSON.stringify('true'),
    'import.meta.env.PRESENTATIONS_TEST_PUBLIC_MATERIALS': JSON.stringify('true'),
  },
  plugins: [{ name: 'materials-test-routes', configureServer(server) { server.middlewares.use((req, _res, next) => {
    if (['/materials', '/free-design', '/presentations'].includes(req.url?.split('?')[0] ?? '') && req.headers.accept?.includes('text/html')) req.url = '/experiments/presentations/'; next();
  }); } }, presentationServerPlugin({ materials: true }), react()],
  server: { host: '127.0.0.1', port: 3019, strictPort: true },
  resolve: { alias: [
    { find: /^@\/integrations\/supabase\/client$/, replacement: path.resolve(__dirname, 'experiments/presentations/workspaceSupabase.ts') },
    { find: /^@\/hooks\/useActiveBusiness$/, replacement: path.resolve(__dirname, 'experiments/presentations/mockActiveBusiness.ts') },
    { find: '@', replacement: path.resolve(__dirname, 'src') },
  ] },
});
