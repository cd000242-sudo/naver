// generateWithCodexImage with a shopping product reference photo: every session gets the same photo, the prompt ends
// with the preservation line then the ratio line, and a result that is a copy of the reference fails its slot.
import { describe, expect, it, vi } from 'vitest';
import type { GeneratedImage, ImageRequestItem } from '../image/types.js';
import { generateWithCodexImage, type CodexImageRuntime } from '../image/codex/codexImageGenerator.js';
import type { CodexImageSessionOptions } from '../image/codex/codexImageSession.js';
import type { CodexReferenceImage } from '../image/codex/codexReferenceImage.js';

const PRODUCT_LINE = '\nPRODUCT REFERENCE: referenced image 1 is the real product. Draw this exact product — same shape, proportions, colours, materials, logo, label text and packaging; do not redesign, recolour, mirror, re-letter or replace it. Build a new scene for this section; do not reuse the reference photo\'s background or framing.';
const SQUARE = '\nASPECT RATIO: square 1:1 (1024x1024). Keep the main subject and all text inside the central square. Compose for this frame; keep every subject and all text inside it.';

const reference: CodexReferenceImage = {
  buffer: Buffer.from('89504e470d0a1a0a', 'hex'), fileName: 'reference-01.png', sha256: 'a'.repeat(64), width: 1024, height: 1024,
};
const items = (count: number): ImageRequestItem[] => Array.from({ length: count }, (_, i) => ({
  heading: `소제목 ${i + 1}`, prompt: `exact english prompt ${i + 1}`,
}));
const promptNumber = (prompt: string): string => /exact english prompt (\d+)/.exec(prompt)?.[1] ?? '?';

function makeRuntime(isCopy: (file: string) => boolean = () => false) {
  const sessions: Array<{ prompts: string[]; options: CodexImageSessionOptions }> = [];
  const log = vi.fn();
  const save = vi.fn(async (filePath: string, source: ImageRequestItem): Promise<GeneratedImage> => (
    { heading: source.heading, filePath, previewDataUrl: 'data:image/png;base64,AA', provider: 'codex-image' }
  ));
  const runtime: CodexImageRuntime = {
    assertReady: vi.fn(async () => undefined),
    runSession: vi.fn(async (prompts: string[], options: CodexImageSessionOptions) => {
      const call = sessions.push({ prompts, options }) - 1;
      return { threadId: `thread-${call}`, files: prompts.map((p) => `C:/codex/${promptNumber(p)}.png`) };
    }),
    save,
    log,
    isReferenceCopy: vi.fn(async (file: string) => isCopy(file)),
  };
  return { runtime, sessions, log, save };
}
const logText = (log: ReturnType<typeof vi.fn>): string => log.mock.calls.map((c) => String(c[0])).join('\n');

describe('generateWithCodexImage — 쇼핑 참고 사진', () => {
  it('모든 세션에 같은 참고 사진이 붙고, 프롬프트 끝은 상품 보존 줄 + 비율 줄이다', async () => {
    const h = makeRuntime();
    const images = await generateWithCodexImage(items(3), '글 제목', 'post-1', undefined, undefined, { referenceImage: reference }, h.runtime);

    expect(images.map((i) => i.heading)).toEqual(['소제목 1', '소제목 2', '소제목 3']);
    expect(h.sessions).toHaveLength(3);
    for (const { options } of h.sessions) {
      expect(options.referenceImage).toEqual({ buffer: reference.buffer, fileName: 'reference-01.png' });
    }
    // The same buffer object goes to every session (one cleaned photo, not one per slot).
    expect(new Set(h.sessions.map((s) => s.options.referenceImage?.buffer)).size).toBe(1);
    expect(h.sessions.map((s) => s.prompts[0]).sort()).toEqual(
      [1, 2, 3].map((n) => `exact english prompt ${n}${PRODUCT_LINE}${SQUARE}`),
    );
  });

  it('"🛒 상품 사진 1장을 참고로 붙여 N장 생성" 로그를 남긴다', async () => {
    const h = makeRuntime();
    await generateWithCodexImage(items(3), '글', 'p', undefined, undefined, { referenceImage: reference }, h.runtime);
    expect(logText(h.log)).toContain('🛒 상품 사진 1장을 참고로 붙여 3장 생성');
  });

  it('참고 사진이 없으면 지금 동작 그대로 — 키도 로그도 해시 검사도 없다', async () => {
    const h = makeRuntime();
    await generateWithCodexImage(items(2), '글', 'p', undefined, undefined, {}, h.runtime);
    for (const { options, prompts } of h.sessions) {
      expect('referenceImage' in options).toBe(false);
      expect(prompts[0]).not.toContain('PRODUCT REFERENCE');
      expect(prompts[0].endsWith(SQUARE)).toBe(true);
    }
    expect(logText(h.log)).not.toContain('🛒');
    expect(h.runtime.isReferenceCopy).not.toHaveBeenCalled();
  });

  it('결과가 참고 사진의 복사본이면 그 칸만 실패한다 — 다른 엔진으로 채우지 않고 저장도 하지 않는다', async () => {
    const h = makeRuntime((file) => file.endsWith('/2.png'));
    await expect(
      generateWithCodexImage(items(3), '글', 'p', undefined, undefined, { referenceImage: reference }, h.runtime),
    ).rejects.toThrow(/2번 이미지를 받지 못함/);
    expect(h.save).toHaveBeenCalledTimes(2);
    expect(h.save.mock.calls.map((c) => c[0]).sort()).toEqual(['C:/codex/1.png', 'C:/codex/3.png']);
    const text = logText(h.log);
    expect(text).toContain('2번 이미지를 받지 못함');
    expect(text).toContain('참고 사진을 그대로 복사한 결과');
    expect(text).toContain('다른 엔진으로 채우지 않았습니다');
  });

  it('부분 허용이면 복사본이 아닌 칸의 이미지는 돌려준다', async () => {
    const h = makeRuntime((file) => file.endsWith('/2.png'));
    const images = await generateWithCodexImage(items(3), '글', 'p', undefined, undefined, { referenceImage: reference, allowPartial: true }, h.runtime);
    expect(images.map((i) => i.heading)).toEqual(['소제목 1', '소제목 3']);
  });

  it('복사본 검사 자체가 실패하면(파일을 못 읽음) 검증 못 한 이미지를 쓰지 않고 그 칸을 실패 처리한다', async () => {
    const h = makeRuntime();
    (h.runtime.isReferenceCopy as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('EACCES'));
    await expect(
      generateWithCodexImage(items(1), '글', 'p', undefined, undefined, { referenceImage: reference }, h.runtime),
    ).rejects.toThrow(/1번 이미지를 받지 못함/);
    expect(h.save).not.toHaveBeenCalled();
  });
});
