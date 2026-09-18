import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

/** Separate local entry: no App/AuthGate, .env credentials, Supabase or live provider imports. */
export default defineConfig({
  envDir: path.resolve(__dirname, 'experiments/desaing'),
  envPrefix: 'DESAING_LAB_PUBLIC_',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 3011, strictPort: true },
  preview: { host: '127.0.0.1', port: 3011, strictPort: true },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist-desaing-lab', rollupOptions: { input: path.resolve(__dirname, 'experiments/desaing/index.html') } },
});
