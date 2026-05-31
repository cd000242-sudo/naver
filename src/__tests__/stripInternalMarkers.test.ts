import { describe, it, expect } from 'vitest';
import { stripInternalMarkers } from '../contentGenerator';

// [발행 안전] 내부 프롬프트 마커는 발행물에 절대 노출되면 안 된다(= AI 작성 광고).
// stripInternalMarkers가 [자료N]·[원본 텍스트]·[Article Content]를 본문에서 제거함을 보장한다.
describe('stripInternalMarkers — 발행물 마커 절대 노출 금지', () => {
  it('[원본 텍스트] 마커 제거 (앞 공백까지)', () => {
    const out = stripInternalMarkers('수국은 6월에 핀다 [원본 텍스트]. 다음 문장.');
    expect(out).not.toContain('[원본 텍스트]');
    expect(out).toBe('수국은 6월에 핀다. 다음 문장.');
  });

  it('[원본 텍스트] 줄 단독으로 들어가도 제거', () => {
    const out = stripInternalMarkers('첫 문단입니다.\n[원본 텍스트]\n둘째 문단입니다.');
    expect(out).not.toContain('[원본 텍스트]');
    expect(out).not.toContain('원본 텍스트');
  });

  it('[Article Content] 영문 마커 제거 (대소문자 무관)', () => {
    expect(stripInternalMarkers('본문 [Article Content] 끝')).not.toContain('Article Content');
    expect(stripInternalMarkers('본문 [article content] 끝')).not.toContain('article content');
  });

  it('[자료]/[자료N] 인용 토큰 제거 (기존 동작 유지)', () => {
    const out = stripInternalMarkers('가격은 만원이다 [자료3]. 추천한다 [자료].');
    expect(out).toBe('가격은 만원이다. 추천한다.');
  });

  it('마커 여러 개 혼재해도 전부 제거', () => {
    const out = stripInternalMarkers('A [원본 텍스트] B [자료1] C [Article Content] D');
    expect(out).not.toMatch(/\[원본 텍스트\]|\[자료\d*\]|\[Article Content\]/i);
  });

  it('마커 없는 정상 본문은 그대로 유지', () => {
    const body = '6월 수국 명소는 휴애리, 카멜리아힐이 유명하다. 입장료는 1만3천원이다.';
    expect(stripInternalMarkers(body)).toBe(body);
  });

  it('문자열이 아니면 그대로 반환 (방어)', () => {
    expect(stripInternalMarkers(undefined as any)).toBe(undefined);
    expect(stripInternalMarkers(null as any)).toBe(null);
  });
});
