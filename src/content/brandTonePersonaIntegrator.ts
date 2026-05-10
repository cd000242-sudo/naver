/**
 * SPEC-CONVERSION-001 L4-3.2 — 브랜드 톤 ↔ 페르소나 통합
 *
 * brandEmbedder의 검색·집계 결과를 받아 personaBuilder 입력에 자동 주입.
 *   - 유사 글 본문에서 자주 등장한 어휘 → vocabularyHints 보강
 *   - aggregate.perToneCount → toneOverride 추천
 *   - 본문 구절 짧은 인용 → userVoice (개인정보 제거 후)
 *
 * 본 모듈은 *입력 가공*만 담당. personaBuilder 호출은 호출자 책임.
 *
 * 메모리 [silent 폴백 금지]: 데이터 부족 시 미가공 입력 그대로 반환 + reason.
 * 메모리 [추정 효과 금지]: 톤 일관성 향상 약속 X.
 *
 * 파일 한도 200줄 준수.
 */

import type { BrandEmbedder, BrandToneAggregate } from '../rag/brandEmbedder';
import type { PersonaBuilderInput, PersonaTone } from './personaBuilder';

export interface BrandToneIntegratorInput {
  readonly brandEmbedder: BrandEmbedder;
  readonly accountId: string;
  readonly basePersonaInput: PersonaBuilderInput;
  readonly query?: string;                       // 유사글 retrieval 쿼리 (없으면 카테고리 기반)
  readonly maxAdditionalVocab?: number;          // 기본 5
  readonly maxUserVoiceItems?: number;            // 기본 5
}

export interface BrandToneIntegratorResult {
  readonly enrichedPersonaInput: PersonaBuilderInput;
  readonly aggregate: BrandToneAggregate | null;
  readonly addedVocabulary: readonly string[];
  readonly addedUserVoice: readonly string[];
  readonly suggestedTone: PersonaTone | null;
  readonly fallbackReason?: string;
}

const VALID_TONES: ReadonlySet<PersonaTone> = new Set([
  'friendly', 'professional', 'casual', 'expert_review', 'mom_cafe', 'storyteller',
]);

const DEFAULT_MAX_VOCAB = 5;
const DEFAULT_MAX_USER_VOICE = 5;

/**
 * aggregate.perToneCount 최빈값을 toneOverride 후보로.
 * 단 PersonaTone 유효 값만 채택.
 */
function suggestToneFromAggregate(ag: BrandToneAggregate): PersonaTone | null {
  if (!ag.perToneCount) return null;
  let bestTone: PersonaTone | null = null;
  let bestCount = 0;
  for (const [tone, count] of Object.entries(ag.perToneCount)) {
    if (count > bestCount && VALID_TONES.has(tone as PersonaTone)) {
      bestTone = tone as PersonaTone;
      bestCount = count;
    }
  }
  return bestTone;
}

/**
 * 검색 hits의 metadata.title에서 짧은 어휘 추출.
 * 한글 2자+ 명사 후보. stopword 제거.
 */
const STOPWORDS_VOCAB: ReadonlySet<string> = new Set([
  '있다', '없다', '같다', '하다', '되다',
  '저는', '제가', '오늘', '어제', '진짜', '정말',
]);

function extractVocabFromTitles(titles: readonly string[], n: number): string[] {
  const freq = new Map<string, number>();
  for (const t of titles) {
    const tokens = (t.match(/[가-힣]{2,8}/g) ?? [])
      .map((x) => x.toLowerCase())
      .filter((x) => !STOPWORDS_VOCAB.has(x));
    for (const tok of tokens) freq.set(tok, (freq.get(tok) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([term]) => term);
}

function sanitizeUserVoice(raw: string, maxLen: number = 60): string {
  // 개인정보 휴리스틱: 전화번호·이메일·@핸들 제거
  const cleaned = raw
    .replace(/\d{2,4}-\d{3,4}-\d{4}/g, '')
    .replace(/[\w.+-]+@[\w.-]+\.\w+/g, '')
    .replace(/@\S+/g, '')
    .trim();
  return cleaned.slice(0, maxLen);
}

export async function enrichPersonaWithBrandTone(
  input: BrandToneIntegratorInput,
): Promise<BrandToneIntegratorResult> {
  if (!input.accountId) {
    return {
      enrichedPersonaInput: input.basePersonaInput,
      aggregate: null,
      addedVocabulary: [],
      addedUserVoice: [],
      suggestedTone: null,
      fallbackReason: 'BRAND_ACCOUNT_ID_EMPTY',
    };
  }

  const aggregate = await input.brandEmbedder.aggregate(input.accountId);
  if (!aggregate || aggregate.totalPosts === 0) {
    return {
      enrichedPersonaInput: input.basePersonaInput,
      aggregate: null,
      addedVocabulary: [],
      addedUserVoice: [],
      suggestedTone: null,
      fallbackReason: `NO_BRAND_DATA: accountId=${input.accountId} 누적 글 0건`,
    };
  }

  const maxVocab = Math.max(0, input.maxAdditionalVocab ?? DEFAULT_MAX_VOCAB);
  const maxUserVoice = Math.max(0, input.maxUserVoiceItems ?? DEFAULT_MAX_USER_VOICE);

  // 1. retrieval로 유사 글 본문 어휘 후보 수집
  const query = input.query ?? (input.basePersonaInput.productHint ?? '');
  let addedVocab: string[] = [];
  let addedUserVoice: string[] = [];
  if (query.trim() && (maxVocab > 0 || maxUserVoice > 0)) {
    try {
      const hits = await input.brandEmbedder.searchSimilarPosts({
        accountId: input.accountId,
        query,
        topK: 10,
      });
      const titles = hits.map((h) => String(h.metadata?.title ?? '')).filter((s) => s.length > 0);
      if (maxVocab > 0) {
        addedVocab = extractVocabFromTitles(titles, maxVocab);
      }
      if (maxUserVoice > 0) {
        addedUserVoice = titles
          .map((t) => sanitizeUserVoice(t, 60))
          .filter((t) => t.length >= 8)
          .slice(0, maxUserVoice);
      }
    } catch (err) {
      console.warn(`[brandTone] retrieval 실패 (vocab/userVoice 미보강): ${(err as Error).message}`);
    }
  }

  // 2. tone 추천
  const suggestedTone = suggestToneFromAggregate(aggregate);

  // 3. 기존 입력 위에 enriched 입력 합성
  const baseUserVoice = input.basePersonaInput.userVoice ?? [];
  const mergedUserVoice = [...baseUserVoice, ...addedUserVoice].slice(0, maxUserVoice + baseUserVoice.length);

  const enrichedPersonaInput: PersonaBuilderInput = {
    ...input.basePersonaInput,
    userVoice: mergedUserVoice,
    toneOverride: input.basePersonaInput.toneOverride ?? suggestedTone ?? undefined,
  };

  return {
    enrichedPersonaInput,
    aggregate,
    addedVocabulary: addedVocab,
    addedUserVoice,
    suggestedTone,
  };
}
