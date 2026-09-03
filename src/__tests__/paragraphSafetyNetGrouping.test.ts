import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ensureContentParagraphBreaks } from '../contentBodyTransforms';

/**
 * [2026-09-02 실측] 후처리기를 2~3문장으로 바꾼 뒤 dist 로 돌려 보니, 200자를 넘는 긴 문단은
 * 안전망(ensureParagraphBreaks)이 먼저 랜덤 2~3 으로 나눠 7문장 → 2+2+2+1 — 마지막 문장이 혼자 남았다.
 * 후처리기는 나누기만 하고 합치지 않으니 그 1 은 그대로 화면에 간다.
 * 세 자리(프롬프트·후처리기·안전망)가 같은 묶음 규칙을 써야 한다.
 */
const SEVEN = [
  '닥터웰 종아리 마사지기는 바지처럼 입는 방식이라 처음엔 낯설게 느껴집니다.',
  '지퍼를 올리고 전원을 켜면 발끝부터 허벅지 쪽으로 공기가 차오릅니다.',
  '압박 강도는 세 단계인데 첫날은 가장 약한 단계로 시작하는 편이 낫습니다.',
  '소음은 거의 없어서 누워서 영상을 보며 쓸 수 있었습니다.',
  '다만 종아리보다 허벅지 쪽이 더 조여진다는 구매자 의견이 있습니다.',
  '15분 자동 종료라 잠들어도 부담이 없습니다.',
  '어르신께 드릴 때는 지퍼 조작을 한 번 같이 해 보는 것이 좋습니다.',
];

describe('긴 문단 안전망도 2~3문장씩 고르게 — 혼자 남는 문장 없음', () => {
  it('빈 줄 없는 7문장(230자↑) → 3+2+2, 문단 안 문장은 이어 쓴다', () => {
    const out = ensureContentParagraphBreaks({ bodyPlain: SEVEN.join(' '), headings: [] } as never).bodyPlain as string;
    const paragraphs = out.split('\n\n');
    // [2026-09-02 사장님 참고글] 문단 안 문장은 이어진다(자연 줄바꿈) — 줄바꿈으로 나누던 것을 되돌렸다.
    expect(paragraphs).toEqual([SEVEN.slice(0, 3).join(' '), SEVEN.slice(3, 5).join(' '), SEVEN.slice(5, 7).join(' ')]);
  });

  it('여러 번 돌려도 같다 — 랜덤이 아니다', () => {
    const first = ensureContentParagraphBreaks({ bodyPlain: SEVEN.join(' '), headings: [] } as never).bodyPlain;
    for (let i = 0; i < 5; i += 1) {
      expect(ensureContentParagraphBreaks({ bodyPlain: SEVEN.join(' '), headings: [] } as never).bodyPlain).toBe(first);
    }
  });

  it('안전망이 후처리기의 묶음 함수를 쓴다', () => {
    const src = readFileSync(resolve(__dirname, '..', 'contentBodyTransforms.ts'), 'utf-8');
    // [2026-09-04] 홈판은 1~2문장 — maxSentences 를 finalize 가 넘긴다
    expect(src).toMatch(/const sizes = paragraphGroupSizes\(sentences\.length, maxSentences\);/u);
    expect(src).not.toMatch(/Math\.random\(\) \* [23]\) \+ [12]/u);
  });

  // [2026-09-03 자체 실행 비평] 표 행의 "표기됩니다." 뒤에서 문장 분리가 일어나 표가 깨졌다 — 표 덩어리는 손대지 않는다
  it('표가 든 덩어리는 문단 나누기를 건너뛴다', () => {
    const table = [
      '| 제품 정보 | 구매 전 의미 |',
      '| --- | --- |',
      '| 정격전압 | 220, 60Hz 전원을 사용하는 유선 제품입니다. |',
      '| 소비전력 | 23W로 표기돼 있습니다. |',
      '| 출시연월 | 동일 모델은 2019년 11월 출시연월로 표기됩니다. |',
      '| 구성 | (그레이)본체+다리 구성입니다. |',
      '| 수집 당시 표시 가격 | 135,000원으로 표시됐습니다. |',
    ].join('\n');
    const prose = '본체는 약 1.5kg입니다. 접어 둘 수 있어 무겁게 느껴지지는 않았어요. 보관통은 따로 준비해야 합니다. 배송은 주문한 날 도착했습니다. 포장도 깔끔했어요. 결제 전 옵션을 확인하세요.';
    const content = ensureContentParagraphBreaks({ headings: [{ title: '크기', content: `${prose}\n\n${table}` }] } as any);
    const out = String(content.headings[0].content);
    expect(out).toContain(table);
    expect(out).not.toMatch(/표기됩니다\.\n\n\|/u);
  });

  // [2026-09-03 5차 실측] 인용문 안 "!" 에서 갈려 따옴표가 두 문단에 걸쳤다
  it('따옴표가 닫히기 전에는 문장을 가르지 않는다', () => {
    const text = '처음 일주일은 매일 쓰다가 시간이 지나면 손이 덜 가기도 하네요. "진짜 만족하면서 사용하고 있어요! 힘도 엄청 세고 3단으로만 사용해도 충분히 시원하더라고요."라는 말처럼 강한 압박감을 원하는 사람이라면 후보에 둘 이유가 있어요. 반대로 종아리 한 부위에만 압이 들어오길 기대한다면 허벅지 압이 더 도드라지는 점을 먼저 받아들여야 합니다. 그래도 저는 만족했어요. 다음은 보관입니다.';
    const out = String(ensureContentParagraphBreaks({ headings: [{ title: 't', content: text }] } as any).headings[0].content);
    expect(out).not.toMatch(/있어요!\n\n힘도/u);
    expect(out).toContain('"진짜 만족하면서 사용하고 있어요! 힘도 엄청 세고 3단으로만 사용해도 충분히 시원하더라고요."라는 말처럼');
  });
});
