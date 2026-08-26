import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildFullPrompt } from '../promptLoader';

/**
 * [2026-08-26 사장님 지시] "전문가 관점과 독자 관점, 일반인 관점을 동시에 공략해야
 * 살아남는다." 실측해 보니 프롬프트에 '관점' 축이 하나도 없었다 — 유일한 언급이
 * 문단 나누기 규칙이었다(seo/base:598).
 *
 * 순증이 아니라 교체다. 죽은 지시 세 덩어리를 빼고 그 자리에 넣었다.
 */
const base = readFileSync(join(__dirname, '..', 'prompts', 'seo', 'base.prompt'), 'utf-8');
const angles = readFileSync(join(__dirname, '..', 'prompts', 'shared', 'reader-angles.prompt'), 'utf-8');
const assembled = (mode: string, cat: string) =>
  buildFullPrompt(mode as any, cat as any, {} as any) || '';

describe('관점 3축', () => {
  it('전문가·당사자·구경꾼 세 각도를 요구한다', () => {
    expect(angles).toMatch(/전문가 각도/);
    expect(angles).toMatch(/당사자 각도/);
    expect(angles).toMatch(/구경꾼 각도/);
  });

  it('가장 자주 빠지는 축이 무엇인지 짚어 준다', () => {
    expect(angles).toMatch(/당사자 각도가 빠지면 남 얘기로 끝난다/);
  });

  it('소제목으로 나눠 나열하지 말라고 막는다 — 형식이 아니라 시선이다', () => {
    expect(angles).toMatch(/소제목으로 나눠 나열하지 마라/);
  });
});

describe('전제 교정과 반박 선점', () => {
  it('반전을 지어내지 말라고 못박는다', () => {
    expect(angles).toMatch(/\[AG-2\]/);
    expect(angles).toMatch(/없으면 만들지 마라/);
    expect(angles).toMatch(/일부러 틀린 설명을 하지 마라/);
  });

  it('근거 없으면 확인되지 않았다고 쓰라고 한다', () => {
    expect(angles).toMatch(/\[AG-3\]/);
    expect(angles).toMatch(/지어내서 반박하지 마라/);
  });
});

describe('죽은 지시를 걷어냈다', () => {
  it('AdPost 광고 단가 매칭이 사라졌다 — 글 품질과 무관했다', () => {
    expect(base).not.toMatch(/AdPost CPC/);
    expect(base).not.toMatch(/고단가 컨텍스트 자연 매칭 룰/);
  });

  it('네이버 랭킹 4층 해설이 사라졌다 — 지시가 아니라 배경 지식이었다', () => {
    expect(base).not.toMatch(/C-Rank \(출처 신뢰도\)/);
    expect(base).not.toMatch(/DIA\+ \(문서 품질\)/);
  });

  it('첫 줄 5대 공식이 원칙으로 바뀌었다', () => {
    expect(base).not.toMatch(/\[첫 줄 5대 공식\]/);
    expect(base).toMatch(/\[첫 문장 — 공식이 아니라 원칙\]/);
    // base 자신이 금지하던 세 항목이 예시에서 사라지고 금지로 옮겨졌다.
    expect(base).toMatch(/오늘 이 글 하나로 끝내드릴게요.*AI 정리체/s);
    expect(base).toMatch(/혹시 이런 고민 있으신가요\?.*빈 질문/s);
  });
});

describe('전 모드에 붙고, 총량은 줄었다', () => {
  it('seo·홈판·메이트·쇼핑 모두 관점 축을 받는다', () => {
    for (const [mode, cat] of [
      ['seo', 'society'], ['homefeed', 'entertainment'],
      ['mate', 'society'], ['affiliate', 'shopping'],
    ] as const) {
      const p = assembled(mode, cat);
      expect(p).toMatch(/\[AG-1\]/);
      expect(p).toMatch(/\[AG-2\]/);
      expect(p).toMatch(/\[AG-3\]/);
    }
  });

  it('SEO 프롬프트가 4만 자를 넘지 않는다 — 순증이 아니라 교체였다', () => {
    // 작업 전 40,335자. 세 축을 넣고도 줄어야 한다.
    expect(assembled('seo', 'society').length).toBeLessThan(40_000);
  });
});
