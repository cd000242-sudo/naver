import { describe, it, expect } from 'vitest';
import {
  getPersonaProfile,
  injectExtendedExperience,
  assessContentQuality,
} from '../authgrDefense';

describe('getPersonaProfile', () => {
  it('알려진 카테고리에 맞는 프로필을 반환한다', () => {
    const tech = getPersonaProfile('tech');
    expect(tech.category).toBe('tech');
    expect(tech.signatureExpressions.length).toBeGreaterThan(0);
  });

  it('알 수 없는 카테고리는 general로 폴백한다', () => {
    const unknown = getPersonaProfile('xyz_unknown');
    expect(unknown.category).toBe('general');
  });

  it('모든 프로필에 필수 필드가 있다', () => {
    for (const cat of ['tech', 'health', 'food', 'travel', 'lifestyle', 'general']) {
      const profile = getPersonaProfile(cat);
      expect(profile.expertiseYears).toBeTruthy();
      expect(profile.credentialHint).toBeTruthy();
      expect(profile.writingStyle).toBeTruthy();
      expect(profile.signatureExpressions.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('injectExtendedExperience', () => {
  const content = `도입부입니다. 이 제품을 소개합니다.

첫 번째 단락: 이 제품의 장점은 매우 많습니다. 내구성이 뛰어나고 디자인도 좋습니다.

두 번째 단락: 가격 대비 성능이 뛰어납니다. 합리적인 가격대입니다.

세 번째 단락: 배송도 빠르고 포장도 깔끔했습니다. AS 대응도 좋습니다.

네 번째 단락: 몇 가지 아쉬운 점도 있지만 전반적으로 만족합니다.

결론: 전체적으로 추천할 만한 제품입니다.`;

  it('확장 경험 패턴을 주입한다', () => {
    const result = injectExtendedExperience(content, 'tech', 3);
    expect(result.injectedCount).toBeGreaterThanOrEqual(0);
    expect(result.injectedCount).toBeLessThanOrEqual(3);
  });

  it('짧은 콘텐츠에는 주입하지 않는다', () => {
    const result = injectExtendedExperience('짧은 글\n\n끝', 'tech');
    expect(result.injectedCount).toBe(0);
  });
});

describe('assessContentQuality', () => {
  it('고품질 콘텐츠에 pass를 반환한다', () => {
    const goodContent = `
직접 사용해보니 이 무선 이어폰의 음질이 정말 뛰어나더라고요.

실제로 3개월째 매일 출퇴근길에 사용 중인데, 노이즈 캔슬링이 체감 성능이 좋습니다.
배터리도 공식 스펙대로 8시간은 거뜬히 가요. 개인적으로 느낀 점은 저음이 풍부하면서도 고음이 깨끗하다는 거예요.

솔직히 아쉬운 점을 꼽자면 케이스가 좀 두꺼워요. 주머니에 넣으면 볼록하게 튀어나옵니다.
하지만 음질과 배터리를 감안하면 가성비는 확실합니다.

직접 비교해본 결과, 같은 가격대 경쟁 제품보다 확실히 한 수 위예요.
추천하냐는 질문에는 "네"라고 자신 있게 답할 수 있습니다.
    `;
    const result = assessContentQuality(goodContent, 'tech');
    expect(result.overallQuality).toBeGreaterThanOrEqual(0);
    expect(['pass', 'borderline', 'regenerate']).toContain(result.verdict);
    expect(result.suggestions).toBeDefined();
  });

  it('AI 같은 콘텐츠에 낮은 점수를 반환한다', () => {
    const aiContent = Array(15)
      .fill('이 제품은 매우 좋은 제품입니다. 다양한 기능이 있습니다. 추천합니다.')
      .join('\n\n');
    const result = assessContentQuality(aiContent);
    expect(result.overallQuality).toBeLessThan(80);
    expect(result.fingerprint.overallRisk).toBeGreaterThan(20);
  });

  it('verdict가 올바른 범위 내에 있다', () => {
    const result = assessContentQuality('짧은 테스트 텍스트');
    expect(['pass', 'borderline', 'regenerate']).toContain(result.verdict);
  });

  it('필수 필드가 모두 존재한다', () => {
    const result = assessContentQuality('테스트 콘텐츠입니다.');
    expect(typeof result.fingerprint).toBe('object');
    expect(typeof result.expertiseScore).toBe('number');
    expect(typeof result.experienceScore).toBe('number');
    expect(typeof result.overallQuality).toBe('number');
    expect(typeof result.verdict).toBe('string');
    expect(Array.isArray(result.suggestions)).toBe(true);
  });
});
