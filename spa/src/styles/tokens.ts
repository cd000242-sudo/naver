/**
 * 디자인 토큰 — 이 사이트가 "이미 쓰고 있는 값"의 단일 출처.
 *
 * 여기 있는 값은 전부 기존 소스에서 실측해 옮긴 것이다. 새로 만든 색은 없다.
 * 그래서 페이지가 리터럴 대신 이 토큰을 쓰도록 바꿔도 화면은 한 픽셀도 안 바뀐다.
 * (검증: scripts/style-snapshot.mjs — 라우트 18개 × 뷰포트 2종 computed style diff)
 *
 * 프로젝트 규칙상 CSS 클래스를 쓰지 않으므로, CSS 파일이 아니라 인라인 스타일에
 * 그대로 꽂아 쓰는 평범한 TS 상수로 둔다.
 *
 * ── 골드 램프 ──────────────────────────────────────────────────────────────
 * 예전엔 두 갈래(#FFD700→#FFA500 / #c9a84c→#d4a012)와 3-stop 변형이 섞여 있었다.
 * gradient.goldBright 하나로 모았다. 사용처가 더 많았고, 결제·요금제처럼 돈이
 * 오가는 화면이 이미 이 갈래여서 바꿀 때 위험이 가장 작았다.
 * 골드 위 글자색도 4종(#000/#0a0a0f/#1a1a2e/#1a0a2e)에서 onGold.black 하나로 모았다.
 *
 * 남겨 둔 예외: ChatbotsPage 의 카테고리 액센트(gold/blue/green/purple/rose)는
 * 5색이 한 세트로 도는 색 코딩이라 CTA 골드와 역할이 다르다. 여기 골드만 밝게
 * 올리면 나머지 4색과 채도가 어긋나므로 그대로 둔다.
 */

/** 흰색 반투명 — 유리 표면·경계선에 쓰는 이 사이트의 주력 패턴. */
export const whiteA = (alpha: number) => `rgba(255, 255, 255, ${alpha})`;
/** 검정 반투명 — 그림자·오버레이. */
export const blackA = (alpha: number) => `rgba(0, 0, 0, ${alpha})`;
/** 브랜드 골드 반투명 — 골드 배지·경계선 (#c9a84c 기준, global.css --border-gold 와 동일). */
export const goldA = (alpha: number) => `rgba(201, 168, 76, ${alpha})`;
/** 민트 반투명 — 보조 액센트 배지·경계선 (#44d7b6 기준). */
export const mintA = (alpha: number) => `rgba(68, 215, 182, ${alpha})`;

export const color = {
    // ── 골드 (브랜드) ────────────────────────────────────────────────
    goldBright: '#FFD700',      // 주 브랜드 골드. CTA·제목 그라디언트의 시작점
    goldBrightEnd: '#FFA500',   // goldBright 그라디언트의 끝점
    goldBrass: '#c9a84c',       // global.css --gold-primary (.section-tag 배지가 사용)
    goldBrassEnd: '#d4a012',    // global.css --gold-light
    goldSoft: '#f4c95d',        // 30회. 보드·차트에서 쓰는 밝은 황동
    goldDeep: '#b8860b',        // global.css --gold-dark

    // ── 보조 액센트 ──────────────────────────────────────────────────
    mint: '#44d7b6',            // 34회. 성공·라이브 상태의 기본색
    sky: '#38bdf8',             // 4회
    purple: '#a78bfa',          // 8회. 내비 활성 상태
    purpleDeep: '#7c3aed',      // 5회
    rose: '#ff6b6b',            // 8회

    // ── 텍스트 ───────────────────────────────────────────────────────
    textPrimary: '#fff',        // 85회
    textMuted: '#a0a0b0',       // 14회. 푸터·보조 문구

    // ── 어두운 표면 ──────────────────────────────────────────────────
    // 근사 블랙이 22종 있다. 실제로 여러 곳에서 쓰이는 것만 이름을 준다.
    bgDark: '#0a0a0f',          // 9회. global.css --bg-dark. 페이지 바닥
    bgSection: '#0d0d14',       // global.css --bg-section
    bgCard: '#12121a',          // 카드 바닥
    bgSlate: '#0f172a',         // 9회. 슬레이트 계열 패널
    bgInk: '#071018',           // 8회. 잉크 계열 패널
} as const;

export const gradient = {
    /** 주 CTA·강조 제목의 골드. 사이트 전체가 이 하나를 쓴다. */
    goldBright: `linear-gradient(135deg, ${color.goldBright}, ${color.goldBrightEnd})`,
} as const;

/** 골드 배경 위 글자색. */
export const onGold = {
    black: '#000',
} as const;

/**
 * 모서리 반경. 현재 13종(6·8·9·10·12·14·16·18·20·22·24·28)이 쓰인다.
 * 자주 쓰이는 것만 계단으로 세우고, 나머지는 통일 단계에서 흡수한다.
 */
export const radius = {
    sm: 8,      // 62회 (인라인 35 + CSS 27). 최다
    md: 10,     // 38회. global.css --radius-sm
    lg: 12,     // 28회. global.css --radius-md
    xl: 14,     // 17회. 큰 CTA·패널
    xxl: 16,    // 10회. global.css --radius-lg
    /** 알약 모양. 지금 50/999/999px/100px/50px 다섯 방식이 섞여 있다. */
    pill: 999,
    /** 정원. */
    circle: '50%',
} as const;

export type Radius = typeof radius;
export type Color = typeof color;
