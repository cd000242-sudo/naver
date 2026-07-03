// SPEC-DEFAMATION-2026 P0 — 실존인물 미확인 단정 가드 (차단 기반). 적대적 검토(review-defamation-p0) 반영.
//
// 법률 리서치(.autopus/specs/SPEC-DEFAMATION-2026/legal-research.md) 결론:
//   "의혹/미확인 병기·'보도에 따르면' attribution"은 판례상 면책 효과가 없다.
//   → 완화(hedge)가 아니라 (1) 프롬프트로 생성 억제, (2) 생성물에서 위험 단정을 탐지해
//     legalRisk='danger'로 표면화한다(텍스트 변형 안 함 — 법적 무의미 + 오탐 위험).
//
// 검토 must-fix 반영:
//   M1 오탐필터 — 해명/무죄/공식확정(CLEARED_RE) + 정책/정보 주제어(POLICY_RE) + 위험명사 단어경계
//     (비위⊂비위생 제거, 사기는 詐欺 문맥일 때만).
//   M3 렉시콘 확장 — 전언/유죄확정 종결(전해졌다·구속·시인·인정 등) 대폭 추가.
//   M4 제목 스캔 + 인접문장(±1) 슬라이딩 윈도우(문장분할 회피 차단).
// 게이트: 프롬프트 억제는 celebrity 컨텍스트에서만(토큰 비용). 탐지(경고)는 컨텍스트 무관(M2 — 가십은
//   흔히 seo/일반 모드로 작성되므로). 기능플래그 CELEBRITY_FACT_GUARD_V1 (기본 ON, =false 롤백).
//
// §4.6 암시형 단정(누가 봐도·정황상·정설 등)은 SPEC이 "정규식 한계로 gap 명시"한 영역이다. 헤지 마커의
//   단순 co-occurrence AND는 헤지가 위험명사를 '확정 서술'하는지 못 가려 오탐이 일반 글까지 번진다
//   (리뷰 실증: "도박 논란은 누가 봐도 과장됐다"[부정], "음주운전 단속이 이 정도면 강력하다"[정책] → 오탐).
//   탐지가 컨텍스트 무관(M2)이라 blast radius가 크므로, 정밀도 실측 전까지 암시형은 미도입(명시 단정만).

import { inferHallucinationCategory } from './hallucinationCheck.js';

export function isCelebrityFactGuardEnabled(): boolean {
  const raw = process.env.CELEBRITY_FACT_GUARD_V1;
  if (raw == null) return true;
  const n = String(raw).trim().toLowerCase();
  return n !== 'false' && n !== '0' && n !== 'off';
}

export function isCelebrityContext(source: { contentMode?: string; toneStyle?: string; categoryHint?: string } | undefined): boolean {
  if (!source) return false;
  if ((source.contentMode || '').toLowerCase() === 'homefeed') return true;
  return inferHallucinationCategory({
    contentMode: source.contentMode,
    toneStyle: source.toneStyle,
    categoryHint: source.categoryHint,
  }) === 'celebrity';
}

// 사생활(공익성 방어막이 범죄의혹보다 더 약함 — legal-research Q3) + 범죄/비위(리스크 최대).
// '사기'는 士氣(morale)·沙器 폴리시미라 별도 FRAUD_RE로 처리. '비위'는 비위생 부분매칭이라 제외.
const PRIVATE_LIFE_NOUNS = ['열애', '열애설', '결별', '이혼', '재혼', '임신', '불륜', '파경', '스캔들', '동거', '외도'];
const CRIME_NOUNS = ['학폭', '마약', '탈세', '음주운전', '폭행', '도박', '성추문', '성접대', '성 접대', '성상납', '성 상납', '갑질', '횡령', '성범죄', '불법촬영', '성매매', '주가조작', '시세조작', '데이트폭력', '몰카'];
const RISK_NOUNS = [...PRIVATE_LIFE_NOUNS, ...CRIME_NOUNS];

// 詐欺 문맥일 때만 사기 인정(morale/pottery 오탐 방지).
const FRAUD_RE = /(?:보이스피싱|전세|투자|중고|취업|결혼|보험|코인|주가|다단계|부동산)\s*사기|사기(?:\s*(?:혐의|행각|사건|죄|피해|범|꾼)|를?\s*(?:저질|쳤|당))/;

// 미확인을 '사실'로 못박는 단정/전언/유죄확정 종결. legal-research §4.2 + 검토 M3.
const ASSERTION_RE = /(?:드러났다|드러난|밝혀졌다|밝혀진|밝혀져|확정됐다|확정된|사실로\s*확인|확인됐다|확인된|들통|판명(?:됐다|난|되)|저질렀|전해졌다|전해진|알려졌다|알려진|포착(?:됐다|된)|인정(?:했다|됐다|된)|시인|자백|실토|적발|입건|구속|기소|발각|폭로(?:됐다|된)|한\s*것으로\s*(?:확인|드러|나타|밝혀|전해|알려))/;

// 해명/무죄/공식확정/판결 — 명예 보호 or 확정사실이라 danger 제외(M1).
const CLEARED_RE = /사실무근|오해였|근거\s*없|사실이\s*아닌|무죄|무혐의|부인(?:했|한|하)|해명|정정|거짓으로\s*(?:드러|밝혀|판명|확인)|공식\s*(?:발표|입장|인정|확인)|소속사(?:가|는|\s|.{0,10}(?:발표|인정|밝혔|전했))|판결(?:문|이|을|에서)?|벌금형|징계/;

// 정책/정보/예방 맥락 — 위험명사가 '고발 주어'가 아니라 '주제어'(M1).
const POLICY_RE = /예방|방지|특별법|법안|처벌\s*기준|의무화|제도|근절|주의보|캠페인|법\s*개정|가이드|매뉴얼|대책|예방법/;

// 극중/픽션 — 위험명사가 픽션 구에 인접했을 때만 면제(과잉면제 방지). legal-research §3.4.
const FICTION_RE = /드라마|영화|예능|극중|배역|배우로|역할|연기(?:를|한|하며|했|하는)|작품|캐릭터|출연작|시트콤|뮤직비디오|웹툰|소설|주인공/;

function splitSentences(text: string): string[] {
  return String(text || '')
    .split(/[.!?。？！\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function hasRiskNoun(sentence: string): boolean {
  if (FRAUD_RE.test(sentence)) return true;
  return RISK_NOUNS.some((n) => new RegExp(`${n}(?:[을를이가은는에의로도와과,. ]|혐의|행각|사건|의혹|설|죄|가해|피해|$)`).test(sentence));
}

/** 한 문장에 위험명사 AND 단정어미가 동시 출현하고, 극중·해명·정책 문맥이 아니면 위험. */
export function isRiskyAssertionSentence(sentence: string): boolean {
  if (!sentence) return false;
  if (FICTION_RE.test(sentence)) return false; // 극중/작품
  if (CLEARED_RE.test(sentence)) return false; // 해명/무죄/공식확정/판결
  if (POLICY_RE.test(sentence)) return false; // 정책·정보 주제어
  if (!hasRiskNoun(sentence)) return false;
  return ASSERTION_RE.test(sentence);
}

export interface CelebrityRiskResult {
  risky: boolean;
  samples: string[];
}

/**
 * structuredContent 텍스트 필드를 스캔해 위험 단정을 탐지한다.
 * - 제목(selectedTitle/titleAlternatives/viralHooks)까지 포함(홈판 최대노출 위치 — 검토 M4).
 * - bodyHtml은 제외(HTML 태그/URL 파괴 방지 — SPEC §3-B-3).
 * - 인접 문장(±1) 슬라이딩 윈도우로 문장분할 회피 차단(검토 M4).
 */
export function detectCelebrityAssertionRisk(content: any): CelebrityRiskResult {
  const samples: string[] = [];
  const fields: string[] = [];
  const push = (v: any): void => {
    if (typeof v === 'string' && v.trim()) fields.push(v);
  };
  push(content?.selectedTitle);
  push(content?.title);
  if (Array.isArray(content?.titleAlternatives)) for (const t of content.titleAlternatives) push(t);
  if (Array.isArray(content?.viralHooks)) for (const h of content.viralHooks) push(typeof h === 'string' ? h : h?.text);
  push(content?.bodyPlain);
  push(content?.content);
  push(content?.introduction);
  push(content?.conclusion);
  if (Array.isArray(content?.headings)) {
    for (const h of content.headings) {
      push(h?.title);
      push(h?.content);
    }
  }

  for (const field of fields) {
    const sentences = splitSentences(field);
    let hit = false;
    for (let i = 0; i < sentences.length && !hit; i += 1) {
      const single = sentences[i];
      const pair = i > 0 ? `${sentences[i - 1]} ${single}` : single;
      if (isRiskyAssertionSentence(single) || (i > 0 && isRiskyAssertionSentence(pair))) {
        samples.push(single.slice(0, 60));
        hit = true;
      }
    }
    if (samples.length >= 5) return { risky: true, samples };
  }
  return { risky: samples.length > 0, samples };
}

// ─────────────────────────────────────────────────────────────────────────
// [P1 §3-C] 발행 경계 위험 게이트
//   finalize(생성)를 거치지 않는 저장본 재발행·반자동 붙여넣기·수동입력 발행은
//   legalRisk가 세팅되지 않아 P0 탐지의 사각지대다. 발행 개시 시점에 payload를 스캔해
//   위험이면 사용자에게 1회 확인을 받는다(하드차단 아님 — 라이브 발행 신뢰).
//   탐지는 main 프로세스(모듈 위치), 확인 모달은 renderer(사용자 대면)에서 — IPC로 분리.
export interface PublishRiskResult {
  risky: boolean;
  samples: string[];
  /** legalRisk: finalize가 이미 danger 표기 / scan: 신선 스캔 적발 / none: 위험 없음. */
  source: 'legalRisk' | 'scan' | 'none';
}

/**
 * 발행 payload에서 실존인물 미확인 단정 위험을 판정한다.
 * 1) structuredContent.quality.legalRisk === 'danger'  → AI 생성 경로(finalize가 표기).
 * 2) 신선 스캔(structuredContent 필드 또는 title/content 원문) → 붙여넣기/저장본 사각지대.
 * 기능플래그 OFF면 항상 not-risky(롤백 안전).
 */
export function evaluateCelebrityPublishRisk(payload: any): PublishRiskResult {
  if (!isCelebrityFactGuardEnabled()) return { risky: false, samples: [], source: 'none' };
  const structured = payload?.structuredContent;
  if (structured?.quality?.legalRisk === 'danger') {
    const scan = detectCelebrityAssertionRisk(structured);
    return { risky: true, samples: scan.samples, source: 'legalRisk' };
  }
  // structuredContent가 없으면(순수 붙여넣기/수동입력) title/content 원문을 스캔한다.
  const target = structured || { title: payload?.title, content: payload?.content };
  const scan = detectCelebrityAssertionRisk(target);
  return { risky: scan.risky, samples: scan.samples, source: scan.risky ? 'scan' : 'none' };
}

/** 프롬프트 억제 블록 — base 프롬프트 뒤에 붙여 recency로 최우선 적용. */
export function buildCelebrityFactGuardBlock(): string {
  return `
═══════════════════════════════════════════════════════════
⚖️ [실존인물 안전 가드 — 허위조작정보법(2026-07-07 시행) 대응, 최우선]
═══════════════════════════════════════════════════════════
이 글은 실존 인물(연예인/스포츠인/공인)을 다룹니다. 아래는 앞선 모든 지시보다 우선입니다.

[절대 금지 — 미확인 단정]
실존 인물의 (1) 범죄·비위(학폭·마약·탈세·음주운전·사기·폭행·성범죄 등) (2) 사생활(열애·결별·이혼·임신·불륜 등)
의혹을 "사실"로 단정하지 마세요. "드러났다/밝혀졌다/전해졌다/구속됐다/시인했다" 같은 단정·전언 종결 금지.

[완화도 답이 아님 — 아예 빼세요]
"의혹이 있으나 확인되지 않았다", "~라고 한다", "보도에 따르면"으로 흐리는 것도 안전하지 않습니다(판례상 면책 효과 없음).
확인되지 않은 부정·사생활·범죄 사안은 **완화하지 말고 문장에서 아예 빼세요.**

[써도 되는 것]
  ✓ 공식 발표·판결 등 **확정된 사실**만 (그 경우에도 출처 명시)
  ✓ 공적 인물의 공적 활동(작품·공연·수상 등)에 대한 정보
  ✓ "온라인에서 화제가 되고 있다" 같은 관찰 (특정인의 부정 사실을 전제하지 않는 선에서)

[극중/작품은 예외]
드라마·영화·예능의 배역/연기 서술은 위 금지에 해당하지 않습니다(예: "극중 살인마를 연기").
═══════════════════════════════════════════════════════════
`.trim();
}
