import { describe, expect, it } from 'vitest';
import {
  canPublishShoppingConnectQuality,
  detectBannedHeadingPatterns,
  SHOPPING_CONNECT_PUBLISH_MIN_SCORE,
  SHOPPING_CONNECT_TARGET_SCORE,
  resolveShoppingConnectQualityDisposition,
  validateShoppingConnectContent,
} from '../contentShoppingConnectValidation.js';

describe('contentShoppingConnectValidation', () => {
  it('treats 90 as the target while allowing safe pass-level scores to publish', () => {
    expect(SHOPPING_CONNECT_TARGET_SCORE).toBe(90);
    expect(SHOPPING_CONNECT_PUBLISH_MIN_SCORE).toBe(80);
    expect(canPublishShoppingConnectQuality(83)).toBe(true);
    expect(canPublishShoppingConnectQuality(79)).toBe(false);
  });

  it('records below-floor results as advisory acceptance instead of a quality pass', () => {
    expect(resolveShoppingConnectQualityDisposition(79)).toEqual({
      passed: false,
      qualityFloorReached: false,
      advisoryAccepted: true,
      targetReached: false,
      nearTargetAccepted: false,
    });

    expect(resolveShoppingConnectQualityDisposition(83)).toEqual({
      passed: true,
      qualityFloorReached: true,
      advisoryAccepted: false,
      targetReached: false,
      nearTargetAccepted: true,
    });
  });

  it('uses the active generation threshold and visible body text for length scoring', () => {
    const result = validateShoppingConnectContent({
      bodyPlain: `${'가 '.repeat(800)}구성은 작은 공간에서 활용하기 편한 분에게 맞습니다.`.trim(),
      headings: [
        { title: '구성 확인', content: '구성 설명' },
        { title: '사용 조건', content: '조건 설명' },
        { title: '구매 전 체크', content: '확인 설명' },
      ],
      conclusion: '쇼핑커넥트 활동으로 수수료가 발생할 수 있습니다.',
    }, { minimumBodyChars: 1500 });

    expect(result.score).toBe(100);
  });

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
        { title: '구매 전 확인할 구성', content: `구성은 좁은 공간에서 활용하기 편한 분에게 맞습니다. ${'a'.repeat(850)}` },
        { title: '사용 환경에 맞는 장점', content: 'b'.repeat(900) },
        { title: '비교할 때 놓치기 쉬운 부분', content: 'c'.repeat(900) },
      ],
      conclusion: '쇼핑커넥트 활동으로 수수료가 발생할 수 있습니다.',
    };

    const result = validateShoppingConnectContent(content);

    expect(result.score).toBe(100);
    expect(result.feedback).toContain('✅ 금지 패턴 없음');
  });

  it('keeps disclosure ownership in the publisher while still penalizing thin content', () => {
    const result = validateShoppingConnectContent({
      headings: [{ title: '강력 추천 제품', content: '짧음' }],
      conclusion: '구매 전 확인해보세요.',
    });

    expect(result.score).toBeLessThan(80);
    expect(result.feedback.join('\n')).toContain('발행 설정에서 원문 그대로 별도 삽입');
  });

  it('recognizes the exact user-authored disclosure without asking the model to rewrite it', () => {
    const result = validateShoppingConnectContent({
      bodyPlain: `${'상품 정보 '.repeat(180)}용량 5L라 물을 자주 채우는 번거로움을 줄이는 데 도움이 됩니다.`,
      headings: [
        { title: '공간에 맞는 크기', content: '크기 320mm라 좁은 자리에 두기 편합니다.' },
        { title: '물통 용량', content: '용량 5L라 자주 채우는 번거로움을 줄입니다.' },
        { title: '풍량 선택', content: '풍량 3단이라 상황에 맞춰 조절하기 쉽습니다.' },
      ],
      ftcDisclosure: '[광고] 이 글에는 제휴 링크가 포함될 수 있습니다.',
    }, { minimumBodyChars: 500 });

    expect(result.feedback).toContain('✅ 사용자 설정 공정위 문구 삽입 경로 확인');
  });

  it('does not mistake a model-written body disclosure for the user setting', () => {
    const result = validateShoppingConnectContent({
      bodyPlain: `[광고] 이 글에는 제휴 링크가 포함될 수 있습니다.\n${'상품 정보 '.repeat(180)}용량 5L라 자주 채우는 번거로움을 줄입니다.`,
      headings: [
        { title: '공간에 맞는 크기', content: '크기 320mm라 좁은 자리에 두기 편합니다.' },
        { title: '물통 용량', content: '용량 5L라 자주 채우는 번거로움을 줄입니다.' },
        { title: '풍량 선택', content: '풍량 3단이라 상황에 맞춰 조절하기 쉽습니다.' },
      ],
    }, { minimumBodyChars: 500 });

    expect(result.feedback).toContain('ℹ️ 공정위 문구는 글 생성문이 아닌 발행 설정에서 원문 그대로 별도 삽입');
    expect(result.feedback).not.toContain('✅ 사용자 설정 공정위 문구 삽입 경로 확인');
  });

  it('warns on repetitive verification copy and missing product-to-benefit value links', () => {
    const repetitive = validateShoppingConnectContent({
      bodyPlain: ('상세 페이지에서 확인해야 합니다. 결제 전에 확인해 주세요. 단정하기 어렵습니다. ').repeat(18),
      headings: [
        { title: '가격 확인', content: '상세 페이지에서 확인해 주세요.' },
        { title: '기능 확인', content: '단정하기 어렵습니다.' },
        { title: '조건 확인', content: '결제 전에 확인해 주세요.' },
      ],
      conclusion: '[광고] 이 글에는 제휴 링크가 포함될 수 있습니다.',
    }, { minimumBodyChars: 500 });

    expect(repetitive.score).toBeLessThan(80);
    expect(repetitive.feedback.join('\n')).toContain('확인 안내 반복');
    expect(repetitive.feedback.join('\n')).toContain('생활상 이익 연결 부족');
    expect(repetitive.feedback.join('\n')).not.toContain('쇼핑커넥트 고지 문구 누락');
  });

  it('catches the repetitive caution pattern from the reported sparse shopping article', () => {
    const reportedStyle = validateShoppingConnectContent({
      bodyPlain: `판매 페이지에서 먼저 확인되는 정보는 가격과 상품명입니다. 결제하기보다 상품명 표현을 먼저 나눠서 읽어야 해요. 현재 제공된 상세 정보에는 세부 항목이 적혀 있지 않습니다. 가격은 결제 화면에서 다시 확인해야 합니다. 냉풍기와 이동식 에어컨은 같은 뜻으로 넘기면 안 됩니다. 구매 전에는 상세 페이지에서 기능 설명을 확인해야 합니다. 이 표기 역시 상세 설명을 확인해야 판단할 수 있습니다. 적용 공간은 현재 확인된 정보에 없습니다.`,
      headings: [
        { title: '판매 페이지에서 확인되는 정보', content: '가격과 상품명을 확인합니다.' },
        { title: '같은 뜻으로 넘기면 안 됩니다', content: '상세 페이지 확인이 필요합니다.' },
        { title: '공간 조건을 따로 봅니다', content: '결제 전에 확인합니다.' },
      ],
      ftcDisclosure: '[광고] 이 글에는 제휴 링크가 포함될 수 있습니다.',
    }, { minimumBodyChars: 300 });

    expect(reportedStyle.score).toBeLessThan(80);
    expect(reportedStyle.feedback.join('\n')).toContain('확인 안내 반복');
    expect(reportedStyle.feedback.join('\n')).toContain('생활상 이익 연결 부족');
  });
});
