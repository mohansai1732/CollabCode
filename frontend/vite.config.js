import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

function spaFallbackPlugin() {
  return {
    name: 'spa-fallback',
    closeBundle() {
      const distDir = path.resolve(import.meta.dirname, 'dist');
      const indexPath = path.join(distDir, 'index.html');
      if (!fs.existsSync(indexPath)) return;

      const html = fs.readFileSync(indexPath, 'utf-8');

      // 1. Render Static Site fallback (Render automatically serves 404.html on unmapped paths)
      fs.writeFileSync(path.join(distDir, '404.html'), html);

      // 2. Direct static entry points for known static routes so they return 200 OK
      const staticRoutes = ['dashboard', 'login', 'register', 'sign-in', 'sign-up'];
      for (const route of staticRoutes) {
        const routeDir = path.join(distDir, route);
        if (!fs.existsSync(routeDir)) {
          fs.mkdirSync(routeDir, { recursive: true });
        }
        fs.writeFileSync(path.join(routeDir, 'index.html'), html);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), spaFallbackPlugin()],
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 5173,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['monaco-editor', 'y-monaco', 'yjs', 'y-socket.io', 'socket.io-client'],
  },
});
