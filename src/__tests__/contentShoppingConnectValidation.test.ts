import { describe, expect, it } from 'vitest';
import {
  detectBannedHeadingPatterns,
  validateShoppingConnectContent,
} from '../contentShoppingConnectValidation.js';

describe('contentShoppingConnectValidation', () => {
  it('detects banned shopping-connect heading templates', () => {
    const detected = detectBannedHeadingPatterns([
      { title: '이것 하나로 끝나는 주방 관리' },
      { title: '실제 가격과 구성 확인' },
    ]);

    expect(detected).toHaveLength(1);
    expect(detected[0]).toContain('이것 하나로 끝');
  });

  it('scores healthy shopping-connect content without banned patterns', () => {
    const content = {
      headings: [
        { title: '구매 전 확인할 구성', content: 'a'.repeat(900) },
        { title: '실사용에서 보이는 장점', content: 'b'.repeat(900) },
        { title: '비교할 때 놓치기 쉬운 부분', content: 'c'.repeat(900) },
      ],
      conclusion: '쇼핑커넥트 활동으로 수수료가 발생할 수 있습니다.',
    };

    const result = validateShoppingConnectContent(content);

    expect(result.score).toBe(100);
    expect(result.feedback).toContain('✅ 금지 패턴 없음');
  });

  it('penalizes missing disclosure and thin content', () => {
    const result = validateShoppingConnectContent({
      headings: [{ title: '강력 추천 제품', content: '짧음' }],
      conclusion: '구매 전 확인해보세요.',
    });

    expect(result.score).toBeLessThan(70);
    expect(result.feedback.join('\n')).toContain('쇼핑커넥트 고지 문구 누락');
  });
});
