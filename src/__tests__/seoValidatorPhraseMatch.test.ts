import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateSeoContent } from '../contentSeoValidator';

/**
 * [2026-08-26 라이브 실측] 다어절 키워드를 통문장으로 찾던 판정이 오탐을 냈다.
 * "김윤주 권정열 연애"는 본문에 그대로 붙어 나올 일이 없어, 주제를 제대로 다룬
 * 글에도 "본문 미등장 — 주제 불일치 의심" 경고가 매번 떴다.
 * 실측 사례에서 경고 7건 중 3건이 이 결함이었다.
 */
const BODY =
  '옥상달빛 김윤주가 남편인 십센치 권정열과 결혼 13년 차에 때아닌 공개 연애 축하를 받았습니다. ' +
  '8월 25일 함께 찍은 셀카에 덧붙인 짧은 문구 하나로 시작된 장난스러운 축하에, 26일 김윤주가 응수했네요.';

const CONTENT = {
  selectedTitle: '김윤주 권정열 연애 8월 25일 꽤 친함 셀카 한 장으로 시작된 때아닌 공개 축하',
  introduction: '옥상달빛 김윤주가 남편인 십센치 권정열과 결혼 13년 차에 때아닌 공개 연애 축하를 받았습니다.',
  conclusion: '유쾌하게 마무리되었습니다.',
  bodyPlain: BODY,
  headings: [{ title: '재치 있는 감사 인사' }, { title: '13년차 현실 부부' }],
} as any;

const SOURCE = {
  contentMode: 'seo',
  metadata: { keywords: ['김윤주 권정열 연애', '옥상달빛 럽스타그램', '김윤주 권정열 공개연애'] },
} as any;

function captureWarnings(): string[] {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
    lines.push(args.map(String).join(' '));
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    validateSeoContent(CONTENT, SOURCE);
  } finally {
    spy.mockRestore();
    vi.restoreAllMocks();
  }
  return lines;
}

describe('다어절 키워드는 통문장이 아니라 토큰으로 본다', () => {
  it('주제를 제대로 다룬 글에 "본문 미등장"이 뜨지 않는다', () => {
    expect(captureWarnings().join('\n')).not.toMatch(/본문 미등장/);
  });

  it('도입부가 키워드를 풀어 써도 "미포함"으로 잡지 않는다', () => {
    expect(captureWarnings().join('\n')).not.toMatch(/도입부에 키워드.*미포함/);
  });

  it('제목이 서브키워드를 절반 이상 담으면 포함으로 본다', () => {
    expect(captureWarnings().join('\n')).not.toMatch(/제목에 서브키워드 미포함/);
  });

  it('키워드가 정말 없는 글은 여전히 잡는다', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((...a) => { lines.push(a.map(String).join(' ')); });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    validateSeoContent(
      {
        ...CONTENT,
        // 밀도 계산 블록이 100자 이상일 때만 도므로 충분히 길게 둔다.
        bodyPlain:
          '오늘 날씨가 참 좋았고 산책을 다녀왔습니다. 점심은 국수를 먹었어요. ' +
          '오후에는 도서관에 들러 책을 두 권 빌렸고, 저녁에는 집에서 밀린 청소를 했습니다. ' +
          '주말에는 가까운 공원에 자전거를 타러 갈 생각이라 미리 바람을 넣어 두었어요.',
      },
      SOURCE,
    );
    vi.restoreAllMocks();
    expect(lines.join('\n')).toMatch(/본문 미등장/);
  });
});
