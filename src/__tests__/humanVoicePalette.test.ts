import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import { auditAffiliateAuthenticity } from '../content/affiliateAuthenticity';
import { humanizeContent } from '../aiHumanizer';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-07-30] 사용자 지시 잠금: "휴머나이저는 사람보다 더 사람처럼, 차단 금지".
 *
 * ~해요/~합니다 단조 어미(라이브 실측)의 원인이던 3중 억제를 해제한 계약:
 * (1) 어미 팔레트 의무 (프롬프트), (2) 구어 종결 감점 해제 (쇼핑 감사),
 * (3) 전달형 "~라고 하더라구요" 개방 — 단 체험 위장("써보니 좋더라구요")은 불변 금지.
 */
describe('human voice palette (구어체 개방)', () => {
  it('어미 팔레트가 의무 규칙 + 전달형 허용 + 위장 금지 + 구어 철자 보존을 담는다', () => {
    const prompt = read('prompts/shared/human-writing-anti-pattern.prompt');
    expect(prompt).toContain('[어미 팔레트 — 필수]');
    expect(prompt).toContain('~잖아요');
    expect(prompt).toContain('~라고 하더라구요');
    expect(prompt).toContain('전달 어미다');
    expect(prompt).toContain('체험으로 위장하는 데는 쓰지 않는다');
    expect(prompt).toContain('구어 철자(더라구요, 하려구요)는 표준 철자로 교정하지 말고');
    // 억제문 재도입 금지
    expect(prompt).not.toContain('거든요/잖아요/더라고요는 양념');
  });

  it('쇼핑 감사: 구어 종결(거든요/잖아요/더라고요)은 몇 번 나와도 감점하지 않는다', () => {
    const body = Array.from({ length: 10 }, (_, i) =>
      `이 부분은 설치 공간을 먼저 재야 하거든요. 규격이 다르면 못 쓰잖아요. 구매자들이 조용해졌다고 하더라고요. (${i})`,
    ).join(' ');
    const report = auditAffiliateAuthenticity({
      title: '공기청정기 고르기 전 확인할 3가지',
      body,
      evidenceMode: 'review_synthesis',
    });
    expect(report.issues.some(i => i.code === 'CONVERSATIONAL_OVERACTING')).toBe(false);
  });

  it('과장 추임새(진짜/완전/대박)는 임계 초과 시 여전히 advisory 감점 (차단 아님)', () => {
    const body = Array.from({ length: 14 }, () => '진짜 완전 대박인 제품이에요.').join(' ');
    const report = auditAffiliateAuthenticity({
      title: '공기청정기 후기',
      body,
      evidenceMode: 'review_synthesis',
    });
    const issue = report.issues.find(i => i.code === 'CONVERSATIONAL_OVERACTING');
    expect(issue).toBeDefined();
    expect(issue?.hard).toBe(false); // 감점만, 문장 삭제·발행 차단 없음
  });

  // [2026-09-22 SPEC — 후처리 결정론화, supersedes 2026-07-30 지시] "전 모드 무조건 strong"
  // 정책은 resolveHumanizeIntensity가 항상 'light'를 기본값으로 반환하고 configured 인자로만
  // 'strong'을 켜는 방식으로 바뀌었다. '거든요' 계열은 diversifyEndings(무작위 어미 치환,
  // FORMAL_TO_CASUAL)에서만 등장했는데 그 함수 자체가 Math.random 기반이라 제거됐다 —
  // 이제 aiHumanizer.ts에 남은 어미 변주(diversifyConsecutiveEndings)는 반복 방지용으로
  // 결정론적 ENDING_VARIATIONS/FORMAL_ENDING_VARIATIONS 맵만 쓴다(거든요 계열 없음).
  it('기본값은 light이고, 강한 강도는 configured로 명시해야 한다', () => {
    const policy = read('contentHumanizationPolicy.ts');
    expect(policy).toContain("return 'light'");
    const humanizer = read('aiHumanizer.ts');
    expect(humanizer).not.toContain('Math.random');
  });

  it('보이스 프로필: 글마다 다른 목소리를 뽑고 시드가 다르면 조합이 달라진다', async () => {
    const { sampleVoiceProfile, buildVoiceProfileBlock } = await import('../contentVoiceProfile');
    const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
    const a = sampleVoiceProfile(seq([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]));
    const b = sampleVoiceProfile(seq([0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]));
    expect(a.casualShare).toBeGreaterThanOrEqual(15);
    expect(a.casualShare).toBeLessThanOrEqual(35);
    expect(a.signatureEndings.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b)); // 시드 다르면 목소리 다름
    const block = buildVoiceProfileBlock(a);
    expect(block).toContain('[VOICE PROFILE');
    expect(block).toContain(`${a.casualShare}%`);
    expect(block).toContain('다른 글에서 쓰던 습관을 이 글에 복사하지 않는다');
  });

  it('보이스 프로필이 생성 프롬프트(user 파트 랜덤 구역)에 주입된다', () => {
    const jsonFormat = read('contentJsonPromptFormat.ts');
    // 캐시 무효화 전례(v1.4.18) 때문에 랜덤 블록은 구조 지시문과 같은 구역에만 둔다
    expect(jsonFormat).toContain('buildVoiceProfileBlock(sampleVoiceProfile())');
    const loader = read('promptLoader.ts');
    expect(loader).not.toContain('buildVoiceProfileBlock');
  });

  // [2026-09-22 SPEC — 후처리 결정론화] "글마다 확률을 ±30% 흔드는 지터"와 "서브셋 랜덤
  // 샘플링"은 둘 다 Math.random 기반이라 제거 대상이었다(같은 입력 → 다른 출력이라
  // 회귀 테스트가 불안정했고, 개인 표현/감탄사 삽입은 자료에 없는 체험을 무작위로
  // 지어낼 위험이 있었다). 이제 humanizeContent는 결정론적이다 — 같은 입력은 항상
  // 같은 출력을 낸다.
  it('결정론적 후처리: 같은 입력은 항상 같은 출력을 낸다(랜덤 지터/서브셋 제거)', () => {
    const humanizer = read('aiHumanizer.ts');
    expect(humanizer).not.toContain('Math.random');
    expect(humanizer).not.toContain('samplePhraseSubset');

    const body = '안녕하세요. 오늘은 이 제품을 소개해드리겠습니다. 물론 확실히 중요한 점은 이겁니다.';
    const outputs = new Set<string>();
    for (let i = 0; i < 20; i++) {
      outputs.add(humanizeContent(body, 'strong', true, 'community_fan'));
    }
    expect(outputs.size).toBe(1);
  });
});
