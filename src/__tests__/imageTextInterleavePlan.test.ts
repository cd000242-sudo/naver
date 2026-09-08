import { describe, expect, it } from 'vitest';

import {
  planImageTextInterleave,
  splitBodyIntoParagraphs,
} from '../automation/imageTextInterleavePlan';

/**
 * [2026-09-09 사장님 요청] 발행글이 "이미지 4장 → 글 3덩이" 로 나왔다.
 * 원하는 모양은 "추론한 이미지 → 글 → 추론한 이미지 → 글" — 사진과 그 사진을
 * 설명하는 글이 붙어 있어야 읽힌다.
 */

describe('본문 문단 분리', () => {
  it('빈 줄 기준으로 나눈다', () => {
    expect(splitBodyIntoParagraphs('가\n\n나\n\n다')).toEqual(['가', '나', '다']);
  });

  it('빈 줄이 없으면 개행으로 나눈다', () => {
    expect(splitBodyIntoParagraphs('가\n나\n다')).toEqual(['가', '나', '다']);
  });

  it('빈 본문은 빈 배열', () => {
    expect(splitBodyIntoParagraphs('   ')).toEqual([]);
  });
});

describe('이미지·본문 교차 배치', () => {
  // 실제 사진 글의 문단 길이(대략 100~200자)에 맞춘다. 60자 미만 조각은
  // 설계상 앞 문단에 흡수되므로, 그보다 짧은 표본으로는 교차를 검증할 수 없다.
  const para = (n: number) => `${n}번 문단입니다. `.repeat(14).trim();

  it('이미지 4장 + 문단 4개 → 이미지 하나마다 글이 붙는다', () => {
    const body = [para(1), para(2), para(3), para(4)].join('\n\n');
    const steps = planImageTextInterleave(['a', 'b', 'c', 'd'], body);

    expect(steps).toHaveLength(4);
    steps.forEach((step) => {
      expect(step.images).toHaveLength(1);
      expect(step.text.trim().length).toBeGreaterThan(0);
    });
    // 순서 보존
    expect(steps.map((s) => s.images[0])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('사진이 문단보다 많아도 한 장도 버리지 않는다', () => {
    const body = [para(1), para(2)].join('\n\n');
    const steps = planImageTextInterleave(['a', 'b', 'c', 'd', 'e'], body);

    const placed = steps.flatMap((s) => s.images);
    expect(placed).toEqual(['a', 'b', 'c', 'd', 'e']);
    // 마지막 단계가 남은 사진을 흡수한다.
    expect(steps[steps.length - 1]!.images.length).toBeGreaterThan(1);
  });

  it('문단이 사진보다 많으면 글을 묶어 사진 수에 맞춘다', () => {
    const body = [para(1), para(2), para(3), para(4), para(5)].join('\n\n');
    const steps = planImageTextInterleave(['a', 'b'], body);

    expect(steps).toHaveLength(2);
    // 본문 전체가 보존되어야 한다 — 교차하느라 글이 사라지면 안 된다.
    const joined = steps.map((s) => s.text).join('\n\n');
    [1, 2, 3, 4, 5].forEach((n) => expect(joined).toContain(`${n}번 문단입니다.`));
  });

  it('사진 1장이면 기존 동작 그대로 (단계 1개)', () => {
    const body = [para(1), para(2)].join('\n\n');
    const steps = planImageTextInterleave(['a'], body);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.images).toEqual(['a']);
    expect(steps[0]!.text).toBe(body);
  });

  it('문단이 하나뿐이면 쪼개지 않는다', () => {
    const steps = planImageTextInterleave(['a', 'b'], para(1));
    expect(steps).toHaveLength(1);
    expect(steps[0]!.images).toEqual(['a', 'b']);
  });

  it('본문이 없으면 이미지만 넣는 단계 하나', () => {
    const steps = planImageTextInterleave(['a', 'b'], '   ');
    expect(steps).toEqual([{ images: ['a', 'b'], text: '' }]);
  });

  it('이미지가 없으면 본문만 넣는 단계 하나', () => {
    const steps = planImageTextInterleave([], '가\n\n나');
    expect(steps).toHaveLength(1);
    expect(steps[0]!.images).toEqual([]);
    expect(steps[0]!.text).toBe('가\n\n나');
  });

  it('짧은 한 줄 조각들 사이에는 사진을 끼우지 않는다', () => {
    // 60자 미만 조각은 앞 조각에 흡수된다.
    const steps = planImageTextInterleave(['a', 'b', 'c'], '짧다\n조금\n더\n짧다');
    expect(steps).toHaveLength(1);
  });

  it('어떤 배치에서도 본문 글자가 유실되지 않는다', () => {
    const body = [para(1), para(2), para(3)].join('\n\n');
    for (const imgs of [['a'], ['a', 'b'], ['a', 'b', 'c'], ['a', 'b', 'c', 'd']]) {
      const steps = planImageTextInterleave(imgs, body);
      const joined = steps.map((s) => s.text).join('\n\n');
      [1, 2, 3].forEach((n) => expect(joined).toContain(`${n}번 문단입니다.`));
    }
  });
});
