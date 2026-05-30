/**
 * AEO rules manager — external configuration foundation.
 *
 * SPEC-AEO-EXPOSURE-2026 R2.
 *
 * 베타 기간 동안 네이버 룰이 바뀌면 코드 재배포 없이 `userData/aeo_rules.json`만
 * 수정해 임계값을 조정할 수 있게 한다. 이 모듈은 그 설정을 읽고 검증한다.
 *
 * 안전 원칙:
 *   - DEFAULT_AEO_RULES 값은 현재 R1 스캐너의 하드코딩 임계값과 바이트 일치한다
 *     (외부화는 순수 no-op — 파일이 없으면 기존 동작 그대로).
 *   - 파일 부재/파싱 오류/타입 오류 시 절대 throw 하지 않고 DEFAULT로 폴백한다.
 *   - 정규식은 외부화하지 않는다(직렬화 위험). 숫자 임계값만 외부화한다.
 *
 * 이 단계에서는 로더만 제공한다. 스캐너/파이프라인 연결은 다음 증분에서 한다.
 */

import * as fs from 'fs';

export interface AeoRules {
  version: string;
  imageRatio: { minRatio: number };
  curiosityHook: { minHooks: number };
  h2QuestionRatio: { minRatio: number };
}

/** Byte-equal to the current hardcoded R1 scanner thresholds. */
export const DEFAULT_AEO_RULES: AeoRules = {
  version: '1.0',
  imageRatio: { minRatio: 0.33 },
  curiosityHook: { minHooks: 2 },
  h2QuestionRatio: { minRatio: 0.6 },
};

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function isRatio(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** Build a fresh AeoRules from untrusted input, validating each field. */
function buildRules(input: unknown): AeoRules {
  const src = asObject(input);
  const ir = asObject(src.imageRatio);
  const ch = asObject(src.curiosityHook);
  const h2 = asObject(src.h2QuestionRatio);

  return {
    version: typeof src.version === 'string' ? src.version : DEFAULT_AEO_RULES.version,
    imageRatio: {
      minRatio: isRatio(ir.minRatio) ? ir.minRatio : DEFAULT_AEO_RULES.imageRatio.minRatio,
    },
    curiosityHook: {
      minHooks: isNonNegInt(ch.minHooks)
        ? ch.minHooks
        : DEFAULT_AEO_RULES.curiosityHook.minHooks,
    },
    h2QuestionRatio: {
      minRatio: isRatio(h2.minRatio) ? h2.minRatio : DEFAULT_AEO_RULES.h2QuestionRatio.minRatio,
    },
  };
}

/** Parse a raw JSON string into validated AeoRules. Never throws. */
export function parseAeoRules(raw: string): AeoRules {
  try {
    return buildRules(JSON.parse(raw));
  } catch {
    return buildRules({});
  }
}

/** Read and parse an aeo_rules.json file. Returns DEFAULT on any error. */
export function loadAeoRules(filePath: string): AeoRules {
  try {
    return parseAeoRules(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return buildRules({});
  }
}
