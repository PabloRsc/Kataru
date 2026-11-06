import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/anime': {
        target: 'https://api.jikan.moe/v4',
        changeOrigin: true,
        secure: true,
        rewrite: path => path
          .replace(/^\\/api\\/anime\\/search/, '/anime')
          .replace(/^\\/api\\/anime\\/(\\d+)$/, '/anime/$1/full')
      }
    }
  }
});
