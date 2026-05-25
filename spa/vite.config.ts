import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Leaders Pro SPA — React 18 + Vite
// 빌드 출력: spa/dist → GitHub Pages workflow가 _site로 복사 후 leaderspro.kr 배포
export default defineConfig({
  plugins: [react()],
  // Phase 1b: 점진 마이그레이션 동안 /spa/ 경로에 배포 (leaderspro.kr/spa/).
  // Phase 6 마이그 완료 후 '/' 로 변경 + 기존 HTML 제거.
  base: '/spa/',
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
