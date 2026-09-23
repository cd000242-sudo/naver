// SPEC-NAVER-IMAGE-2026 — number phrase for a thumbnail card, and the cover direction.
import { describe, expect, it } from 'vitest';
import { HOOK_MAX_CHARS, extractThumbnailHook } from '../image/director/thumbnailHook';
import { chooseThumbnailDirection, coverDirectionLines } from '../image/director/thumbnailStrategy';

describe('extractThumbnailHook', () => {
  it('takes the number and its nearest meaningful words, within the card length', () => {
    expect(extractThumbnailHook('나나를 되레 고소한 집 강도범, 항소심에서도 징역 10년 구형')?.main).toBe('징역 10년 구형');
    expect(extractThumbnailHook('출고가 420만원 차이, 보조금 받으면 줄어든다')?.main).toBe('출고가 420만원 차이');
  });

  it('strips particles from the number word and unfinished endings from edge words', () => {
    const hook = extractThumbnailHook('검찰이 다시 10년을 요구하며 짚은 범행 이후의 행동');
    expect(hook?.main).not.toMatch(/10년을/);
    expect(hook?.main).not.toMatch(/하며$/);
    expect(hook?.main).toContain('10년');
  });

  it('never exceeds the card length', () => {
    const hook = extractThumbnailHook('아주아주긴단어하나 그리고또긴단어 3,800만원 이상 받는사람들만해당되는이야기');
    expect(hook).not.toBeNull();
    expect(hook!.main.length).toBeLessThanOrEqual(HOOK_MAX_CHARS);
  });

  it('ignores bare years and returns null without a number', () => {
    expect(extractThumbnailHook('양수진 마담 논란, 폐업증명서와 2013년 판결문에는 무엇이 적혔나')).toBeNull();
    expect(extractThumbnailHook('전세 계약 전 확인할 것')).toBeNull();
  });

  it('falls back to the card promise when the title has no number', () => {
    expect(extractThumbnailHook('보조금 넣으면 달라지는 것', '두 트림 차이가 334만원으로 줄어든다')?.main).toContain('334만원');
  });

  it('keeps dates and percentages', () => {
    expect(extractThumbnailHook('항소심 선고는 10월 22일')?.main).toContain('10월 22일');
    expect(extractThumbnailHook('전기요금 30% 아끼는 법')?.main).toContain('30%');
  });
});

describe('chooseThumbnailDirection / coverDirectionLines', () => {
  it('picks comparison, problem, numeric, then literal reconstruction', () => {
    expect(chooseThumbnailDirection('셀토스 두 트림 차이')).toBe('comparison');
    expect(chooseThumbnailDirection('출고가 4200만원, 보조금 받으면 3866만원')).toBe('comparison');
    expect(chooseThumbnailDirection('나나를 고소한 강도범 논란')).toBe('problem-scene');
    expect(chooseThumbnailDirection('청년월세 20만원 받는 법')).toBe('numeric');
    expect(chooseThumbnailDirection('제주 봄 산책길')).toBe('real-reconstruct');
  });

  it('cover lines carry the card promise, the feed-size rule, and the real-person rule', () => {
    const lines = coverDirectionLines('numeric', { titleBandPlanned: true, cardPromise: '보조금 넣으면 "334만원" 차이' });
    expect(lines[0]).toContain("'334만원'");
    expect(lines.join(' ')).toContain('about 200px wide');
    expect(lines.join(' ')).toContain('bottom third');
    expect(lines.join(' ')).toContain('lookalike');
  });

  it('no title band → no bottom-third rule; no promise → no promise line', () => {
    const lines = coverDirectionLines('real-reconstruct', { titleBandPlanned: false });
    expect(lines.join(' ')).not.toContain('bottom third');
    expect(lines[0]).not.toContain('make this one point obvious');
  });
});
