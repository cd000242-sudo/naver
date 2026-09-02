/**
 * URL 모드 핵심 검색 키워드 선정.
 *
 * [2026-08-23] 왜 필요한가: SEO 제목 강제 로직(배치강제·커버리지 게이트·제목 품질 게이트)이
 *   전부 `source.metadata.keywords[0]`에 매여 있다. 그런데 사용자가 URL만 넣으면 그 값이
 *   비어서 강제 로직이 통째로 스킵되고, 모델이 기사 제목을 그대로 흉내 낸 제목을 낸다.
 *   (실측: 특별재난지역 기사 URL → "거제 통영 특별재난지역, 통영은 왜 2곳만 먼저인가".
 *    정작 검색량이 붙은 말은 "재난지원금"이었다.)
 *
 * 설계: 결정 로직은 전부 순수 함수다. LLM 호출과 검색량 조회는 주입받는다.
 *   그래야 노드 환경 테스트로 규칙을 검증할 수 있고, 둘 중 하나가 죽어도
 *   생성이 멈추지 않고 "선정 없음"으로 조용히 물러난다(기존 동작 그대로).
 *
 * 메모리 [자동 폴백 금지]: 여기서 말하는 폴백은 *모델 교체*가 아니라 "키워드 미선정"이다.
 *   사용자가 고른 생성 모델을 바꾸지 않는다.
 */

export interface KeywordVolume {
  readonly keyword: string;
  /** 월간 검색수 합계(PC+모바일). 조회 실패 시 null. */
  readonly monthlySearches: number | null;
}

export type KeywordDecisionSource = 'search-volume' | 'llm-first' | 'none';

export interface UrlKeywordPick {
  /** 확정 키워드. 못 고르면 빈 문자열. */
  readonly keyword: string;
  readonly candidates: readonly string[];
  readonly monthlySearches: number | null;
  readonly decidedBy: KeywordDecisionSource;
  readonly reason: string;
}

const MIN_KEYWORD_CHARS = 2;
const MAX_KEYWORD_CHARS = 20;
const MAX_CANDIDATES = 5;

/** 제목/본문에서 키워드로 쓸 수 없는 잡토큰. */
const REJECT_PATTERNS: readonly RegExp[] = Object.freeze([
  /^\d+$/,                      // 숫자만
  /^[a-z]{1,2}$/i,              // 알파벳 한두 글자
  /^(기사|뉴스|사진|영상|제공|기자|무단|전재|배포|금지|연합뉴스|뉴시스)$/,
]);

function isUsableKeyword(term: string): boolean {
  const t = term.trim();
  if (t.length < MIN_KEYWORD_CHARS || t.length > MAX_KEYWORD_CHARS) return false;
  return !REJECT_PATTERNS.some((re) => re.test(t));
}

/**
 * 모델 응답에서 키워드 후보를 뽑는다.
 * JSON 배열, 줄바꿈 목록, 쉼표 목록, 앞머리 번호/불릿을 모두 받아낸다.
 */
export function parseKeywordCandidates(raw: unknown): string[] {
  const out: string[] = [];
  const push = (value: unknown): void => {
    if (typeof value !== 'string') return;
    const cleaned = value
      .replace(/^\s*[-*•]\s*/, '')
      .replace(/^\s*\d+[.)]\s*/, '')
      .replace(/^["'`\[]+|["'`\],]+$/g, '')
      .trim();
    if (isUsableKeyword(cleaned) && !out.includes(cleaned)) out.push(cleaned);
  };

  if (Array.isArray(raw)) {
    raw.forEach(push);
    return out.slice(0, MAX_CANDIDATES);
  }

  const text = String(raw ?? '').trim();
  if (!text) return [];

  // 코드펜스를 걷어낸 뒤 JSON 배열이면 그대로 읽는다.
  const unfenced = text.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
  const arrayAt = unfenced.indexOf('[');
  if (arrayAt >= 0) {
    try {
      const parsed = JSON.parse(unfenced.slice(arrayAt, unfenced.lastIndexOf(']') + 1));
      if (Array.isArray(parsed)) {
        parsed.forEach(push);
        if (out.length > 0) return out.slice(0, MAX_CANDIDATES);
      }
    } catch { /* 배열이 아니면 줄/쉼표 분해로 내려간다 */ }
  }

  unfenced.split(/[\r\n,]+/).forEach(push);
  return out.slice(0, MAX_CANDIDATES);
}

/**
 * 후보 + 검색량 → 확정 키워드.
 *
 * 검색량을 하나라도 확보하면 그중 최대치를 고른다. 전부 못 구했으면(광고 API 미설정 등)
 * 모델이 1순위로 준 후보를 쓴다 — 아무것도 안 고르는 것보다 낫고, 어느 쪽을 썼는지
 * decidedBy 로 남겨서 나중에 추적할 수 있게 한다.
 */
export function pickPrimaryKeyword(
  candidates: readonly string[],
  volumes: readonly KeywordVolume[] = [],
): UrlKeywordPick {
  const list = candidates.filter((c) => isUsableKeyword(String(c || '')));
  if (list.length === 0) {
    return { keyword: '', candidates: [], monthlySearches: null, decidedBy: 'none', reason: '후보 없음' };
  }

  const byKeyword = new Map<string, number>();
  for (const v of volumes) {
    const key = String(v?.keyword || '').trim();
    if (!key || typeof v?.monthlySearches !== 'number' || !Number.isFinite(v.monthlySearches)) continue;
    if (v.monthlySearches <= 0) continue;
    byKeyword.set(key, Math.max(byKeyword.get(key) ?? 0, v.monthlySearches));
  }

  let best = '';
  let bestVolume = -1;
  for (const candidate of list) {
    const volume = byKeyword.get(candidate);
    if (typeof volume === 'number' && volume > bestVolume) {
      best = candidate;
      bestVolume = volume;
    }
  }

  if (best) {
    return {
      keyword: best,
      candidates: list,
      monthlySearches: bestVolume,
      decidedBy: 'search-volume',
      reason: `검색량 ${bestVolume.toLocaleString()}회/월로 최다`,
    };
  }

  return {
    keyword: list[0],
    candidates: list,
    monthlySearches: null,
    decidedBy: 'llm-first',
    reason: '검색량 조회 불가 — 모델 1순위 사용',
  };
}

/** 원문에서 검색 키워드 후보를 뽑아달라고 시키는 프롬프트. */
export function buildKeywordInferencePrompt(rawText: string, sourceTitle?: string): string {
  const title = String(sourceTitle || '').trim();
  const body = String(rawText || '').slice(0, 4000);
  return [
    '아래 글을 읽고, 이 글을 찾으려는 한국 사람이 **네이버 검색창에 실제로 칠 말**을 골라라.',
    '',
    '규칙:',
    '- 기사 제목을 그대로 쓰지 마라. 제목은 검색어가 아니다.',
    '- 고유명사 나열 대신, 사람들이 궁금해서 검색하는 **주제어**를 골라라.',
    '- 2~20자. 조사·서술어를 붙이지 마라.',
    '- 검색량이 많을 것 같은 순서로 최대 5개.',
    '- JSON 배열만 출력하라. 설명 금지.',
    '',
    title ? `[원문 제목]\n${title}\n` : '',
    '[원문]',
    body,
  ].filter(Boolean).join('\n');
}

/**
 * [2026-09-02 사장님 승인 ②] 쇼핑 경로의 검색량 기반 키워드 선정.
 * 쇼핑 URL 흐름에서는 상위호환 1단 분석이 메인 키워드를 모델 판단으로만 정한다(닥터웰: "닥터웰 종아리 마사지기", 검색량 80).
 * 사람들이 실제로 치는 상품 검색어(품목형·브랜드+품목형)를 후보로 받아 검색량으로 고른다.
 */
export function buildShoppingKeywordInferencePrompt(rawText: string, productName: string, existingKeyword: string): string {
  const body = String(rawText || '').slice(0, 3000);
  return [
    '아래 상품 정보를 읽고, **이 상품을 사려는 한국 사람이 네이버 검색창에 실제로 칠 말**을 골라라.',
    '',
    '규칙:',
    '- 품목형(브랜드 없이: "종아리 마사지기 추천", "다리 공기압 마사지기")과 브랜드+품목형("닥터웰 종아리 마사지기")을 섞어라.',
    '- 옵션·색상·모델코드·스토어명·수식어는 넣지 마라. 사람들은 그런 말로 검색하지 않는다.',
    '- 검색량이 많을 것 같은 순서로 최대 5개. 한 줄에 하나.',
    '',
    `상품명: ${String(productName || '').trim()}`,
    `현재 키워드: ${String(existingKeyword || '').trim()}`,
    '',
    '상품 정보:',
    body,
  ].join('\n');
}

export interface ShoppingKeywordPick {
  readonly keyword: string;
  readonly replaced: boolean;
  readonly candidates: readonly string[];
  readonly reason: string;
}

/** 품목의 머리 명사 — 기존 키워드의 마지막 어절. 후보는 이것을 품어야 상품 검색어다("후기"·"소음" 같은 곁말 배제). */
export function shoppingHeadNoun(existingKeyword: string): string {
  const parts = String(existingKeyword || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

/**
 * 기존 키워드를 검색량이 확실히 더 큰 상품 검색어로만 바꾼다.
 *   · 검색량을 하나도 못 구했으면 바꾸지 않는다 — 모델 판단만으로 바꾸는 것은 자동 폴백과 같은 부류다.
 *   · 머리 명사를 품지 않는 후보는 버린다.
 *   · 기존보다 검색량이 큰 후보가 없으면 기존 유지.
 */
export function pickShoppingSearchKeyword(
  existingKeyword: string,
  candidates: readonly string[],
  volumes: readonly KeywordVolume[],
): ShoppingKeywordPick {
  const existing = String(existingKeyword || '').trim();
  const head = shoppingHeadNoun(existing);
  const usable = candidates
    .map((c) => String(c || '').trim())
    .filter((c) => c && isUsableKeyword(c) && c !== existing && (!head || c.includes(head)));
  const byKeyword = new Map<string, number>();
  for (const v of volumes) {
    const key = String(v?.keyword || '').trim();
    if (!key || typeof v?.monthlySearches !== 'number' || !Number.isFinite(v.monthlySearches) || v.monthlySearches <= 0) continue;
    byKeyword.set(key, Math.max(byKeyword.get(key) ?? 0, v.monthlySearches));
  }
  const existingVolume = byKeyword.get(existing) ?? null;
  let best = '';
  let bestVolume = -1;
  for (const c of usable) {
    const v = byKeyword.get(c);
    if (typeof v === 'number' && v > bestVolume) { best = c; bestVolume = v; }
  }
  if (!best || bestVolume <= 0) {
    return { keyword: existing, replaced: false, candidates: usable, reason: '검색량을 구한 후보 없음 — 기존 유지' };
  }
  if (existingVolume !== null && bestVolume <= existingVolume) {
    return { keyword: existing, replaced: false, candidates: usable, reason: `기존 키워드 검색량(${existingVolume.toLocaleString()})이 더 크거나 같음 — 유지` };
  }
  return {
    keyword: best,
    replaced: true,
    candidates: usable,
    reason: `검색량 ${bestVolume.toLocaleString()}회/월 (기존 ${existingVolume === null ? '미확인' : existingVolume.toLocaleString()}) — 교체`,
  };
}
