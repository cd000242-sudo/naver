/**
 * 나노 바나나 프로 이미지 생성기
 * Refactored: PromptBuilder 모듈로 프롬프트 로직 분리
 */

import type { ImageRequestItem, GeneratedImage } from './types.js';
import { sanitizeImagePrompt, writeImageFile } from './imageUtils.js';
import { getImageErrorMessage } from './imageErrorMessages.js';
import { PromptBuilder } from './promptBuilder.js';
import { trackApiUsage } from '../apiUsageTracker.js';
import { promises as fs } from 'fs';
import sharp from 'sharp';
import { probeDuplicate, commitHashes, applyDiversityHint } from './imageHashUtils.js';

// ✅ [2026-03-02] 실시간 이미지 생성 로그 → 렌더러 UI로 IPC 전송
function sendImageLog(message: string): void {
  try {
    const { BrowserWindow } = require('electron');
    const wins = BrowserWindow.getAllWindows();
    if (wins[0]) {
      wins[0].webContents.send('image-generation:log', message);
    }
  } catch { /* 렌더러 초기화 전이면 무시 */ }
  console.log(message); // 터미널에도 출력
}

// ✅ [2026-03-02] Gemini 모델별 이미지 1장당 추정 비용 (원화)
const MODEL_COST_KRW: Record<string, number> = {
  // ✅ [v2.7.25] Google 공식 단가 기준 정확화
  //   gemini-2.5-flash-image: $0.039/장 (1290 출력 토큰 × $30/1M) ≈ ₩54/장 (환율 ₩1,380)
  //   가짜 ID(gemini-3.x preview) 항목은 호환성 위해 동일 단가로 매핑
  'gemini-3.1-flash-image-preview': 54,    // 통합 매핑 (실제 = gemini-2.5-flash-image)
  'gemini-3-pro-image-preview': 54,        // 통합 매핑 (실제 = gemini-2.5-flash-image)
  'gemini-2.5-flash-image': 54,            // 나노바나나 정식 GA (~₩54/장)
  'gemini-2.0-flash-exp-image-generation': 0, // 무료
  'imagen-4.0-generate-001': 100,          // 이미지4 (~₩100)
};

// 전역 사용된 이미지 URL 추적
const usedImageUrls = new Set<string>();
const MAX_USED_URLS = 500; // ✅ [2026-02-03] 메모리 누수 방지: 최대 500개 유지

// ✅ [2026-02-18] 503 에러 폴백 시스템 (모듈 레벨 - 호출 간 상태 공유)
// Imagen 4: 고품질 이미지 전용 모델 (Gemini 3 Pro 서버 과부하 시 폴백)
const FALLBACK_MODEL = 'imagen-4.0-generate-001';
let global503Count = 0; // 전체 503 에러 누적 카운트
let global503FallbackActive = false; // 폴백 모델 활성 여부
let global503FallbackStartTime = 0; // 폴백 시작 시간 (30분 후 자동 복구)

// ✅ [2026-02-23 FIX] 폴백 모델용 프롬프트 정제 함수
// 나노바나나프로(Gemini 기본 모델)에서만 한글 텍스트를 생성해야 함
// Imagen 4, gemini-2.5-flash 폴백에서는 텍스트 없는 이미지만 생성
function stripTextInstructions(prompt: string): string {
  let cleaned = prompt
    // 텍스트 배치 관련 섹션 전체 제거
    .replace(/⚠️ CRITICAL TEXT PLACEMENT[\s\S]*?(?=\n\n)/g, '')
    .replace(/DESIGN REQUIREMENTS \(NAVER HOMEFEED QUALITY\):[\s\S]*?(?=\n\n)/g, '')
    .replace(/TEXT OVERLAY REQUIREMENTS:[\s\S]*?(?=\n\n)/g, '')
    // 개별 텍스트 관련 지시문 제거
    .replace(/- Use BOLD.*?typography.*?\n/gi, '')
    .replace(/- .*?Korean text overlay.*?\n/gi, '')
    .replace(/- .*?텍스트.*?\n/g, '')
    .replace(/Can include Korean text overlay[^.\n]*/gi, '')
    .replace(/BOLD.*?Korean text overlay[^.\n]*/gi, '')
    .replace(/Text must be CLEARLY VISIBLE[^.\n]*/gi, '')
    .replace(/THE TEXT SHOULD BE THE MAIN[^.\n]*/gi, '')
    .replace(/- Text should be placed in.*?\n/gi, '')
    .replace(/- Keep text in a SINGLE LINE.*?\n/gi, '')
    .replace(/- Use COMPACT text.*?\n/gi, '')
    .replace(/- TEXT MUST NOT EXTEND.*?\n/gi, '')
    .replace(/- ALL TEXT MUST be placed.*?\n/gi, '')
    .replace(/- NEVER place text near.*?\n/gi, '')
    .replace(/- .*?LARGE.*?and.*?impactful typography.*?\n/gi, '')
    .replace(/- Add the title text:.*?\n/gi, '')
    .replace(/- The ONLY text allowed is the title:.*?\n/gi, '')
    .replace(/- MAX \d+ lines of text.*?\n/gi, '')
    .replace(/- .*?font size.*?\n/gi, '')
    .replace(/- .*?48-64px.*?\n/gi, '')
    // 한글 제목 문자열 "..." 내의 한글을 공백으로 대체
    .replace(/"([^"]*)"/g, (match, content) => {
      return /[\uAC00-\uD7AF]/.test(content) ? '""' : match;
    })
    // 연속 빈 줄 정리
    .replace(/\n{3,}/g, '\n\n');

  // 텍스트 없는 이미지 생성 지시 추가
  cleaned += '\n\nABSOLUTE RULE: DO NOT include ANY text, letters, words, numbers, or typography in this image. Generate a PURE VISUAL image only. NO TEXT AT ALL.';

  console.log(`[stripTextInstructions] 프롬프트 정제 완료: ${prompt.length}자 → ${cleaned.length}자`);
  return cleaned;
}

// ✅ [2026-02-18] Imagen 4 폴백 함수 (Gemini 3 Pro 503 시 대체)
// Imagen 4는 :predict 엔드포인트 사용 (Gemini의 :generateContent와 다름)
async function generateImageWithImagen4(
  prompt: string,
  apiKey: string,
  aspectRatio: string = '1:1',
  signal?: AbortSignal
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const axios = (await import('axios')).default; // Imagen 4 전용 — top-level import 없음

    // ✅ [2026-02-23 FIX] Imagen 4는 한글 텍스트 생성 불가 → 텍스트 관련 지시문 제거
    const cleanPrompt = stripTextInstructions(prompt);
    console.log(`[Imagen4-Fallback] 🖼️ Imagen 4로 이미지 생성 시도... (텍스트 지시문 제거됨)`);
    console.log(`[Imagen4-Fallback] 📐 비율: ${aspectRatio}, 프롬프트 길이: ${cleanPrompt.length}자`);

    // Imagen 4 :predict 요청 형식
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${FALLBACK_MODEL}:predict`,
      {
        instances: [{ prompt: cleanPrompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: aspectRatio,
          personGeneration: 'allow_adult',
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        timeout: 90000, // ✅ [2026-03-11 FIX] 60초→90초 (성공률 극대화)
        signal,
      }
    );

    // Imagen 4 응답: { predictions: [{ bytesBase64Encoded: "...", mimeType: "image/png" }] }
    const predictions = response.data?.predictions;
    if (predictions && predictions.length > 0 && predictions[0].bytesBase64Encoded) {
      const base64Data = predictions[0].bytesBase64Encoded;
      const mimeType = predictions[0].mimeType || 'image/png';
      const buffer = Buffer.from(base64Data, 'base64');
      console.log(`[Imagen4-Fallback] ✅ Imagen 4 생성 성공! (${Math.round(buffer.length / 1024)}KB)`);
      return { buffer, mimeType };
    }

    console.warn(`[Imagen4-Fallback] ⚠️ 응답에 이미지 없음:`, JSON.stringify(response.data).substring(0, 200));
    return null;
  } catch (error: any) {
    const statusCode = error?.response?.status;
    const errorMsg = error?.response?.data?.error?.message || error.message;
    console.error(`[Imagen4-Fallback] ❌ Imagen 4 실패 (${statusCode}): ${errorMsg}`);

    // 503이면 Imagen 4도 과부하 → null 반환 (상위에서 처리)
    if (statusCode === 503) {
      console.error(`[Imagen4-Fallback] ❌ Imagen 4 서버도 503 → 이미지 생성 불가`);
    }
    return null;
  }
}


// ✅ [2026-02-03 FIX] Set 크기 제한 함수
function addToUsedUrls(url: string): void {
  if (usedImageUrls.size >= MAX_USED_URLS) {
    // 가장 오래된 항목 삭제 (FIFO)
    const firstUrl = usedImageUrls.values().next().value;
    if (firstUrl) usedImageUrls.delete(firstUrl);
  }
  usedImageUrls.add(url);
}

// ✅ [2026-01-29] 쇼핑커넥트 라이프스타일 전용 스타일 (쇼핑커넥트는 비즈니스 요구사항이므로 유지)
const SHOPPING_CONNECT_LIFESTYLE_STYLE = `Premium lifestyle photography, Korean person (20-40s) using the product, luxury Korean setting, warm natural lighting, Instagram-worthy aspirational aesthetic, Samsung/LG ad quality.`;

// ✅ [2026-03-01] 인물 필수 / 제외 카테고리 목록 (하드코딩 → personRule만 제공)
const PERSON_REQUIRED_CATEGORIES = [
  '스타 연예인', '스포츠', '패션 뷰티', '건강',
  '교육/육아', '자기계발', '취미 라이프', '책 영화',
];
const NO_PERSON_CATEGORIES = [
  '요리 맛집', '여행', 'IT 테크', '제품 리뷰',
  '리빙 인테리어', '반려동물', '자동차', '부동산',
  '비즈니스 경제', '사회 정치', '공부', '생활 꿀팁',
];

/**
 * ✅ [2026-03-01] AI 추론 기반 리팩토링: getCategoryStyle() → getPersonRule()
 * - 하드코딩된 28개 카테고리 비주얼 스타일 전면 삭제
 * - AI 모델(Gemini)이 주제(heading)에서 적절한 비주얼을 직접 추론
 * - 이 함수는 인물 출현 규칙(person rule)만 반환
 * - 인물 등장 시 반드시 한국인으로 하드코딩
 */
function getPersonRule(category?: string): string {
  if (!category || typeof category !== 'string') return '';

  const norm = String(category).toLowerCase().trim();

  // 인물 필수 카테고리
  const isPersonRequired = PERSON_REQUIRED_CATEGORIES.some(c =>
    norm.includes(c.toLowerCase()) || c.toLowerCase().includes(norm)
  );
  if (isPersonRequired) {
    return 'If people appear, they MUST be Korean (한국인). Authentic Korean facial features, Korean bone structure, Korean skin tone. Never Western/Caucasian.';
  }

  // 인물 제외 카테고리
  const isNoPerson = NO_PERSON_CATEGORIES.some(c =>
    norm.includes(c.toLowerCase()) || c.toLowerCase().includes(norm)
  );
  if (isNoPerson) {
    return 'Focus only on objects, scenes, environments, products, food, or landscapes. NO PEOPLE, NO HANDS.';
  }

  // 기타 (AI가 자유롭게 판단, 인물 등장 시 한국인)
  return 'If people appear in the image, they MUST be Korean (한국인). Authentic Korean facial features. Never Western/Caucasian.';
}

// 해시 유틸리티는 v2.6.7에서 imageHashUtils.ts로 이동 — Flow와 공유

// ===== API 키 관리 =====

let storedGeminiApiKey: string | null = null;

// ✅ [2026-02-13] Gemini API 키 풀 매니저 (429 할당량 초과 시 자동 로테이션)
class GeminiKeyPool {
  private keys: string[];
  private currentIndex: number = 0;
  private exhaustedKeys: Set<string> = new Set(); // 할당량 소진된 키 추적
  private exhaustedAt: Map<string, number> = new Map(); // 소진 시각 (자동 복구용)

  constructor(keys: string[]) {
    // 중복 제거 + 빈 문자열 제거
    this.keys = [...new Set(keys.filter(k => k && k.trim().length > 0))];
  }

  /** 현재 사용 가능한 키 반환 (소진된 키 스킵) */
  getCurrentKey(): string | null {
    if (this.keys.length === 0) return null;

    // 1시간 이상 지난 소진 키는 복구 시도
    const now = Date.now();
    for (const [key, time] of this.exhaustedAt.entries()) {
      if (now - time > 3600000) { // 1시간
        this.exhaustedKeys.delete(key);
        this.exhaustedAt.delete(key);
        console.log(`[KeyPool] 🔄 키 ${key.substring(0, 10)}... 복구 (1시간 경과)`);
      }
    }

    // 사용 가능한 키 찾기
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.currentIndex + i) % this.keys.length;
      const key = this.keys[idx];
      if (!this.exhaustedKeys.has(key)) {
        this.currentIndex = idx;
        return key;
      }
    }

    // 모든 키 소진
    return null;
  }

  /** 현재 키를 소진 처리하고 다음 키로 전환. 새 키를 반환 (없으면 null) */
  markExhaustedAndRotate(): string | null {
    if (this.keys.length === 0) return null;

    const exhaustedKey = this.keys[this.currentIndex];
    this.exhaustedKeys.add(exhaustedKey);
    this.exhaustedAt.set(exhaustedKey, Date.now());
    console.log(`[KeyPool] ❌ 키 ${exhaustedKey.substring(0, 10)}... 할당량 소진 → 로테이션`);

    // 다음 사용 가능한 키 찾기
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    const nextKey = this.getCurrentKey();

    if (nextKey) {
      console.log(`[KeyPool] ✅ 새 키로 전환: ${nextKey.substring(0, 10)}... (${this.getAvailableCount()}/${this.keys.length} 사용 가능)`);
    } else {
      console.error(`[KeyPool] ⛔ 모든 API 키(${this.keys.length}개)가 할당량 소진됨!`);
    }

    return nextKey;
  }

  /** 사용 가능한 키 개수 */
  getAvailableCount(): number {
    return this.keys.length - this.exhaustedKeys.size;
  }

  /** 전체 키 개수 */
  getTotalCount(): number {
    return this.keys.length;
  }

  /** 키 풀이 비어있는지 */
  isEmpty(): boolean {
    return this.keys.length === 0;
  }
}

// ✅ [2026-03-02] 스마트 RPM 쓰로틀러 (분당 요청 횟수 제한 자동 관리)
// ✅ [v2.6.2] 적응형 쓰로틀러 — 429 없으면 점진 상향, 429 발생 시 자동 감속
// Gemini 이미지 모델 RPM (공식 2026-04):
//   - gemini-3-pro-image-preview: Tier 1 = 10 RPM
//   - gemini-3.1-flash-image-preview: Tier 1 = 60 RPM (Flash는 6배 높음)
//   - gemini-2.5-flash-image: Tier 1 = 10 RPM (이전 세대)
//   Tier 2+ (결제 >$100): 모두 1,000 RPM
class GeminiRpmThrottler {
  private callTimestamps: number[] = [];
  private currentMaxRpm: number;       // 동적 상한 (429 감지 시 감소)
  private readonly ceilingRpm: number;  // 상한 (모델별)
  private readonly floorRpm: number;    // 하한 (최소 보장)
  private readonly safetyMargin: number;
  private consecutiveSuccesses: number = 0;
  private last429At: number = 0;

  constructor(ceilingRpm: number = 30, floorRpm: number = 8, safetyMargin: number = 2) {
    this.ceilingRpm = ceilingRpm;
    this.floorRpm = floorRpm;
    this.currentMaxRpm = Math.floor((ceilingRpm + floorRpm) / 2); // 중간값 시작
    this.safetyMargin = safetyMargin;
  }

  private getRecentCallCount(): number {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    this.callTimestamps = this.callTimestamps.filter(t => t > oneMinuteAgo);
    return this.callTimestamps.length;
  }

  async throttle(): Promise<void> {
    const safeLimit = this.currentMaxRpm - this.safetyMargin;
    const recentCalls = this.getRecentCallCount();

    if (recentCalls >= safeLimit) {
      const oldestInWindow = this.callTimestamps[0];
      const waitMs = Math.max(0, (oldestInWindow + 60000) - Date.now()) + 1500;
      console.log(`[RPM Throttler] ⏳ 분당 ${recentCalls}/${this.currentMaxRpm}회 도달 → ${Math.round(waitMs / 1000)}초 대기`);
      sendImageLog(`⏳ 분당 요청 한도 ${recentCalls}/${this.currentMaxRpm}회 도달 — ${Math.round(waitMs / 1000)}초 대기 중...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  recordCall(): void {
    this.callTimestamps.push(Date.now());
    this.consecutiveSuccesses++;
    // [v2.6.2] 20회 연속 성공 시 RPM 상한 +5 상향 (적응형 가속)
    if (this.consecutiveSuccesses >= 20 && this.currentMaxRpm < this.ceilingRpm) {
      const newRpm = Math.min(this.ceilingRpm, this.currentMaxRpm + 5);
      if (newRpm > this.currentMaxRpm) {
        console.log(`[RPM Throttler] 🚀 적응형 가속: ${this.currentMaxRpm} → ${newRpm} RPM (20회 연속 성공)`);
        this.currentMaxRpm = newRpm;
      }
      this.consecutiveSuccesses = 0;
    }
  }

  /** [v2.6.2] 429 감지 시 호출 — RPM 상한 즉시 절반 감소 */
  record429(): void {
    this.last429At = Date.now();
    this.consecutiveSuccesses = 0;
    const newRpm = Math.max(this.floorRpm, Math.floor(this.currentMaxRpm / 2));
    console.warn(`[RPM Throttler] 🔻 429 감지 → RPM 상한 ${this.currentMaxRpm} → ${newRpm} 감소 (보호)`);
    this.currentMaxRpm = newRpm;
  }

  getStatus(): string {
    const count = this.getRecentCallCount();
    return `${count}/${this.currentMaxRpm} RPM (상한 ${this.ceilingRpm})`;
  }
}

// [v2.6.2] 전역 RPM 쓰로틀러 — Flash 고속화
// 기본 상한 30 RPM, 하한 8 RPM, 중간값 19에서 시작해 429 없으면 점진 가속
// Tier 2+ 사용자는 환경변수 GEMINI_RPM_CEILING으로 상향 가능
const getCeilingRpm = (): number => {
  try {
    const env = typeof process !== 'undefined' ? parseInt(process.env.GEMINI_RPM_CEILING || '', 10) : NaN;
    if (!isNaN(env) && env > 0) return env;
  } catch {}
  return 30; // Flash 모델 Tier 1 기준
};
const geminiRpmThrottler = new GeminiRpmThrottler(getCeilingRpm(), 8, 2);

// 전역 키 풀 인스턴스 (세션 간 소진 상태 공유)
let globalKeyPool: GeminiKeyPool | null = null;

/** 키 풀 초기화 (configManager에서 키 배열 로드 시 호출) */
function initKeyPool(primaryKey?: string, keyArray?: string[]): GeminiKeyPool {
  const allKeys: string[] = [];

  // 기존 단일 키도 포함
  if (primaryKey && primaryKey.trim()) {
    allKeys.push(primaryKey.trim());
  }

  // 배열 키 추가
  if (keyArray && Array.isArray(keyArray)) {
    keyArray.forEach(k => {
      if (k && k.trim()) allKeys.push(k.trim());
    });
  }

  // 중복 제거는 GeminiKeyPool 생성자에서 처리
  const pool = new GeminiKeyPool(allKeys);
  console.log(`[KeyPool] 🔑 키 풀 초기화: ${pool.getTotalCount()}개 키 등록`);
  return pool;
}

// ✅ [2026-02-03 FIX] AbortController를 세션 ID 기반으로 관리 (경쟁 조건 해결)
// 이전: 전역 변수로 동시 요청 시 덮어쓰기 문제
// 변경: Map으로 각 세션별 AbortController 관리
const abortControllerMap = new Map<string, AbortController>();
let currentSessionId: string | null = null;

export function setGeminiApiKey(apiKey: string): void {
  storedGeminiApiKey = apiKey;
  console.log(`[NanoBananaPro] Gemini API 키 설정됨: ${apiKey.substring(0, 10)}...`);
}

/**
 * ✅ [2026-02-03 FIX] 이미지 생성 중지 함수 (모든 세션 중지)
 */
export function abortImageGeneration(): void {
  if (abortControllerMap.size > 0) {
    for (const [sessionId, controller] of abortControllerMap.entries()) {
      controller.abort();
      console.log(`[NanoBananaPro] ⏹️ 세션 ${sessionId} 이미지 생성 중지됨`);
    }
    abortControllerMap.clear();
    currentSessionId = null;
    console.log('[NanoBananaPro] ⏹️ 모든 이미지 생성이 중지되었습니다.');
  }
}

/**
 * ✅ [2026-02-03] 특정 세션만 중지
 */
export function abortImageGenerationSession(sessionId: string): void {
  const controller = abortControllerMap.get(sessionId);
  if (controller) {
    controller.abort();
    abortControllerMap.delete(sessionId);
    console.log(`[NanoBananaPro] ⏹️ 세션 ${sessionId} 이미지 생성 중지됨`);
  }
}

/**
 * 나노 바나나 프로로 이미지 생성 (Gemini 기반)
 * ✅ [100점 수정] stopCheck 콜백 추가 - 루프 중 중지 여부 확인
 * ✅ [2026-02-03 FIX] 세션 기반 AbortController + global503Count
 * ✅ [2026-02-13 SPEED] onImageGenerated 콜백 + 참조 이미지 캐싱 + 병렬 3개
 */
export async function generateWithNanoBananaPro(
  items: ImageRequestItem[],
  postTitle?: string,
  postId?: string,
  isFullAuto: boolean = false,
  providedApiKey?: string,
  isShoppingConnect?: boolean,
  collectedImages?: string[],
  stopCheck?: () => boolean,  // ✅ 중지 여부 확인 콜백
  onImageGenerated?: (image: GeneratedImage, index: number, total: number) => void,  // ✅ [2026-02-13] 이미지 완성 즉시 콜백
  productData?: { name?: string; price?: string; brand?: string; category?: string },  // ✅ [2026-02-23 FIX] 제품 가격 정보 → 스펙 표 정확도 향상
  forceModelKey?: string,  // v2.7.16: 호출자가 명시적으로 모델 강제 ('gemini-3-1-flash' = 나노바나나2, 'gemini-3-pro' = 나노바나나프로)
): Promise<GeneratedImage[]> {
  // v2.7.16: forceModelKey가 주어지면 config의 nanoBananaMainModel/SubModel을 일시 오버라이드
  if (forceModelKey) {
    const cm = await import('../configManager.js');
    const cfg = await cm.loadConfig();
    (cfg as any).nanoBananaMainModel = forceModelKey;
    (cfg as any).nanoBananaSubModel = forceModelKey;
    console.log(`[NanoBananaPro] 🎯 forceModelKey="${forceModelKey}" — config 일시 오버라이드`);
  }
  const mode = isFullAuto ? '풀오토' : '일반';
  const primaryApiKey = providedApiKey || storedGeminiApiKey || process.env.GEMINI_API_KEY;

  // ✅ [2026-02-13] 키 풀 초기화 (다중 키 로테이션 지원)
  const configModuleForKeys = await import('../configManager.js');
  const configForKeys = await configModuleForKeys.loadConfig();
  const keyPool = initKeyPool(primaryApiKey || undefined, (configForKeys as any).geminiApiKeys);
  globalKeyPool = keyPool;

  // 키 풀에서 첫 번째 사용 가능한 키 가져오기
  const apiKey = keyPool.getCurrentKey() || primaryApiKey;
  console.log(`[NanoBananaPro] 🔑 키 풀: ${keyPool.getTotalCount()}개 키 등록, 현재 키: ${apiKey ? apiKey.substring(0, 10) + '...' : '미설정'}`);

  // ✅ [2026-02-03 FIX] 세션 ID 생성 및 AbortController 등록 (경쟁 조건 해결)
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const sessionAbortController = new AbortController();
  abortControllerMap.set(sessionId, sessionAbortController);
  currentSessionId = sessionId;
  console.log(`[NanoBananaPro] 🆔 새 세션 시작: ${sessionId}`);



  // ✅ [2026-02-13 FIX] 세션 cleanup을 try-finally로 보장 (예외 시 AbortController 메모리 누수 방지)
  try {

    // ✅ [2026-01-24 FIX] 수집된 이미지 유사도 필터링 (스티커가 붙은 같은 이미지 중복 제거)
    let filteredCollectedImages = collectedImages || [];
    if (isShoppingConnect && collectedImages && collectedImages.length > 1) {
      try {
        const { filterSimilarImages } = await import('./imageUtils.js');
        console.log(`[NanoBananaPro] 🔍 수집된 이미지 유사도 필터링 시작 (${collectedImages.length}개)...`);
        filteredCollectedImages = await filterSimilarImages(collectedImages, 12); // threshold=12 (약간 관대하게)
        console.log(`[NanoBananaPro] ✅ 유사 이미지 필터링 완료: ${collectedImages.length}개 → ${filteredCollectedImages.length}개`);
      } catch (filterError) {
        console.warn(`[NanoBananaPro] ⚠️ 유사 이미지 필터링 실패, 원본 사용:`, (filterError as Error).message);
        filteredCollectedImages = collectedImages;
      }
    }

    console.log(`[NanoBananaPro] 🍌 총 ${items.length}개 이미지 생성 시작 (${mode} 모드)`);
    console.log(`[NanoBananaPro] Gemini API 키: ${apiKey ? apiKey.substring(0, 10) + '...' : '미설정'}`);

    const configModule = await import('../configManager.js');
    const config = await configModule.loadConfig();

    const todayKey = new Date().toISOString().split('T')[0];

    if (config.geminiImageLastReset !== todayKey) {
      config.geminiImageLastReset = todayKey;
      config.geminiImageDailyCount = 0;
      await configModule.saveConfig(config);
      console.log(`[NanoBananaPro] 📅 날짜 변경됨 → 카운트 초기화 (${todayKey})`);
    }

    const planType = config.geminiPlanType || 'paid';
    console.log(`[NanoBananaPro] 적용된 플랜 정책: ${planType.toUpperCase()}`);

    const currentCount = config.geminiImageDailyCount || 0;
    const FREE_DAILY_LIMIT = 100;
    const PAID_DAILY_LIMIT = 9999;
    const isPaid = planType === 'paid';
    const limit = isPaid ? PAID_DAILY_LIMIT : FREE_DAILY_LIMIT;
    const estimatedBatchCost = items.length * 0.04;

    console.log(`[NanoBananaPro] 현재 플랜: ${planType.toUpperCase()}, 금일 사용량: ${currentCount}/${limit}`);
    console.log(`[NanoBananaPro] 💰 이번 작업 예상 비용: 약 $${estimatedBatchCost.toFixed(2)} (KRW 약 ${(estimatedBatchCost * 1350).toLocaleString()}원)`);

    if (currentCount >= limit) {
      throw new Error(isPaid ? '⛔ 유료 플랜 한도 초과' : '⛔ 무료 플랜 한도 초과');
    }

    if (!apiKey) {
      throw new Error('나노 바나나 프로(Gemini) API 키가 설정되지 않았습니다.');
    }

    const results: GeneratedImage[] = [];
    const usedImageHashes = new Set<string>();
    const usedImageAHashes: bigint[] = [];

    // ✅ [2026-02-13 SPEED] 참조 이미지 사전 캐싱 — 같은 이미지를 매번 다운로드하지 않음
    let cachedReferenceImage: { data: string; mimeType: string } | null = null;
    if (filteredCollectedImages && filteredCollectedImages.length > 0) {
      try {
        const firstImage = filteredCollectedImages[0];
        const candidateUrl = typeof firstImage === 'string'
          ? firstImage
          : ((firstImage as any)?.url || (firstImage as any)?.thumbnailUrl || '');

        if (candidateUrl && /^https?:\/\//i.test(candidateUrl)) {
          console.log(`[NanoBananaPro] 🚀 [사전 캐싱] 참조 이미지 다운로드 시작: ${candidateUrl.substring(0, 80)}...`);
          const cacheStartTime = Date.now();
          const axios = (await import('axios')).default;
          const fetched = await axios.get(candidateUrl, { responseType: 'arraybuffer', timeout: 15000 });
          const buf = Buffer.from(fetched.data);
          if (buf && buf.length > 0) {
            cachedReferenceImage = {
              data: buf.toString('base64'),
              mimeType: String(fetched.headers?.['content-type'] || 'image/png'),
            };
            const elapsed = Date.now() - cacheStartTime;
            console.log(`[NanoBananaPro] ✅ [사전 캐싱 완료] ${Math.round(buf.length / 1024)}KB, ${elapsed}ms — 이후 ${items.length - 1}번의 재다운로드 절약`);
          }
        }
      } catch (cacheErr: any) {
        console.warn(`[NanoBananaPro] ⚠️ [사전 캐싱 실패] 개별 다운로드로 fallback: ${cacheErr.message}`);
      }
    }

    // ✅ [v2.6.2] 병렬 한도 2 → 4 상향 (Flash 모델 고속화)
    //   이전: 2장 → 8장 처리 시 4 사이클 (장당 20초 × 4 = 80초)
    //   변경: 4장 → 8장 처리 시 2 사이클 (장당 20초 × 2 = 40초)
    //   안전: RPM 쓰로틀러가 Rate Limit 보호 (30 RPM 적응형)
    //   환경변수: GEMINI_PARALLEL_LIMIT로 튜닝 가능 (기본 4, 최대 8)
    const getParallelLimit = (): number => {
      try {
        const env = typeof process !== 'undefined' ? parseInt(process.env.GEMINI_PARALLEL_LIMIT || '', 10) : NaN;
        if (!isNaN(env) && env >= 1 && env <= 8) return env;
      } catch {}
      return 4;
    };
    const PARALLEL_LIMIT = getParallelLimit();
    console.log(`[NanoBananaPro] 📷 ${PARALLEL_LIMIT}장 병렬 처리 모드 (Gemini API, 적응형 RPM ${geminiRpmThrottler.getStatus()})`);

    // 병렬 처리를 위한 세마포어 (동시 실행 제한)
    let activeCount = 0;
    const queue: Array<() => Promise<void>> = [];

    const runNext = () => {
      while (activeCount < PARALLEL_LIMIT && queue.length > 0) {
        const task = queue.shift();
        if (task) {
          activeCount++;
          task().finally(() => {
            activeCount--;
            runNext();
          });
        }
      }
    };

    // 각 이미지 생성 작업을 Promise로 래핑
    const generatePromises = items.map((item, i) => {
      return new Promise<GeneratedImage | null>((resolve) => {
        const task = async () => {
          // 중지 여부 확인
          if (stopCheck && stopCheck()) {
            console.log(`[NanoBananaPro] ⏹️ 중지 요청됨 - 이미지 ${i + 1} 건너뜀`);
            resolve(null);
            return;
          }

          // ✅ [2026-01-19 수정] 쇼핑커넥트 모드에서는 AI 이미지가 썸네일이 아님 (수집된 제품 이미지가 썸네일)
          const isThumbnail = isShoppingConnect
            ? false  // 쇼핑커넥트: 썸네일은 수집된 제품 이미지 사용, AI 이미지는 모두 소제목용
            : ((item as any).isThumbnail !== undefined ? (item as any).isThumbnail : (i === 0));

          // ✅ [수정 2026-01-18] 쇼핑커넥트 썸네일은 HTML 렌더링(generateThumbnailWithTextOverlay)으로 별도 생성
          // 나노바나나프로에서는 1번 소제목 이미지에 텍스트를 강제로 넣지 않음 (텍스트 없이 생성)
          const modifiedItem = { ...item };
          // if (isShoppingConnect && isThumbnail) {
          //   (modifiedItem as any).allowText = true;
          //   console.log(`[NanoBananaPro] 🛒 [쇼핑커넥트 썸네일] 제목 텍스트 포함 강제 적용`);
          // }

          console.log(`[NanoBananaPro] 🖼️ [Parallel] "${item.heading}" 생성 시작 (${i + 1}/${items.length})...`);
          // ✅ [2026-01-28 DEBUG] allowText/isThumbnail 값 확인 로그
          console.log(`[NanoBananaPro] 📋 [DEBUG] i=${i}, isThumbnail=${isThumbnail}, allowText=${(modifiedItem as any).allowText}, itemAllowText=${(item as any).allowText}`);

          try {
            if (isShoppingConnect && filteredCollectedImages && filteredCollectedImages.length > 0) {
              console.log(`[NanoBananaPro] 🛒 [쇼핑커넥트] AI가 수집된 제품 이미지를 참조하여 이미지 생성 (${i + 1}번)`);
            }

            let result: GeneratedImage | null = null;

            // ✅ [2026-03-17] 나노바나나 = Gemini API 직접 사용 (ImageFX 우선 로직 제거)
            result = await generateSingleImageWithGemini(
                modifiedItem,
                i,
                isThumbnail,
                postTitle,
                postId,
                isFullAuto,
                keyPool.getCurrentKey() || apiKey,
                isShoppingConnect,
                filteredCollectedImages,
                usedImageHashes,
                usedImageAHashes,
                sessionAbortController?.signal,
                items.length,
                cachedReferenceImage,
                keyPool
              );

            if (result) {
              console.log(`[NanoBananaPro] ✅ [Parallel] "${item.heading}" 생성 완료 (${i + 1}/${items.length})`);
              if (result.filePath) addToUsedUrls(result.filePath);
              // ✅ [2026-02-13 SPEED] 이미지 완성 즉시 콜백 → renderer에 실시간 전달
              if (onImageGenerated) {
                try { onImageGenerated(result, i, items.length); } catch (cbErr) { /* 콜백 오류 무시 */ }
              }
              resolve(result);
            } else {
              resolve(null);
            }
          } catch (error: any) {
            if (error.name === 'CanceledError' || error.name === 'AbortError') {
              console.log('[NanoBananaPro] ⏹️ 요청이 취소되었습니다.');
            } else {
              console.error(`[NanoBananaPro] ❌ "${item.heading}" 생성 실패:`, (error as Error).message);
            }
            resolve(null);
          }
        };

        queue.push(task);
      });
    });

    // 병렬 실행 시작
    runNext();

    // 모든 작업 완료 대기
    const settledResults = await Promise.allSettled(generatePromises);
    const fulfilledResults = settledResults.filter((r): r is PromiseFulfilledResult<GeneratedImage | null> => r.status === 'fulfilled').map(r => r.value);
    const rejectedResults = settledResults.filter(r => r.status === 'rejected');
    if (rejectedResults.length > 0) {
      console.warn(`[NanoBananaPro] ${rejectedResults.length}/${settledResults.length} image generations failed`);
    }

    // ✅ [2026-03-11 FIX] 실패 재시도 2라운드로 증가 - 원래 엔진 성공률 극대화
    const MAX_RETRY_ROUNDS = 2; // 실패한 이미지에 대해 2회 추가 재시도

    // 인덱스별 결과 매핑 (null = 실패)
    const indexedResults: (GeneratedImage | null)[] = [...fulfilledResults];

    // 실패한 이미지 인덱스 수집
    let failedIndices = indexedResults
      .map((r, idx) => r === null ? idx : -1)
      .filter(idx => idx >= 0);

    console.log(`[NanoBananaPro] 📊 1차 시도 결과: ${items.length - failedIndices.length}/${items.length} 성공`);

    // 실패한 이미지가 있으면 재시도
    for (let retryRound = 1; retryRound <= MAX_RETRY_ROUNDS && failedIndices.length > 0; retryRound++) {
      console.log(`[NanoBananaPro] 🔄 [재시도 ${retryRound}/${MAX_RETRY_ROUNDS}] ${failedIndices.length}개 실패 이미지 재생성 시작...`);

      // ✅ [2026-02-13 SPEED] 재시도 전 대기 축소 (3초→1초)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 실패한 각 이미지를 순차적으로 재시도 (병렬 X, 안정성 우선)
      for (const failedIdx of failedIndices) {
        if (stopCheck && stopCheck()) break;

        const item = items[failedIdx];
        const isThumbnail = isShoppingConnect ? false : ((item as any).isThumbnail !== undefined ? (item as any).isThumbnail : (failedIdx === 0));

        console.log(`[NanoBananaPro] 🔄 [재시도] "${item.heading}" (인덱스 ${failedIdx + 1}/${items.length})...`);

        try {
          // ✅ [2026-02-13] 키 풀에서 최신 키 사용 (재시도 시 로테이션된 키 반영)
          const retryApiKey = keyPool.getCurrentKey() || apiKey;
          const result = await generateSingleImageWithGemini(
            item,
            failedIdx,
            isThumbnail,
            postTitle,
            postId,
            isFullAuto,
            retryApiKey,
            isShoppingConnect,
            filteredCollectedImages,
            usedImageHashes,
            usedImageAHashes,
            sessionAbortController?.signal,
            items.length,
            cachedReferenceImage,  // ✅ [2026-02-13 SPEED] 사전 캐싱된 참조 이미지
            keyPool  // ✅ [2026-02-13] 키 풀 전달 (429 시 자동 로테이션)
          );

          if (result) {
            indexedResults[failedIdx] = result;
            console.log(`[NanoBananaPro] ✅ [재시도 성공] "${item.heading}"`);
            if (result.filePath) addToUsedUrls(result.filePath);
            // ✅ [2026-02-13 SPEED] 재시도 성공 시에도 콜백 호출
            if (onImageGenerated) {
              try { onImageGenerated(result, failedIdx, items.length); } catch (cbErr) { /* 콜백 오류 무시 */ }
            }
          }
        } catch (retryError: any) {
          console.warn(`[NanoBananaPro] ⚠️ [재시도 실패] "${item.heading}": ${retryError.message}`);
        }

        // ✅ [2026-02-13 SPEED] 다음 재시도 전 대기 축소 (2초→0.5초)
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 재시도 후 여전히 실패한 인덱스 업데이트
      failedIndices = indexedResults
        .map((r, idx) => r === null ? idx : -1)
        .filter(idx => idx >= 0);

      console.log(`[NanoBananaPro] 📊 [재시도 ${retryRound}] 결과: ${items.length - failedIndices.length}/${items.length} 성공`);
    }

    // 최종 결과 수집 (원래 순서 유지)
    indexedResults.forEach((result) => {
      if (result) {
        results.push(result);
      }
    });

    // 최종 성공률 로깅
    const finalSuccessRate = Math.round((results.length / items.length) * 100);
    console.log(`[NanoBananaPro] 🎯 최종 성공률: ${finalSuccessRate}% (${results.length}/${items.length})`);

    if (results.length > 0) {
      config.geminiImageDailyCount = (config.geminiImageDailyCount || 0) + results.length;
      await configModule.saveConfig(config);
      console.log(`[NanoBananaPro] 📈 쿼터 사용: +${results.length} (누적: ${config.geminiImageDailyCount})`);
    }

    // ✅ [표 이미지 통합] 쇼핑커넥트 모드에서 스펙 표 & 장단점 표 생성
    if (isShoppingConnect && postTitle) {
      console.log(`[NanoBananaPro] 📊 [표 이미지] 쇼핑커넥트 모드: 표 이미지 생성 시작...`);

      try {
        const { extractSpecsWithGemini, extractProsConsWithGemini, canGenerateSpecTable, canGenerateProsConsTable } = await import('./geminiTableExtractor.js');
        const { generateProductSpecTableImage, generateProsConsTableImage } = await import('./tableImageGenerator.js');

        // 본문 내용 수집 (items에서 body 필드 추출)
        const bodyContent = items.map(item => `${item.heading}\n${(item as any).body || ''}`).join('\n\n');

        // 1. 스펙 추출 및 스펙 표 이미지 생성
        console.log(`[NanoBananaPro] 📊 [표 이미지] 스펙 추출 중...`);
        // ✅ [2026-02-23 FIX] productData가 있으면 crawledData 구성하여 정확한 가격 반영
        // ✅ [2026-03-04 FIX] 가격 없으면 '정보없음' 대신 아예 제외 → Gemini 혼동 방지
        // ✅ [2026-03-22 FIX] 가격 포맷 정규화: "원" 중복 방지 + 콤마 포맷팅
        //   입력 소스별 형식 차이: "29900" / "29,900원" / "29900원" → 모두 "29,900원"으로 통일
        let priceStr = '';
        if (productData?.price) {
          const rawPrice = String(productData.price).replace(/[,원\s]/g, '');
          const numPrice = parseInt(rawPrice, 10);
          priceStr = !isNaN(numPrice) && numPrice > 0
            ? `가격: ${numPrice.toLocaleString()}원`
            : '';
        }
        const crawledData = productData ? `제품명: ${productData.name || postTitle}\n${priceStr}\n브랜드: ${productData.brand || ''}\n카테고리: ${productData.category || ''}`.replace(/\n{2,}/g, '\n').trim() : null;
        if (crawledData) {
          console.log(`[NanoBananaPro] 💰 [표 이미지] 실제 제품 데이터로 스펙 추출: price=${productData?.price}`);
        } else {
          console.log(`[NanoBananaPro] ⚠️ [표 이미지] productData 없음 → 본문 기반으로 스펙 추출`);
        }
        const specs = await extractSpecsWithGemini(postTitle, crawledData, bodyContent, apiKey);

        if (canGenerateSpecTable(specs)) {
          console.log(`[NanoBananaPro] ✅ [표 이미지] 스펙 ${specs.length}개 추출 성공, 표 이미지 생성 중...`);
          const specTablePath = await generateProductSpecTableImage(postTitle, specs);

          // 30% 지점 계산 (예: 8개 섹션이면 2~3번째)
          const specPosition = Math.floor(items.length * 0.3);
          const specHeading = items[specPosition]?.heading || '제품 스펙';

          results.push({
            heading: `[스펙표] ${specHeading}`,
            filePath: specTablePath,
            provider: 'nano-banana-pro',
            previewDataUrl: '',
            savedToLocal: specTablePath,
            tableType: 'spec', // 표 이미지 타입 표시
            targetPosition: specPosition // 배치할 위치
          } as any);

          console.log(`[NanoBananaPro] ✅ [표 이미지] 스펙 표 생성 완료: ${specTablePath}`);
        } else {
          console.log(`[NanoBananaPro] ℹ️ [표 이미지] 스펙 부족 (${specs.length}개), 표 생성 건너뜀 (Silent Skip)`);
        }

        // 2. 장단점 추출 및 장단점 표 이미지 생성
        console.log(`[NanoBananaPro] 📊 [표 이미지] 장단점 추출 중...`);
        const prosConsData = await extractProsConsWithGemini(postTitle, bodyContent, apiKey);

        if (canGenerateProsConsTable(prosConsData)) {
          console.log(`[NanoBananaPro] ✅ [표 이미지] 장점 ${prosConsData.pros.length}개, 단점 ${prosConsData.cons.length}개 추출 성공, 표 이미지 생성 중...`);
          const prosConsTablePath = await generateProsConsTableImage(postTitle, prosConsData.pros, prosConsData.cons);

          // 80% 지점 계산 (예: 8개 섹션이면 6~7번째)
          const prosConsPosition = Math.floor(items.length * 0.8);
          const prosConsHeading = items[prosConsPosition]?.heading || '장단점 요약';

          results.push({
            heading: `[장단점표] ${prosConsHeading}`,
            filePath: prosConsTablePath,
            provider: 'nano-banana-pro',
            previewDataUrl: '',
            savedToLocal: prosConsTablePath,
            tableType: 'proscons', // 표 이미지 타입 표시
            targetPosition: prosConsPosition // 배치할 위치
          } as any);

          console.log(`[NanoBananaPro] ✅ [표 이미지] 장단점 표 생성 완료: ${prosConsTablePath}`);
        } else {
          console.log(`[NanoBananaPro] ℹ️ [표 이미지] 장단점 부족, 표 생성 건너뜀 (Silent Skip)`);
        }

      } catch (tableError: any) {
        // ✅ Silent Skip: 표 이미지 실패해도 발행 계속 진행
        console.warn(`[NanoBananaPro] ⚠️ [표 이미지] 생성 실패 (Silent Skip): ${tableError.message}`);
      }
    }

    return results;

  } finally {
    // ✅ [2026-02-13 FIX] 세션 정리 → finally 블록으로 이동 (예외 시에도 반드시 정리)
    abortControllerMap.delete(sessionId);
    if (currentSessionId === sessionId) {
      currentSessionId = null;
    }
    console.log(`[NanoBananaPro] 🏁 세션 종료: ${sessionId}`);
  }
}

/**
 * Gemini를 사용한 단일 이미지 생성 (PromptBuilder 사용으로 리팩토링됨)
 * ✅ [100점 수정] AbortSignal 파라미터 추가
 * ✅ [2026-01-18] batchSize 파라미터 추가 (배치 처리 시 첫 번째 이미지 구분용)
 * ✅ [2026-02-13 SPEED] cachedReferenceImage 파라미터 추가 (사전 캐싱된 참조 이미지)
 * ✅ [2026-02-13] keyPool 파라미터 추가 (429 시 자동 키 로테이션)
 */
async function generateSingleImageWithGemini(
  item: ImageRequestItem,
  index: number,
  isThumbnail: boolean,
  postTitle?: string,
  postId?: string,
  isFullAuto?: boolean,
  apiKey?: string,
  isShoppingConnect?: boolean,
  collectedImages?: string[],
  usedImageHashes?: Set<string>,
  usedImageAHashes?: bigint[],
  signal?: AbortSignal,  // ✅ [100점 수정] 중지 신호
  batchSize?: number,     // ✅ [2026-01-18] 배치 크기 (배치 처리 시 첫 번째 이미지 구분용)
  cachedReferenceImage?: { data: string; mimeType: string } | null,  // ✅ [2026-02-13 SPEED]
  keyPool?: GeminiKeyPool  // ✅ [2026-02-13] 키 풀 (429 시 자동 로테이션)
): Promise<GeneratedImage | null> {

  // 썸네일 크롭 헬퍼
  const cropThumbnail = async (buf: Buffer, ext: string): Promise<Buffer> => {
    try {
      const sharpModule = await import('sharp');
      const sharpFn = (sharpModule as any).default || (sharpModule as any);
      const s = sharpFn(buf).resize(1200, 630, { fit: 'inside' });
      if (ext === 'jpg' || ext === 'jpeg') return await s.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
      if (ext === 'webp') return await s.webp({ quality: 88 }).toBuffer();
      return await s.png({ quality: 90, compressionLevel: 9 }).toBuffer();
    } catch {
      return buf;
    }
  };

  // ✅ [2026-03-11 FIX] 재시도 횟수 증가 (2→3회) - 원래 엔진 성공률 극대화
  // Image-gen 429 recovery needs more attempts than text: image models have
  // tighter per-minute quotas (10 RPM on paid tier) and 429s cluster. 3 was
  // too tight — users hit 429 on image 4/5, exhausted retries, and saw the
  // whole post fail. 5 gives ~3 minutes of retry coverage.
  const maxRetries = 5;

  // ✅ [2026-01-27 FIX] config를 for 루프 앞에서 미리 로드 (imageStyle/imageRatio 사용 위해)
  const configModulePre = await import('../configManager.js');
  const configPre = await configModulePre.loadConfig();

  // ✅ [2026-01-30] 503 에러 연속 발생 추적 (더 긴 대기 시간 적용)
  let consecutive503Count = 0;

  // ✅ [2026-02-20] 503 폴백 타이머 체크 (10분 후 원래 모델 복구 시도) — 30분→10분 단축
  if (global503FallbackActive) {
    const elapsed = Date.now() - global503FallbackStartTime;
    const RECOVERY_TIMEOUT = 3 * 60 * 1000; // ✅ [2026-04-06] 3분으로 단축 (나노바나나 로테이션으로 빠른 복구)
    if (elapsed > RECOVERY_TIMEOUT) {
      console.log(`[NanoBananaPro] 🔄 폴백 ${Math.round(elapsed / 60000)}분 경과 → 원래 모델 복구 시도`);
      global503FallbackActive = false;
      global503Count = 0;
    } else {
      // 폴백 모드 활성 중 → 아래 정상 플로우에서 503 발생 시 즉시 폴백 사용
      console.log(`[NanoBananaPro] ⚠️ 폴백 모드 활성 중 (${Math.round((RECOVERY_TIMEOUT - elapsed) / 1000)}초 후 원래 모델 복구 시도 예정)`);
    }
  }

  let imageRatio = '1:1'; // 기본값 (try 블록에서 재설정) — 루프 밖으로 이동 (안전망 접근용)
  let prompt = '';        // 기본값 (try 블록에서 재설정) — 루프 밖으로 이동
  const lastApiKey = apiKey; // ✅ [2026-02-21] 마지막 사용 API 키 추적 (안전망용)
  let lastSelectedModel = ''; // ✅ [2026-04-06] 마지막 선택 모델 추적 (최종 안전망 로테이션용)

  attemptLoop:
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // ✅ [2026-01-27] 이미지 스타일 및 비율 설정 읽기 (config.json에서 - localStorage는 메인 프로세스에서 접근 불가)
      const imageStyle = (item as any).imageStyle || (configPre as any).imageStyle || 'realistic';
      imageRatio = (item as any).imageRatio || (configPre as any).imageRatio || '1:1';

      console.log(`[NanoBananaPro] 🎨 이미지 스타일: ${imageStyle}, 비율: ${imageRatio}`);

      // ✅ [2026-02-08] 11가지 스타일별 프롬프트 매핑 (3카테고리)
      const stylePromptMap: Record<string, string> = {
        // 📷 실사
        'realistic': 'Hyper-realistic professional photography, 8K UHD quality, DSLR camera, natural lighting, authentic Korean person, Fujifilm XT3 quality',
        'bokeh': 'Beautiful bokeh photography, shallow depth of field, dreamy out-of-focus background lights, soft circular bokeh orbs, DSLR wide aperture f/1.4 quality, romantic atmosphere, fairy light aesthetic',
        // 🖌️ 아트
        'vintage': 'Vintage retro illustration, 1950s poster art style, muted color palette, nostalgic aesthetic, old-fashioned charm, classic design elements, aged paper texture',
        'minimalist': 'Minimalist flat design, simple clean lines, solid colors, modern aesthetic, geometric shapes, professional infographic style, san-serif typography',
        '3d-render': '3D render, Octane render quality, Cinema 4D style, Blender 3D art, realistic materials and textures, studio lighting setup, high-end 3D visualization',
        'korean-folk': 'Korean traditional Minhwa folk painting style (한국 민화), vibrant primary colors on hanji paper, stylized tiger and magpie motifs, peony flowers, lotus blossoms, pine trees, traditional Korean decorative patterns, bold flat color areas with fine ink outlines, cheerful folk art aesthetic, naive but charming composition',
        // ✨ 이색
        'stickman': 'Cute chibi cartoon character with oversized round white head much larger than body (졸라맨), simple black dot eyes, small expressive mouth showing emotion, tiny simple body wearing colorful casual clothes, thick bold black outlines, flat cel-shaded colors with NO gradients, detailed colorful background scene that matches the topic, Korean internet meme comic art style, humorous and lighthearted mood, web comic panel composition, clean high quality digital vector art, NO TEXT NO LETTERS NO WATERMARK',
        // 🫧 뚱글이
        'roundy': 'Adorable chubby round blob character with extremely round soft body and very short stubby limbs (뚱글이), small dot eyes and tiny happy smile, pure white or soft pastel colored body, soft rounded outlines with NO sharp edges, dreamy pastel colored background with gentle gradient, Molang and Sumikko Gurashi inspired kawaii aesthetic, healing and cozy atmosphere, minimalist cute Korean character design, soft lighting with gentle shadows, warm comforting mood, high quality digital illustration, NO TEXT NO LETTERS NO WATERMARK',
        'claymation': 'Claymation stop-motion style, cute clay figurines, handmade plasticine texture, soft rounded shapes, miniature diorama set, warm studio lighting, Aardman Animations quality, Wallace and Gromit aesthetic',
        'neon-glow': 'Neon glow effect, luminous light trails, dark background with vibrant neon lights, synthwave aesthetic, glowing outlines, electric blue and hot pink, LED sign style, night atmosphere',
        'papercut': 'Paper cut art style, layered paper craft, 3D paper sculpture effect, shadow between layers, handmade tactile texture, colorful construction paper, kirigami aesthetic, depth through layering',
        'isometric': 'Isometric 3D illustration, cute isometric pixel world, 30-degree angle view, clean geometric shapes, pastel color palette, miniature city/scene, game-like perspective, detailed tiny world',
        // 🎨 2D 일러스트 (✅ [2026-02-17] 신규)
        '2d': 'Korean webtoon style 2D illustration, vibrant flat colors, clean line art, manhwa aesthetic, modern Korean digital illustration, soft pastel palette, cute and expressive character design'
      };

      const stylePrompt = stylePromptMap[imageStyle] || stylePromptMap['realistic'];

      // ✅ [2026-03-01] AI 추론 기반 리팩토링: categoryStyle → personRule
      // 쇼핑커넥트만 전용 스타일 유지, 나머지는 AI가 주제에서 비주얼 추론
      let categoryStyleToUse: string;
      let personRuleToUse: string;
      if (isShoppingConnect && collectedImages && collectedImages.length > 0) {
        // 쇼핑커넥트: 라이프스타일 이미지 전용 스타일 (사람이 제품 사용하는 장면)
        categoryStyleToUse = SHOPPING_CONNECT_LIFESTYLE_STYLE;
        personRuleToUse = 'Korean person (20-40s) using the product naturally. Authentic Korean facial features. Never Western/Caucasian.';
        console.log(`[NanoBananaPro] 🛒 쇼핑커넥트 라이프스타일 스타일 적용 (인물 + 제품 사용 장면)`);
      } else {
        categoryStyleToUse = ''; // AI가 주제에서 직접 비주얼 추론
        personRuleToUse = getPersonRule(item.category);
      }

      // 🔥 [핵심] PromptBuilder를 사용하여 프롬프트 생성 (코드가 매우 짧아짐)
      // ✅ [2026-01-30 100점] provider: 'nano-banana-pro' → Gemini가 한글 텍스트 직접 생성
      prompt = PromptBuilder.build(item, {
        isThumbnail,
        postTitle,
        categoryStyle: categoryStyleToUse, // ✅ 쇼핑커넥트만 전용 스타일, 나머지 빈 문자열
        personRule: personRuleToUse, // ✅ [2026-03-01] 인물 규칙 (한국인 하드코딩)
        isShoppingConnect,
        hasCollectedImages: !!(collectedImages && collectedImages.length > 0), // ✅ 추가: collectedImages 참조 모드
        provider: 'nano-banana-pro', // ✅ [2026-01-30] 나노바나나프로는 한글 지원 → AI 직접 텍스트 생성
        imageStyle, // ✅ [2026-03-01] 추가: 이미지 스타일 적용
        stylePrompt // ✅ [2026-03-01] 추가: 이미지 스타일 상세 프롬프트
      });

      // ✅ [2026-02-24 FIX] 재시도 시 프롬프트 변형 (선택된 스타일 범위 내에서만 변형)
      // 이전: "watercolor, flat design" 등 스타일 자체를 바꾸라는 지시 → realistic 선택과 충돌
      // 수정: 구도/색감/조명만 변형하여 원래 스타일 유지
      if (attempt > 1) {
        const variationStyles = [
          'Use a completely different color temperature (warm golden vs cool blue).',
          'Change the camera angle: try overhead, low angle, or extreme close-up.',
          'Shift the composition: try asymmetric framing or rule of thirds.',
          'Change the lighting mood: dramatic shadows vs soft diffused light.',
          'Try a different scene setting while keeping the same subject.',
        ];
        const randomVariation = variationStyles[Math.floor(Math.random() * variationStyles.length)];
        prompt += `\n\nVARIATION: ${randomVariation}`;
        console.log(`[NanoBananaPro] 🎨 변형 요청: ${randomVariation}`);
      }

      console.log(`[NanoBananaPro] 📡 Gemini 시도 ${attempt}/${maxRetries}: ${item.heading}`);

      // ===== Axios 호출 준비 =====
      const axios = (await import('axios')).default;

      const normalizeLocalPath = (raw: string): string => {
        const v = String(raw || '').trim();
        if (!v) return '';
        return v.replace(/^file:\/\//i, '').replace(/^\/+/, '');
      };

      const inferMimeType = (p: string): string => {
        const s = String(p || '').toLowerCase();
        if (s.endsWith('.jpg') || s.endsWith('.jpeg')) return 'image/jpeg';
        if (s.endsWith('.webp')) return 'image/webp';
        return 'image/png';
      };

      // ===== 레퍼런스 이미지 처리 =====
      const parts: Array<any> = [];
      let referenceImageLoaded = false;

      // ✅ [2026-02-13 SPEED] 캐시된 참조 이미지가 있으면 다운로드 생략
      if (cachedReferenceImage && !referenceImageLoaded) {
        parts.push({
          inlineData: {
            data: cachedReferenceImage.data,
            mimeType: cachedReferenceImage.mimeType,
          },
        });
        referenceImageLoaded = true;
        console.log(`[NanoBananaPro] ⚡ [캐시 사용] 참조 이미지 재다운로드 생략 (${index + 1}번)`);
      }

      try {
        const rawRefPath = String((item as any).referenceImagePath || '').trim();
        const rawRefUrl = String((item as any).referenceImageUrl || '').trim();

        // ✅ [2026-01-21 FIX] referenceImagePath가 URL인지 먼저 확인
        // URL이면 urlRef로 처리, 아니면 localRef로 처리
        const isRefPathUrl = /^https?:\/\//i.test(rawRefPath);

        const localRef = isRefPathUrl ? '' : normalizeLocalPath(rawRefPath);
        const urlRef = isRefPathUrl ? rawRefPath : (rawRefUrl && /^https?:\/\//i.test(rawRefUrl) ? rawRefUrl : '');

        if (!referenceImageLoaded && localRef) {
          const buf = await fs.readFile(localRef);
          if (buf && buf.length > 0) {
            parts.push({
              inlineData: {
                data: buf.toString('base64'),
                mimeType: inferMimeType(localRef),
              },
            });
            referenceImageLoaded = true;
            console.log(`[NanoBananaPro] ✅ 로컬 참조 이미지 로드: ${localRef}`);
          }
        } else if (!referenceImageLoaded && urlRef) {
          const fetched = await axios.get(urlRef, { responseType: 'arraybuffer', timeout: 25000 });
          const buf = Buffer.from(fetched.data);
          if (buf && buf.length > 0) {
            parts.push({
              inlineData: {
                data: buf.toString('base64'),
                mimeType: String(fetched.headers?.['content-type'] || inferMimeType(urlRef) || 'image/png'),
              },
            });
            referenceImageLoaded = true;
            console.log(`[NanoBananaPro] ✅ URL 참조 이미지 로드: ${urlRef}`);
          }
        }

        // ✅ [핵심 수정 2026-01-19] 참조 이미지가 없으면 collectedImages에서 첫 번째 이미지(1번 제품 이미지) 사용
        // 모든 AI 생성 이미지가 동일한 제품 이미지를 참조하여 일관성 유지
        // ✅ [버그 수정] collectedImages는 객체 배열 { url, thumbnailUrl, ... } 또는 문자열 배열일 수 있음
        if (!referenceImageLoaded && collectedImages && collectedImages.length > 0) {
          const firstImage = collectedImages[0];
          // 객체({ url: "...", thumbnailUrl: "..." })인지 문자열인지 판별
          const candidateUrl = typeof firstImage === 'string'
            ? firstImage
            : ((firstImage as any)?.url || (firstImage as any)?.thumbnailUrl || '');

          if (candidateUrl && /^https?:\/\//i.test(candidateUrl)) {
            try {
              console.log(`[NanoBananaPro] 🔄 1번 제품 이미지를 참조하여 AI 생성: ${candidateUrl.substring(0, 80)}...`);
              const fetched = await axios.get(candidateUrl, { responseType: 'arraybuffer', timeout: 25000 });
              const buf = Buffer.from(fetched.data);
              if (buf && buf.length > 0) {
                parts.push({
                  inlineData: {
                    data: buf.toString('base64'),
                    mimeType: String(fetched.headers?.['content-type'] || 'image/png'),
                  },
                });
                referenceImageLoaded = true;
                console.log(`[NanoBananaPro] ✅ collectedImages 참조 이미지 로드 성공 (${Math.round(buf.length / 1024)}KB)`);
              }
            } catch (collectedErr: any) {
              console.warn(`[NanoBananaPro] ⚠️ collectedImages 참조 이미지 로드 실패: ${collectedErr.message}`);
            }
          } else {
            console.warn(`[NanoBananaPro] ⚠️ collectedImages[0]에서 유효한 URL을 찾을 수 없음: ${JSON.stringify(firstImage).substring(0, 100)}`);
          }
        }
      } catch (err: any) {
        console.warn(`[NanoBananaPro] ⚠️ 참조 이미지 로드 실패: ${err.message}`);
      }

      parts.push({ text: prompt });

      // ===== 이미지 품질 티어 시스템: 모델 동적 선택 =====
      const configModule = await import('../configManager.js');
      const config = await configModule.loadConfig();

      // ✅ [2026-01-16] 환경설정에서 Nano Banana Pro 모델 설정 읽어오기
      // nanoBananaMainModel: 대표/썸네일 이미지 (통합)
      // nanoBananaSubModel: 본문 서브 이미지
      const userMainModel = (config as any).nanoBananaMainModel || 'gemini-3-1-flash';
      const userSubModel = (config as any).nanoBananaSubModel || 'gemini-3-1-flash';  // ✅ [2026-03-01] 기본값 gemini-3-1-flash로 변경 (나노바나나2)

      // ✅ [2026-01-18] 디버그 로그: 어떤 모델이 설정에서 로드되었는지 확인
      console.log(`[NanoBananaPro] 📋 환경설정 모델: Main="${(config as any).nanoBananaMainModel || '(미설정→gemini-3-1-flash)'}", Sub="${(config as any).nanoBananaSubModel || '(미설정→gemini-3-1-flash)'}"`);  // ✅ [2026-03-01] 기본값 나노바나나2
      console.log(`[NanoBananaPro] 📋 적용 모델: Main="${userMainModel}", Sub="${userSubModel}"`);

      // 모델 매핑 (설정값 → API 모델명)
      // ✅ [2026-02-20] 기본 모델을 gemini-2.5-flash-image로 변경
      // - gemini-2.0-flash-exp: 🆓 무료 실험 모델, 한글 정확도 높음
      // - gemini-2.5-flash-image: 1K 해상도, 비용 ~$0.034/장 (Pro 대비 4배 저렴)
      // - gemini-3-pro-image-preview: 4K/1K 해상도, 최고 품질, 비용 ~$0.134/장
      // ✅ [v2.7.24] 2026-04 기준 검증된 Google Gemini 공식 모델 ID로 일괄 정정
      //   이전 버그: 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview' 는
      //              Google API에 **존재하지 않는** ID 또는 미공개 → 모든 Tier에서 400 발생
      //   수정: 검증된 정식 ID(`gemini-2.5-flash-image`)를 모든 사용자 키에 매핑
      //   사용자 UI 명칭은 그대로 (나노바나나2/프로) 유지하되 내부 호출은 정확한 ID로
      const MODEL_MAP: Record<string, { model: string; resolution: string }> = {
        // 사용자 UI: "나노바나나 프로 4K"
        'gemini-3-pro-4k': { model: 'gemini-2.5-flash-image', resolution: '1K' },
        // 사용자 UI: "나노바나나 프로"
        'gemini-3-pro': { model: 'gemini-2.5-flash-image', resolution: '1K' },
        // 사용자 UI: "나노바나나2" — Flash 정식 GA로 매핑 (모든 Tier 작동)
        'gemini-3-1-flash': { model: 'gemini-2.5-flash-image', resolution: '1K' },
        // Imagen 4 — Tier 1+ 작동 확인됨
        'imagen-4': { model: 'imagen-4.0-generate-001', resolution: '1K' },
        // 나노바나나 (정식 GA)
        'gemini-2.5-flash': { model: 'gemini-2.5-flash-image', resolution: '1K' },
        // 무료 실험 모델 (preview 형식 ID)
        'gemini-2.0-flash-exp': { model: 'gemini-2.0-flash-preview-image-generation', resolution: '1K' },
      };

      // 이미지 유형에 따라 모델 결정 (썸네일과 대표 이미지 통합)
      let selectedModel: string;
      let selectedResolution: string = '1K';
      // ✅ [2026-01-18 FIX v2] 모델 결정 로직 완성
      // - isThumbnail: 명시적 썸네일 플래그 (텍스트 포함)
      // - index === 0 && batchSize > 1: 배치 요청의 첫 번째 이미지 (대표 이미지)
      // - 한 장씩 요청(batchSize === 1 또는 undefined)이면서 isThumbnail이 false면 Sub 모델
      const effectiveBatchSize = batchSize ?? 1;
      const isFirstInBatch = index === 0 && effectiveBatchSize > 1;
      const isMainOrThumbnail = isThumbnail === true || isFirstInBatch;

      if (isMainOrThumbnail) {
        // 대표/썸네일 이미지: nanoBananaMainModel 사용 (통합)
        const configForMain = MODEL_MAP[userMainModel] || { model: 'gemini-2.5-flash-image', resolution: '1K' };
        selectedModel = configForMain.model;
        selectedResolution = configForMain.resolution;
        const imageType = isThumbnail ? '썸네일' : '대표';
        console.log(`[NanoBananaPro] 🖼️ ${imageType} 이미지: ${userMainModel} (${selectedModel}, ${selectedResolution})`);
      } else {
        // 본문 서브 이미지: nanoBananaSubModel 사용
        const configForSub = MODEL_MAP[userSubModel] || { model: 'gemini-2.5-flash-image', resolution: '1K' };
        selectedModel = configForSub.model;
        selectedResolution = configForSub.resolution;
        console.log(`[NanoBananaPro] 📷 서브 이미지: ${userSubModel} (${selectedModel}, ${selectedResolution})`);
      }
      lastSelectedModel = selectedModel; // ✅ [2026-04-06] 최종 안전망용 추적

      // ✅ [v2.7.22] 사용자 환경에서 작동하는 모델로 자동 교체 (사용자 모름)
      //   목적: Tier별/지역별 차단을 사전에 감지해 발행 시작 전 정상 모델로 전환
      //   효과: 400 발생 → 폴백 진입 → 시간 낭비를 사전 차단
      try {
        const { pickWorkingImageModel } = await import('./geminiAutoRecovery.js');
        const picked = await pickWorkingImageModel(apiKey || '', selectedModel);
        if (!picked.isOriginal && picked.model && picked.model !== selectedModel) {
          console.log(`[NanoBananaPro] 🤖 [Auto-Recovery] ${selectedModel} → ${picked.model} (${picked.reason})`);
          selectedModel = picked.model;
          lastSelectedModel = selectedModel;
        }
      } catch {
        // 헬스체크 실패는 무시 — 기존 폴백 체인이 백업
      }






      // ===== 🔥 [2026-03-01] 4단계 계단식 폴백 체인 =====
      // 나노바나나2 → 나노바나나프로 → 이미진4 → 나노바나나
      // 503/429/500 에러 시 활성화, 현재 선택 모델은 건너뜀
      if (global503FallbackActive) {
        const effectiveRatio = isShoppingConnect ? '1:1' : imageRatio;

        // ✅ [2026-04-06] 폴백 체인: 나노바나나 계열만 로테이션 (Imagen 4 제거)
        // Imagen 4는 서버 과부하 시 동일하게 실패하므로, Gemini 모델 간 로테이션이 더 안정적
        // ✅ [v2.7.24] 검증된 정식 모델 ID만 사용 (가짜 ID 제거)
        //   gemini-3.1-flash-image-preview, gemini-3-pro-image-preview는 미존재 ID
        //   → 폴백 체인에서 완전 제거
        const FALLBACK_CHAIN = [
          { name: '나노바나나(정식)', model: 'gemini-2.5-flash-image', type: 'gemini' },
          { name: '나노바나나(무료)', model: 'gemini-2.0-flash-preview-image-generation', type: 'gemini' },
          { name: 'Imagen 4', model: 'imagen-4.0-generate-001', type: 'imagen' },
        ];

        // 현재 선택된 모델은 이미 실패했으므로 건너뜀
        const chainToTry = FALLBACK_CHAIN.filter(f => f.model !== selectedModel);
        console.log(`[NanoBananaPro] ⚡ 4단계 폴백 시작 (현재 모델: ${selectedModel} 제외, ${chainToTry.length}개 후보)`);

        for (let step = 0; step < chainToTry.length; step++) {
          const fallback = chainToTry[step];
          console.log(`[NanoBananaPro] ⚡ 폴백 Step ${step + 1}/${chainToTry.length}: ${fallback.name} (${fallback.model}) 시도`);

          try {
            if (fallback.type === 'imagen') {
              // === Imagen 4: 별도 :predict 엔드포인트 ===
              const imagen4Direct = await generateImageWithImagen4(
                prompt,
                apiKey || '',
                effectiveRatio,
                signal
              );

              if (imagen4Direct) {
                let finalBuffer = imagen4Direct.buffer;
                const extension = imagen4Direct.mimeType.includes('jpeg') ? 'jpg' : 'png';

                const metadata = await sharp(finalBuffer).metadata();
                if (metadata.width && metadata.width > 2048) {
                  finalBuffer = await sharp(finalBuffer).resize(2048, null, { withoutEnlargement: true }).toBuffer();
                }
                if (isThumbnail) finalBuffer = await cropThumbnail(finalBuffer, extension);

                const savedResult = await writeImageFile(finalBuffer, extension, item.heading, postTitle, postId);
                console.log(`[NanoBananaPro] ✅ ${fallback.name} 폴백 성공! (${Math.round(finalBuffer.length / 1024)}KB)`);
                trackApiUsage('gemini', { images: 1, model: fallback.model });

                return {
                  heading: item.heading,
                  filePath: savedResult.savedToLocal || savedResult.filePath,
                  provider: `${fallback.model}-fallback` as any,
                  previewDataUrl: savedResult.previewDataUrl,
                  savedToLocal: savedResult.savedToLocal,
                  originalIndex: (item as any).originalIndex,
                };
              } else {
                console.warn(`[NanoBananaPro] ⚠️ ${fallback.name} 폴백: 이미지 없음 → 다음 단계`);
                continue;
              }
            } else {
              // === Gemini 모델: :generateContent 엔드포인트 ===
              const axiosFallback = (await import('axios')).default;
              const fallbackParts = parts.map((p: any) => {
                if (p.text) {
                  return { text: stripTextInstructions(p.text) };
                }
                return p;
              });

              // ✅ [2026-03-02] RPM 쓰로틀 적용 (폴백 Gemini 호출)
              await geminiRpmThrottler.throttle();
              const fallbackResponse = await axiosFallback.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${fallback.model}:generateContent`,
                {
                  contents: [{ parts: fallbackParts }],
                  generationConfig: {
                    responseModalities: ['Text', 'Image'],
                    imageConfig: { imageSize: '1K', aspectRatio: effectiveRatio }
                  }
                },
                { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey || '' }, timeout: 60000, signal }
              );
              geminiRpmThrottler.recordCall();

              const fallbackCandidates = fallbackResponse.data?.candidates;
              if (fallbackCandidates?.[0]?.content?.parts) {
                for (const fbPart of fallbackCandidates[0].content.parts) {
                  if (fbPart.inlineData?.data) {
                    let fbBuffer: Buffer = Buffer.from(fbPart.inlineData.data, 'base64') as Buffer;
                    const fbExt = (fbPart.inlineData.mimeType || '').includes('jpeg') ? 'jpg' : 'png';
                    if (isThumbnail) fbBuffer = await cropThumbnail(fbBuffer, fbExt);
                    const fbSaved = await writeImageFile(fbBuffer, fbExt, item.heading, postTitle, postId);
                    console.log(`[NanoBananaPro] ✅ ${fallback.name} 폴백 성공! (${Math.round(fbBuffer.length / 1024)}KB)`);
                    trackApiUsage('gemini', { images: 1, model: fallback.model });
                    return {
                      heading: item.heading,
                      filePath: fbSaved.savedToLocal || fbSaved.filePath,
                      provider: `${fallback.model}-fallback` as any,
                      previewDataUrl: fbSaved.previewDataUrl,
                      savedToLocal: fbSaved.savedToLocal,
                      originalIndex: (item as any).originalIndex,
                    };
                  }
                }
              }
              console.warn(`[NanoBananaPro] ⚠️ ${fallback.name} 폴백: 이미지 없음 → 다음 단계`);
            }
          } catch (fbErr: any) {
            console.warn(`[NanoBananaPro] ⚠️ ${fallback.name} 폴백 실패 (${fbErr?.response?.status || fbErr.message}) → 다음 단계`);
          }
        }

        // 모든 폴백 실패 → 원래 모델 복구 시도
        console.warn(`[NanoBananaPro] ⚠️ 4단계 폴백 모두 실패 → 원래 모델 복구 시도`);
        global503FallbackActive = false;
        global503Count = 0;
      }

      // ===== [2026-02-22] Imagen 4 직접 선택 시 별도 :predict 엔드포인트 사용 =====
      if (selectedModel === 'imagen-4.0-generate-001') {
        console.log(`[NanoBananaPro] 🖼️ Imagen 4 직접 선택 모드 → :predict 엔드포인트 사용`);
        const effectiveRatio = isShoppingConnect ? '1:1' : imageRatio;
        const imagen4Result = await generateImageWithImagen4(
          prompt,
          apiKey || '',
          effectiveRatio,
          signal
        );

        if (imagen4Result) {
          let finalBuffer = imagen4Result.buffer;
          const extension = imagen4Result.mimeType.includes('jpeg') ? 'jpg' : 'png';

          // 해상도 최적화
          const metadata = await sharp(finalBuffer).metadata();
          if (metadata.width && metadata.width > 2048) {
            finalBuffer = await sharp(finalBuffer).resize(2048, null, { withoutEnlargement: true }).toBuffer();
          }

          // 썸네일 크롭
          if (isThumbnail) finalBuffer = await cropThumbnail(finalBuffer, extension);

          const savedResult = await writeImageFile(finalBuffer, extension, item.heading, postTitle, postId);
          console.log(`[NanoBananaPro] ✅ Imagen 4 직접 생성 성공! (${Math.round(finalBuffer.length / 1024)}KB)`);
          trackApiUsage('gemini', { images: 1, model: 'imagen-4.0-generate-001' });

          return {
            heading: item.heading,
            filePath: savedResult.savedToLocal || savedResult.filePath,
            provider: 'nano-banana-pro',
            previewDataUrl: savedResult.previewDataUrl,
            savedToLocal: savedResult.savedToLocal,
            originalIndex: (item as any).originalIndex,
          };
        } else {
          // Imagen 4 실패 → 다음 attempt로 재시도 (Gemini 폴백)
          console.warn(`[NanoBananaPro] ⚠️ Imagen 4 직접 생성 실패 → 다음 시도`);
          throw new Error('Imagen 4 직접 생성 실패');
        }
      }

      // ===== Gemini API 호출 =====
      // ✅ [100점 수정] imageConfig로 해상도 설정 (4K/2K/1K)
      // ✅ [2026-01-26] 사용자 선택 비율 적용
      const imageConfigOptions: any = {
        imageSize: selectedResolution  // ✅ 4K, 2K, 1K 해상도 지원
      };

      // 쇼핑커넥트 모드에서는 1:1 비율 강제
      if (isShoppingConnect) {
        imageConfigOptions.aspectRatio = '1:1';
        console.log(`[NanoBananaPro] 🛒 쇼핑커넥트 모드: 1:1 비율 적용`);
      } else {
        // ✅ [2026-01-26] 사용자 선택 비율 적용 (1:1, 16:9, 9:16, 4:3, 3:4)
        imageConfigOptions.aspectRatio = imageRatio;
        console.log(`[NanoBananaPro] 📐 사용자 선택 비율 적용: ${imageRatio}`);
      }


      // ✅ [2026-03-02] RPM 쓰로틀 적용 (메인 Gemini 호출)
      await geminiRpmThrottler.throttle();
      console.log(`[NanoBananaPro] 📊 RPM 상태: ${geminiRpmThrottler.getStatus()}`);
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`,
        {
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ['Text', 'Image'],
            imageConfig: imageConfigOptions
          }
        },
        {
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey || '' },
          timeout: selectedResolution === '4K' ? 120000 : 90000,  // ✅ [2026-03-11 FIX] 타임아웃 상향 (4K:120초, 1K:90초) - 원래 엔진 성공률 극대화
          signal: signal  // ✅ [100점 수정] AbortSignal로 요청 취소 지원
        }
      );
      geminiRpmThrottler.recordCall();

      // ✅ [2026-03-02] 이미지 API 사용량 추적 (일일 비용 집계)
      try {
        const costKrw = MODEL_COST_KRW[selectedModel] || 100;
        const { consumeImageApi } = await import('../quotaManager.js');
        await consumeImageApi(costKrw);
      } catch { /* 쿼터 추적 실패는 무시 */ }

      // ===== 응답 처리 =====
      const candidates = response.data?.candidates;

      // ✅ [2026-01-23 FIX] API 응답 상세 로깅 (디버깅용)
      const hasValidCandidate = candidates && candidates[0]?.content?.parts;
      if (!hasValidCandidate) {
        console.error(`[NanoBananaPro] ❌ API 응답 구조 이상:`, {
          hasCandidates: !!candidates,
          candidatesLength: candidates?.length || 0,
          hasContent: !!candidates?.[0]?.content,
          hasParts: !!candidates?.[0]?.content?.parts,
          finishReason: candidates?.[0]?.finishReason,
          blockReason: response.data?.promptFeedback?.blockReason
        });
      }

      if (candidates && candidates[0]?.content?.parts) {
        for (const part of candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.data) {
            const imageData = part.inlineData.data;
            const mimeType = part.inlineData.mimeType || 'image/png';
            const extension = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';

            let buffer: Buffer = Buffer.from(imageData, 'base64');

            // 크기 검증 - 경고만 출력하고 허용
            if (buffer.length < 1000) {
              console.warn(`[NanoBananaPro] ⚠️ 이미지 크기가 작음 (${buffer.length} bytes) - 허용하고 진행`);
            }

            // 썸네일 크롭
            if (isThumbnail) buffer = await cropThumbnail(buffer, extension);

            // ===== 중복/유사 이미지 검사 (v2.6.7: 공유 유틸 + 비누적 hint) =====
            const probe = await probeDuplicate(buffer, usedImageHashes, usedImageAHashes);
            if (probe.isDuplicate || probe.isSimilar) {
              if (attempt < maxRetries) {
                const reason = probe.isDuplicate ? '중복(SHA256)' : '유사(aHash)';
                console.warn(`[NanoBananaPro] 🔁 ${reason} 감지 → diversity hint 적용 후 재시도 (${attempt}/${maxRetries}) - ${item.heading}`);
                sendImageLog(`🔁 중복 이미지 감지 — 다른 각도로 재생성 시도 (${attempt + 1}/${maxRetries})`);
                prompt = applyDiversityHint(prompt, attempt);
                continue attemptLoop;
              }
              console.warn(`[NanoBananaPro] ℹ️ 최종 attempt(${maxRetries})에도 중복/유사 — 허용하고 진행`);
            }
            commitHashes(probe, usedImageHashes, usedImageAHashes);

            // ===== 파일 저장 =====
            const savedResult = await writeImageFile(buffer, extension, item.heading, postTitle, postId);
            console.log(`[NanoBananaPro] ✅ 생성 성공 (${Math.round(buffer.length / 1024)}KB)`);
            trackApiUsage('gemini', { images: 1, model: selectedModel });

            // ✅ [2026-02-18] 성공 시 503 카운터 리셋 (서버 정상화 확인)
            if (global503FallbackActive || global503Count > 0) {
              console.log(`[NanoBananaPro] ✅ 이미지 생성 성공 → 503 카운터 리셋 (이전: ${global503Count}회)`);
              global503Count = 0;
              // 폴백 모델에서 성공하면 5분 타이머 유지 (원래 모델 자동 복구 대기)
            }

            return {
              heading: item.heading,
              filePath: savedResult.savedToLocal || savedResult.filePath,
              provider: 'nano-banana-pro',
              previewDataUrl: savedResult.previewDataUrl,
              savedToLocal: savedResult.savedToLocal,
              originalIndex: (item as any).originalIndex, // ✅ [2026-01-24] 원래 인덱스 보존
            };
          }
        }

        // ✅ [2026-02-20] 안전 필터/콘텐츠 차단 감지 및 자동 프롬프트 수정
        const finishReason = candidates[0]?.finishReason;
        const blockReason = (response as any).data?.promptFeedback?.blockReason;
        console.warn(`[NanoBananaPro] ⚠️ 응답에 parts 있지만 이미지 없음.`, {
          finishReason,
          blockReason,
          partsTypes: candidates[0].content.parts.map((p: any) => p.text ? 'text' : p.inlineData ? 'inlineData' : 'unknown')
        });

        // ✅ [2026-02-20] SAFETY/RECITATION 차단 시 프롬프트 자동 정화 후 1회 재시도
        if ((finishReason === 'SAFETY' || finishReason === 'RECITATION' || blockReason) && attempt === 1) {
          console.log(`[NanoBananaPro] 🔄 안전 필터 감지 → 프롬프트 정화 후 재시도`);
          // 민감한 키워드 제거
          prompt = prompt
            .replace(/\b(nude|naked|sexy|violence|blood|gore|kill|weapon|drug|alcohol|cigarette|gambling)\b/gi, '')
            .replace(/celebrity|famous person|real person|실제 인물|연예인|유명인/gi, 'professional model')
            .replace(/\bchild|children|kid|아이|어린이|아동/gi, 'young adult')
            .replace(/\n{3,}/g, '\n\n');
          prompt += '\n\nIMPORTANT: Generate a SAFE, family-friendly image. No controversial content.';
          console.log(`[NanoBananaPro] 📝 정화된 프롬프트 길이: ${prompt.length}자`);
          continue; // 다음 attempt로 재시도
        }
      }
      throw new Error(`Gemini 응답에서 이미지를 찾을 수 없습니다 (finishReason: ${candidates?.[0]?.finishReason || 'unknown'})`);

    } catch (error: any) {
      const errorMessage = error?.message || '알 수 없는 오류';
      const statusCode = error?.response?.status || (errorMessage.match(/(\d{3})/)?.[1]);

      // ✅ [2026-01-24 FIX] 에러 코드별 사용자 친화적 메시지
      const isQuotaError = errorMessage.includes('quota') || errorMessage.includes('429') || statusCode === 429;
      // ✅ [v2.6.2] 429 감지 → 적응형 쓰로틀러에 통보 → RPM 자동 감속
      if (isQuotaError) {
        try { geminiRpmThrottler.record429(); } catch {}
      }
      // ✅ [v2.7.20 HOTFIX] 400 Bad Request — 모델명 잘못/access 차단 진단
      //   사용자 제보: "제미나이 키는 정확한데 400 오류"
      //   원인: gemini-3.1-flash-image-preview 등 모델명이 사용자 Tier 또는 지역에서 미지원
      //   대응: 안정 모델(gemini-2.5-flash-image)로 즉시 전환 + 명확한 안내
      const isBadModelError = statusCode === 400 && (
        errorMessage.toLowerCase().includes('model') ||
        errorMessage.toLowerCase().includes('not found') ||
        errorMessage.toLowerCase().includes('not supported') ||
        errorMessage.toLowerCase().includes('invalid') ||
        errorMessage.toLowerCase().includes('preview')
      );
      if (isBadModelError) {
        const model = lastSelectedModel || 'unknown';
        console.warn(`[NanoBananaPro] 🚫 400 모델 오류 감지 (${model}) → 안정 모델 폴백 활성화`);
        sendImageLog(`🚫 모델(${model})이 현재 환경에서 지원 안 됨 → 안정 모델로 전환`);
        // 다음 시도부터 안정 모델 강제 사용
        if (model !== 'gemini-2.5-flash-image') {
          // 폴백 체인 활성화 (503 폴백 로직 재사용)
          global503FallbackActive = true;
          global503FallbackStartTime = Date.now();
        }
      }
      const isLimitZero = errorMessage.includes('limit: 0') || errorMessage.includes('free_tier');
      const isPaidOnly = errorMessage.includes('paid plan') || errorMessage.includes('paid plans');
      const isServerError = statusCode === 500 || statusCode === 503 || errorMessage.includes('500') || errorMessage.includes('503');
      const isAuthError = statusCode === 401 || statusCode === 403 || errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('API key');
      const isTimeoutError = errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNRESET');

      // ✅ [v1.4.44] limit:0 또는 paid plans only → 재시도 무의미, 즉시 안내
      if (isLimitZero || isPaidOnly) {
        console.error(`[NanoBananaPro] 🚫 무료 할당량 0 또는 유료 전용 — 재시도 불가`);
        sendImageLog(`🚫 나노바나나/Imagen은 Google이 무료 사용을 차단했습니다. 이미지 엔진을 ImageFX로 변경하세요 (무료). 참고: 유료 전환(Pay-as-you-go) 시 Flash/Flash-Lite 텍스트 무료 할당량도 사라지므로 주의!`);
        return null; // 즉시 종료 — 재시도/폴백 모두 무의미
      }

      // ✅ [2026-02-21] 최대 재시도 도달 → throw 대신 break → Imagen 4 최종 안전망으로 이동
      // ✅ [2026-03-09 FIX] 사용자 친화적 에러 메시지로 개선
      if (attempt === maxRetries) {
        const userFriendlyMsg = getImageErrorMessage(error);
        if (isQuotaError) {
          const poolInfo = keyPool ? ` (${keyPool.getAvailableCount()}/${keyPool.getTotalCount()}개 키 사용 가능)` : '';
          console.error(`[NanoBananaPro] ❌ 할당량 초과 (${maxRetries}회 재시도 실패)${poolInfo} → Imagen 4 안전망 시도`);
          sendImageLog(`⚠️ API 할당량이 초과되었습니다! 할당량을 확인하거나 다른 생성 엔진으로 변경해주세요. Imagen 4로 전환 시도 중...`);
        } else if (isServerError) {
          console.error(`[NanoBananaPro] ❌ 서버 오류 (${maxRetries}회 재시도 실패) → Imagen 4 안전망 시도`);
          sendImageLog(`🔥 이미지 생성 서버가 과부하 상태입니다! 다른 생성 엔진으로 변경하거나 잠시 기다려주세요. Imagen 4로 전환 시도 중...`);
        } else if (isAuthError) {
          console.error(`[NanoBananaPro] ❌ 인증 오류 → Imagen 4 안전망 시도`);
          sendImageLog(`🔑 API 키가 유효하지 않습니다! 설정 → API 키에서 키를 확인해주세요.`);
        } else if (isTimeoutError) {
          console.error(`[NanoBananaPro] ❌ 연결 시간 초과 (${maxRetries}회 재시도 실패) → Imagen 4 안전망 시도`);
          sendImageLog(`⏰ 연결 시간이 초과되었습니다. 네트워크 상태를 확인해주세요. Imagen 4로 전환 시도 중...`);
        } else {
          console.error(`[NanoBananaPro] ❌ 이미지 생성 실패: ${errorMessage} → Imagen 4 안전망 시도`);
          sendImageLog(userFriendlyMsg);
        }
        break; // ✅ throw 대신 break → for 루프 탈출 → Imagen 4 최종 안전망으로
      }

      // ✅ [2026-01-24 FIX] 재시도 대기 시간 강화 - 429 에러 시 더 긴 대기
      let waitTime = 3000 * attempt;
      if (isQuotaError) {
        // ✅ [2026-02-13] 키 풀 로테이션: 새 키가 있으면 즉시 전환, 없으면 긴 대기
        if (keyPool && keyPool.getTotalCount() > 1) {
          const nextKey = keyPool.markExhaustedAndRotate();
          if (nextKey) {
            // 새 키로 전환 성공 → 짧은 대기 후 즉시 재시도
            apiKey = nextKey;
            waitTime = 8000; // ✅ [2026-04-06] 8초 대기 (Gemini가 새 키를 인식할 시간 확보)
            console.log(`[NanoBananaPro] 🔄 429 감지 → 새 API 키로 전환 완료, 8초 후 재시도`);
            sendImageLog(`🔄 할당량 초과 → 다른 API 키로 전환하여 재시도합니다...`);
          } else {
            // 모든 키 소진 → 긴 대기
            waitTime = 15000 + (Math.random() * 10000);
            console.log(`[NanoBananaPro] ⚠️ 모든 API 키 소진 → ${Math.round(waitTime / 1000)}초 대기`);
            sendImageLog(`⚠️ 모든 API 키 소진 — ${Math.round(waitTime / 1000)}초 대기 중...`);
          }
        } else {
          // 키 풀 없음 → 기존 로직 (긴 대기)
          waitTime = 15000 + (Math.random() * 10000);
          console.log(`[NanoBananaPro] ⚠️ 할당량 오류(429) 감지 - 더 긴 대기 시간 적용`);
        }
        consecutive503Count = 0;  // 다른 에러는 503 카운트 리셋
      } else if (isServerError) {
        // ✅ [2026-03-01] 503/500 에러 시 4단계 폴백 체인 활성화
        consecutive503Count++;
        global503Count = (global503Count || 0) + 1;
        console.log(`[NanoBananaPro] ⚠️ 서버 오류(${statusCode}) 감지 - 연속 ${consecutive503Count}회 (전체 ${global503Count}회)`);

        // ✅ [2026-04-06] 1회라도 발생 → 즉시 나노바나나 로테이션 폴백 활성화
        if (consecutive503Count >= 1) {
          console.log(`[NanoBananaPro] 🔄 에러 ${statusCode} (${consecutive503Count}회 연속) → 나노바나나 로테이션 폴백 활성화`);
          global503FallbackActive = true;
          global503FallbackStartTime = Date.now();

          // ✅ [v2.7.24] 검증된 정식 ID만 사용 — 가짜 ID 완전 제거
          const NANO_ROTATION = [
            { name: '나노바나나(정식)', model: 'gemini-2.5-flash-image' },                       // 검증된 정식 GA
            { name: '나노바나나(무료)', model: 'gemini-2.0-flash-preview-image-generation' },    // 무료 등급 작동
          ].filter(m => m.model !== lastSelectedModel);

          let rotationSuccess = false;
          for (const fallbackModel of NANO_ROTATION) {
            console.log(`[NanoBananaPro] 🔄 ${fallbackModel.name} (${fallbackModel.model}) 즉시 시도...`);
            try {
              // 8초 대기 후 다른 모델로 시도 (같은 서버 과부하 방지)
              await new Promise(resolve => setTimeout(resolve, 8000));
              // 다음 재시도에서 이 모델을 사용하도록 추적
              lastSelectedModel = fallbackModel.model;
              rotationSuccess = true;
              console.log(`[NanoBananaPro] 🔄 → ${fallbackModel.name}으로 전환, 재시도 진행`);
              sendImageLog(`🔄 서버 과부하 → ${fallbackModel.name}으로 전환하여 재시도합니다...`);
              break;
            } catch (rotErr: any) {
              console.warn(`[NanoBananaPro] ⚠️ ${fallbackModel.name} 전환 실패: ${rotErr?.message}`);
            }
          }

          if (!rotationSuccess) {
            // 모든 로테이션 실패 → 대기 후 원래 모델 재시도
            console.error(`[NanoBananaPro] ❌ 모든 나노바나나 모델 전환 실패 → 대기 후 재시도`);
            waitTime = 10000 + (Math.random() * 5000);
          } else {
            waitTime = 2000; // 모델 전환 성공 → 짧은 대기
          }
          consecutive503Count = 0;
        }
      } else {
        consecutive503Count = 0;  // 다른 에러(인증/타임아웃 등)는 503 카운트 리셋
      }

      console.log(`[NanoBananaPro] ⏳ 에러 발생, ${Math.round(waitTime / 1000)}초 후 재시도... (${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  // ===== 🔥 [2026-04-06] 최종 안전망: 나노바나나 계열 전체 로테이션 =====
  // 선택 모델 재시도 실패 후 → 다른 나노바나나 모델을 순차 시도
  // ✅ [v2.7.24] 검증된 정식 ID만 유지 (gemini-3.x 프리뷰는 미존재)
  const FINAL_ROTATION = [
    { name: '나노바나나(정식)', model: 'gemini-2.5-flash-image' },
    { name: '나노바나나(무료)', model: 'gemini-2.0-flash-preview-image-generation' },
  ].filter(m => m.model !== lastSelectedModel); // 이미 실패한 모델 제외

  console.log(`[NanoBananaPro] 🛡️ 최종 안전망: ${FINAL_ROTATION.length}개 나노바나나 모델 순차 시도 (실패 모델: ${lastSelectedModel})`);

  for (const fallback of FINAL_ROTATION) {
    try {
      console.log(`[NanoBananaPro] 🛡️ 최종 안전망 시도: ${fallback.name} (${fallback.model})`);
      sendImageLog(`🛡️ 최종 안전망: ${fallback.name}으로 이미지 생성 시도...`);

      // 8초 대기 후 다른 모델 시도 (서버 과부하 분산)
      await new Promise(resolve => setTimeout(resolve, 8000));

      await geminiRpmThrottler.throttle();
      const effectiveKey = lastApiKey || apiKey || '';
      const effectiveRatio = isShoppingConnect ? '1:1' : imageRatio;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${fallback.model}:generateContent?key=${effectiveKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt || item.heading }] }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
              temperature: 1.0,
            },
          }),
          signal: signal || (AbortSignal as any).timeout?.(90000),
        },
      );
      geminiRpmThrottler.recordCall();

      if (!response.ok) {
        console.warn(`[NanoBananaPro] ⚠️ ${fallback.name} 최종 안전망 HTTP ${response.status} → 다음 모델`);
        continue;
      }

      const data = await response.json();
      const candidates = data?.candidates;
      if (!candidates?.[0]?.content?.parts) continue;

      for (const part of candidates[0].content.parts) {
        if (part.inlineData?.mimeType?.startsWith('image/')) {
          let finalBuffer: Buffer = Buffer.from(part.inlineData.data, 'base64');
          const extension = part.inlineData.mimeType.includes('jpeg') ? 'jpg' : 'png';

          const metadata = await sharp(finalBuffer).metadata();
          if (metadata.width && metadata.width > 2048) {
            finalBuffer = await sharp(finalBuffer).resize(2048, null, { withoutEnlargement: true }).toBuffer() as Buffer;
          }
          if (isThumbnail) finalBuffer = await cropThumbnail(finalBuffer, extension);

          const savedResult = await writeImageFile(finalBuffer, extension, item.heading, postTitle, postId);
          console.log(`[NanoBananaPro] ✅ ${fallback.name} 최종 안전망 성공! (${Math.round(finalBuffer.length / 1024)}KB)`);
          trackApiUsage('gemini', { images: 1, model: fallback.model });

          return {
            heading: item.heading,
            filePath: savedResult.savedToLocal || savedResult.filePath,
            provider: `${fallback.model}-final-fallback` as any,
            previewDataUrl: savedResult.previewDataUrl,
            savedToLocal: savedResult.savedToLocal,
            originalIndex: (item as any).originalIndex,
          };
        }
      }
      console.warn(`[NanoBananaPro] ⚠️ ${fallback.name} 최종 안전망: 이미지 파트 없음 → 다음 모델`);
    } catch (fallbackErr: any) {
      console.error(`[NanoBananaPro] ❌ ${fallback.name} 최종 안전망 실패:`, fallbackErr?.message);
    }
  }

  // 모든 나노바나나 모델 실패
  throw new Error(`[Gemini] ❌ 이미지 생성에 실패했습니다. 나노바나나 모든 모델(${lastSelectedModel} + ${FINAL_ROTATION.map(f => f.name).join(', ')})이 응답하지 않았습니다. API 키와 네트워크를 확인해주세요.`);
}

/**
 * 사용된 URL 목록 초기화
 */
export function clearUsedUrls(): void {
  usedImageUrls.clear();
  console.log('[NanoBananaPro] 🔄 사용된 URL 목록 초기화됨');
}

/**
 * ✅ [2026-02-23 FIX] 이미지 생성 전체 상태 초기화
 * 글 생성/이미지 생성 완료 후 또는 새 글 시작 전에 호출하여
 * 이전 세션의 캐시가 남지 않도록 완벽히 초기화
 * 
 * 초기화 대상:
 * - usedImageUrls: 중복 방지용 URL 추적 Set
 * - global503 상태: 503 폴백 시스템 카운터/플래그
 * - GeminiKeyPool: 소진된 키 목록 초기화
 */
export function resetAllImageState(): void {
  console.log('[NanoBananaPro] 🔄🔄🔄 === 이미지 생성 전체 상태 초기화 시작 ===');

  // 1. 사용된 URL 목록 초기화
  const prevUsedCount = usedImageUrls.size;
  usedImageUrls.clear();
  console.log(`[NanoBananaPro] ✅ 사용된 URL 목록 초기화 (이전: ${prevUsedCount}개)`);

  // 2. 503 폴백 시스템 초기화
  const prev503Count = global503Count;
  const prev503Active = global503FallbackActive;
  global503Count = 0;
  global503FallbackActive = false;
  global503FallbackStartTime = 0;
  console.log(`[NanoBananaPro] ✅ 503 폴백 상태 초기화 (이전 카운트: ${prev503Count}, 활성: ${prev503Active})`);

  // 3. GeminiKeyPool 소진 키는 인스턴스별로 생성되므로 
  // 새 호출 시 자동으로 새 인스턴스가 생성됨 (추가 초기화 불필요)

  console.log('[NanoBananaPro] 🔄🔄🔄 === 이미지 생성 전체 상태 초기화 완료 ===');
}

/**
 * ✅ [2026-01-18] 장단점 표 AI 이미지 생성
 * 나노바나나프로(Gemini)로 시각적인 장단점 비교 인포그래픽 생성
 */
export async function generateProsConsWithAI(
  productName: string,
  pros: string[],
  cons: string[],
  productImagePath?: string,
  apiKey?: string
): Promise<string | null> {
  const key = apiKey || storedGeminiApiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn('[NanoBananaPro] ⚠️ API 키 없음 - AI 표 생성 불가');
    return null;
  }

  console.log(`[NanoBananaPro] 📊 AI 장단점 표 생성 시작: ${productName}`);

  const prompt = `Create a clean, professional PROS & CONS comparison infographic image.

PRODUCT: "${productName}"

PROS (장점):
${pros.map((p, i) => `${i + 1}. ✅ ${p}`).join('\n')}

CONS (단점):
${cons.map((c, i) => `${i + 1}. ❌ ${c}`).join('\n')}

DESIGN REQUIREMENTS:
- Clean white/light gray background
- Two-column layout: LEFT = PROS (green), RIGHT = CONS (red/orange)
- Use check marks (✓) for pros, X marks (✗) for cons
- Large, readable Korean text
- Professional infographic style (like Samsung/LG product comparison)
- Modern, minimalist design
- Include subtle icons next to each point
- Header: "${productName} 장단점 비교"

SIZE: 1200x800 pixels (landscape)
STYLE: Corporate infographic, magazine quality
TEXT: Must be in Korean, clearly readable

ABSOLUTE REQUIREMENTS:
- NO product photos, ONLY text and icons
- Clean, professional, easy to read
- High contrast for mobile viewing`;

  try {
    const axios = (await import('axios')).default;
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`,  // ✅ [v2.7.24] 정식 GA로 통합 (gemini-3-pro-image-preview는 미존재 ID)
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['Text', 'Image'],
          imageConfig: { imageSize: '1K' }
        }
      },
      { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, timeout: 60000 }
    );

    const candidates = response.data?.candidates;
    if (candidates?.[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData?.data) {
          const buffer = Buffer.from(part.inlineData.data, 'base64');
          const { writeImageFile } = await import('./imageUtils.js');
          const result = await writeImageFile(buffer, 'png', `${productName}_장단점`);
          console.log(`[NanoBananaPro] ✅ AI 장단점 표 생성 완료: ${result.savedToLocal}`);
          return result.savedToLocal || result.filePath;
        }
      }
    }
    console.warn('[NanoBananaPro] ⚠️ AI 장단점 표 응답에서 이미지 없음');
    return null;
  } catch (error: any) {
    console.error(`[NanoBananaPro] ❌ AI 장단점 표 생성 실패: ${error.message}`);
    return null;
  }
}

/**
 * ✅ [2026-01-18] CTA 배너 AI 이미지 생성
 * 나노바나나프로(Gemini)로 클릭 유도 배너 이미지 생성
 */
export async function generateCtaBannerWithAI(
  productName: string,
  ctaText: string,
  productImagePath?: string,
  apiKey?: string
): Promise<string | null> {
  const key = apiKey || storedGeminiApiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn('[NanoBananaPro] ⚠️ API 키 없음 - AI 배너 생성 불가');
    return null;
  }

  console.log(`[NanoBananaPro] 🖼️ AI CTA 배너 생성 시작: ${productName}`);

  const prompt = `Create a high-converting CTA (Call-to-Action) banner image for e-commerce.

PRODUCT: "${productName}"
CTA TEXT: "${ctaText}"

DESIGN REQUIREMENTS:
- Eye-catching gradient background (deep blue to purple, or vibrant green to teal)
- Large, bold CTA button in the center
- Button text: "${ctaText}" (in Korean)
- Premium, luxury feel
- Subtle product silhouette or abstract shape in background
- Modern Korean shopping mall style (like Coupang, 11st, SSG)

BUTTON STYLE:
- Large rounded rectangle
- Gradient fill (orange-to-red OR green-to-teal)
- White or light text
- Subtle shadow for depth
- Arrow icon (→) next to text

SIZE: 1200x400 pixels (wide banner, 3:1 ratio)
STYLE: Premium e-commerce, high-end shopping

ABSOLUTE REQUIREMENTS:
- The CTA button must be PROMINENTLY visible
- Text must be LARGE and READABLE
- Evokes urgency and desire to click
- NO product photos, ONLY abstract/gradient design with text`;

  try {
    const axios = (await import('axios')).default;
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`,  // ✅ [v2.7.24] 정식 GA로 통합 (gemini-3-pro-image-preview는 미존재 ID)
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['Text', 'Image'],
          imageConfig: { imageSize: '1K' }
        }
      },
      { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, timeout: 60000 }
    );

    const candidates = response.data?.candidates;
    if (candidates?.[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData?.data) {
          const buffer = Buffer.from(part.inlineData.data, 'base64');
          const { writeImageFile } = await import('./imageUtils.js');
          const result = await writeImageFile(buffer, 'png', `${productName}_CTA배너`);
          console.log(`[NanoBananaPro] ✅ AI CTA 배너 생성 완료: ${result.savedToLocal}`);
          return result.savedToLocal || result.filePath;
        }
      }
    }
    console.warn('[NanoBananaPro] ⚠️ AI CTA 배너 응답에서 이미지 없음');
    return null;
  } catch (error: any) {
    console.error(`[NanoBananaPro] ❌ AI CTA 배너 생성 실패: ${error.message}`);
    return null;
  }
}
