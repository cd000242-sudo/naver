# HANDOFF — leaderspro.kr 웹사이트 전면 개선

> 새 세션 인수인계. 작성 2026-05-23. 7팀 병렬 심층감사 기반 재작성.
> 대상: `payment-page/` (leaderspro.kr 배포본). 루트 사본(`/detail.html` 등)·`.env.pre-pack-backup`은 손대지 말 것.
> ⚠️ `payment-page/`는 GitHub Pages 배포 — 라이브 결제 사이트. **재배포(GitHub Pages·GAS)는 사용자가 직접 수행.**

## 감사 개요

사용자 원 요청 6건(detail CTA / 할인·부가세 / 음악 끊김·자동재생 / 여름곡 / admin 관리탭 / 모바일 메뉴)에 대해
"빠진 게 더 많을 것"이라는 사용자 지적에 따라 **7개 도메인 병렬 감사** 수행:
모바일반응형 / 네비·링크 / 결제·가격 / 음악·공통컴포넌트 / admin·GAS / 테마·콘텐츠 / 페이지인벤토리.
→ 원 6건 외 **추가 이슈 ~15건** 발견. 전체를 7 Phase로 재구성.

## ⚠️ 자기비평 (이전 플랜의 오류 — 새 세션 필독)

1. **음악 끊김 원인 오진**: 이전 플랜은 "페이지마다 YouTube 플레이어가 새로 생성되는 구조적 한계 →
   지속 플레이어 전면 개편 필요"라 했음. **틀림.** 진짜 1차 원인은 `music.js`가 **index.html에만
   로드되고 다른 10+ 페이지엔 아예 없음**(Agent4). music.js를 전 페이지에 추가하면 기존
   localStorage 이어재생이 작동해 **"전면 개편" 없이도 거의 무중단**이 됨(페이지 로드 1~2초 갭만 잔존).
   → "전면 개편"은 P0가 아니라 **선택 작업으로 강등**. 사용자가 "전면 개편"을 골랐으나
   잘못된 설명에 기반한 선택이므로, 새 세션은 Phase 2(music.js 전파) 먼저 하고 사용자에게 재확인할 것.

2. **모바일 메뉴 — 정적 분석 신뢰 금지**: 모바일 감사 에이전트는 햄버거 메뉴 CSS를 "정상(PASS)"으로
   판정했으나, **사용자 실제 스크린샷은 명백히 깨짐**(메뉴가 배경 없이 히어로 위에 투명하게 겹침).
   정적 CSS 분석은 실렌더링 버그를 못 잡음. 새 세션은 **반드시 Playwright/실제 모바일로 재현**해
   원인 규명할 것(index.html 인라인 CSS ↔ style.css ↔ summer-theme.css 충돌 의심).

3. **검증**: 정적 HTML이라 자동 테스트 없음. 각 Phase 변경 후 **PC·모바일 양쪽 실제 확인 필수**
   (Playwright MCP 활용 가능).

## ✅ Phase 1 — 완료 (미커밋)

`payment-page/detail.html`: CTA 11개의 깨진 `#pricing` 앵커 → `pricing.html` 교체.
"첫 달 50% 할인" 배너 + 카운트다운 JS 제거.

---

## Phase 2 — 사이트 골격: 음악 로딩·네비·모바일 메뉴  ★최우선

### P0-1. music.js 전 페이지 로드 (음악 끊김 1차 해결)
- 현재 `music.js`는 **index.html(:744)에만** `<script src="music.js">` 있음.
- 누락 페이지: pricing/products/community/reviews/download/lookup/detail/privacy/refund/terms/
  success/fail/bank-order/subscription. → 전부 `</body>` 직전에 `<script src="music.js"></script>` 추가.
- detail.html은 경로 주의(같은 디렉토리이므로 `music.js`).

### P0-2. 모바일 햄버거 메뉴 깨짐
- 증상(사용자 스크린샷): 우측 상단 3줄 메뉴 탭 시 드롭다운이 **불투명 배경 없이** 히어로 위에 겹쳐 렌더.
- style.css(2144~2176)엔 모바일 메뉴 규칙(`rgba(3,3,5,0.97)` 배경)이 있으나 실제론 적용 안 되는 듯.
- 의심: index.html 인라인 CSS 또는 summer-theme.css가 덮어씀 / 메뉴 마크업 클래스 불일치.
- → Playwright로 모바일 뷰 재현 → 실제 원인 CSS 특정 → 수정. 전 페이지 동일 점검.

### P0-3. detail.html 네비게이션·푸터 부재
- detail.html은 navbar·로고·푸터가 **전혀 없음** → 진입 시 다른 페이지로 못 감(갇힘).
- 다른 페이지와 동일한 navbar+footer 추가.

### P1. 네비게이션 일관성
- products.html: 메뉴에 "홈" 링크 누락 → 추가.
- index.html:218 로고 `href="#"` → `index.html`.
- lookup.html:56 메뉴 라벨 "가격" → "구매"로 통일.
- index.html:227 "제품정보" → "제품"으로 통일.
- "구매" 메뉴 항목(→pricing.html)은 대부분 페이지에 존재하나, 사용자가 "구매하기 안 보임"이라 함
  = 모바일 메뉴 깨짐 탓으로 추정. P0-2 수정 후 노출 확인 + 라벨 "구매하기"로 명확화 검토.
- (선택·큰작업) navbar/footer가 전 페이지 복붙 → 공통 JS 컴포넌트화. 위험·범위 크므로 별도 판단.

---

## Phase 3 — 가격·부가세·할인  ★돈 관련, 신중

### 할인 전면 폐지 (정가만)
- pricing.html: "20% 절약"(159), "17% 절약"(218), "11% 절약"(288·358) → 제거.
- community.html:188~191 "봄맞이 20% 할인 이벤트 🌸" 공지 → 제거 또는 일반 공지로 교체.

### 부가세(VAT) — 결정: 현재가=공급가, 카드 ×1.1, 계좌이체 원가
- pricing.html 가격카드: "카드 ₩55,000(VAT 포함) / 계좌이체 ₩50,000" 병기.
  `PRODUCTS` 객체(442~458행) amount 기준 — Naver만 공개, 나머지는 `display:none`.
- Toss 청구액: `requestBillingAuth`(507행) `amount` → 카드는 ×1.1.
- bank-order.html(272~)·detail.html 가격섹션도 동기화. 계좌이체는 원가 유지.
- "부가세 없이 결제 → 계좌이체" 유도(pricing.html:410에 bank-order.html 링크 존재).
- ⚖️ 전자상거래법: 카드 실제 청구액(VAT 포함 최종가)을 결제 전 명확 표시. terms.html:172
  "VAT 포함" 문구도 새 정책에 맞게 갱신.

---

## Phase 4 — 음악 콘텐츠: 여름곡·자동재생

- **여름곡 확정**: YouTube `f4jS6yW83MU`
  (원본 https://www.youtube.com/watch?v=f4jS6yW83MU&list=RDf4jS6yW83MU&start_radio=1).
  `music.js` PLAYLIST(23~29행)의 봄/lo-fi 5곡을 이 곡으로 교체.
- **자동재생**: 사용자 "사이트 열면 자동" 요청. ⚠️ 브라우저 정책상 사용자 제스처 0회 상태에선
  오디오 자동재생 불가(특히 모바일). 최선 = 첫 탭/터치/스크롤 즉시 재생(music.js에 로직 있음 →
  보강). 사용자에게 이 한계 반드시 설명.
- (선택·고위험) "지속 플레이어 전면 개편": Phase 2의 music.js 전파로 이미 거의 무중단이 되므로
  P0 아님. 페이지 로드 1~2초 갭까지 없애려면 상단 고정프레임+iframe 구조 필요(전 페이지 개편).
  토스 결제는 별도 창이라 충돌 없음(사용자 확인). **사용자 재확인 후 진행 여부 결정.**

---

## Phase 5 — 봄→여름 테마 정리

- 봄/벚꽃 CSS·HTML 잔재 제거: detail.html(14~109), index.html(28~123), reviews.html(16~87).
  현재 summer-theme.css가 `display:none !important`로 덮고만 있어 소스에 그대로 박혀 있음.
- reviews.html "🌸 봄 배경음악" 텍스트(427~428·480·484) → 여름 문구 또는 제거.
- spring-bg.png 정리(봄 테마 전용 잔재).
- summer-theme.css 적용 여부 전 페이지 점검(admin 제외 정상).

---

## Phase 6 — admin 후기·커뮤니티 관리 + GAS

- 실사용 admin = `payment-page/admin/index.html`(404.html이 /admin/로 리다이렉트). 구버전
  `admin.html`(평문 비번)은 정리/삭제 검토.
- admin/index.html에 탭 추가: 📝후기관리 / 📢공지사항 / 💰수익인증 / 💡활용팁.
- GAS `payment-page/.gas-license-backend/Code.js`(4576줄)에 액션 추가:
  - 후기: `review-approve`/`review-reject` (현재 get-reviews/submit-review만 있음, 승인 UI 없음)
  - 팁: `tip-approve`/`tip-reject`
  - 공지: `get-notices`/`submit-notice`/`update-notice`/`delete-notice` (현재 전무)
  - 수익인증: `income-list`/`income-add`/`income-delete` (현재 전무)
- 데이터 이전: community.html의 공지사항(149~191)·수익인증(192~281) **하드코딩 → GAS 시트**.
- (선택) 사이트편집 탭이 localStorage에만 저장 → 방문자 미반영. GAS 저장으로 개선 검토.
- 완료 후 **사용자가 GAS 재배포 1회** 필요(방법 안내).

---

## Phase 7 — 잔여 정합성

- 깨진 이미지: detail.html의 `shopping-connect.png`·`shopping-cta-preview.png`·
  `shopping-banner-preview.png`·`thumbnail-generator.png`(1507~1532행) — 파일 없음 → 추가 또는 참조 제거.
- 브랜드명 통일: detail.html title/meta의 "Better Life Naver" → "Leaders Pro"(타 페이지 표준).
  community.html:193 제품명 표기도 통일.
- 고정위젯 모바일 겹침 점검: 음악 FAB·카카오·유튜브 버튼 좌표(모바일에서 우하단 군집).
- 폰트/파비콘 일관성: detail.html만 Noto Sans KR + 🚀 파비콘 → 표준(Inter/Pretendard, 👑)으로.
- subscription.html·payment-complete-demo.html: 메뉴 미연결 — 용도 확정(미사용이면 정리).
- petalContainer 중복 생성 코드 정리(Phase 5 테마 정리와 함께).

---

## 작업 규칙 (필수)

- 라이브 결제 사이트 — **회귀 cascade 절대 금지**. Phase 단위 분리, 각 Phase 후 PC·모바일 실제 검증.
- 정적 HTML — 자동 테스트 없음. Playwright MCP로 모바일/PC 렌더 확인.
- 코드·커밋은 에이전트가, **재배포(GitHub Pages·GAS)는 사용자 직접**.
- 비배포 루트 사본(`/detail.html` 등)·`.env.pre-pack-backup`는 손대지 말 것.
- 토스 재심사: 가격 인상·동종 SW 제품 추가는 재심사 불필요(확인 완료).

## 핵심 파일 레퍼런스

- `payment-page/music.js`(522줄) — PLAYLIST 23~29, 자동재생 449~471, localStorage 이어재생 30~33.
- `payment-page/pricing.html` — 가격카드 146~, PRODUCTS 442~458, Toss 507.
- `payment-page/admin/index.html`(1838줄) — 실사용 admin. GAS_URL/ADMIN_TOKEN ~1094.
- `payment-page/.gas-license-backend/Code.js`(4576줄) — doGet 186~, doPost 286~, 후기/팁 4389~.
- `payment-page/community.html` — 공지 149~191·수익인증 192~281 하드코딩, 활용팁 GAS.
- `payment-page/style.css` — 공통 스타일. 모바일 메뉴 2144~2176.
- `payment-page/summer-theme.css` / `summer-theme.js` — 여름 테마 오버레이.

## 다음 세션 시작 방법

이 파일을 읽게 한 뒤 "Phase 2부터 진행" 식으로 지시. Phase 단위로 진행(한 번에 몰지 말 것).
Phase 4 전면개편 여부, Phase 2 navbar 컴포넌트화 여부는 사용자에게 확인 후 진행.
