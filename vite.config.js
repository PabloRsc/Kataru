import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/genres': {
        target: 'https://api.jikan.moe',
        changeOrigin: true,
        secure: true,
        rewrite: path => path.replace(/^\/api\/genres/, '/v4/genres')
      },
      '/api/anime': {
        target: 'https://api.jikan.moe',
        changeOrigin: true,
        secure: true,
        rewrite: path => {
          if (path === '/api/anime/search') return '/v4/anime';
          const prefix = '/api/anime/';
          if (path.startsWith(prefix)) {
            const suffix = path.slice(prefix.length);
            if (/^\d+$/.test(suffix)) return '/v4/anime/' + suffix + '/full';
            return '/v4/anime/' + suffix;
          }
          return '/v4/anime';
        }
      }
    }
  }
});
