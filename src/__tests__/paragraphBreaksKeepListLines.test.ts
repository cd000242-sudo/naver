import { describe, expect, it } from 'vitest';

import { ensureContentParagraphBreaks } from '../contentBodyTransforms';

/** [2026-09-03 self-run 08:47 비염 글] "- 채소와 …" 목록 줄이 문장 분할에 휘말려 한 문단으로 뭉쳤다 */
describe('문단 나누기 — 목록 줄은 한 줄에 하나', () => {
  const prose = '환절기 비염은 코 증상에서 시작해도 수면과 집중력으로 이어질 수 있습니다. 잠을 깨게 하는 코막힘이 계속되면 생활 루틴부터 정리해야 합니다. 치료의 졸림이 걱정된다면 그 조건을 진료 때 구체적으로 말해 보세요. 아이는 기침과 재채기만 보지 말고 수면과 식사 양상까지 메모해 두면 다음 상담에서 훨씬 정확한 이야기를 나눌 수 있습니다.';
  const list = '- 채소와 제철 과일, 발효식품을 식사에 더합니다.\n- 낮과 밤 기온 차가 10도 이상 벌어질 때는 얇은 옷을 여러 겹 입습니다.\n- 외출 뒤에는 비누로 30초 이상 손을 씻습니다.';

  it('목록 앞뒤 산문은 나누고 목록 항목은 줄마다 남긴다', () => {
    const out = ensureContentParagraphBreaks({ headings: [{ title: '루틴', content: `${prose}\n${list}\n쉽게 말하면 매일 끊기지 않게 챙기는 쪽입니다.` }] } as any);
    const content = String(out.headings?.[0]?.content || '');
    expect(content).not.toMatch(/\. - /u);
    expect(content).toMatch(/^- 채소와 제철 과일, 발효식품을 식사에 더합니다\.$/mu);
    expect(content).toMatch(/^- 낮과 밤 기온 차가 10도 이상 벌어질 때는 얇은 옷을 여러 겹 입습니다\.$/mu);
    expect(content).toMatch(/^- 외출 뒤에는 비누로 30초 이상 손을 씻습니다\.$/mu);
    expect(content).toContain('쉽게 말하면 매일 끊기지 않게 챙기는 쪽입니다.');
  });

  it('목록이 없으면 이전과 같은 결과', () => {
    const before = ensureContentParagraphBreaks({ headings: [{ title: 'x', content: prose }] } as any);
    expect(String(before.headings?.[0]?.content || '')).toContain('\n');
  });
});
