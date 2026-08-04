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

  // [2026-08-04] 사용자 신고: 발행된 글 본문에 "[이미지 설명]"이 그대로 노출됨.
  // LLM이 imagePrompt 필드 대신 본문 안에 이미지 지시문을 쓰는 누출 — 앱 내부
  // 사정은 발행물에 절대 노출 금지.
  describe('[이미지 설명] 지시문 누출 차단', () => {
    it('마커로 시작하는 줄은 지시문 텍스트까지 통째로 제거한다', () => {
      const out = stripInternalMarkers(
        '첫 문단입니다.\n[이미지 설명] 밝은 조명의 경기장 전경, 관중석이 가득 찬 모습\n둘째 문단입니다.',
      );
      expect(out).not.toContain('이미지 설명');
      expect(out).not.toContain('경기장 전경');
      expect(out).toBe('첫 문단입니다.\n\n둘째 문단입니다.');
    });

    it('변형 마커도 잡는다 — [사진 설명] / [이미지 프롬프트: ...] / (이미지 삽입)', () => {
      for (const line of [
        '[사진 설명] 카페 내부 좌석',
        '[이미지 프롬프트: 단계별 흐름도 그래픽]',
        '(이미지 삽입) 제품 클로즈업',
        '【이미지 묘사】 겨울 바다',
      ]) {
        const out = stripInternalMarkers(`본문 시작.\n${line}\n본문 끝.`);
        expect(out, line).not.toMatch(/이미지|사진/);
      }
    });

    it('문장 중간에 낀 브래킷 마커는 마커만 제거하고 문장은 보존한다', () => {
      const out = stripInternalMarkers('대기 시간은 40분이었다. [이미지 설명] 그래서 예약을 추천한다.');
      expect(out).not.toContain('[이미지 설명]');
      expect(out).toContain('대기 시간은 40분이었다.');
      expect(out).toContain('그래서 예약을 추천한다.');
    });

    it('정상 본문의 "이미지"/"사진" 단어는 건드리지 않는다', () => {
      const body = '프로필 사진을 바꾸는 방법은 설정에서 이미지 업로드를 누르면 된다.';
      expect(stripInternalMarkers(body)).toBe(body);
    });

    it('줄 삭제로 생긴 3연속 빈 줄은 2줄로 정리된다', () => {
      const out = stripInternalMarkers('가\n\n[이미지 설명] 지시문\n\n나');
      expect(out).toBe('가\n\n나');
    });
  });
});
