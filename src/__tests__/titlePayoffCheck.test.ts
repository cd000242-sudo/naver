import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  checkTitlePayoff,
  extractTitlePromise,
  PAYOFF_COVERAGE_FLOOR,
} from '../content/titlePayoffCheck';

/**
 * [2026-08-26 사장님 지시] "홈판은 제목이 정말 클릭을 강하게 유발하는지,
 *   클릭을 한 이유를 본문에서 제대로 긁어주는지를 봐줘."
 *
 * 앞의 절반(제목이 클릭을 부르는가)은 evaluateTitleQuality 의 홈판 감점이 이미 본다.
 * 뒤의 절반(본문이 그 클릭을 갚는가)은 코드 전체에 검사가 하나도 없었다 —
 *   grep payoff → 0건. 제목이 약속한 말이 도입부에 아예 안 나와도 통과했다.
 *
 * 이 검사는 경고 전용이다. 발행을 막지 않는다(사장님: 발행 차단 게이트 추가 금지).
 */
describe('제목이 약속한 말 뽑기', () => {
  it('메인키워드는 약속에서 뺀다 — 키워드는 누구나 넣는다', () => {
    const promise = extractTitlePromise('택배없는날인데 우리 집 택배만 오는 이유', '택배없는날');
    expect(promise).not.toContain('택배없는날');
    expect(promise).toContain('이유');
  });

  it('키워드가 여러 낱말이면 낱말 단위로 뺀다', () => {
    const promise = extractTitlePromise('김윤주 권정열 결혼 발표에 팬들이 놀란 대목', '김윤주 권정열');
    expect(promise).not.toContain('김윤주');
    expect(promise).not.toContain('권정열');
  });

  it('조사·일반어는 약속이 아니다', () => {
    const promise = extractTitlePromise('홈플러스 재개장 그런데 매장이', '홈플러스');
    expect(promise).not.toContain('그런데');
  });
});

describe('본문이 제목의 약속을 갚는가', () => {
  const TITLE = '택배없는날인데 우리 집 택배만 오는 이유가 있었다';
  const KEYWORD = '택배없는날';

  it('도입부가 약속한 말을 다루면 갚은 것으로 본다', () => {
    const result = checkTitlePayoff({
      title: TITLE,
      primaryKeyword: KEYWORD,
      payoffZone:
        '택배없는날에도 우리 집에 택배가 오는 이유는 위탁 배송사가 협약 대상이 아니기 때문입니다. ' +
        '집으로 오는 물량 중 상당수가 이 경로를 탑니다.',
    });
    expect(result.checked).toBe(true);
    expect(result.coverage).toBeGreaterThanOrEqual(PAYOFF_COVERAGE_FLOOR);
    expect(result.unpaid).toHaveLength(0);
  });

  it('제목만 자극적이고 도입부가 딴소리면 미상환으로 잡는다', () => {
    const result = checkTitlePayoff({
      title: TITLE,
      primaryKeyword: KEYWORD,
      payoffZone:
        '택배없는날은 2020년부터 시행된 제도입니다. 매년 8월 14일로 지정되어 있으며 ' +
        '관련 부처가 협약을 통해 운영하고 있습니다.',
    });
    expect(result.coverage).toBeLessThan(PAYOFF_COVERAGE_FLOOR);
    expect(result.unpaid).toContain('이유');
    expect(result.message).toContain('이유');
  });

  it('재료가 없으면 판정하지 않는다 — 없는 근거로 경고하지 않는다', () => {
    expect(checkTitlePayoff({ title: '', primaryKeyword: KEYWORD, payoffZone: '본문' }).checked)
      .toBe(false);
    expect(checkTitlePayoff({ title: TITLE, primaryKeyword: KEYWORD, payoffZone: '' }).checked)
      .toBe(false);
  });

  it('제목이 키워드뿐이면 약속이 없어 판정하지 않는다', () => {
    const result = checkTitlePayoff({
      title: '택배없는날',
      primaryKeyword: KEYWORD,
      payoffZone: '아무 본문',
    });
    expect(result.checked).toBe(false);
  });

  it('어떤 입력에도 던지지 않는다 — 발행을 막을 수 없다', () => {
    expect(() =>
      checkTitlePayoff({ title: undefined as never, primaryKeyword: undefined, payoffZone: undefined as never }),
    ).not.toThrow();
  });
});

/**
 * 본선 배선 잠금. 검사기만 있고 아무 데서도 부르지 않으면 예전과 똑같다 —
 * 실제로 `grep payoff` 가 0건이던 상태가 그랬다.
 */
describe('본선 배선', () => {
  const source = readFileSync(resolve(__dirname, '../contentGenerator.ts'), 'utf-8');

  it('사후 검증기가 상환 검사를 부른다', () => {
    // 근접 거리로 단언하지 않는다 — 사이에 다른 진단이 늘면 의도와 무관하게 깨진다
    //   (2026-08-27 Phase 0 진단 로그가 들어오며 실제로 깨졌다).
    //   확인할 것은 "검증기 안에서 불린다" 하나뿐이다.
    const body = source.slice(source.indexOf('function runPostGenValidator'));
    const scope = body.slice(0, body.indexOf('\n}'));
    expect(scope).toContain('logTitlePayoff(content, source)');
  });

  it('validator 기능이 꺼져 있어도 상환 검사는 돈다', () => {
    // isFeatureEnabled('validator') 조기 반환보다 앞에 있어야 한다.
    const body = source.slice(source.indexOf('function runPostGenValidator'));
    const payoffAt = body.indexOf('logTitlePayoff(content, source)');
    const guardAt = body.indexOf("isFeatureEnabled('validator')");
    expect(payoffAt).toBeGreaterThanOrEqual(0);
    expect(payoffAt).toBeLessThan(guardAt);
  });

  it('상환 구간은 도입부와 첫 소제목이다 — 뒤에서 갚는 건 이미 늦다', () => {
    // [2026-09-04] 필드는 title 이다. heading 을 읽던 탓에 첫 소제목이 상환 구역에서 빠져 있었고,
    //   이 단언이 그 결함을 박제하고 있었다(실측 38편 상환 65%→72%).
    expect(source).toMatch(/firstSection\?\.title, firstSection\?\.content/);
    expect(source).not.toMatch(/firstSection\?\.heading/);
  });

  it('모델이 선언한 클릭 사유도 대조한다', () => {
    expect(source).toMatch(/preWritingAnalysis\?\.clickReason/);
  });

  it('던지지 않는다 — 발행 경로를 막을 수 없다', () => {
    expect(source).toMatch(/function logTitlePayoff[\s\S]{0,2000}catch \(err\)/);
  });
});
