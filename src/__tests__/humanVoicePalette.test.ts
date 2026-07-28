import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import { auditAffiliateAuthenticity } from '../content/affiliateAuthenticity';

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

  it('전 모드 strong 휴머나이즈 + 거든요 계열 어미 사전 확장', () => {
    const policy = read('contentHumanizationPolicy.ts');
    expect(policy).toContain("return 'strong'");
    expect(policy).not.toMatch(/return 'light'/);
    const humanizer = read('aiHumanizer.ts');
    expect(humanizer).toContain("'있거든요'");
    expect(humanizer).toContain("'하거든요'");
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

  it('후처리 지터+서브셋: 고정 확률·전체 풀 재사용 지문을 깬다', () => {
    const humanizer = read('aiHumanizer.ts');
    expect(humanizer).toMatch(/jitter\(intensity === 'strong' \? 0\.28 : 0\.18\)/);
    expect(humanizer).toContain('samplePhraseSubset(PERSONAL_EXPRESSIONS_SAFE_INSERT, 4)');
    expect(humanizer).toContain('samplePhraseSubset(INTERJECTIONS, 4)');
  });
});
