import { describe, expect, it } from 'vitest';
import {
  recoverLooseStructuredContentFields,
} from '../contentStructuredRecovery';

describe('contentStructuredRecovery', () => {
  it('recovers bodyPlain from a loose content field', () => {
    const content: Record<string, any> = {
      selectedTitle: '장마철 빨래 건조 팁',
      content: '제습기와 서큘레이터를 같이 쓰면 건조 시간이 줄어듭니다.\n\n공기 흐름과 습도 제거를 함께 잡는 것이 핵심입니다.',
    };

    const result = recoverLooseStructuredContentFields(content);

    expect(result.bodyRecovered).toBe(true);
    expect(result.bodySource).toBe('content');
    expect(content.bodyPlain).toContain('건조 시간이 줄어듭니다');
  });

  it('recovers bodyPlain and headings from section arrays', () => {
    const content: Record<string, any> = {
      selectedTitle: '에어컨 냄새 관리법',
      sections: [
        {
          heading: '냄새가 나는 이유',
          paragraphs: [
            '자동건조 기능만으로는 내부 습기와 오염을 완전히 막기 어렵습니다.',
            '필터와 송풍팬에 남은 먼지가 냄새의 시작점이 될 수 있습니다.',
          ],
        },
        {
          title: '관리 루틴',
          body: '냉방 종료 후 송풍을 충분히 돌리고 필터를 주기적으로 청소해야 합니다.',
        },
      ],
    };

    const result = recoverLooseStructuredContentFields(content);

    expect(result.bodyRecovered).toBe(true);
    expect(result.headingsRecovered).toBe(true);
    expect(content.bodyPlain).toContain('냄새가 나는 이유');
    expect(content.headings).toHaveLength(2);
    expect(content.headings[0].content).toContain('내부 습기');
  });

  it('does not invent body text when only title-like metadata exists', () => {
    const content: Record<string, any> = {
      selectedTitle: '제목만 있는 응답',
      titleAlternatives: ['제목만 있는 응답'],
      metadata: { source: 'gemini' },
    };

    const result = recoverLooseStructuredContentFields(content);

    expect(result.bodyRecovered).toBe(false);
    expect(content.bodyPlain).toBeUndefined();
    expect(content.headings).toBeUndefined();
  });

  it('strips html when body text is recovered from html aliases', () => {
    const content: Record<string, any> = {
      selectedTitle: '지원금 신청 오류',
      articleHtml: '<p>지원금 신청 결과가 보이지 않을 때는 신청 완료 여부를 먼저 확인해야 합니다.</p><p>이후 은행 앱과 문의처를 함께 점검하는 순서가 좋습니다.</p>',
    };

    const result = recoverLooseStructuredContentFields(content);

    expect(result.bodyRecovered).toBe(true);
    expect(content.bodyPlain).toContain('신청 완료 여부');
    expect(content.bodyPlain).not.toContain('<p>');
  });

  it('recovers body text from nested provider payload objects', () => {
    const content: Record<string, any> = {
      selectedTitle: '냉동식품 해동기계 후기',
      result: {
        article: {
          body: '냉동식품 해동기계를 고를 때는 해동 속도보다 식재료 손상 여부를 먼저 봐야 합니다.\n\n광고 문구와 실제 사용 후기가 다를 수 있어 소음과 세척 편의성도 함께 확인하는 편이 좋습니다.',
        },
      },
    };

    const result = recoverLooseStructuredContentFields(content);

    expect(result.bodyRecovered).toBe(true);
    expect(result.bodySource).toBe('result.article.body');
    expect(content.bodyPlain).toContain('식재료 손상 여부');
  });
});
