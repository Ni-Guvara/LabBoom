import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // 纯静态离线构建：base 相对路径，U 盘双击 index.html 可用
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          echarts: ['echarts'],
          vendor: ['react', 'react-dom', 'react-router-dom', 'zustand', 'katex', 'react-katex'],
        },
      },
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
