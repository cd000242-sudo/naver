/**
 * Curiosity-hook scanner (advisory).
 *
 * SPEC-AEO-EXPOSURE-2026 R1.
 *
 * "그런데 / 하지만 / 여기서 중요한 건" 같은 연결 후크는 다음 단락으로의 스크롤을
 * 유도해 체류시간 신호를 만든다. 이 스캐너는 후크 표현의 개수만 센다. 강제하지
 * 않으며 수정하지 않는다. 발행 파이프라인 미연결.
 */

export interface CuriosityHookResult {
  hookCount: number;
  matchedHooks: string[];
  meetsRecommended: boolean;
  warnings: string[];
}

const HOOKS = ['그런데', '하지만', '여기서 중요한 건', '잠깐', '사실', '놀랍게도'];
const MIN_HOOKS = 2;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function scanCuriosityHooks(
  bodyText: string,
  minHooks: number = MIN_HOOKS,
): CuriosityHookResult {
  const text = bodyText ?? '';
  const matchedHooks: string[] = [];
  let hookCount = 0;

  for (const hook of HOOKS) {
    const matches = text.match(new RegExp(escapeRegExp(hook), 'g'));
    if (matches && matches.length > 0) {
      hookCount += matches.length;
      matchedHooks.push(hook);
    }
  }

  const meetsRecommended = hookCount >= minHooks;
  const warnings: string[] = [];
  if (!meetsRecommended) {
    warnings.push(`연결 후크가 ${hookCount}개. 스크롤 유도 표현 ${minHooks}개 이상 권장(선택)`);
  }

  return { hookCount, matchedHooks, meetsRecommended, warnings };
}
