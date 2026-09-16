import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径，便于直接用静态服务器或 GitHub Pages 托管构建产物
  base: './',
  server: { port: 5173, open: false },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
});
