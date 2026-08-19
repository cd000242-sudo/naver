// 연속 발행 최소 간격 정책 잠금.
//
// 실측(2026-08-19) leader_248 29건: 1시간 미만 간격 발행이 11회, 최소 11분이었다.
// 기존 하드 플로어가 5분(이미지 많으면 7~8분)이라 그 아래로만 안 가면 통과했기 때문이다.
// SPEC-NAVER-PROTECTION-2026 조사 결론은 "안전 인터벌 1시간 텀(실무 합의선)"이다.

import { describe, it, expect } from 'vitest';
import {
  RECOMMENDED_MIN_PUBLISH_INTERVAL_MINUTES,
  ABSOLUTE_MIN_PUBLISH_INTERVAL_SEC,
  DEFAULT_MIN_PUBLISH_INTERVAL_MINUTES,
  normalizeConfiguredMinIntervalSec,
  resolvePublishFloorSec,
  describeIntervalRisk,
  shouldApplyUserInterval,
} from '../automation/publishIntervalPolicy';

const IMAGE_FLOOR = 300;        // SAFE_PUBLISH_MIN_INTERVAL_SEC
const IMAGE_HEAVY_FLOOR = 420;
const UI_AUTOMATION_FLOOR = 480;

describe('기본값 — 설정이 없으면 권장선으로 동작한다', () => {
  it('기본값이 SPEC 권장선(60분)과 같다', () => {
    expect(DEFAULT_MIN_PUBLISH_INTERVAL_MINUTES).toBe(RECOMMENDED_MIN_PUBLISH_INTERVAL_MINUTES);
    expect(RECOMMENDED_MIN_PUBLISH_INTERVAL_MINUTES).toBe(60);
  });

  it('설정을 못 읽어도(undefined/null/빈값) 60분으로 떨어진다 — 로드 실패가 빠른 발행 허용이 되면 안 된다', () => {
    for (const bad of [undefined, null, '', NaN, 'abc', {}]) {
      expect(normalizeConfiguredMinIntervalSec(bad)).toBe(60 * 60);
    }
  });

  it('0 이나 음수도 기본값으로 되돌린다', () => {
    expect(normalizeConfiguredMinIntervalSec(0)).toBe(60 * 60);
    expect(normalizeConfiguredMinIntervalSec(-30)).toBe(60 * 60);
  });
});

describe('실제 적용 하한 — 이미지 플로어와 사용자 설정 중 큰 쪽', () => {
  it('설정 없으면 60분이 적용된다 (기존 5분이 아니라)', () => {
    expect(resolvePublishFloorSec(IMAGE_FLOOR, undefined)).toBe(3600);
    expect(resolvePublishFloorSec(IMAGE_HEAVY_FLOOR, undefined)).toBe(3600);
    expect(resolvePublishFloorSec(UI_AUTOMATION_FLOOR, undefined)).toBe(3600);
  });

  it('실측에서 통과했던 11분 간격은 이제 하한에 걸린다', () => {
    const floor = resolvePublishFloorSec(IMAGE_FLOOR, undefined);
    expect(11 * 60).toBeLessThan(floor);
  });

  it('사용자가 더 길게 설정하면 그 값을 쓴다', () => {
    expect(resolvePublishFloorSec(IMAGE_FLOOR, 120)).toBe(120 * 60);
  });

  it('사용자가 짧게 줄여도 절대 하한(5분) 아래로는 안 간다', () => {
    expect(resolvePublishFloorSec(IMAGE_FLOOR, 1)).toBe(ABSOLUTE_MIN_PUBLISH_INTERVAL_SEC);
    expect(resolvePublishFloorSec(IMAGE_FLOOR, 3)).toBe(ABSOLUTE_MIN_PUBLISH_INTERVAL_SEC);
  });

  it('사용자 설정이 이미지 플로어보다 짧으면 이미지 플로어가 이긴다', () => {
    // 느린 이미지 소스는 8분이 필요한데 사용자가 6분으로 줄인 경우
    expect(resolvePublishFloorSec(UI_AUTOMATION_FLOOR, 6)).toBe(UI_AUTOMATION_FLOOR);
  });

  it('말도 안 되게 큰 값은 24시간에서 자른다', () => {
    expect(resolvePublishFloorSec(IMAGE_FLOOR, 99999)).toBe(24 * 60 * 60);
  });

  it('이미지 플로어가 망가져 들어와도 절대 하한은 지킨다', () => {
    expect(resolvePublishFloorSec(0, 1)).toBe(ABSOLUTE_MIN_PUBLISH_INTERVAL_SEC);
    expect(resolvePublishFloorSec(NaN, 1)).toBe(ABSOLUTE_MIN_PUBLISH_INTERVAL_SEC);
  });
});

describe('권장선 미만 안내', () => {
  it('짧게 설정하면 위험을 알려준다', () => {
    const msg = describeIntervalRisk(10);
    expect(msg).toContain('10분');
    expect(msg).toContain('60분');
  });

  it('권장선 이상이면 안내하지 않는다', () => {
    expect(describeIntervalRisk(60)).toBeNull();
    expect(describeIntervalRisk(120)).toBeNull();
    expect(describeIntervalRisk(undefined)).toBeNull();
  });
});

describe('배선 — 설정이 저장·복원되고 실제 계산에 닿는다', () => {
  it('연속 발행이 정책 함수를 통해 하한을 구한다', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/renderer/modules/continuousPublishing.ts', 'utf-8');
    expect(src).toContain('resolvePublishFloorSec(SAFE_PUBLISH_MIN_INTERVAL_SEC');
    expect(src).toContain('resolvePublishFloorSec(IMAGE_HEAVY_SAFE_PUBLISH_MIN_INTERVAL_SEC');
    expect(src).toContain('resolvePublishFloorSec(UI_AUTOMATION_SAFE_PUBLISH_MIN_INTERVAL_SEC');
    // 진입점에서 설정을 읽지 않으면 사용자가 바꾼 값이 반영되지 않는다
    expect((src.match(/void refreshPublishIntervalSetting\(\)/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('설정이 저장·복원 경로에 들어 있다', async () => {
    const { readFileSync } = await import('fs');
    const config = readFileSync('src/configManager.ts', 'utf-8');
    expect(config).toContain('minPublishIntervalMinutes?: number;');
    expect(config).toContain("parsed.minPublishIntervalMinutes ?? parsed['min-publish-interval-minutes']");
    expect(config).toContain("'min-publish-interval-minutes': normalizedConfig.minPublishIntervalMinutes");
    // 부분 저장으로 유실되지 않도록 보존 목록에도 있어야 한다
    expect((config.match(/'minPublishIntervalMinutes',/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('발행 모드별 적용 — 임시저장·예약은 1시간 대상이 아니다', () => {
  it('실제 발행에만 사용자 설정 간격을 건다', () => {
    expect(resolvePublishFloorSec(IMAGE_FLOOR, 60, 'publish')).toBe(3600);
    // 모드를 안 넘기면 기존처럼 발행으로 본다 (안전한 쪽)
    expect(resolvePublishFloorSec(IMAGE_FLOOR, 60, undefined)).toBe(3600);
  });

  it('임시저장·예약은 이미지 플로어만 지킨다 — 바로바로 등록된다', () => {
    expect(resolvePublishFloorSec(IMAGE_FLOOR, 60, 'draft')).toBe(IMAGE_FLOOR);
    expect(resolvePublishFloorSec(IMAGE_FLOOR, 60, 'schedule')).toBe(IMAGE_FLOOR);
  });

  it('임시저장이어도 이미지 소스별 플로어는 그대로 지킨다 (행위 빈도 보호)', () => {
    expect(resolvePublishFloorSec(UI_AUTOMATION_FLOOR, 60, 'draft')).toBe(UI_AUTOMATION_FLOOR);
    expect(resolvePublishFloorSec(IMAGE_HEAVY_FLOOR, 120, 'schedule')).toBe(IMAGE_HEAVY_FLOOR);
  });

  it('모드 판정이 명시적이다', () => {
    expect(shouldApplyUserInterval('publish')).toBe(true);
    expect(shouldApplyUserInterval(undefined)).toBe(true);
    expect(shouldApplyUserInterval('draft')).toBe(false);
    expect(shouldApplyUserInterval('schedule')).toBe(false);
  });

  it('연속 발행이 현재 모드를 읽어 넘긴다', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/renderer/modules/continuousPublishing.ts', 'utf-8');
    expect(src).toContain('function getCurrentPublishModeForInterval()');
    expect((src.match(/getCurrentPublishModeForInterval\(\)\)/g) || []).length).toBe(3);
  });
});
