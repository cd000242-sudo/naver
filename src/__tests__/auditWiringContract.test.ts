import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * 감사기 배선 계약.
 *
 * [2026-09-01] 사장님 요청 — "배선이 엉키지 않게 체계적으로 되어 있어야 돼요."
 *
 * 오늘 하루에만 배선 결함이 셋 나왔다. 셋 다 같은 병이다:
 * 장치는 멀쩡한데 그 장치까지 값이 가지 않았고, 실패가 아니라 침묵으로 나타나
 * 아무도 몰랐다.
 *
 *   1. 감사기들이 h.heading 을 읽었다 — 실제 필드는 h.title.
 *      소제목 감지기가 한 번도 발화하지 못했다(하한 3개에 걸려 checked=0).
 *   2. syncHeadingsWithBodyPlain 이 빈 껍데기였다.
 *      소제목 보정과 SEO 메인키워드 앞배치가 독자에게 도달하지 않았다.
 *   3. 출구 게이트가 크롤 경로에만 있었다.
 *      자료의 대부분을 대는 네이버 API 경로로 오염이 그대로 들어왔다.
 *
 * 유닛 테스트는 셋 다 못 잡는다. 모듈에 값을 직접 넣어 검사하므로 배선을 지나지 않는다.
 * 그래서 배선 자체를 계약으로 못 박는다.
 *
 * 이 테스트가 깨지면 둘 중 하나다.
 *   · 감지기를 만들고 부르는 것을 잊었다 (오늘 실수)
 *   · 감지기를 의도적으로 뺐다 — 그러면 이 목록에서도 빼면 된다
 * 어느 쪽이든 조용히 넘어가지 않는다는 것이 요점이다.
 */
const generator = readFileSync(resolve(__dirname, '..', 'contentGenerator.ts'), 'utf-8');

/** 생성 후 감사기 — 각 항목은 (모듈, 호출 함수, 로그 태그) 로 배선을 확인한다. */
const AUDITORS = [
  { name: '반응 날조', fn: 'findUngroundedReactionClaims', tag: 'ReactionClaim' },
  { name: '수치 근거', fn: 'findUngroundedNumbers', tag: 'NumberCheck' },
  { name: '경험 3요소', fn: 'auditExperienceSentences', tag: 'Experience' },
  { name: '소제목 골격', fn: 'analyzeHeadingSkeletons', tag: 'HeadingVariety' },
  { name: '섹션 간 반복', fn: 'findCrossSectionRepeats', tag: 'SectionRepeat' },
  { name: '검색 건수 누출', fn: 'findPipelineMetricLeaks', tag: 'MetricLeak' },
  { name: '자료 라벨 누출', fn: 'findMaterialLabelLeaks', tag: 'LabelLeak' },
  { name: '미래 날짜 과거형', fn: 'findFutureDatedPastClaims', tag: 'DateClaim' },
];

describe('감사기가 실제로 불린다', () => {
  for (const auditor of AUDITORS) {
    it(`${auditor.name} — 호출되고 로그 태그가 있다`, () => {
      expect(generator).toContain(`${auditor.fn}(`);
      expect(generator).toContain(`[${auditor.tag}]`);
    });
  }
});

describe('감사기가 소제목을 실제로 받는다', () => {
  /*
   * 오늘의 결함이 여기였다. 감사용 본문을 만들 때 없는 필드를 읽으면
   * 위 감사기 전부가 소제목을 못 본다 — 호출은 되는데 입력이 빈 셈이다.
   */
  it('감사용 본문 조립이 h.title 을 읽는다', () => {
    /*
     * [2026-09-01] 처음에는 /h\?\.heading(?!\s*\)?\s*\|\|)/ 로 썼는데
     * `h?.heading || ''` 도 뒤에 || 가 있어 통과했다 — 결함을 되살려도 안 깨졌다.
     * 줄 단위로 본다: h?.heading 을 읽는 줄에는 h?.title 이 함께 있어야 한다.
     */
    const offenders = generator.split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('*') && !line.startsWith('//') && !line.startsWith('/*'))
      .filter((line) => line.includes('h?.heading') && !line.includes('h?.title'));
    expect(offenders).toEqual([]);
  });
});

describe('소제목 보정이 본문에 반영된다', () => {
  /*
   * 소제목만 바꾸고 본문을 안 바꾸면 독자에게 도달하지 않는다.
   * 게다가 발행 코드가 소제목 문자열을 본문에서 글자 그대로 찾으므로
   * (editorHelpers bodyText.includes(title)) 이미지 자리도 잃는다.
   */
  it('소제목을 바꾸는 곳마다 스냅샷을 넘긴다', () => {
    const calls = generator.match(/syncHeadingsWithBodyPlain\([^)]*\)/gu) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      // 인자가 하나뿐이면 스냅샷이 없어 아무것도 반영하지 않는다.
      expect(call).toMatch(/,/u);
    }
  });

  it('동기화 함수가 빈 껍데기가 아니다', () => {
    const optimizer = readFileSync(resolve(__dirname, '..', 'contentHeadingOptimizer.ts'), 'utf-8');
    const at = optimizer.indexOf('export function syncHeadingsWithBodyPlain');
    expect(at).toBeGreaterThan(0);
    expect(optimizer.slice(at, at + 1400)).toMatch(/applyHeadingRenames/u);
  });
});

describe('자료 주제 게이트가 모든 수집 경로에 있다', () => {
  it('크롤 경로와 API 경로 모두 판정한다', () => {
    const assembler = readFileSync(resolve(__dirname, '..', 'sourceAssembler.ts'), 'utf-8');
    const hits = assembler.match(/isOnTopicForKeyword\(/gu) ?? [];
    // 상위글 본문 · URL 크롤 · 네이버 API 세 경로.
    expect(hits.length).toBeGreaterThanOrEqual(3);
  });
});
