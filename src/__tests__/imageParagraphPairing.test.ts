import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import {
  describeParagraphPairing,
  orderParagraphsByImageRefs,
} from '../imageNarrative/narrativeBuilder/paragraphOrdering';
import { planImageTextInterleave } from '../automation/imageTextInterleavePlan';

/**
 * [2026-09-09 사장님 실측] "근포땅굴 이미지인데 왜 갑자기 한꼬막 두꼬막 식당
 * 주차장에 대한 내용이 나오는 거니?? 글과 이미지가 따로 논다고."
 *
 * v2.11.235 에서 이미지·글 교차 모양은 만들었지만 짝을 맞추지 않았다. 문단 개수만 세서
 * 앞에서부터 붙였을 뿐이다. 재료는 이미 있었다 — beats 는 imageRefs 와 같은 순서다.
 */

describe('사진별 문단을 사진 순서대로 세우기', () => {
  it('사진 순서대로 본문을 만든다 (모델이 순서를 바꿔 줘도)', () => {
    const paired = orderParagraphsByImageRefs(
      [
        { imageRef: 'img-c', text: '매미성 돌담' },
        { imageRef: 'img-a', text: '근포땅굴 입구' },
        { imageRef: 'img-b', text: '꼬막 한 상' },
      ],
      ['img-a', 'img-b', 'img-c'],
    );
    expect(paired).toBe('근포땅굴 입구\n\n꼬막 한 상\n\n매미성 돌담');
  });

  it('사진 하나라도 짝이 없으면 통째로 포기한다', () => {
    // 반쯤 맞은 짝은 안 맞은 것보다 나쁘다 — 어떤 사진은 맞고 어떤 사진은 엉뚱해진다.
    const paired = orderParagraphsByImageRefs(
      [{ imageRef: 'img-a', text: '근포땅굴' }],
      ['img-a', 'img-b'],
    );
    expect(paired).toBeNull();
  });

  it('빈 텍스트는 짝으로 치지 않는다', () => {
    expect(orderParagraphsByImageRefs(
      [{ imageRef: 'img-a', text: '   ' }],
      ['img-a'],
    )).toBeNull();
  });

  it('사진별 문단이 아예 없으면 null (기존 content 를 쓴다)', () => {
    expect(orderParagraphsByImageRefs(undefined, ['img-a'])).toBeNull();
    expect(orderParagraphsByImageRefs([], ['img-a'])).toBeNull();
  });

  it('진단 문구가 개수를 알려준다', () => {
    expect(describeParagraphPairing([{ imageRef: 'a', text: 'x' }], ['a', 'b']))
      .toContain('문단 1개 / 사진 2장');
  });
});

describe('짝이 맞으면 합치거나 묶지 않는다', () => {
  it('문단 수 = 사진 수면 순서대로 1:1 로 붙인다', () => {
    const steps = planImageTextInterleave(
      ['img-a', 'img-b', 'img-c'],
      '근포땅굴 입구\n\n꼬막 한 상\n\n매미성 돌담',
    );
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.images[0])).toEqual(['img-a', 'img-b', 'img-c']);
    expect(steps.map((s) => s.text)).toEqual(['근포땅굴 입구', '꼬막 한 상', '매미성 돌담']);
  });

  it('짧은 문단도 합치지 않는다 (합치면 짝이 어긋난다)', () => {
    // 60자 미만이라도 개수가 맞으면 그대로 둔다 — 이게 사고의 지점이었다.
    const steps = planImageTextInterleave(['a', 'b'], '짧은 글 하나\n\n짧은 글 둘');
    expect(steps).toHaveLength(2);
    expect(steps[0]!.text).toBe('짧은 글 하나');
    expect(steps[1]!.text).toBe('짧은 글 둘');
  });

  it('개수가 다르면 기존 방식(묶기)으로 떨어진다', () => {
    const para = (n: number) => `${n}번 문단입니다. `.repeat(14).trim();
    const steps = planImageTextInterleave(['a', 'b'], [para(1), para(2), para(3)].join('\n\n'));
    expect(steps).toHaveLength(2);
    const joined = steps.map((s) => s.text).join('\n\n');
    [1, 2, 3].forEach((n) => expect(joined).toContain(`${n}번 문단입니다.`));
  });
});

describe('프롬프트 계약', () => {
  it('사진별 문단을 사진 순서대로 요구한다', () => {
    const prompt = readFileSync(
      new URL('../prompts/imageNarrative/base.prompt', import.meta.url), 'utf8',
    );
    expect(prompt).toMatch(/"paragraphs"/);
    expect(prompt).toMatch(/사진 \*\*한 장마다 하나씩\*\*/);
    expect(prompt).toMatch(/다른 사진 이야기를 섞지 않는다/);
  });

  it('비트를 사진 ID 와 짝지어 보여준다', () => {
    const builder = readFileSync(
      new URL('../imageNarrative/narrativeBuilder/builder.ts', import.meta.url), 'utf8',
    );
    expect(builder).toMatch(/section\.imageRefs\s*\n\s*\.map\(\(ref, k\) =>/);
    expect(builder).toMatch(/orderParagraphsByImageRefs/);
  });
});
