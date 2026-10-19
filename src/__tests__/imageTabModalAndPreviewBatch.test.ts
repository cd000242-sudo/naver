// [2026-10-20 사장님 "저번부터 고치라 했는데 못 고쳤네"] 이미지 관리탭 "생성된 프롬프트대로 이미지 생성하기":
//   ① 모달이 프롬프트 번역이 다 끝난 뒤에야 떴다 → 클릭 직후 띄운다.
//   ② 9/2 의 미리보기 자리 배치(imagePreviewBatch)가 "비어있는 소제목만" 버튼에만 있었다 → 이 버튼의 순차 루프에도.
//   ③ 썸네일 생성기 리스너가 발행마다 쌓여 다운로드 1클릭에 글 수만큼 다운로드 → 한 번만 붙이고 최신 인스턴스로 전달.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const src = (rel: string): string => readFileSync(resolve(rel), 'utf8').replace(/\r\n/g, '\n');

function mainGenerateHandler(): string {
  const file = src('src/renderer/modules/headingImageGen.ts');
  const start = file.indexOf("closest('#generate-images-btn')");
  const end = file.indexOf("closest('#generate-remaining-images-btn')", start);
  expect(start).toBeGreaterThan(0);
  const handler = file.slice(start, end > start ? end : undefined);
  expect(handler).toContain('const shouldRunSequentially = true;');
  return handler;
}

describe('이미지 관리탭 "생성된 프롬프트대로 이미지 생성하기"', () => {
  it('모달(liveImagePreview.show)을 AI 프롬프트 번역보다 먼저 띄운다', () => {
    const handler = mainGenerateHandler();
    const showAt = handler.indexOf('liveImagePreview.show(filteredHeadings, sourceLabel)');
    const translateAt = handler.indexOf('generateEnglishPromptForHeading(h.title');
    expect(showAt).toBeGreaterThan(0);
    expect(translateAt).toBeGreaterThan(showAt);
    // 번역 뒤에 또 띄우면(패널 재생성) 번역 중 로그가 사라진다 — 한 번만.
    expect(handler.indexOf('liveImagePreview.show(filteredHeadings, sourceLabel)', showAt + 1)).toBe(-1);
  });

  it('순차 루프가 미리보기 배치 자리를 알려준다(1번 타일에 전부 몰리지 않게)', () => {
    const handler = mainGenerateHandler();
    const loopAt = handler.indexOf('if (shouldRunSequentially) {');
    const loop = handler.slice(loopAt, handler.indexOf('const normalizedImages', loopAt));
    expect(loop).toContain('beginImagePreviewBatch(filteredHeadings.length)');
    expect(loop).toContain('setImagePreviewBatchSlot(i)');
    expect(loop).toContain('finally { endImagePreviewBatch(); }');
  });
});

describe('ThumbnailGenerator 리스너 1회 바인딩', () => {
  it('setupEventListeners 는 한 번만 붙이고 핸들러는 최신 인스턴스(gen())를 쓴다', () => {
    const file = src('src/renderer/modules/thumbnailGenerator.ts');
    expect(file).toContain('private static current: ThumbnailGenerator | null = null;');
    expect(file).toContain('private static listenersBound = false;');
    const start = file.indexOf('  private setupEventListeners(): void {');
    const end = file.indexOf('  private updateCanvasSize(): void {', start);
    const method = file.slice(start, end);
    expect(method).toContain('ThumbnailGenerator.current = this;');
    expect(method).toContain('if (ThumbnailGenerator.listenersBound) return;');
    expect(method).toContain('const gen = (): ThumbnailGenerator => ThumbnailGenerator.current ?? this;');
    // 가드 뒤의 핸들러 본문에 'this.' 가 남아 있으면 첫 인스턴스에 묶인다.
    const afterGuard = method.slice(method.indexOf('const gen = ()') + 'const gen = ()'.length);
    expect(afterGuard).not.toMatch(/\bthis\./);
    expect(afterGuard).toContain("gen().download()");
    expect(afterGuard).toContain("gen().applyToPost()");
  });

  it('발행 완료 초기화(renderer.resetThumbnailGeneratorOnPublish)는 여전히 새 인스턴스를 만든다 — 그래서 1회 바인딩이 필요하다', () => {
    const renderer = src('src/renderer/renderer.ts');
    const at = renderer.indexOf('function resetThumbnailGeneratorOnPublish');
    expect(at).toBeGreaterThan(0);
    expect(renderer.slice(at, at + 600)).toContain('thumbnailGenerator = new ThumbnailGenerator();');
  });
});
