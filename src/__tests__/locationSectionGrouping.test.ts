import { describe, expect, it } from 'vitest';

import {
  buildNarrativeSections,
  isSameLocationKey,
  MAX_IMAGES_PER_NARRATIVE_SECTION,
  MAX_SECTIONS_PER_LOCATION,
  MIN_IMAGES_PER_SPLIT_PART,
  MIN_TARGET_SECTIONS,
  resolveTargetSections,
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

  it('한 장소에 사진이 아주 많아도 한 소제목에 몰아넣지 않는다', () => {
    const many = Array.from({ length: MAX_IMAGES_PER_NARRATIVE_SECTION + 2 }, (_, i) =>
      photo(`x${i}`, '근포땅굴'));
    const sections = buildNarrativeSections(many);
    expect(sections.length).toBeGreaterThan(1);
    sections.forEach((section) => {
      expect(section.imageRefs.length).toBeLessThanOrEqual(MAX_IMAGES_PER_NARRATIVE_SECTION);
    });
    // 사진은 한 장도 잃지 않는다.
    expect(sections.flatMap((s) => s.imageRefs)).toHaveLength(many.length);
  });

  it('상한이 한 장소의 사진을 담을 만큼은 된다', () => {
    // 4장이면 한 장소에서 찍은 사진도 두 소제목으로 쪼개진다 — 실사용과 맞지 않았다.
    expect(MAX_IMAGES_PER_NARRATIVE_SECTION).toBeGreaterThanOrEqual(8);
  });
});

/**
 * [2026-09-09 사장님 지적] "만약에 장소가 하나라면 소제목이 1개만 나오는 거 아니니?"
 *
 * 맞다. 장소로 묶으면서 생긴 부작용이다 — 한 카페·한 식당만 다녀오면 사진이 여섯 장이어도
 * 섹션이 하나가 되고, 소제목 하나짜리 글이 된다. 장면 단위로 쪼개 최소 개수를 지킨다.
 */
describe('장소가 하나뿐일 때', () => {
  it('사진이 많으면 소제목 하나로 끝나지 않는다', () => {
    const sections = buildNarrativeSections(
      Array.from({ length: 6 }, (_, i) => photo(`p${i}`, '연남동 카페')),
    );
    expect(sections.length).toBeGreaterThanOrEqual(MIN_TARGET_SECTIONS);
  });

  it('쪼개도 사진 순서는 그대로다 (시간 순서가 곧 이야기 순서)', () => {
    const sections = buildNarrativeSections(
      Array.from({ length: 6 }, (_, i) => photo(`p${i}`, '연남동 카페')),
    );
    const flattened = sections.flatMap((s) => s.imageRefs);
    expect(flattened).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('사진과 설명의 짝도 쪼갠 뒤까지 유지된다', () => {
    const sections = buildNarrativeSections([
      photo('p0', '카페', '간판'),
      photo('p1', '카페', '창가 자리'),
      photo('p2', '카페', '라떼'),
      photo('p3', '카페', '디저트'),
    ]);
    const pairs = sections.flatMap((s) => s.imageRefs.map((ref, i) => [ref, s.beats[i]]));
    expect(pairs).toEqual([
      ['p0', '간판'], ['p1', '창가 자리'], ['p2', '라떼'], ['p3', '디저트'],
    ]);
  });

  it('사진이 적으면 억지로 쪼개지 않는다 (사진 1장짜리 소제목 방지)', () => {
    // 3장을 3섹션으로 만들면 사진 1장짜리 소제목이 생겨 원래 문제로 되돌아간다.
    const sections = buildNarrativeSections([
      photo('p0', '카페'), photo('p1', '카페'), photo('p2', '카페'),
    ]);
    sections.forEach((s) => {
      expect(s.imageRefs.length).toBeGreaterThanOrEqual(MIN_IMAGES_PER_SPLIT_PART);
    });
  });

  it('사진 2장뿐이면 섹션 하나로 둔다 (더 쪼갤 수 없다)', () => {
    const sections = buildNarrativeSections([photo('p0', '카페'), photo('p1', '카페')]);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.imageRefs).toEqual(['p0', 'p1']);
  });

  it('장소가 여러 곳이면 쪼개지 않는다 (이미 충분하다)', () => {
    const sections = buildNarrativeSections([
      photo('a1', '근포땅굴'), photo('a2', '근포땅굴'),
      photo('b1', '한꼬막 두꼬막'), photo('b2', '한꼬막 두꼬막'),
      photo('c1', '매미성'), photo('c2', '매미성'),
    ]);
    expect(sections).toHaveLength(3);
    expect(sections[0]!.imageRefs).toEqual(['a1', 'a2']);
  });
});

/**
 * [2026-09-09 사장님] "장소가 많으면 지금처럼 장소끼리 묶고 함축적으로 장소당
 * 소제목 1~2개, 1~2개의 장소면 소제목을 그만큼 자동으로 쪼개줘야지."
 */
describe('장소 수에 따라 소제목 수를 맞춘다', () => {
  it('장소 3곳 이상이면 목표는 장소 수', () => {
    expect(resolveTargetSections(3)).toBe(3);
    expect(resolveTargetSections(5)).toBe(5);
  });

  it('장소 1~2곳이면 최소 3개로 쪼갠다', () => {
    expect(resolveTargetSections(1)).toBe(MIN_TARGET_SECTIONS);
    expect(resolveTargetSections(2)).toBe(MIN_TARGET_SECTIONS);
  });

  it('장소가 여러 곳이면 한 장소가 소제목을 2개까지만 가져간다', () => {
    // 근포땅굴 8장(사진 많음) + 다른 두 곳 2장씩
    const sections = buildNarrativeSections([
      ...Array.from({ length: 8 }, (_, i) => photo(`a${i}`, '근포땅굴')),
      photo('b1', '한꼬막 두꼬막'), photo('b2', '한꼬막 두꼬막'),
      photo('c1', '매미성'), photo('c2', '매미성'),
    ]);
    const fromFirstPlace = sections.filter((s) => s.imageRefs[0]!.startsWith('a'));
    expect(fromFirstPlace.length).toBeLessThanOrEqual(MAX_SECTIONS_PER_LOCATION);
    expect(fromFirstPlace.length).toBe(2); // 8장이면 둘로 나뉜다
  });

  it('장소가 여러 곳이고 사진이 적으면 장소당 1개', () => {
    const sections = buildNarrativeSections([
      photo('a1', '근포땅굴'), photo('a2', '근포땅굴'),
      photo('b1', '한꼬막 두꼬막'), photo('b2', '한꼬막 두꼬막'),
      photo('c1', '매미성'), photo('c2', '매미성'),
    ]);
    expect(sections).toHaveLength(3);
  });

  it('장소가 두 곳이면 3개 이상으로 쪼갠다', () => {
    const sections = buildNarrativeSections([
      ...Array.from({ length: 4 }, (_, i) => photo(`a${i}`, '근포땅굴')),
      ...Array.from({ length: 4 }, (_, i) => photo(`b${i}`, '매미성')),
    ]);
    expect(sections.length).toBeGreaterThanOrEqual(MIN_TARGET_SECTIONS);
    // 장소 경계는 지킨다 — 근포땅굴 사진과 매미성 사진이 한 소제목에 섞이지 않는다.
    sections.forEach((section) => {
      const prefixes = new Set(section.imageRefs.map((ref) => ref[0]));
      expect(prefixes.size).toBe(1);
    });
  });
});
