/**
 * [2026-10-10] 젠스파크 엔진 앱 내부 연결 시험 — dropshotIntegration.test.ts 와 같은 방식(소스 등록 지점 + 순수 함수).
 * 실제 브라우저·젠스파크 접속 없음.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ALLOWED_PROVIDER, assertProvider } from '../image/types.js';
import { IMAGE_ENGINE_CATALOG, GENSPARK } from '../runtime/imageEngineCatalog.js';
import { drawsKoreanTextItself, resolveHeadingImageText } from '../image/director/koreanTextEngines.js';
import { gensparkListModels } from '../image/genspark/gensparkModels.js';
import {
  SHOPPING_REFERENCE_IMAGE_ENGINES,
  SHOPPING_SELECTABLE_REFERENCE_ENGINES,
} from '../image/shoppingReferenceGeneration.js';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('젠스파크 등록 지점', () => {
  it('image/types.ts — ImageProvider 와 ALLOWED_PROVIDER 에 genspark', () => {
    const code = read('image/types.ts');
    expect(code.match(/export type ImageProvider\s*=[\s\S]{0,2000}?;/)?.[0]).toMatch(/'genspark'/);
    expect(ALLOWED_PROVIDER).toContain('genspark');
    expect(() => assertProvider('genspark')).not.toThrow();
  });

  it('카탈로그 — genspark 값·라벨·비용 0·한글 가능', () => {
    expect(GENSPARK.value).toBe('genspark');
    expect(GENSPARK.label).toBe('젠스파크');
    expect(GENSPARK.costKrw).toBe(0);
    expect(GENSPARK.koreanText).toBe(true);
    expect(GENSPARK.model).toBe('genspark/gpt-image-2.5');
    expect(IMAGE_ENGINE_CATALOG.map((e) => e.value)).toContain('genspark');
  });

  it('automation/imageProvenance.ts — AI 이미지 판정 목록에 genspark', () => {
    expect(read('automation/imageProvenance.ts')).toMatch(/'genspark'/);
  });

  it('쇼핑 참조 이미지 허용 목록에는 없다(미지원)', () => {
    expect(SHOPPING_REFERENCE_IMAGE_ENGINES as readonly string[]).not.toContain('genspark');
    expect(SHOPPING_SELECTABLE_REFERENCE_ENGINES as readonly string[]).not.toContain('genspark');
  });

  it('설정 — 타입·정규화 파싱·부분 저장 보존·계정 이전 보존 목록에 gensparkImageModel', () => {
    const cfg = read('configManager.ts');
    expect(cfg).toMatch(/gensparkImageModel\?: string;/);
    expect(cfg).toMatch(/gensparkImageModel: typeof parsed\.gensparkImageModel === 'string'/);
    expect((cfg.match(/'gensparkImageModel'/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(read('main/userDataMigration.ts')).toMatch(/'gensparkImageModel'/);
  });
});

describe('젠스파크 생성 분기(imageGenerator.ts)', () => {
  const code = read('imageGenerator.ts');
  const gStart = code.indexOf("if (normalizedProvider === 'genspark') {");
  const branch = code.slice(gStart, code.indexOf("if (normalizedProvider === 'deepinfra') {"));

  it('dropshot 분기 바로 뒤에 같은 모양의 genspark 분기가 있다', () => {
    const dropshotAt = code.indexOf("if (normalizedProvider === 'dropshot') {");
    const gensparkAt = code.indexOf("if (normalizedProvider === 'genspark') {");
    const deepinfraAt = code.indexOf("if (normalizedProvider === 'deepinfra') {");
    expect(dropshotAt).toBeGreaterThan(0);
    expect(gensparkAt).toBeGreaterThan(dropshotAt);
    expect(deepinfraAt).toBeGreaterThan(gensparkAt);
  });

  it('결과 기록 → 한글 처리 → finalizeImages, 실패는 폴백 없이 [젠스파크] 오류로 throw', () => {
    expect(branch).toMatch(/generateWithGenspark\(/);
    expect(branch).toMatch(/finalizeImages\(await applyKoreanTextOverlayIfNeeded\(annotateEngineTrace\(/);
    expect(branch).toMatch(/actualProvider: 'genspark'/);
    expect(branch).toMatch(/throw new Error\(`\[젠스파크\] 이미지 생성 실패/);
    expect(branch).not.toMatch(/generateWithNanoBananaPro|fallbackReason|generateWithDropshot/);
  });

  // [2026-10-10] 발행 "미리 한꺼번에" 요청만 일부 결과를 받는다 — 다른 호출은 지금처럼 전부 아니면 실패.
  it('allowPartialResults === true 일 때만 생성기에 allowPartial 을 넘긴다', () => {
    expect(branch).toMatch(/generateWithGenspark\([\s\S]*?undefined,\s*\{ allowPartial: options\.allowPartialResults === true \}/);
    expect(read('image/types.ts')).toMatch(/allowPartialResults\?: boolean;/);
  });
  it('렌더러가 실어 보낸 options.imageModel 을 쓰지 않는다', () => {
    expect(branch).not.toMatch(/options\.imageModel/);
  });

  it('중지 시 epoch 무효화 + 컨텍스트 정리(로그인 창은 남김) — Promise.allSettled 목록에 포함', () => {
    expect(code).toMatch(/abortGensparkGenerations\(\);/);
    expect(code).toMatch(/label: 'Genspark'[\s\S]{0,200}closeAllGensparkContexts\(\{ keepLoginWindows: true \}\)/);
  });

  it('표시 이름 등록 + 폴백 경로(지원하지 않는 제공자)로 떨어지는 길이 없다', () => {
    expect(code).toMatch(/'genspark': '젠스파크'/);
    const gensparkAt = code.indexOf("if (normalizedProvider === 'genspark') {");
    const fallbackAt = code.indexOf('const unsupportedReason');
    // genspark 분기는 모든 경로에서 return/throw 하므로 폴백 선언보다 앞에 있어야 한다
    expect(gensparkAt).toBeGreaterThan(0);
    expect(fallbackAt).toBeGreaterThan(gensparkAt);
    expect(branch).toMatch(/return finalizeImages/);
    expect(ALLOWED_PROVIDER).toContain('genspark');
  });
});

describe('한글 판정 — 모델 선택 인자', () => {
  it('기존 호출(모델 없음)은 그대로 동작', () => {
    for (const e of ['nano-banana-2', 'nano-banana-pro', 'flow', 'openai-image', 'dropshot']) {
      expect(drawsKoreanTextItself(e)).toBe(true);
    }
    for (const e of ['nano-banana', 'prodia', 'imagefx']) expect(drawsKoreanTextItself(e)).toBe(false);
  });

  it('genspark 는 모델의 drawsKorean 을 본다(빈 값=기본 모델, 모르는 값=false)', () => {
    expect(drawsKoreanTextItself('genspark')).toBe(true);
    expect(drawsKoreanTextItself('genspark', undefined)).toBe(true);
    for (const m of gensparkListModels()) {
      expect(drawsKoreanTextItself('genspark', m.id), m.id).toBe(m.drawsKorean);
    }
    expect(drawsKoreanTextItself('genspark', 'z-image-turbo')).toBe(false);
    expect(drawsKoreanTextItself('genspark', 'nano-banana-2-flash-lite')).toBe(true);
    expect(drawsKoreanTextItself('genspark', 'no-such-model')).toBe(false);
  });

  it('다른 엔진은 모델 인자를 무시한다', () => {
    expect(drawsKoreanTextItself('prodia', 'gpt-image-2.5')).toBe(false);
    expect(drawsKoreanTextItself('dropshot', 'z-image-turbo')).toBe(true);
  });

  it('소제목 글자 판정도 모델을 따른다', () => {
    const item = { heading: '청약통장 만드는 법' };
    expect(resolveHeadingImageText(item, 'genspark', true, 'gpt-image-2.5')).toBe('청약통장 만드는 법');
    expect(resolveHeadingImageText(item, 'genspark', true, 'z-image-turbo')).toBeNull();
  });

  it('호출부 배선 — 썸네일 감독 게이트가 config.gensparkImageModel 을 넘긴다', () => {
    expect(read('image/director/thumbnailDirectorGate.ts')).toMatch(/drawsKoreanTextItself\(provider, .*gensparkImageModel/);
    expect(read('imageGenerator.ts')).toMatch(/isKoreanTextSupportedEngine\(normalizedProvider, engineModelHint\)/);
  });
});

describe('main.ts · IPC · preload 배선', () => {
  it('main.ts — 전체 초기화·종료 cleanup 에서 젠스파크 컨텍스트를 닫는다', () => {
    const main = read('main.ts');
    expect(main).toMatch(/closeAllGensparkContexts as closeGensparkBrowserContexts/);
    expect(main).toMatch(/closeDropshotBrowserContexts\(\),\s*closeGensparkBrowserContexts\(\),/);
    expect(main).toMatch(/\['Flow', 'ImageFX', 'Dropshot', 'Genspark'\]/);
    expect(main).toMatch(/runCleanupStep\('Genspark contexts'/);
    expect(main).toMatch(/&& gensparkContextsClean/);
  });

  it('main.ts — UI 자동화 엔진 안정화 대기 목록에 genspark', () => {
    expect(read('main.ts')).toMatch(/\['dropshot', 'flow', 'imagefx', 'genspark'\]\.includes\(normalizedImageProvider\)/);
  });

  it('IPC 핸들러 genspark:check-login / genspark:open-login', () => {
    const code = read('main/ipc/imageHandlers.ts');
    expect(code).toMatch(/safeHandle\('genspark:check-login'/);
    expect(code).toMatch(/safeHandle\('genspark:open-login'/);
    expect(code).toMatch(/checkGensparkLogin\(\)/);
    expect(code).toMatch(/openGensparkLoginWindow\(\)/);
  });

  it('preload — checkGensparkLogin / openGensparkLogin 이 같은 채널 이름을 부른다', () => {
    const code = read('preload.ts');
    expect(code).toMatch(/checkGensparkLogin:[\s\S]{0,200}ipcRenderer\.invoke\('genspark:check-login'\)/);
    expect(code).toMatch(/openGensparkLogin:[\s\S]{0,200}ipcRenderer\.invoke\('genspark:open-login'\)/);
  });
});
