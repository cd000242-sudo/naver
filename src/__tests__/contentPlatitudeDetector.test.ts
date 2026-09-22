import { describe, expect, it } from 'vitest';
import { detectPlatitudes } from '../contentPlatitudeDetector';

/**
 * [2026-09-22 SPEC — 일반론 트리거 축소] '~할 수 있습니다', '~하는 게 좋습니다', '다양한',
 * '여러 가지', '보통', '일반적으로', '흔히', '대체로' 는 평범한 한국어 서술 표현이라 트리거
 * 목록에서 뺐다. MAX_PLATITUDE_HITS 도 3 → 5로 올렸다.
 */
describe('detectPlatitudes — 트리거 축소', () => {
  it('제거된 평범한 서술 패턴은 반복해도 플래그되지 않는다', () => {
    const r = detectPlatitudes({
      introduction: '이 방법은 도움이 될 수 있습니다. 저 방법도 쓸 수 있습니다. 그 방법도 될 수 있습니다.',
      headings: [
        { title: '방법1', body: '해보는 게 좋습니다. 이렇게 하는 게 좋습니다.' },
        { title: '방법2', body: '다양한 선택지가 있습니다. 여러 가지로 시도할 수 있습니다.' },
      ],
    });
    expect(r.exceedsThreshold).toBe(false);
    expect(r.platitudeHitCount).toBe(0);
  });

  it('진짜 도망성 상투구가 여러 번 반복되면 임계를 넘는다', () => {
    const r = detectPlatitudes({
      introduction: '참고하시기 바랍니다.',
      headings: [
        { title: '섹션', body: '도움이 되셨길 바랍니다. 많은 분들이 궁금해하실 내용입니다. 이상으로 마치겠습니다.' },
      ],
      conclusion: '여기까지 읽어주셔서 감사합니다.',
    });
    expect(r.platitudeHitCount).toBeGreaterThan(5);
    expect(r.exceedsThreshold).toBe(true);
  });

  it('sectionHits는 섹션별 트리거 수를 보고한다', () => {
    const r = detectPlatitudes({
      headings: [
        { title: '깨끗한 섹션', body: '접수는 온라인으로 진행됩니다. 마감은 9월 30일입니다.' },
        { title: '지저분한 섹션', body: '참고하시기 바랍니다. 도움이 되셨길 바랍니다.' },
      ],
    });
    expect(r.sectionHits).toEqual([
      { heading: '깨끗한 섹션', hits: 0 },
      { heading: '지저분한 섹션', hits: 2 },
    ]);
  });

  it('overlapTooLow는 정보성 플래그이며 단독으로 exceedsThreshold를 켜지 않는다', () => {
    const ragSource = '9월 1일부터 청년월세지원 2차 접수가 시작됐다. '.repeat(5);
    const r = detectPlatitudes(
      { introduction: '완전히 관계없는 이야기를 늘어놓습니다 오늘 점심은 맛있었습니다 날씨도 좋았습니다' },
      { ragSource },
    );
    expect(r.overlapTooLow).toBe(true);
    expect(r.exceedsThreshold).toBe(false);
  });
});
