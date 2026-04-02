import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/music-api': {
        target: 'https://music.youtube.com/youtubei/v1',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/music-api/, ''),
      },
    },
  },
  preview: {
    proxy: {
      '/music-api': {
        target: 'https://music.youtube.com/youtubei/v1',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/music-api/, ''),
      },
    },
  },
});