import { describe, expect, it } from 'vitest';
import { wrapKoreanTitleForThumbnail } from '../image/koreanTitleWrap';

describe('wrapKoreanTitleForThumbnail', () => {
  it('keeps semantic Korean title chunks together for thumbnail text', () => {
    expect(
      wrapKoreanTitleForThumbnail('제습기와 서큘레이터 같이 쓰면 빨래가 더 빨리 마를까?', {
        maxLines: 3,
        maxCharsPerLine: 18,
      }),
    ).toEqual(['제습기와 서큘레이터 같이 쓰면', '빨래가 더 빨리 마를까?']);
  });

  it('does not leave subject particles at the end of the first line when a better split exists', () => {
    const lines = wrapKoreanTitleForThumbnail('에어컨 자동건조 기능 있는데 왜 냄새가 계속 나나요?', {
      maxLines: 3,
      maxCharsPerLine: 18,
    });

    expect(lines[0]).not.toMatch(/[이가은는을를와과]$/);
    expect(lines.join(' ')).toBe('에어컨 자동건조 기능 있는데 왜 냄새가 계속 나나요?');
  });

  it('uses three lines only for long titles', () => {
    expect(
      wrapKoreanTitleForThumbnail('청소 체크리스트로 필터 분리와 송풍팬 먼지 제거까지 한 번에 정리', {
        maxLines: 3,
        maxCharsPerLine: 14,
      }).length,
    ).toBe(3);
  });
});
