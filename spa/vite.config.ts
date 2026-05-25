import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Leaders Pro SPA — React 18 + Vite
// 빌드 출력: spa/dist → GitHub Pages workflow가 _site로 복사 후 leaderspro.kr 배포
export default defineConfig({
  plugins: [react()],
  // Phase 7: SPA를 root로 이전.
  // 기존 *.html 정적 파일(success/fail/terms 등)은 호환성을 위해 root에 그대로 유지.
  // /products 같은 SPA 라우트는 404.html → index.html fallback 으로 처리.
  base: '/',
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
