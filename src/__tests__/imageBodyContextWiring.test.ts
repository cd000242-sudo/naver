import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveSectionContentForImage } from '../image/contextualImagePrompt.js';

const multiAccountSource = readFileSync(
  new URL('../renderer/modules/multiAccountManager.ts', import.meta.url),
  'utf8',
);
const fullAutoFlowSource = readFileSync(
  new URL('../renderer/modules/fullAutoFlow.ts', import.meta.url),
  'utf8',
);

// [2026-09-06 R-A/B] The normal full-auto button path used to translate heading titles only,
// so the contextual brief's SECTION EVIDENCE fell back to the heading title. These locks keep
// the body text wired into both the translation call and the image item.
describe('이미지 본문 맥락 배선 — 정상 풀오토 경로', () => {
  const itemsPushBlock = multiAccountSource.match(
    /items\.push\(\{[\s\S]*?diversityIndex:\s*headingIdx,[\s\S]*?\}\);/u,
  )?.[0] ?? '';

  it('multiAccountManager가 resolveSectionContentForImage를 contextualImagePrompt에서 가져온다', () => {
    expect(multiAccountSource).toMatch(
      /import \{[^}]*resolveSectionContentForImage[^}]*\} from '\.\.\/\.\.\/image\/contextualImagePrompt\.js'/u,
    );
  });

  it('소제목 번역 호출이 제목 문자열이 아닌 heading 객체 + 섹션 본문을 넘긴다', () => {
    expect(multiAccountSource).not.toMatch(
      /generateEnglishPromptForHeading\(\s*title,\s*postTitle,\s*subheadingStyle\s*\)/u,
    );
    expect(multiAccountSource).toMatch(
      /const headingForPrompt = typeof h === 'string' \? \{ title \} : \{ \.\.\.h, title \};/u,
    );
    expect(multiAccountSource).toMatch(
      /generateEnglishPromptForHeading\(\s*headingForPrompt,\s*postTitle,\s*subheadingStyle,\s*sectionContent\s*\)/u,
    );
  });

  it('썸네일 번역 호출이 서론(intro)을 4번째 인자로 넘긴다', () => {
    expect(multiAccountSource).not.toMatch(
      /generateEnglishPromptForHeading\(\s*postTitle,\s*'',\s*thumbStyle\s*\)/u,
    );
    expect(multiAccountSource).toMatch(
      /generateEnglishPromptForHeading\(\s*postTitle,\s*'',\s*thumbStyle,\s*sectionContent\s*\)/u,
    );
  });

  it('이미지 아이템이 sectionContent와 articleContext를 함께 실어 보낸다', () => {
    expect(itemsPushBlock).not.toBe('');
    expect(itemsPushBlock).toMatch(/\bsectionContent\b/u);
    expect(itemsPushBlock).toMatch(/articleContext:/u);
  });

  it('fullAutoFlow 배치 블록 썸네일 번역이 서론을 4번째 인자로 넘긴다', () => {
    expect(fullAutoFlowSource).not.toMatch(
      /generateEnglishPromptForHeading\(fullAutoTitle,\s*formData\.keywords,\s*thumbImageStyle\s*\)/u,
    );
    expect(fullAutoFlowSource).toMatch(
      /generateEnglishPromptForHeading\(\s*fullAutoTitle,\s*formData\.keywords,\s*thumbImageStyle,[^)]*structuredContent\.introduction/u,
    );
  });
});

describe('resolveSectionContentForImage — 썸네일 의사-소제목', () => {
  it('bodyPlain이 없어도 heading.content(서론)를 그대로 돌려준다', () => {
    const intro = '아침마다 무릎이 뻐근해서 계단 내려갈 때 난간을 잡게 됐다. 그래서 두 달 동안 직접 바꿔본 것들을 적어둔다.';
    const thumbnail = { title: '무릎 뻐근함 두 달 기록', content: intro, isThumbnail: true, isIntro: true };
    const headings = [thumbnail, { title: '첫째, 계단', content: '계단 이야기' }];

    const resolved = resolveSectionContentForImage({
      heading: thumbnail,
      headings,
      bodyPlain: '',
      maxChars: 900,
    });

    expect(resolved).toContain('난간을 잡게');
    expect(resolved).not.toContain('계단 이야기');
  });

  it('content가 빈 소제목은 제목으로 폴백하되 빈 문자열을 내지 않는다', () => {
    const heading = { title: '둘째, 의자 높이', content: '' };
    const resolved = resolveSectionContentForImage({
      heading,
      headings: [heading],
      bodyPlain: '',
      maxChars: 900,
    });
    expect(resolved).toBe('둘째, 의자 높이');
  });
});
