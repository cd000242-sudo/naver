import { describe, expect, it } from 'vitest';

import { buildContentJsonOutputFormat } from '../contentJsonPromptFormat';

/**
 * [2026-08-27 Phase 3-B] 클릭 사유가 자꾸 "정리해주니까"로 흐른다.
 *
 * 홈판 글 6편의 [TitleDiag] 로그를 모아보니 패턴이 하나였다.
 *   전제 뒤집기 1편(윤은혜)  → 제목이 살았다: "흰옷도 아닌데 민폐? … 3일 드레스 코드가 있었다"
 *   정리·해석·서사형 4편      → 제목이 밋밋: "… 넷플릭스 입장은", "… 달라진 지점"
 *   밋밋 1편(티파니)          → 사장님: "클릭을 부르는 제목이 아닌데?"
 *
 * 클릭 사유의 유형이 제목의 상한을 정한다. 제목을 아무리 잘 써도 사유가
 * "차이를 정리해준다"면 정리형 제목밖에 안 나온다.
 *
 * 그런데 clickReason 필드 설명에는 이미 이렇게 적혀 있었다 —
 * "자료 속 가장 의외의 사실이나 모순에서 도출". 모델은 그걸 무시했다.
 * 필드 설명 안의 지시보다 **필드가 던지는 질문**이 답을 정하기 때문이다.
 * "왜 클릭하나?"라고 물으면 "정리해주니까"가 나온다.
 *
 * 그래서 질문을 따로 던진다 — "가장 의외인 게 뭔가?"
 */
function homefeedPrompt(categoryHint?: string): string {
  return buildContentJsonOutputFormat({
    contentMode: 'homefeed',
    mode: 'homefeed',
    source: {
      rawText: '원본 본문입니다.',
      title: '제목 참고',
      metadata: { keywords: ['김새롬', '결혼관'] },
      categoryHint,
    } as never,
    title: '제목 참고',
    rawText: '테스트 원문',
    primaryKeyword: '김새롬',
    subKeywords: '결혼관',
  } as never);
}

describe('의외 지점 필드', () => {
  const prompt = homefeedPrompt();

  it('홈판 사전분석이 가장 의외인 지점을 따로 묻는다', () => {
    expect(prompt).toMatch(/"surprisingFact"/);
  });

  it('질문이 "왜 클릭하나"가 아니라 "무엇이 의외인가"다', () => {
    const field = prompt.match(/"surprisingFact":\s*"([^"]+)"/)?.[1] || '';
    expect(field).toContain('의외');
    expect(field).not.toContain('클릭');
  });

  it('자료에 없으면 지어내지 말라고 말한다', () => {
    const field = prompt.match(/"surprisingFact":\s*"([^"]+)"/)?.[1] || '';
    expect(field).toMatch(/자료|없으면/);
  });

  it('clickReason 보다 먼저 나온다 — 뒤 필드가 앞 필드를 이어받는다', () => {
    expect(prompt.indexOf('"surprisingFact"')).toBeLessThan(prompt.indexOf('"clickReason"'));
  });

  it('clickReason 이 그 값에서 출발하도록 묶는다', () => {
    const field = prompt.match(/"clickReason":\s*"([^"]+)"/)?.[1] || '';
    expect(field).toContain('surprisingFact');
  });

  it('이슈픽 골격에서도 같다', () => {
    const issue = homefeedPrompt('연예');
    expect(issue).toMatch(/"surprisingFact"/);
  });
});

describe('적용 범위', () => {
  const other = (mode: 'seo' | 'affiliate' | 'business' | 'mate') =>
    buildContentJsonOutputFormat({
      contentMode: mode,
      mode,
      source: { rawText: '원본', title: '제목', metadata: { keywords: ['키워드'] } } as never,
      title: '제목',
      rawText: '원문',
      primaryKeyword: '키워드',
      subKeywords: '',
    } as never);

  it('검색 기반 모드에는 넣지 않는다 — 근거가 홈판에서만 나왔다', () => {
    // SEO·쇼핑·업체는 "의외"보다 "내 질문에 답하는가"가 클릭을 만든다.
    // 실측 없이 전 모드에 퍼뜨리지 않는다.
    for (const mode of ['seo', 'affiliate', 'business', 'mate'] as const) {
      expect(other(mode)).not.toMatch(/"surprisingFact"/);
    }
  });
});
