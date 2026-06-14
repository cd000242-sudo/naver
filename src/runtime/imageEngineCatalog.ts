/**
 * 이미지 생성 엔진 카탈로그 — AI 생성엔진 4종의 SSOT (Single Source of Truth)
 *
 * v2.10.335 나노바나나 3종 분리. 메인 풀오토 이미지 설정 그리드와
 * 이미지 관리 탭 드롭다운이 모두 이 정의를 따른다.
 * Stage 4 연동 테스트(imageEngineConnectivity.test.ts)가 UI ↔ 카탈로그 일치를 강제한다.
 *
 * ⚠️ 무료 플랜 한도: Gemini 3.x 이미지 프리뷰 모델의 무료 한도는 프로젝트·지역·과금 상태에
 *    따라 가변적이며 유료 전용일 수 있다. 검증 불가한 고정 수치 대신 정직한 안내를 노출한다.
 */
import { GEMINI_IMAGE_MODELS, OPENAI_IMAGE_MODELS } from './modelRegistry.js';

export interface ImageEngineSpec {
  /** UI provider 값 — localStorage 저장 + generateImages 디스패치 공통 키 */
  value: string;
  /** UI 표시 라벨 */
  label: string;
  /** 한 줄 특징 설명 */
  tagline: string;
  /** 실제 호출되는 API 모델 ID */
  model: string;
  /** 나노바나나 계열 모델 키 (nanoBananaProGenerator MODEL_MAP). 비-나노 엔진은 null */
  forceModelKey: string | null;
  /** 1장당 추정 비용 (KRW, 환율 ₩1,380 기준) */
  costKrw: number;
  /** 한글 텍스트를 이미지 안에 네이티브로 렌더링 가능한지 */
  koreanText: boolean;
  /** UI 아이콘 (이모지) */
  icon: string;
  /** 무료 플랜 한도 안내 (UI 노출 — 정직한 분석 텍스트) */
  freeTierNote: string;
}

/** 나노바나나2 — 적정 가격 · 한글 텍스트 가능 (기본 추천 엔진) */
export const NANO_BANANA_2: ImageEngineSpec = {
  value: 'nano-banana-2',
  label: '나노바나나2',
  tagline: '적정 가격 · 한글 텍스트 가능 · 4K (★ 추천)',
  model: GEMINI_IMAGE_MODELS.NANO_BANANA_2,
  forceModelKey: 'gemini-3-1-flash',
  costKrw: 97,
  koreanText: true,
  icon: '🍌',
  freeTierNote:
    '무료 플랜: Gemini 3.1 Flash Image는 프리뷰 모델로, 무료 한도가 프로젝트·지역·과금 상태에 ' +
    '따라 다르며 유료 전용일 수 있습니다. 무료 티어 이미지 요청은 일반적으로 모델별 일일 한도(RPD)가 ' +
    '적용되고 매일 자정(태평양시) 초기화됩니다. 정확한 한도는 Google AI Studio 사용량 페이지에서 ' +
    '프로젝트별로 확인하세요.',
};

/** 나노바나나 프로 — 이미지 끝판왕 · 한글 최강 · 고가 */
export const NANO_BANANA_PRO: ImageEngineSpec = {
  value: 'nano-banana-pro',
  label: '나노바나나 프로',
  tagline: '이미지 끝판왕 · 한글 텍스트 최강 · 가격 비쌈',
  model: GEMINI_IMAGE_MODELS.NANO_BANANA_PRO,
  forceModelKey: 'gemini-3-pro',
  costKrw: 185,
  koreanText: true,
  icon: '🍌',
  freeTierNote:
    '무료 플랜: Gemini 3 Pro Image는 최고 사양 프리뷰 모델로, 무료 한도가 가장 제한적이며 ' +
    '유료(Tier 1+) 전용일 가능성이 높습니다. 무료로 사용 가능하더라도 일일 요청 수(RPD)가 매우 ' +
    '낮을 수 있으니, 사용 전 Google AI Studio 사용량 페이지에서 프로젝트 한도를 반드시 확인하세요.',
};

/** 나노바나나 — 이미지 퀄리티 좋음 · 한글 텍스트 깨짐 (구버전 GA) */
export const NANO_BANANA: ImageEngineSpec = {
  value: 'nano-banana',
  label: '나노바나나',
  tagline: '이미지 퀄리티 좋음 · 한글 텍스트 깨짐 (구버전)',
  model: GEMINI_IMAGE_MODELS.STANDARD,
  forceModelKey: 'gemini-2.5-flash',
  costKrw: 54,
  koreanText: false,
  icon: '🍌',
  freeTierNote:
    '무료 플랜: Gemini 2.5 Flash Image는 정식 GA 모델로 무료 티어에서 사용 가능하나, ' +
    '이미지 생성 요청은 모델별 일일 한도(RPD)가 적용되고 매일 자정(태평양시) 초기화됩니다. ' +
    '한글 텍스트가 깨질 수 있어 한글 텍스트가 필요하면 나노바나나2를 권장합니다.',
};

/** 덕테이프 — OpenAI gpt-image-2 · 한글 텍스트 가능 */
export const DUCK_TAPE: ImageEngineSpec = {
  value: 'openai-image',
  label: '덕테이프',
  tagline: 'OpenAI gpt-image-2 · 한글 텍스트 가능 · Org 인증 필요',
  model: OPENAI_IMAGE_MODELS.GPT_IMAGE_2,
  forceModelKey: null,
  costKrw: 280,
  koreanText: true,
  icon: '🦆',
  freeTierNote:
    'OpenAI gpt-image-2는 무료 플랜이 없습니다. 사용량만큼 과금되며(품질 옵션에 따라 장당 ' +
    '약 ₩25~₩280), Organization 인증이 필요합니다.',
};

/**
 * 리더스 나노바나나 무제한 — Dropshot nano-banana-pro (UI 자동화)
 * ✅ [v2.11.7] 추가
 * 비용: Pro 구독자 무제한 · 이미지당 추가비용 0원 (구독료 별도 결제)
 */
/** Flow — Google Labs UI automation provider. */
export const FLOW: ImageEngineSpec = {
  value: 'flow',
  label: 'Flow',
  tagline: 'Google Labs UI 자동화 · 로그인 필요 · 기존 사용자 선택권 복구',
  model: 'labs.google/flow',
  forceModelKey: null,
  costKrw: 0,
  koreanText: true,
  icon: '🍌',
  freeTierNote: 'Google Labs/AI Pro 계정 상태와 지역/세션에 따라 사용 가능 여부가 달라질 수 있습니다. 앱은 순차 생성과 안정화 대기를 적용합니다.',
};

/** Prodia — API based low-cost image generation provider. */
export const PRODIA: ImageEngineSpec = {
  value: 'prodia',
  label: 'Prodia',
  tagline: 'Prodia API · 빠른 저비용 이미지 생성 · API 키 필요',
  model: 'prodia/sdxl',
  forceModelKey: null,
  costKrw: 14,
  koreanText: false,
  icon: '⚡',
  freeTierNote: 'Prodia API 키가 필요하며 사용량 기준으로 과금될 수 있습니다. 정확한 요금과 제한은 Prodia 계정 대시보드에서 확인하세요.',
};

export const DROPSHOT: ImageEngineSpec = {
  value: 'dropshot',
  label: '🍌 리더스 나노바나나 무제한',
  tagline: 'UI 자동화 · 한글 텍스트 최강 · Pro 구독자 전용',
  model: 'dropshot/nano-banana-pro',
  forceModelKey: null,
  costKrw: 0,
  koreanText: true,
  icon: '🍌',
  freeTierNote: 'Pro 구독자 무제한 · 이미지당 추가비용 0원 (Dropshot Pro 구독료 월 74,000~99,000원은 사이트에서 별도 결제)',
};

/** AI 생성엔진 카탈로그 — 그리드/드롭다운 노출 순서 */
export const IMAGE_ENGINE_CATALOG: ImageEngineSpec[] = [
  NANO_BANANA_2,
  NANO_BANANA_PRO,
  NANO_BANANA,
  DUCK_TAPE,
  FLOW,
  PRODIA,
  DROPSHOT,
];

/** provider 값 → 엔진 스펙 조회 */
export function getImageEngineSpec(value: string): ImageEngineSpec | undefined {
  return IMAGE_ENGINE_CATALOG.find((e) => e.value === value);
}

/** 나노바나나 3종 provider 값 → nanoBananaProGenerator forceModelKey */
export const NANO_PROVIDER_TO_MODEL_KEY: Record<string, string> = {
  'nano-banana': 'gemini-2.5-flash',
  'nano-banana-2': 'gemini-3-1-flash',
  'nano-banana-pro': 'gemini-3-pro',
};
