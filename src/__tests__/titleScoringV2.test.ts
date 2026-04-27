// Phase 1 Day 6-7 (5 Opus 합의): titleSelector v2.7.17 회귀 테스트.
// scoreTitles의 8가지 신규 검증이 정확히 동작하는지 모드별 골든셋으로 검증.

import { describe, it, expect } from 'vitest';
import { scoreTitles, type TitleMode } from '../titleSelector';

const mk = (id: number, text: string) => ({ id, text, score: 0, reasons: [] });

describe('scoreTitles v2.7.17 — 5 Opus 합의 검증', () => {
  describe('1. 모드별 자수 (LENGTH_RULES)', () => {
    it('SEO: 25~40자 최적 +15점', () => {
      const r = scoreTitles([mk(1, '신혼집 인테리어 견적 받기 전 확인할 다섯 가지')], 'seo')[0];
      expect(r.reasons.some((x) => x.includes('최적 자수(seo'))).toBe(true);
    });

    it('홈판: 28~42자 최적 +15점', () => {
      const r = scoreTitles([mk(1, '라미네이트 했다가 평생 후회한 진짜 사례 모음 다섯 가지 정리')], 'homefeed')[0];
      expect(r.reasons.some((x) => x.includes('최적 자수(homefeed'))).toBe(true);
    });

    it('자수 위반(50자 초과) -30점', () => {
      const r = scoreTitles([mk(1, '아주 매우 길고 길고 매우매우 길어서 자수를 한참 초과한 의미 없는 무한정 길어지는 제목 예시 끝나지 않는 제목')], 'homefeed')[0];
      expect(r.reasons.some((x) => x.includes('자수 위반'))).toBe(true);
    });
  });

  describe('2. 빈 수식어 블랙리스트 (즉시 0점)', () => {
    const cases = [
      '효과가 좋은 다이어트 핵심 포인트',
      '필라테스 결정적 이유',
      '이거 진짜 놀라운 변화 가져옴',
      '운동의 완벽 정리',
      '대박 효과 가져온 운동',
    ];
    cases.forEach((text) => {
      it(`"${text}" → 0점`, () => {
        const r = scoreTitles([mk(1, text)], 'homefeed')[0];
        expect(r.score).toBe(0);
        expect(r.reasons.some((x) => x.includes('빈 수식어'))).toBe(true);
      });
    });
  });

  describe('3. 금지 어미 (즉시 0점)', () => {
    const cases = [
      '강남 필라테스 진짜 뜨거워요',
      '이번 효과 정말 예상돼요',
      '최근 운동 화제예요',
      '검색해도 정리해보겠습니다',
    ];
    cases.forEach((text) => {
      it(`"${text}" → 0점`, () => {
        const r = scoreTitles([mk(1, text)], 'homefeed')[0];
        expect(r.score).toBe(0);
      });
    });
  });

  describe('4. 광고법 위반 (Business 즉시 0점)', () => {
    it('"100% 만족 보장" → Business 0점', () => {
      const r = scoreTitles([mk(1, '강남 인테리어 100% 만족 보장 시공')], 'business')[0];
      expect(r.score).toBe(0);
      expect(r.reasons.some((x) => x.includes('광고법'))).toBe(true);
    });

    it('"업계 1위" → Business 0점', () => {
      const r = scoreTitles([mk(1, '서울 ○○세무사 업계 1위 환급 전문가')], 'business')[0];
      expect(r.score).toBe(0);
    });

    it('SEO 모드에서는 같은 표현이 0점 아님 (Business 전용)', () => {
      const r = scoreTitles([mk(1, '서울 ○○세무사 업계 1위 환급 전문가')], 'seo')[0];
      expect(r.score).toBeGreaterThan(0);
    });
  });

  describe('5. 어미 다양성 (5개 후보 비교)', () => {
    it('같은 어미 2개 이상 → 충돌 -30', () => {
      const titles = [
        mk(1, '필라테스 다녀온 결과 진짜 달랐다'),
        mk(2, '요가 일주일 해본 결과 완전 달랐다'),
        mk(3, '러닝 시작하고 한 달 뒤 달랐다'),
        mk(4, '걷기만 했는데 의외로 좋았다'),
        mk(5, '운동 안 하니 몸이 무너졌다'),
      ];
      const r = scoreTitles(titles, 'homefeed');
      const conflicting = r.filter((t) => t.reasons.some((x) => x.includes('어미 충돌')));
      expect(conflicting.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('6. 홈판 폭발 감정 단어 -50 (Reviewer C4 핵심)', () => {
    it('"충격" 단어 → -50점', () => {
      const r = scoreTitles([mk(1, '강남 필라테스 가서 충격적인 사실 알았어요')], 'homefeed')[0];
      expect(r.reasons.some((x) => x.includes('홈판 금지 폭발 감정'))).toBe(true);
    });

    it('SEO 모드에서는 감정 단어 페널티 없음', () => {
      const r = scoreTitles([mk(1, '강남 필라테스 가서 충격적인 사실 알았어요')], 'seo')[0];
      expect(r.reasons.some((x) => x.includes('홈판 금지'))).toBe(false);
    });
  });

  describe('7. 인지 함정 (홈판/어필 +15)', () => {
    it('"따로 있었다" 함정 → 가점', () => {
      const r = scoreTitles([mk(1, '필라테스 효과 좋은 사람의 비밀 따로 있었다')], 'homefeed')[0];
      expect(r.reasons.some((x) => x.includes('인지 함정 1개'))).toBe(true);
    });

    it('홈판에서 함정 0개 → -20', () => {
      const r = scoreTitles([mk(1, '강남 필라테스 가격 알아보기')], 'homefeed')[0];
      expect(r.reasons.some((x) => x.includes('인지 함정 0개'))).toBe(true);
    });

    it('SEO 모드에서는 함정 페널티 없음', () => {
      const r = scoreTitles([mk(1, '강남 필라테스 가격 알아보기')], 'seo')[0];
      expect(r.reasons.some((x) => x.includes('인지 함정'))).toBe(false);
    });
  });

  describe('8. AI 못 대체 4영역 (홈판/어필 +20)', () => {
    it('"써본" 체험 키워드 → +10~20', () => {
      const r = scoreTitles([mk(1, '안마의자 두 달 써본 진짜 후기 정리')], 'homefeed')[0];
      expect(r.reasons.some((x) => x.includes('AI 못대체'))).toBe(true);
    });

    it('"평생 후회" 공감서사 → +10~20', () => {
      const r = scoreTitles([mk(1, '라미네이트 했다가 평생 후회한 사례 모음')], 'homefeed')[0];
      expect(r.reasons.some((x) => x.includes('AI 못대체'))).toBe(true);
    });

    it('Business 모드는 가점 없음', () => {
      const r = scoreTitles([mk(1, '안마의자 두 달 써본 진짜 후기 정리')], 'business')[0];
      expect(r.reasons.some((x) => x.includes('AI 못대체'))).toBe(false);
    });
  });

  describe('9. 가운뎃점/세미콜론 즉시 0점', () => {
    it('"·" 가운뎃점 → 0점', () => {
      const r = scoreTitles([mk(1, '강남·역삼 필라테스 추천 다섯 가지')], 'homefeed')[0];
      expect(r.score).toBe(0);
    });
  });

  describe('10. 종합 — 영상 권장 vs 비권장 제목 비교', () => {
    it('영상 권장 패턴 > 영상 비권장 패턴', () => {
      const recommended = mk(1, '라미네이트 했다가 평생 후회한 사례 모음 정리');
      const notRecommended = mk(2, '치아 라미네이트 부작용 핵심 포인트');
      const [r1, r2] = scoreTitles([recommended, notRecommended], 'homefeed');
      expect(r1.score).toBeGreaterThan(r2.score);
      expect(r2.score).toBe(0); // 빈 수식어로 0점
    });

    it('Business 권장 (구체 숫자) > 비권장 (추상)', () => {
      const recommended = mk(1, '강남 ○○인테리어 시공 1,200건 30평 견적');
      const notRecommended = mk(2, '강남 ○○인테리어 100% 만족 보장 시공');
      const [r1, r2] = scoreTitles([recommended, notRecommended], 'business');
      expect(r1.score).toBeGreaterThan(0);
      expect(r2.score).toBe(0); // 광고법 위반
    });
  });
});

describe('scoreTitles v2.7.17 — 회귀 방지 (Phase 1 Day 6-7)', () => {
  it('mode 파라미터 미지정 시 homefeed 폴백 (호환성)', () => {
    const r = scoreTitles([mk(1, '라미네이트 했다가 평생 후회한 사례 모음 정리')]);
    expect(r[0].score).toBeGreaterThan(0);
  });

  it('빈 배열 처리', () => {
    const r = scoreTitles([], 'seo');
    expect(r).toEqual([]);
  });

  it('점수 0~100 범위 보장 (clamp)', () => {
    const r = scoreTitles([mk(1, '핵심 포인트 가져오는 결정적 이유')], 'homefeed');
    expect(r[0].score).toBeGreaterThanOrEqual(0);
    expect(r[0].score).toBeLessThanOrEqual(100);
  });
});
