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
          const prefix = '/api/anime/';
          if (path.startsWith(prefix)) {
            const id = path.slice(prefix.length);
            if (id && [...id].every(char => char >= '0' && char <= '9')) {
              return '/v4/anime/' + id + '/full';
            }
          }
          return path;
        }
      }
    }
  }
});
