import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const imageHandlersSource = read('../main/ipc/imageHandlers.ts');
const diversityHandlerSource = read('../main/ipc/imageDiversityHandler.ts');
const mainSource = read('../main.ts');
const preloadSource = read('../preload.ts');
const fullAutoFlowSource = read('../renderer/modules/fullAutoFlow.ts');

// [2026-09-06 R-A/C] `image:diversityReport` — main computes aHash for the post's image
// files, renderer logs `[ImageDiversity]` before publishing. Measurement only, never a gate.
describe('image:diversityReport IPC 배선', () => {
  it('imageHandlers의 경로 가드가 export 되어 다른 핸들러 파일이 재사용한다', () => {
    expect(imageHandlersSource).toMatch(/export function assertPathWithinAllowedRoots\(/u);
  });

  it('핸들러 파일이 safeHandle 리터럴 채널로 등록하고 경로마다 가드를 건다', () => {
    expect(diversityHandlerSource).toMatch(/safeHandle\(\s*'image:diversityReport'/u);
    expect(diversityHandlerSource).toMatch(/assertPathWithinAllowedRoots\(/u);
    expect(diversityHandlerSource).toMatch(/\.naver-blog-automation/u);
    expect(diversityHandlerSource).toMatch(/computeAHash64\(/u);
    expect(diversityHandlerSource).toMatch(/buildImageDiversityReport\(/u);
    expect(diversityHandlerSource).toMatch(/image-diversity\.jsonl/u);
  });

  it('main.ts가 whenReady 이후 등록 블록에서 핸들러를 붙인다', () => {
    expect(mainSource).toMatch(/registerImageDiversityHandler\(ctx\)/u);
    expect(mainSource).toMatch(/import\('\.\/main\/ipc\/imageDiversityHandler\.js'\)/u);
  });

  it('preload가 2칸 들여쓰기 키로 채널을 노출한다', () => {
    expect(preloadSource).toMatch(/^ {2}reportImageDiversity:/mu);
    expect(preloadSource).toMatch(/ipcRenderer\.invoke\('image:diversityReport',\s*\{\s*paths,\s*postTitle\s*\}\)/u);
  });

  it('렌더러는 발행 직전 IPC로만 재고 리포트 모듈을 직접 import하지 않는다', () => {
    expect(fullAutoFlowSource).toMatch(/window\.api\.reportImageDiversity\(/u);
    expect(fullAutoFlowSource).toMatch(/\[ImageDiversity\]/u);
    expect(fullAutoFlowSource).not.toMatch(/imageDiversityReport/u);
  });

  it('렌더러 측정은 executeBlogPublishing 안에서 발행 전에 일어난다', () => {
    const start = fullAutoFlowSource.indexOf('async function executeBlogPublishing(');
    expect(start).toBeGreaterThan(-1);
    const reportAt = fullAutoFlowSource.indexOf('await logImageDiversityBeforePublish(', start);
    const payloadAt = fullAutoFlowSource.indexOf('페이로드 구성 중', start);
    expect(reportAt).toBeGreaterThan(start);
    expect(reportAt).toBeLessThan(payloadAt);
  });
});
