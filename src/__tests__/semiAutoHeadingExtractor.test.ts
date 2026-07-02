import { describe, expect, it } from 'vitest';
import { extractSemiAutoHeadingsFromBody } from '../renderer/utils/semiAutoHeadingExtractor';

describe('semi-auto manual heading extractor', () => {
  it('detects chatbot-style plain-text headings even when blank lines follow headings', () => {
    const body = [
      '이순재를 다시 떠올리게 한 건 하이킥이 아니라 마지막 대상이었다',
      '',
      '한 배우의 이름이 다시 올라올 때, 사람들은 대개 대표작부터 떠올립니다.',
      '그런데 이순재라는 이름 앞에서는 마지막 장면이 먼저 붙었습니다.',
      '',
      '사람들이 먼저 멈춘 지점',
      '',
      '이순재라는 이름을 들으면 세대마다 떠올리는 장면이 다릅니다.',
      '어떤 사람은 드라마 사랑이 뭐길래 속 대발이 아버지를 기억합니다.',
      '',
      '반응이 갈린 진짜 이유',
      '',
      '이순재를 바라보는 시선은 한 가지로 묶이지 않습니다.',
      '“이렇게 오래 활동했었나.”',
      '“하이킥 이미지가 강했는데 마지막까지 현역이었구나.”',
      '',
      '여기서 오해가 생긴 부분',
      '',
      '잊힌 줄 알았는데 다시 회자됐다는 말은 후킹은 됩니다.',
      '하지만 그대로 쓰면 조금 위험합니다.',
      '',
      '그래서 핵심은 무엇인가',
      '',
      '이순재가 다시 회자되는 이유는 마지막에 받은 상 하나 때문만은 아닙니다.',
      '',
      '결국 남는 질문',
      '',
      '한 시대를 풍미했다는 말은 보통 과거형으로 들립니다.',
      '여러분에게 이순재는 어떤 장면으로 남아 있나요?',
    ].join('\n');

    const headings = extractSemiAutoHeadingsFromBody(body);

    expect(headings.map((heading) => heading.title)).toEqual([
      '사람들이 먼저 멈춘 지점',
      '반응이 갈린 진짜 이유',
      '여기서 오해가 생긴 부분',
      '그래서 핵심은 무엇인가',
      '결국 남는 질문',
    ]);
    expect(headings[0]?.content).toContain('세대마다 떠올리는 장면');
    expect(headings[1]?.content).not.toContain('그래서 핵심은 무엇인가');
  });

  it('detects short headline-style headings that end in ~다 (no trailing period)', () => {
    const body = [
      '장윤정 측이 선을 그은 부분',
      '',
      '장윤정 측 입장은 분명했습니다.',
      '이번 사안과 장윤정은 무관하다는 입장을 밝힌 것으로 전해졌습니다.',
      '',
      '결국 남는 건 연락 여부다',
      '',
      '이번 의혹의 핵심은 돈의 액수만이 아닙니다.',
      '장윤정의 이름이 어떤 방식으로 언급됐는지가 중요합니다.',
    ].join('\n');

    const headings = extractSemiAutoHeadingsFromBody(body);
    expect(headings.map((h) => h.title)).toEqual([
      '장윤정 측이 선을 그은 부분',
      '결국 남는 건 연락 여부다',
    ]);
  });

  it('captures per-section body content for a real pasted article (라이머 안현모 사례)', () => {
    // [2026-07-02] 붙여넣기 발행에서 소제목만 나오고 본문이 유실되던 회귀의 재현 데이터.
    //   추출기는 소제목 사이의 문단을 content로 반드시 담아야 한다(발행 시 heading.content 사용).
    const body = [
      '혼자 사는 삶이 편하다는 말은 예상할 수 있었습니다.',
      '그런데 그 뒤에 붙은 한마디가 분위기를 바꿨습니다.',
      '',
      '라이머의 말이 다시 주목된 이유',
      '',
      '라이머와 안현모의 이름이 다시 함께 언급됐습니다.',
      '이번에는 이혼 사유가 중심이 아닙니다.',
      '',
      '안현모 이름이 함께 언급되는 이유',
      '',
      '두 사람은 2017년 결혼했고, 2023년 이혼 조정 절차를 마무리했습니다.',
      '',
      '결국 남는 질문',
      '',
      '혼자라서 편한 삶과, 함께가 아니라서 외로운 마음.',
    ].join('\n');

    const headings = extractSemiAutoHeadingsFromBody(body);
    expect(headings.map((h) => h.title)).toEqual([
      '라이머의 말이 다시 주목된 이유',
      '안현모 이름이 함께 언급되는 이유',
      '결국 남는 질문',
    ]);
    // 핵심: 각 소제목의 content가 비어있지 않아야 한다(유실 방지).
    expect(headings.every((h) => h.content.trim().length > 0)).toBe(true);
    expect(headings[0]?.content).toContain('라이머와 안현모의 이름이 다시');
    expect(headings[1]?.content).toContain('2017년 결혼');
    expect(headings[2]?.content).toContain('외로운 마음');
  });

  it('does not classify quoted reactions or sentence-like short paragraphs as headings', () => {
    const body = [
      '반응이 갈린 진짜 이유',
      '',
      '“이렇게 오래 활동했었나.”',
      '“하이킥 이미지가 강했는데 마지막까지 현역이었구나.”',
      '',
      '결국 남는 건 그 한 줄이었어요.',
      '',
      '결국 남는 질문',
      '',
      '여러분에게 이순재는 어떤 장면으로 남아 있나요?',
    ].join('\n');

    const headings = extractSemiAutoHeadingsFromBody(body);

    expect(headings.map((heading) => heading.title)).toEqual([
      '반응이 갈린 진짜 이유',
      '결국 남는 질문',
    ]);
  });
});
