import { describe, expect, it } from 'vitest';

import {
  buildNarrativeSections,
  isSameLocationKey,
  MAX_IMAGES_PER_NARRATIVE_SECTION,
} from '../imageNarrative/inferenceAggregator/sectionBuilder';

/**
 * [2026-09-09 사장님] "여행을 3군데 갔는데 한 글로 작성하잖아. 그럼 소제목 하나에
 * 여행할 곳을 전부 설명해줘야 되지 않니? 근포땅굴 소제목 아래 근포땅굴 이미지를
 * 이미지-설명 이미지-설명 이런 식으로 마무리하고, 다음 소제목에 한꼬막 두꼬막."
 *
 * 실측: 소제목 4개에 사진이 1장씩이었다. location_hint 는 사진마다 Vision 이 따로 뽑는
 * 자유 문자열이라 "근포땅굴"/"거제 근포땅굴"/"근포땅굴 입구" 로 갈리면 문자열이 다르다는
 * 이유만으로 매번 새 소제목이 됐다.
 */

function photo(imageId: string, location: string, description = `${imageId} 설명`) {
  return {
    imageId,
    provider: 'gemini' as const,
    latencyMs: 1,
    result: {
      location_hint: location,
      scene_type: 'travel',
      description_ko: description,
      mood_keywords: [],
      food_items: [],
    },
  } as any;
}

describe('같은 장소 판정', () => {
  it('표기가 달라도 같은 장소로 본다', () => {
    expect(isSameLocationKey('근포땅굴', '거제 근포땅굴')).toBe(true);
    expect(isSameLocationKey('근포땅굴', '근포땅굴 입구')).toBe(true);
    expect(isSameLocationKey('한꼬막 두꼬막', '한꼬막두꼬막')).toBe(true);
  });

  it('다른 장소는 섞지 않는다', () => {
    expect(isSameLocationKey('근포땅굴', '매미성')).toBe(false);
    expect(isSameLocationKey('근포땅굴', '한꼬막 두꼬막')).toBe(false);
  });

  it('한 글자짜리 우연한 겹침으로 묶지 않는다', () => {
    expect(isSameLocationKey('성', '매미성')).toBe(false);
  });
});

describe('장소 하나 = 소제목 하나', () => {
  it('여행 3곳이면 소제목 3개, 사진은 각 장소 아래로 모인다', () => {
    const sections = buildNarrativeSections([
      photo('a1', '근포땅굴'),
      photo('a2', '거제 근포땅굴'),
      photo('a3', '근포땅굴 입구'),
      photo('b1', '한꼬막 두꼬막'),
      photo('b2', '한꼬막두꼬막 식당'),
      photo('c1', '매미성'),
      photo('c2', '거제 매미성'),
    ]);

    expect(sections).toHaveLength(3);
    expect(sections[0]!.imageRefs).toEqual(['a1', 'a2', 'a3']);
    expect(sections[1]!.imageRefs).toEqual(['b1', 'b2']);
    expect(sections[2]!.imageRefs).toEqual(['c1', 'c2']);
  });

  it('사진마다 설명이 같은 순서로 붙는다 (짝 맞추기의 전제)', () => {
    const sections = buildNarrativeSections([
      photo('a1', '근포땅굴', '입구 표지판'),
      photo('a2', '근포땅굴', '역광 속 바다'),
    ]);
    expect(sections[0]!.beats).toEqual(['입구 표지판', '역광 속 바다']);
    expect(sections[0]!.imageRefs).toEqual(['a1', 'a2']);
  });

  it('한 장소에 사진이 아주 많으면 상한에서 나눈다 (앨범이 되지 않게)', () => {
    const many = Array.from({ length: MAX_IMAGES_PER_NARRATIVE_SECTION + 2 }, (_, i) =>
      photo(`x${i}`, '근포땅굴'));
    const sections = buildNarrativeSections(many);
    expect(sections.length).toBeGreaterThan(1);
    expect(sections[0]!.imageRefs).toHaveLength(MAX_IMAGES_PER_NARRATIVE_SECTION);
  });

  it('상한이 한 장소의 사진을 담을 만큼은 된다', () => {
    // 4장이면 한 장소에서 찍은 사진도 두 소제목으로 쪼개진다 — 실사용과 맞지 않았다.
    expect(MAX_IMAGES_PER_NARRATIVE_SECTION).toBeGreaterThanOrEqual(8);
  });
});
