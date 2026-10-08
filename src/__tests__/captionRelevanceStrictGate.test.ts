/**
 * Strict free relevance gate (2026-10-08): subject evidence alone no longer passes.
 * A candidate must also show heading/scene evidence — one non-generic heading token
 * (or event/fandom query token) in its caption fields. Generic words and number+unit
 * tokens never count. A heading with no usable token falls back to subject-only.
 */
import { describe, expect, it } from 'vitest';
import {
  judgeCaptionRelevance,
  type CaptionRelevanceContext,
} from '../crawler/issueHarness/captionRelevanceGate';
import {
  isGenericSceneToken,
  sceneEvidenceTokens,
} from '../crawler/issueHarness/relevanceVocabulary';

const YUNA = '김연아';
const ctx = (heading: string, extra: Partial<CaptionRelevanceContext> = {}): CaptionRelevanceContext => ({
  subject: YUNA,
  heading,
  mainKeyword: YUNA,
  ...extra,
});
const img = 'https://img.example.com/a.jpg';

describe('generic tokens never count as scene evidence', () => {
  const generic = [
    '배우', '가수', '근황', '사진', '모습', '공개', '화제', '최근', '영상', '이슈', '뉴스', '기사',
    '오늘', '어제', '이번', '공식', '인스타그램', '인스타', 'SNS', '셀럽', '스타', '관련', '이유', '정리',
    '논란', '직찍', '썸네일', '마무리',
  ];
  it.each(generic)('"%s" is generic', (token) => {
    expect(isGenericSceneToken(token)).toBe(true);
  });

  const numberUnits = ['2026년', '36세', '20년', '9월', '3일', '100만', '16살', '5명', '3개', '2억', '10%', '30대', '36세의'];
  it.each(numberUnits)('number+unit "%s" is generic', (token) => {
    expect(isGenericSceneToken(token)).toBe(true);
  });

  it.each(['흘렀다', '향했습니다', '달라졌어요'])('sentence-ending form "%s" is generic', (token) => {
    expect(isGenericSceneToken(token)).toBe(true);
  });

  it('content words are not generic', () => {
    for (const token of ['피겨', '은퇴', '올림픽', '무대', '눈물', '미운']) {
      expect(isGenericSceneToken(token)).toBe(false);
    }
  });
});

describe('sceneEvidenceTokens', () => {
  it('keeps 2-char Korean heading words, drops generic/number/subject tokens', () => {
    const tokens = sceneEvidenceTokens(ctx('36세 김연아의 은퇴 근황 공개'));
    expect(tokens).toContain('은퇴');
    expect(tokens).not.toContain('36세');
    expect(tokens).not.toContain('근황');
    expect(tokens.some((t) => t.includes(YUNA))).toBe(false);
  });

  it('adds event/fandom query tokens but never the subject itself', () => {
    const tokens = sceneEvidenceTokens(ctx('근황 공개', { sceneTerms: ['김연아 올림픽 은메달', '김연아 직찍'] }));
    expect(tokens).toEqual(expect.arrayContaining(['올림픽', '은메달']));
    expect(tokens).not.toContain('직찍');
    expect(tokens.some((t) => t.includes(YUNA))).toBe(false);
  });

  it('drops emoji-only tokens from decorated meta headings', () => {
    expect(sceneEvidenceTokens(ctx('🖼️ 썸네일'))).toEqual([]);
  });
});

describe('strict gate: subject AND scene evidence', () => {
  it('subject-only caption no longer passes when the heading has usable tokens', () => {
    const v = judgeCaptionRelevance({ caption: '김연아 근황 사진 공개', url: img }, ctx('피겨 소녀가 어느덧 20년이 흘렀다'));
    expect(v.relevant).toBe(false);
    expect(v.sceneRequired).toBe(true);
    expect(v.sceneMatched).toEqual([]);
  });

  it('subject + one heading token in the caption passes', () => {
    const v = judgeCaptionRelevance({ caption: '김연아 피겨 시절 사진', url: img }, ctx('피겨 소녀가 어느덧 20년이 흘렀다'));
    expect(v.relevant).toBe(true);
    expect(v.sceneMatched).toContain('피겨');
  });

  it('overlap on generic words only (근황) does not count as evidence', () => {
    const v = judgeCaptionRelevance({ caption: '김연아 근황 사진', url: img }, ctx('피겨 근황'));
    expect(v.relevant).toBe(false);
  });

  it('overlap on number+unit only (36세) does not count as evidence', () => {
    const v = judgeCaptionRelevance({ caption: '김연아 36세 20년', url: img }, ctx('36세 피겨 20년'));
    expect(v.relevant).toBe(false);
  });

  it('a 2-char Korean heading word is enough evidence', () => {
    const v = judgeCaptionRelevance({ caption: '김연아 은퇴 기자회견', url: img }, ctx('은퇴'));
    expect(v.relevant).toBe(true);
  });

  it('Korean particles on the heading token do not hide the evidence (눈물을 → 눈물)', () => {
    const v = judgeCaptionRelevance({ caption: '김연아 눈물 소감', url: img }, ctx('눈물을 흘린 순간'));
    expect(v.relevant).toBe(true);
  });

  it('the subject in the heading is not scene evidence', () => {
    const v = judgeCaptionRelevance({ caption: '김연아 화보 촬영', url: img }, ctx('김연아의 은퇴'));
    expect(v.relevant).toBe(false);
  });

  it('scene evidence without the subject still fails', () => {
    const v = judgeCaptionRelevance({ caption: '피겨 은퇴 선수 근황', url: img }, ctx('피겨 은퇴'));
    expect(v.relevant).toBe(false);
  });

  it('scene token must sit inside a word, not straddle a word boundary', () => {
    const v = judgeCaptionRelevance({ caption: '김연아 사무 대회', url: img }, ctx('무대'));
    expect(v.relevant).toBe(false);
  });

  it('readable URL parts count as evidence', () => {
    const v = judgeCaptionRelevance(
      { url: 'https://cdn.news.com/2026/09/김연아-은퇴-기자회견.jpg' },
      ctx('은퇴 그 후'),
    );
    expect(v.relevant).toBe(true);
  });

  it('query-plan event terms supply evidence when the heading is all generic', () => {
    const base = { subject: '한다감', heading: '근황 공개', sceneTerms: ['미운 우리 새끼 한다감', '한다감 직찍'] };
    expect(judgeCaptionRelevance({ caption: '한다감 미운 우리 새끼 방송', url: img }, base).relevant).toBe(true);
    const miss = judgeCaptionRelevance({ caption: '한다감 화보 사진', url: img }, base);
    expect(miss.relevant).toBe(false);
    expect(miss.sceneRequired).toBe(true);
  });
});

describe('fallback: heading with no usable token uses the subject-only rule (explicit)', () => {
  it.each([
    ['all-generic heading', '근황 공개 사진'],
    ['meta heading with emoji', '🖼️ 썸네일'],
    ['numbers and units only', '36세 20년'],
    ['only verb endings and numbers', '20년이 흘렀다'],
    ['empty heading', ''],
  ])('%s → sceneRequired=false and subject alone passes', (_label, heading) => {
    const v = judgeCaptionRelevance({ caption: '김연아 셀카', url: img }, ctx(heading));
    expect(v.sceneRequired).toBe(false);
    expect(v.relevant).toBe(true);
  });

  it('the fallback still needs the subject', () => {
    const v = judgeCaptionRelevance({ caption: '길고양이 급식소', url: img }, ctx('근황 공개'));
    expect(v.sceneRequired).toBe(false);
    expect(v.relevant).toBe(false);
  });
});
