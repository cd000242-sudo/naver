// src/imageNarrative/visionInference/geminiVisionKeyPool.ts
// [2026-09-09] 사진 추론(Vision)용 Gemini 키 목록.
//
// 왜 필요한가 — 사장님 실측 진단리포트(2026-09-09 01:00):
//   [Config] 로드된 키 개수: 50
//   [GeminiVisionThrottle] gemini-3.6-flash 429 detected: wait 76s before retry (1/2)
//   [GeminiVisionThrottle] gemini-3.6-flash 429 detected: wait 76s before retry (2/2)
//   [Aggregator] ⚠️ 사진 추론 실패 — 이 사진은 건너뛰고 계속
// 키를 50개 넣어 두셨는데 Vision 경로는 process.env.GEMINI_API_KEY 하나만 읽었다.
// 그 한 개가 한도에 걸리면 나머지 49개가 놀고 있는데도 76초를 기다리고, 두 번 기다린 뒤
// 그 사진을 통째로 버렸다. 사진 한 장당 152초를 쓰고 결과는 "건너뜀" 이었다.
//
// 이미지 *생성* 경로(nanoBananaProGenerator)에는 이미 키 풀 로테이션이 있다.
// 같은 재료를 Vision 경로에도 준다.

/** 설정에서 읽은 Gemini 키들. 앞이 메인 키다. */
export interface GeminiVisionKeys {
  readonly keys: readonly string[];
  /** 설정에 키가 하나도 없으면 false — 호출부가 기존 에러 경로를 타면 된다. */
  readonly hasKeys: boolean;
}

function normalizeKey(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 중복 없이 순서를 지켜 키 목록을 만든다.
 *
 * 순서: 메인 키(GEMINI_API_KEY) → 설정의 보조 키 배열.
 * 같은 키가 두 번 들어 있으면 한 번만 쓴다 — 같은 키로 두 번 시도해봐야 똑같이 429다.
 */
export function collectGeminiVisionKeys(
  envKey: unknown,
  configKeys: unknown,
): GeminiVisionKeys {
  const ordered: string[] = [];
  const seen = new Set<string>();

  const push = (raw: unknown): void => {
    const key = normalizeKey(raw);
    if (!key || seen.has(key)) return;
    seen.add(key);
    ordered.push(key);
  };

  push(envKey);
  if (Array.isArray(configKeys)) {
    for (const entry of configKeys) push(entry);
  }

  return { keys: ordered, hasKeys: ordered.length > 0 };
}

/**
 * 키가 여러 개면 분당 간격을 그만큼 줄인다.
 *
 * 기존 가드는 "무료 등급 5 RPM" 을 가정해 사진 한 장당 13초를 강제로 쉬었다.
 * 키가 N개면 한도도 N배라, 1개 기준으로 묶으면 나머지 키가 놀게 된다.
 * 다만 0 으로 내리지는 않는다 — 같은 프로젝트에서 발급한 키는 한도를 공유할 수 있어
 * 최소 간격은 남겨 둔다.
 */
export function resolveVisionMinIntervalMs(
  baseIntervalMs: number,
  keyCount: number,
  floorMs = 1_000,
): number {
  const count = Math.max(1, Math.floor(keyCount));
  return Math.max(floorMs, Math.ceil(baseIntervalMs / count));
}
