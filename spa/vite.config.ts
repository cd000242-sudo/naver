import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Leaders Pro SPA — React 18 + Vite
// 빌드 출력: spa/dist → GitHub Pages workflow가 _site로 복사 후 leaderspro.kr 배포
export default defineConfig({
  plugins: [react()],
  base: '/',  // 루트 도메인 배포 (leaderspro.kr/...)
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    // 청크 분할: react/router는 별도 chunk → 캐시 효율 ↑
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'router': ['react-router-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
