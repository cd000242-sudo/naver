import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import { buildSituationTitleContract } from '../content/situationTitleContract';
import { buildAffiliateTitleEvidenceDirective } from '../content/affiliateAuthenticity';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-07-31] 제목 공식 폐기 → 상황·경험 기준 전환.
 *
 * 사용자 지시: "홈판제목/seo제목 두 가지가 있고 예전 공식은 다 필요없어.
 * 요즘은 상황이나 실제 경험이 들어간 제목이 먹히는 시대야. 쇼핑커넥트모드도 마찬가지."
 */
describe('situation title contract', () => {
  it('세 모드 모두 공식 폐기 선언 + 상황 조각을 필수로 요구한다', () => {
    for (const mode of ['seo', 'homefeed', 'affiliate', 'other'] as const) {
      const c = buildSituationTitleContract(mode, {});
      expect(c, mode).toContain('제목 공식은 버린다');
      expect(c, mode).toContain('[상황 조각 — 필수]');
      // 옛 공식 계열을 이름으로 금지
      expect(c, mode).toContain('숫자 리스트형');
      expect(c, mode).toContain('비밀 공개형');
      expect(c, mode).toContain('총정리형');
    }
  });

  /**
   * [2026-08-05 결정 변경] 생성 단계의 앞 3자 강제를 폐기했다.
   *
   * 이전 계약은 SPEC-KEYWORD-ENDGAME(v2.11.87~90)의 "제목 앞 3자 배치"였는데,
   * 같은 프롬프트 안의 base R0-1(`첫 3글자나 고정 위치로 옮기지 않는다`),
   * contentJsonPromptFormat(`첫 3글자로 강제 이동하지 않는다`),
   * evidenceIntegrity(최후미·자기 상위 선언)와 정면으로 충돌했다.
   *
   * 폐기 근거 3가지:
   *  1. 앱 자신이 이미 강등해 뒀다 — 항상 주입되는 official-exposure-rubric 첫 줄:
   *     "This block has higher priority than older keyword-density, title-formula …"
   *  2. 삭제해도 동작이 안 바뀐다 — evidenceIntegrity 가 최후미에서 이미 무효화 중이라
   *     실질 동작은 이미 "자연스러운 위치"였다.
   *  3. 죽은 채 두면 오히려 해롭다 — base.prompt 가 SEO 시스템 프롬프트의 약 75%이고
   *     저비용 모델은 recency 뿐 아니라 반복 빈도에도 반응한다. 진 문장이 base 에
   *     남아 있으면 반복 횟수로는 진 쪽이 이긴다.
   *
   * 키워드를 반드시 맨 앞에 두고 싶을 때는 사용자 옵션이 담당한다 —
   * "키워드 제목 앞 배치" 체크박스가 켜지면 contentGeneration.ts:1251 이
   * 생성된 제목 앞에 키워드를 붙인다(발행 단계, 생성 단계 아님).
   */
  it('SEO는 키워드 위치를 R0-1에 맡긴다 (생성 단계 앞 3자 강제 폐기)', () => {
    const c = buildSituationTitleContract('seo', {});
    expect(c).not.toContain('메인 키워드는 제목 맨 앞에 그대로 둔다');
    expect(c).toMatch(/R0-1|첫 3글자나 고정 위치로 옮기지 않는다/);
    // 상황을 앞세우려고 키워드를 밀어내는 것은 여전히 막는다.
    expect(c).toContain('키워드를 뒤로 밀어내면서까지 상황을 앞세우지 마라');
  });

  it('홈판은 키워드 강제 배치를 하지 않는다 (검색어 매칭 대상이 아님)', () => {
    const c = buildSituationTitleContract('homefeed', {});
    expect(c).toContain('키워드를 억지로 앞으로 끌어오지 마라');
    expect(c).not.toContain('메인 키워드는 제목 맨 앞에 그대로 둔다');
  });

  it('쇼핑은 구매 갈림길을 요구하고 TOP5·한정·보장 문형을 금지한다', () => {
    const c = buildSituationTitleContract('affiliate', {});
    expect(c).toContain('구매 직전에 갈리는 지점');
    expect(c).toContain('추천 TOP5');
    expect(c).toContain('품절 임박');
  });

  it('경험형 제목은 경험 메모가 있을 때만 열린다 (날조 차단)', () => {
    const withMemo = buildSituationTitleContract('homefeed', {
      personalExperience: '3개월 써보고 느낀 점을 적어둔 메모',
    });
    expect(withMemo).toContain('[경험형 열림]');
    expect(withMemo).toContain('메모에 실제로 있는 사실만');

    const grounded = buildSituationTitleContract('homefeed', { rawText: '자료 원문입니다. '.repeat(30) });
    expect(grounded).toContain('[경험형 잠김 — 상황형으로 간다]');
    expect(grounded).toContain('체험 후킹을 제목에 쓰면 계약 위반');
    expect(grounded).not.toContain('[경험형 열림]');

    const thin = buildSituationTitleContract('homefeed', {});
    expect(thin).toContain('[경험형 잠김 — 좁게 간다]');
    expect(thin).not.toContain('[경험형 열림]');
  });

  it('상황 없는 제목 형태를 명시적으로 금지한다', () => {
    const c = buildSituationTitleContract('seo', {});
    for (const banned of ['총정리', '완벽 가이드', '알아보기']) {
      expect(c, banned).toContain(banned);
    }
    expect(c).toContain('AI 요약이 이미 답한 자리');
  });
});

describe('situation title wiring', () => {
  const gen = read('contentGenerator.ts');

  it('프롬프트 조립에 실제로 붙는다 (죽은 계약 재발 방지)', () => {
    expect(gen).toContain("import { buildSituationTitleContract } from './content/situationTitleContract.js'");
    expect(gen).toContain('const situationTitle = usesIssueStoryTitle');
    expect(gen).toMatch(/\$\{situationTitle \? `\\n\\n\$\{situationTitle\}` : ''\}/);
  });

  it('홈판 이슈픽은 인용 훅 골격을 유지한다 (제3자 사건에 "내 상황" 강요 금지)', () => {
    expect(gen).toContain('const usesIssueStoryTitle = contentMode === \'homefeed\'');
    expect(gen).toContain('HOMEFEED_ISSUE_STORY_CATEGORIES.has(resolveCategory');
    // issue-story.prompt의 제목 3공식은 그대로 살아 있어야 한다
    const issueStory = readFileSync(new URL('../prompts/homefeed/issue-story.prompt', import.meta.url), 'utf8');
    expect(issueStory).toContain('인용 훅형');
  });
});

describe('legacy title formulas removed', () => {
  it('홈판 NEO-HOOK에서 패턴 9종 선택 규칙이 제거됐다', () => {
    const neo = read('content/neoHookTitles.ts');
    expect(neo).not.toContain('신박 패턴 9개 중 1개 이상 매칭');
    expect(neo).not.toMatch(/■ 아래 패턴 중 글감에 맞는 것을/);
    expect(neo).toContain('패턴 이름을 먼저 고르고 글감을 끼워 맞추지 마라');
    // 블랙리스트·반복 방지는 유지
    expect(neo).toContain('B급 훅 블랙리스트');
    expect(neo).toContain('약속한 정보(질문·숫자·정체·방법)를 근거 자료로 도입부에서 직접 답할 수 있는가');
  });

  it('쇼핑 제목 공식 5종이 구매 상황 기준으로 대체됐다 (3개 근거 모드 전부)', () => {
    for (const input of [
      { personalExperience: '실제로 두 달 써 본 경험 메모입니다' },
      { productReviews: ['설치가 오래 걸렸지만 소음은 확실히 줄었어요. 조용해져서 만족합니다.'] },
      {},
    ]) {
      const directive = buildAffiliateTitleEvidenceDirective(input as any);
      expect(directive).toContain('[제목 — 구매 상황 기준]');
      expect(directive).toContain('제품명만 있는 제목은 다시 쓴다');
      for (const legacy of ['문제 해결형', '공감 질문형', '숫자·리스트형', '비밀 공개형', '비교·대조형']) {
        expect(directive, legacy).not.toContain(legacy);
      }
      expect(directive).toContain('본문 도입부가 직접 답해야 한다');
    }
  });

  it('SEO 프롬프트의 "황금 공식"이 상황 기준으로 대체됐다', () => {
    const seo = readFileSync(new URL('../prompts/seo/base.prompt', import.meta.url), 'utf8');
    expect(seo).not.toContain('[SEO 제목 황금 공식');
    expect(seo).not.toContain('[100점 공식');
    expect(seo).toContain('[SEO 제목 — 상황 기준]');
    // [2026-08-05] 앞 3자 배치는 R0-1 과 충돌해 폐기했다(위 결정 주석 참조).
    expect(seo).not.toContain('[메인 키워드(앞 3자 이내)]');
    expect(seo).toContain('[메인 키워드] + [독자가 처한 상황] + [그 상황의 답]');
    // 제목 글자수도 R0-9(22~42자) 하나로 통일했다. 28~40 은 base 자기모순이었다.
    expect(seo).not.toContain('28~40자');
  });
});
