import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { presentationServerPlugin } from './experiments/presentations/serverPlugin';

/** UI + JWT handler + live adapter, with local SQL/Auth/Storage and an injected fake provider fetch. */
export default defineConfig({
  envDir: path.resolve(__dirname, 'experiments/presentations'),
  envPrefix: 'PRESENTATIONS_TEST_PUBLIC_',
  define: { 'import.meta.env.PRESENTATIONS_TEST_PUBLIC_GENERATION': JSON.stringify('true') },
  plugins: [presentationServerPlugin({ generation: true }), react()],
  server: { host: '127.0.0.1', port: 3013, strictPort: true },
  resolve: { alias: [
    { find: /^@\/integrations\/supabase\/client$/, replacement: path.resolve(__dirname, 'experiments/presentations/mockSupabase.ts') },
    { find: /^@\/hooks\/useActiveBusiness$/, replacement: path.resolve(__dirname, 'experiments/presentations/mockActiveBusiness.ts') },
    { find: '@', replacement: path.resolve(__dirname, 'src') },
  ] },
});
