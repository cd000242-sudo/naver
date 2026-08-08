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
 * ── 알려진 분기 (의도적으로 아직 통일하지 않음) ────────────────────────────
 * 골드 그라디언트가 두 갈래로 갈려 있다. 통일은 화면이 바뀌는 결정이라
 * 별도 단계에서 사장님 확인을 받고 진행한다. 그때까지는 두 갈래를 각각
 * 이름으로 붙잡아 둬서, 최소한 "어디가 어느 갈래인지"는 추적 가능하게 한다.
 *   - goldBright: #FFD700 → #FFA500 (10곳: 결제·요금제·주문조회 등 돈 받는 화면)
 *   - goldBrass : #c9a84c → #d4a012 (5곳: 404·다운로드·뮤직플레이어 등)
 * global.css 의 --gold-primary/--gold-light 는 goldBrass 쪽이다.
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
    goldBright: '#FFD700',      // 52회. 최다 사용 골드
    goldBrightEnd: '#FFA500',   // 14회. goldBright 그라디언트의 끝점
    goldBrass: '#c9a84c',       // 13회. global.css --gold-primary
    goldBrassEnd: '#d4a012',    // 7회.  global.css --gold-light
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
    /** 결제·요금제 계열 주 CTA. #FFD700 → #FFA500 (10곳) */
    goldBright: `linear-gradient(135deg, ${color.goldBright}, ${color.goldBrightEnd})`,
    /** 404·다운로드 계열 CTA. #c9a84c → #d4a012 (5곳) */
    goldBrass: `linear-gradient(135deg, ${color.goldBrass}, ${color.goldBrassEnd})`,
} as const;

/**
 * 골드 배경 위 글자색. 지금 4종(#000 / #0a0a0f / #1a1a2e / #1a0a2e)이 섞여 있다.
 * 통일 대상이지만 화면이 바뀌므로 현 상태를 그대로 이름만 붙여 둔다.
 */
export const onGold = {
    black: '#000',      // 결제·요금제·주문조회
    ink: '#0a0a0f',     // 라이선스 복사 버튼
    navy: '#1a1a2e',    // 다운로드·404
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
