# Leaders Pro SPA

React 18 + Vite + TypeScript SPA. `payment-page/` 의 14개 HTML 페이지를 점진적으로 마이그레이션 중.

## 개발

```bash
cd spa
npm install
npm run dev      # http://localhost:5173
npm run build    # spa/dist 출력
npm run preview  # 빌드 결과 미리보기
```

## 단계 진행

| Phase | 상태 | 내용 |
|-------|------|------|
| 1a | ✅ | Vite + React 18 토대 |
| 1b | 진행 | Router + 공통 컴포넌트 (Navbar/Footer/MusicPlayer/SakuraPetals/FloatStack) |
| 2 | 대기 | index.html (12,652줄) → IndexPage.tsx |
| 3 | 대기 | GitHub Actions workflow 수정 (spa/dist → _site) |
| 4 | 대기 | products / detail / leword 페이지 |
| 5 | 대기 | pricing (Toss SDK) + download (GH API) |
| 6 | 대기 | reviews / community / lookup |
| 7 | 대기 | 기존 HTML deprecated (1주일 안전망 후)|

## 회귀 안전망

- baseline tag: `pre-spa-rewrite-baseline`
- 롤백: `git reset --hard pre-spa-rewrite-baseline && git push --force-with-lease origin main`

## 스타일 전략

기존 `payment-page/*.html` 의 inline style 그대로 React JSX 안에 유지.
컴포넌트 분할로 가독성 확보. Phase 1~6 동안 큰 CSS 리팩토링 X.
