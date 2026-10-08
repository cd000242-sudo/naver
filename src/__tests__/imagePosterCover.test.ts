/**
 * [2026-10-08 사장님] "썸네일은 후킹문구만 짤려서 나오는 구조에요 ai티도 많이 나구요" + leadernam youth-housing covers.
 *
 * An engine that draws Korean itself now gets the WHOLE title as a poster (keyword label + headline, numbers
 * highlighted, a believable person with topic props), the section image can carry its heading verbatim, and
 * only photos the user put in outrank the AI poster. The image studio and app-made cards keep the short phrase.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  buildContextualImagePrompt,
  buildPosterTitleTypography,
  posterEmphasisTokens,
  splitPosterTitle,
} from '../image/contextualImagePrompt';
import { decidePosterTitleText } from '../image/director/thumbnailText';
import { runThumbnailDirector, type ThumbnailDirectorDeps, type ThumbnailDirectorInput } from '../image/director/thumbnailDirector';
import { resolveRealAssets, userPlacedComposable } from '../image/director/realAssetResolver';
import { resolveHeadingImageText } from '../image/director/koreanTextEngines';
import { checkThumbnailPlan } from '../image/director/imageQualityCheck';

const TITLE = '청년미래적금 2차, 2,255만원 받는 3조건 총정리';

describe('poster copy is the whole title, split only into label + headline', () => {
  it('a leading keyword before a separator becomes the label line', () => {
    expect(splitPosterTitle(TITLE)).toEqual({ kicker: '청년미래적금 2차', headline: '2,255만원 받는 3조건 총정리' });
  });

  it('a comma inside a number, a clock time, or a "·" pair never splits the title', () => {
    expect(splitPosterTitle('12,000원 할인 받는 법')).toEqual({ kicker: null, headline: '12,000원 할인 받는 법' });
    expect(splitPosterTitle('오후 10:30 신청 마감 안내')).toEqual({ kicker: null, headline: '오후 10:30 신청 마감 안내' });
    expect(splitPosterTitle('청년·신혼 대출 총정리')).toEqual({ kicker: null, headline: '청년·신혼 대출 총정리' });
    expect(splitPosterTitle('청년도약계좌 | 2026 총정리')).toEqual({ kicker: '청년도약계좌', headline: '2026 총정리' });
    expect(splitPosterTitle('청년 월세: 신청 방법')).toEqual({ kicker: '청년 월세', headline: '신청 방법' });
  });

  it('numbers keep their units for the accent colour, at most three', () => {
    expect(posterEmphasisTokens(TITLE)).toEqual(['2차', '2,255만원', '3조건']);
    expect(posterEmphasisTokens('1만원 2만원 3만원 4만원')).toHaveLength(3);
    expect(posterEmphasisTokens('2024, 2025 비교와 3월 일정')).toEqual(['2024', '2025', '3월']);
  });

  it('the typography states the title once (label + headline) and forbids shortening or extra text', () => {
    const line = buildPosterTitleTypography(TITLE);
    expect(line).toContain('a small label line "청년미래적금 2차" above the headline "2,255만원 받는 3조건 총정리" (2 to 4 lines)');
    expect(line).not.toContain(`"${TITLE}"`);
    expect(line.split('2,255만원 받는 3조건 총정리').length - 1).toBe(1);
    expect(line).toContain('never shorten, paraphrase');
    expect(line).toContain('"2,255만원"');
    expect(line).not.toContain('short hook');
  });
});

describe('brief: only the director poster cover becomes a poster', () => {
  const base = { articleTitle: TITLE, sectionHeading: TITLE, sectionContent: TITLE, isThumbnail: true, allowText: true, thumbnailText: TITLE };

  it('poster cover: poster text policy, poster mode, and a person with props is allowed', () => {
    const brief = buildContextualImagePrompt({ ...base, coverStyle: 'poster' });
    expect(brief).toContain('TEXT POLICY: Cover text, drawn once and nothing else');
    expect(brief).toContain('COVER POSTER MODE');
    expect(brief).not.toContain('No posed person');
  });

  it('without the mark (image studio, legacy callers) the short-phrase wording and the no-pose rule stay', () => {
    const brief = buildContextualImagePrompt({ ...base, thumbnailText: '334만원 차이' });
    expect(brief).toContain('Render exactly this Korean text once, at most 2 lines');
    expect(brief).toContain('EDITORIAL MODE');
    expect(brief).toContain('No posed person');
  });
});

describe('decidePosterTitleText', () => {
  it('AUTO info post → the whole title; exclude → nothing', () => {
    expect(decidePosterTitleText({ mode: 'auto', title: `  ${TITLE} `, kind: 'info' })).toMatchObject({ include: true, text: TITLE });
    expect(decidePosterTitleText({ mode: 'exclude', title: TITLE, kind: 'info' }).include).toBe(false);
  });

  it('AUTO product/place without a number keeps the picture clean, as before', () => {
    expect(decidePosterTitleText({ mode: 'auto', title: '제주 협재 해변 산책 코스', kind: 'travel' }).include).toBe(false);
    expect(decidePosterTitleText({ mode: 'include', title: '제주 협재 해변 산책 코스', kind: 'travel' }).include).toBe(true);
  });
});

function directorInput(over: Partial<ThumbnailDirectorInput> = {}): ThumbnailDirectorInput {
  return {
    title: TITLE, cardPromise: '', item: { heading: '🖼️ 썸네일', prompt: 'x', isThumbnail: true } as any,
    textMode: 'auto', qualityMode: 'standard', kind: 'info', allowBakedText: false,
    engineDrawsText: true, realImages: [], realWorkDir: 'C:/none', ...over,
  };
}

function directorDeps(generateBase: ThumbnailDirectorDeps['generateBase']): ThumbnailDirectorDeps {
  const fail = async () => { throw new Error('not used'); };
  return {
    generateBase, composeSquare: fail, composeTight: fail, composeHook: fail, composePair: fail,
    toJudgeImage: fail, judge: fail, isLocalFile: () => true, log: () => undefined,
  } as unknown as ThumbnailDirectorDeps;
}

describe('runThumbnailDirector with a text-drawing engine', () => {
  it('sends the whole title as a poster with poster cover lines (digits allowed)', async () => {
    const generateBase = vi.fn(async () => ({ heading: 'x', filePath: 'C:/none/cover.png' } as any));
    const result = await runThumbnailDirector(directorInput(), directorDeps(generateBase));
    const cover = (generateBase.mock.calls[0] as any[])[0];
    expect(cover).toMatchObject({ allowText: true, thumbnailText: TITLE, coverStyle: 'poster' });
    expect(cover.coverDirection.join(' ')).toContain('Square Korean blog cover poster');
    expect(cover.coverDirection.join(' ')).not.toContain('do not draw digits');
    expect(result?.engineDrewText).toBe(true);
    expect(result?.text.text).toBe(TITLE);
  });

  it('an engine that cannot draw Korean keeps the old cover (photo look mark only)', async () => {
    const generateBase = vi.fn(async () => ({ heading: 'x', filePath: 'C:/none/cover.png' } as any));
    await runThumbnailDirector(directorInput({ engineDrawsText: false }), directorDeps(generateBase));
    const cover = (generateBase.mock.calls[0] as any[])[0];
    expect(cover.coverStyle).toBe('photo');
    expect(cover.thumbnailText).toBeUndefined();
    expect(cover.coverDirection.join(' ')).not.toContain('cover poster');
  });
});

describe('real photos: only the user\'s own outrank the AI poster', () => {
  it('collected (SOURCE_ASSET) photos are dropped, user photos are kept', () => {
    const inventory = resolveRealAssets({
      placed: [
        { filePath: 'C:/p/collected.jpg', source: 'issue-endgame' },
        { filePath: 'C:/p/mine.jpg', provider: 'local' },
      ],
    }, () => true);
    expect(inventory.composable).toEqual(['C:/p/collected.jpg', 'C:/p/mine.jpg']);
    expect(userPlacedComposable(inventory)).toEqual(['C:/p/mine.jpg']);
  });
});

describe('heading text on section images (opt-in)', () => {
  const item = { heading: '신청 자격 3가지 "꼭" 확인', isThumbnail: false };

  it('draws the heading verbatim only when on, on a Korean-drawing engine, and not for the cover', () => {
    expect(resolveHeadingImageText(item, 'openai-image', true)).toBe('신청 자격 3가지 꼭 확인');
    expect(resolveHeadingImageText(item, 'openai-image', false)).toBeNull();
    expect(resolveHeadingImageText(item, 'nano-banana', true)).toBeNull();
    expect(resolveHeadingImageText({ ...item, isThumbnail: true }, 'openai-image', true)).toBeNull();
  });

  it('slot names and placeholders are never drawn', () => {
    for (const heading of ['🖼️ 썸네일', '썸네일', '이미지 3', '']) {
      expect(resolveHeadingImageText({ heading, isThumbnail: false }, 'flow', true)).toBeNull();
    }
  });
});

describe('thumbnail plan check', () => {
  const facts = { title: TITLE, text: TITLE, width: 800, height: 800, realAssetPriority: false, realAssetAvailable: false, usedRealAsset: false, aiDepictsRealPerson: false };

  it('a poster title is the intended text, not a "full title copy" failure', () => {
    expect(checkThumbnailPlan({ ...facts, posterTitle: true }).verdict).toBe('GOOD');
    expect(checkThumbnailPlan(facts).reasons).toContain('제목 전체를 썸네일에 복사');
  });
});
