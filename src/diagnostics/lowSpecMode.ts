// v2.7.26 — 저사양 모드 자동 감지 + 권장 설정 게이트웨이
// 저성능 노트북(4코어 이하 OR 메모리 8GB 이하)에서 "응답 없음" 빈도를 줄이기 위한 모듈.
// 자동 감지 + 사용자 강제 토글 둘 다 지원.

import os from 'os';

interface LowSpecRecommendation {
  isLowSpec: boolean;
  reason: string;
  cpuCores: number;
  totalMemGB: number;
  recommendations: {
    publishConcurrency: number;          // 동시 발행 워커 수
    imageParallelLimit: number;          // 이미지 동시 생성 수
    geminiRpmCeiling: number;            // Gemini RPM 한도
    backgroundPollMs: number;            // 백그라운드 폴링 주기
    disableHardwareAcceleration: boolean; // GPU 가속 비활성화 (저사양 GPU에서 더 안정)
  };
}

const HIGH_SPEC: LowSpecRecommendation['recommendations'] = {
  publishConcurrency: 3,
  imageParallelLimit: 4,
  geminiRpmCeiling: 30,
  backgroundPollMs: 5000,
  disableHardwareAcceleration: false,
};

const LOW_SPEC: LowSpecRecommendation['recommendations'] = {
  publishConcurrency: 1,
  imageParallelLimit: 1,
  geminiRpmCeiling: 10,
  backgroundPollMs: 30000,
  disableHardwareAcceleration: true,
};

let cachedRecommendation: LowSpecRecommendation | null = null;
let userForced: boolean | null = null; // null = 자동, true = 강제 켜기, false = 강제 끄기

export function detectLowSpec(): LowSpecRecommendation {
  if (cachedRecommendation && userForced === null) {
    return cachedRecommendation;
  }

  const cpuCores = os.cpus().length;
  const totalMemGB = Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10;

  // 자동 판정: 4코어 이하 OR 8GB 이하 = 저사양
  const autoLowSpec = cpuCores <= 4 || totalMemGB <= 8;
  const isLowSpec = userForced !== null ? userForced : autoLowSpec;

  let reason: string;
  if (userForced === true) {
    reason = '사용자 강제 활성화';
  } else if (userForced === false) {
    reason = '사용자 강제 비활성화';
  } else if (autoLowSpec) {
    reason = `자동 감지 (CPU ${cpuCores}코어, RAM ${totalMemGB}GB)`;
  } else {
    reason = `고사양 (CPU ${cpuCores}코어, RAM ${totalMemGB}GB)`;
  }

  cachedRecommendation = {
    isLowSpec,
    reason,
    cpuCores,
    totalMemGB,
    recommendations: isLowSpec ? LOW_SPEC : HIGH_SPEC,
  };
  return cachedRecommendation;
}

export function setLowSpecOverride(forced: boolean | null): void {
  userForced = forced;
  cachedRecommendation = null; // 재계산 강제
}

export function logLowSpecStatus(): void {
  const rec = detectLowSpec();
  const tag = rec.isLowSpec ? '🐢 저사양 모드' : '🏎️ 고사양 모드';
  // eslint-disable-next-line no-console
  console.log(`[LowSpec] ${tag} | ${rec.reason}`);
  // eslint-disable-next-line no-console
  console.log(`[LowSpec] 권장 설정: 동시발행=${rec.recommendations.publishConcurrency}, 이미지병렬=${rec.recommendations.imageParallelLimit}, GeminiRPM=${rec.recommendations.geminiRpmCeiling}, 폴링=${rec.recommendations.backgroundPollMs}ms, GPU가속해제=${rec.recommendations.disableHardwareAcceleration}`);
}
