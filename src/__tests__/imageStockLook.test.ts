// [2026-10-20 사장님] "Orbit 이미지가 대표이미지부터 소제목까지 정말 마음에 든다 — 네이버도". 비율은 각자 그대로.
//   이미지 분위기 기본 = 스톡 사진(Orbit 의 나노바나나 템플릿), "기사 삽화(9~10월 방식)" 는 체크박스로 되돌린다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  STOCK_PHOTO_LOOK,
  buildContextualImagePrompt,
  buildPosterTitleTypography,
  resolveImageLook,
} from '../image/contextualImagePrompt';
import { stockCoverLines } from '../image/director/thumbnailStrategy';

const base = {
  articleTitle: '청년도약계좌 갈아타기 순서',
  globalSubject: '청년도약계좌',
  sectionHeading: '특별중도해지 전에 새 계좌부터',
  sectionContent: '청년미래적금 계좌를 먼저 개설하고 청년도약계좌를 특별중도해지해야 혜택이 유지된다.',
  viewpointIndex: 2,
};
const role = { name: 'procedure', composition: 'hands doing the step', camera: 'first-person', constraints: ['any people are small in the frame, never posing'] };

describe('resolveImageLook', () => {
  it('설정이 없거나 모르는 값이면 스톡(기본), "editorial" 만 기사 삽화', () => {
    expect(resolveImageLook(undefined)).toBe('stock');
    expect(resolveImageLook('xyz')).toBe('stock');
    expect(resolveImageLook('editorial')).toBe('editorial');
  });
});

describe('브리프 — 스톡 사진 분위기', () => {
  it('소제목: 스톡 사진 모드 + 한국인 인물 허용 + 변주 줄, 역할·연출 금지 줄은 빠진다', () => {
    const p = buildContextualImagePrompt({ ...base, imageLook: 'stock', visualRole: role });
    expect(p).toContain('STOCK PHOTO MODE');
    expect(p).toContain(STOCK_PHOTO_LOOK);
    expect(p).toContain('must be Korean / East Asian');
    expect(p).toContain('section 3 of the article');
    expect(p).not.toContain('EDITORIAL MODE');
    expect(p).not.toContain('No posed person');
    expect(p).not.toContain('VISUAL ROLE');
    expect(p).not.toContain('never posing');
  });

  it('기사 삽화(editorial)·설정 없음은 9~10월 브리프 그대로', () => {
    for (const look of ['editorial', undefined] as const) {
      const p = buildContextualImagePrompt({ ...base, imageLook: look, visualRole: role });
      expect(p).toContain('EDITORIAL MODE');
      expect(p).toContain('No posed person');
      expect(p).toContain('VISUAL ROLE (procedure)');
      expect(p).not.toContain('STOCK PHOTO MODE');
    }
  });

  it('쇼핑은 분위기와 무관하게 쇼핑 모드 그대로', () => {
    const p = buildContextualImagePrompt({ ...base, imageLook: 'stock', isShoppingConnect: true });
    expect(p).toContain('SHOPPING MODE');
    expect(p).not.toContain('STOCK PHOTO MODE');
  });

  it('표지(포스터): 스톡이면 한쪽 배치 대신 장면 위 굵은 한글 오버레이, 철자 보존·안전 영역은 유지', () => {
    const p = buildContextualImagePrompt({
      ...base, imageLook: 'stock', isThumbnail: true, allowText: true, coverStyle: 'poster',
      thumbnailText: '청년도약계좌 갈아타기, 순서 하나로 2,255만원',
    });
    expect(p).toContain('COVER MODE');
    expect(p).not.toContain('COVER POSTER MODE');
    expect(p).toContain('stylish, bold Korean text overlay');
    expect(p).not.toContain('aligned to one side of the square');
    expect(p).toContain('Spell every Korean character');
    expect(p).toContain('safe area');
  });

  it('포스터 타이포: 기사 삽화는 예전 문구 그대로', () => {
    expect(buildPosterTitleTypography('제목 하나')).toContain('aligned to one side of the square');
    expect(buildPosterTitleTypography('제목 하나', 'editorial')).toContain('aligned to one side of the square');
    expect(buildPosterTitleTypography('제목 하나', 'stock')).not.toContain('aligned to one side of the square');
  });
});

describe('썸네일 디렉터 — 스톡 표지 줄', () => {
  it('카드 약속·실존 인물 보호 줄은 유지, 장면 우선 구성 + 한국인', () => {
    const lines = stockCoverLines({ cardPromise: '순서 하나로 혜택이 갈린다' }).join('\n');
    expect(lines).toContain('The cover must make this one point obvious');
    expect(lines).toContain('Korean setting');
    expect(lines).toContain('Korean / East Asian');
    expect(lines).toContain('real, named person');
  });
});

describe('배선(소스 가드)', () => {
  it('생성기·OpenAI·디렉터·설정·화면이 같은 값을 쓴다', () => {
    const gen = readFileSync(resolve('src/imageGenerator.ts'), 'utf8');
    expect(gen).toContain('readImageLookSetting(');
    expect(gen).toContain('imageLook,');
    const oa = readFileSync(resolve('src/image/openaiImageGenerator.ts'), 'utf8');
    expect(oa).toContain("(item as any).imageLook === 'stock'");
    expect(oa).toContain('STOCK_PHOTO_LOOK');
    const director = readFileSync(resolve('src/image/director/thumbnailDirector.ts'), 'utf8');
    expect(director).toContain('stockCoverLines(');
    const cfg = readFileSync(resolve('src/configManager.ts'), 'utf8');
    expect(cfg).toContain("imageLook?: 'stock' | 'editorial';");
    const html = readFileSync(resolve('public/index.html'), 'utf8');
    expect(html).toContain('id="image-look-editorial"');
    const tab = readFileSync(resolve('src/renderer/modules/imageManagementTab.ts'), 'utf8');
    expect(tab).toContain("imageLook: imageLookCheckbox.checked ? 'editorial' : 'stock'");
  });
});
