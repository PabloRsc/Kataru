import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/anime': {
        target: 'https://api.jikan.moe',
        changeOrigin: true,
        secure: true,
        rewrite: path => {
          if (path === '/api/anime/search') return '/v4/anime';
          const match = path.match(/^\/api\/anime\/([0-9]+)$/);
          return match ? \`/v4/anime/\${match[1]}/full\` : path;
        }
      }
    }
  }
});
