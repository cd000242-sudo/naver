import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-08-05] 무료 체험 기능 잠금 정책.
 *
 * 사용자 확정 정책:
 *   - 단일 발행           → 잠금 없음, 매일 3회 쿼터
 *   - 반자동 다중계정 발행 → 잠금 없음, 매일 3회 쿼터 (단일 발행과 동일 취급)
 *   - 연속 발행           → Pro 전용 (기능 잠금)
 *   - 풀오토 다중계정 발행 → Pro 전용 (기능 잠금)
 *   - 리셋: 매일
 *
 * 발견된 결함: 연속 발행 잠금이 `startContinuousPublishing` 래퍼에만 있었는데
 * UI 버튼(index.html)과 window 전역은 `startContinuousPublishingV2`를 직접
 * 호출한다 — 잠금이 한 번도 작동한 적이 없었다.
 */
describe('연속 발행 — 잠금이 실제 진입점에 있다', () => {
  const src = read('renderer/modules/continuousPublishing.ts');

  it('UI가 호출하는 함수(V2) 본문에서 잠금을 검사한다', () => {
    // 함수 시작 직후에 게이트가 있어야 한다 (큐 검사보다 앞)
    expect(src).toMatch(
      /async function startContinuousPublishingV2\(\): Promise<void> \{[\s\S]{0,400}?await isContinuousPublishingUnlocked\(\)/,
    );
  });

  it('죽은 래퍼에만 게이트를 두는 형태로 되돌아가지 않는다', () => {
    // 래퍼(startContinuousPublishing)에 게이트를 넣고 V2에서 빼면 다시 무력화된다
    const wrapper = src.slice(
      src.indexOf('export function startContinuousPublishing('),
      src.indexOf('async function isContinuousPublishingUnlocked'),
    );
    expect(wrapper).not.toContain('checkFeatureLockAndShow');
  });

  it('UI 버튼이 V2를 직접 호출한다는 전제를 잠근다', () => {
    const html = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
    expect(html).toContain('onclick="startContinuousPublishingV2()"');
  });

  it('라이선스 검사 실패 시 차단이 아니라 진행한다 (정당 사용자 보호)', () => {
    expect(src).toMatch(/catch \(e\) \{[\s\S]{0,200}?return true;/);
  });
});

describe('반자동 다중계정 — 기능 잠금 없음 (3회 쿼터로만 제한)', () => {
  it('반자동 발행 경로에 featureLock 게이트가 없다', () => {
    for (const mod of ['renderer/renderer.ts', 'renderer/modules/publishingHandlers.ts']) {
      const src = read(mod);
      const codeLines = src
        .split(/\r?\n/)
        .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
        .join('\n');
      expect(codeLines, `${mod} 에 기능 잠금이 생겼습니다`).not.toContain('checkFeatureLockAndShow');
    }
  });
});

describe('풀오토 다중계정 — Pro 잠금 유지', () => {
  const src = read('renderer/modules/multiAccountManager.ts');

  it('풀오토 발행 시작 버튼에 잠금이 걸려 있다', () => {
    expect(src).toContain("checkFeatureLockAndShow?.('multi-account-fullauto')");
  });

  it('다중계정 관리 진입에도 잠금이 유지된다', () => {
    expect(src).toContain("checkFeatureLockAndShow?.('multi-account-manage')");
  });
});

describe('부팅 시 배선 클릭이 Pro 모달을 띄우지 않는다', () => {
  it('renderer가 배선 트리거임을 표시하고 클릭한다', () => {
    const src = read('renderer/renderer.ts');
    expect(src).toContain("maBtn.dataset.wiringTrigger = '1'");
    expect(src).toMatch(/maBtn\.click\(\);[\s\S]{0,80}?delete maBtn\.dataset\.wiringTrigger/);
  });

  it('핸들러가 배선 트리거일 때 잠금을 건너뛴다', () => {
    const src = read('renderer/modules/multiAccountManager.ts');
    expect(src).toContain("dataset?.wiringTrigger === '1'");
    // 사용자가 직접 누른 경우에는 여전히 검사한다
    expect(src).toMatch(/if \(!isWiringTrigger\) \{[\s\S]{0,200}?checkFeatureLockAndShow/);
  });
});

describe('안내 문구가 실제 정책과 일치한다', () => {
  it('"글 1편"이 아니라 매일 3회로 안내한다', () => {
    const src = read('renderer/modules/featureLockModal.ts');
    expect(src).not.toContain('단일 발행 · 글 1편');
    expect(src).toContain('매일 3회까지');
    expect(src).toContain('반자동 다중계정');
  });

  it('무료 한도 상수는 단일 진실을 유지한다 (매일 3회)', async () => {
    const { FREE_TRIAL_DAILY_PUBLISH_LIMIT } = await import('../freeTrialPolicy');
    expect(FREE_TRIAL_DAILY_PUBLISH_LIMIT).toBe(3);
  });
});
