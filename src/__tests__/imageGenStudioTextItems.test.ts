import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { buildStudioItems, studioItemHeading } from '../renderer/modules/imageGenStudioCore';
import { buildContextualImagePrompt } from '../image/contextualImagePrompt';
import { resolveThumbnailOverlayText } from '../image/director/thumbnailText';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-09-30 사장님] "이미지생성기에서 텍스트포함으로하면 텍스트가 이미지생성이라는텍스트만 적용되"
 *
 * The studio sent every item with the fixed label `heading: '이미지 생성 스튜디오'` and nothing else
 * about the prompt. The contextual brief (imageGenerator → contextualImagePrompt) then read
 * ARTICLE TITLE "Untitled article" / SECTION HEADING "이미지 생성 스튜디오", demoted the user's prompt to
 * a secondary hint, and the text policy ("render only the requested title text") left that label as
 * the only title-like Korean text — so the engine drew "이미지 생성 스튜디오".
 *
 * Fix: the item must describe the user's prompt (heading / articleTitle / globalSubject / sectionContent),
 * and when text is requested the item is a text-bearing cover so the brief names an exact phrase taken
 * from the prompt (main derives it with resolveThumbnailOverlayText(articleTitle)).
 */
describe('이미지 생성 스튜디오 — 텍스트 포함 시 프롬프트의 문구를 그린다', () => {
  const prompt = '따뜻한 조명의 아늑한 카페 내부, 나무 테이블과 라떼 한 잔';

  it('아이템이 고정 라벨이 아니라 사용자 프롬프트를 설명한다', () => {
    const [item] = buildStudioItems([prompt], 1, false);
    expect(item.heading).not.toBe('이미지 생성 스튜디오');
    expect(item.heading).toBe(studioItemHeading(prompt));
    expect(item.articleTitle).toBe(prompt);
    expect(item.globalSubject).toBe(prompt);
    expect(item.sectionContent).toBe(prompt);
    expect(item.prompt.startsWith(prompt)).toBe(true);
    expect(item.allowText).toBe(false);
    expect(item.isThumbnail).toBe(false);
  });

  it('텍스트 포함이면 문구를 그리는 커버 아이템이 된다 (엔진이 정확한 문구를 받도록)', () => {
    const items = buildStudioItems([prompt, '눈 내리는 밤의 서울 골목'], 2, true);
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item.allowText).toBe(true);
      expect(item.isThumbnail).toBe(true);
    }
    expect(items[2].articleTitle).toBe('눈 내리는 밤의 서울 골목');
  });

  it('소제목 라벨은 프롬프트의 첫 절을 짧게 자른 것이다', () => {
    expect(studioItemHeading(prompt)).toBe('따뜻한 조명의 아늑한 카페 내부');
    expect(studioItemHeading('  a  lonely lighthouse at dawn  ')).toBe('a lonely lighthouse at dawn');
    expect(studioItemHeading('x'.repeat(80)).length).toBeLessThanOrEqual(40);
    expect(studioItemHeading('')).toBe('이미지 생성 스튜디오');
  });

  it('브리프에는 고정 라벨이 아니라 프롬프트에서 뽑은 문구가 TEXT POLICY 에 들어간다', () => {
    const [item] = buildStudioItems([prompt], 1, true);
    // Same derivation imageGenerator applies to a text-bearing cover (options.postTitle is absent in the studio).
    const thumbnailText = resolveThumbnailOverlayText(item.articleTitle);
    const brief = buildContextualImagePrompt({
      articleTitle: item.articleTitle,
      globalSubject: item.globalSubject,
      sectionHeading: item.heading,
      sectionContent: item.sectionContent,
      existingPrompt: item.prompt,
      allowText: item.allowText,
      isThumbnail: item.isThumbnail,
      thumbnailText,
    });
    expect(brief).not.toContain('이미지 생성 스튜디오');
    expect(brief).not.toContain('Untitled article');
    expect(brief).toContain(`Render exactly this Korean text once, at most 2 lines, large and legible: "${thumbnailText}"`);
    expect(prompt.includes(thumbnailText)).toBe(true);
  });

  it('스튜디오 실행 경로가 헬퍼를 쓰고 고정 라벨을 더는 보내지 않는다', () => {
    const studio = read('renderer/modules/imageGenStudio.ts');
    expect(studio).toContain('buildStudioItems(prompts, count, includeText)');
    expect(studio).not.toMatch(/heading:\s*'이미지 생성 스튜디오'/);
  });
});
