import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { presentationServerPlugin } from './experiments/presentations/serverPlugin';

/** Browser integration harness only: real UI, local storage, no application auth or credentials. */
export default defineConfig({
  envDir: path.resolve(__dirname, 'experiments/presentations'),
  envPrefix: 'PRESENTATIONS_TEST_PUBLIC_',
  plugins: [presentationServerPlugin(), react()],
  server: { host: '127.0.0.1', port: 3012, strictPort: true },
  resolve: {
    alias: [
      { find: /^@\/integrations\/supabase\/client$/, replacement: path.resolve(__dirname, 'experiments/presentations/mockSupabase.ts') },
      { find: /^@\/hooks\/useActiveBusiness$/, replacement: path.resolve(__dirname, 'experiments/presentations/mockActiveBusiness.ts') },
      { find: '@', replacement: path.resolve(__dirname, 'src') },
    ],
  },
  build: {
    outDir: 'dist-presentations-test',
    rollupOptions: { input: path.resolve(__dirname, 'experiments/presentations/index.html') },
  },
});
