import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const jikanProxy = rewrite => ({
  target: 'https://api.jikan.moe',
  changeOrigin: true,
  secure: true,
  rewrite
});

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/catalog': jikanProxy(path => {
        const url = new URL(path, 'http://localhost');
        url.pathname = url.pathname.replace(/^\/api\/catalog/, '/v4');
        url.searchParams.delete('ranking');
        return url.pathname + url.search;
      }),
      '/api/seasons': jikanProxy(path => path.replace(/^\/api\/seasons/, '/v4/seasons')),
      '/api/top': jikanProxy(path => path.replace(/^\/api\/top/, '/v4/top')),
      '/api/anime': jikanProxy(path => {
        if (path === '/api/anime/search') return '/v4/anime';
        if (path === '/api/anime' || path === '/api/anime/') return '/v4/anime';
        const suffix = path.slice('/api/anime/'.length);
        if (/^\d+$/.test(suffix)) return '/v4/anime/' + suffix + '/full';
        return '/v4/anime/' + suffix;
      })
    }
  }
});
