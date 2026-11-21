// generateWithGeminiCliImage with a shopping product reference photo: every session gets the same photo, the prompt is the
// app's prompt plus the ratio line only (the reference wording lives in the CLI instruction), and a result that is a
// byte copy of the reference fails its slot. Without a reference nothing changes.
import { describe, expect, it, vi } from 'vitest';
import type { GeneratedImage, ImageRequestItem } from '../image/types.js';
import { generateWithGeminiCliImage, type GeminiCliImageRuntime } from '../image/geminiCli/geminiCliImageGenerator.js';
import type { GeminiCliImageSessionOptions } from '../image/geminiCli/geminiCliImageSession.js';
import type { CodexReferenceImage } from '../image/codex/codexReferenceImage.js';

const SQUARE = '\nASPECT RATIO: square 1:1 (1024x1024). Keep the main subject and all text inside the central square. Compose for this frame; keep every subject and all text inside it.';
const reference: CodexReferenceImage = {
  buffer: Buffer.from('89504e470d0a1a0a', 'hex'), fileName: 'reference-01.png', sha256: 'a'.repeat(64), width: 1024, height: 1024,
};
const items = (count: number): ImageRequestItem[] => Array.from({ length: count }, (_, i) => ({
  heading: `소제목 ${i + 1}`, prompt: `exact english prompt ${i + 1}`,
}));
const promptNumber = (prompt: string): string => /exact english prompt (\d+)/.exec(prompt)?.[1] ?? '?';

function makeRuntime(isCopy: (file: string) => boolean | Promise<boolean> = () => false) {
  const sessions: Array<{ prompt: string; options: GeminiCliImageSessionOptions }> = [];
  const log = vi.fn();
  const save = vi.fn(async (filePath: string, source: ImageRequestItem): Promise<GeneratedImage> => (
    { heading: source.heading, filePath, previewDataUrl: 'data:image/jpeg;base64,AA', provider: 'gemini-cli-image' as unknown as GeneratedImage['provider'] }
  ));
  const runtime: GeminiCliImageRuntime = {
    assertReady: vi.fn(async () => undefined),
    runSession: vi.fn(async (prompt: string, options: GeminiCliImageSessionOptions) => {
      const call = sessions.push({ prompt, options }) - 1;
      return { conversationId: `conv-${call}`, files: [`C:/gemini/${promptNumber(prompt)}.jpg`] };
    }),
    save,
    log,
    isReferenceCopy: vi.fn(async (file: string) => isCopy(file)),
  };
  return { runtime, sessions, log, save };
}
const logText = (log: ReturnType<typeof vi.fn>): string => log.mock.calls.map((c) => String(c[0])).join('\n');
const run = (list: ImageRequestItem[], h: ReturnType<typeof makeRuntime>, options = {}) =>
  generateWithGeminiCliImage(list, '글 제목', 'post-1', undefined, undefined, options, h.runtime);

describe('generateWithGeminiCliImage - 쇼핑 참고 사진', () => {
  it('모든 세션에 같은 참고 사진이 붙고, 프롬프트는 앱이 만든 문장 + 비율 줄뿐이다 (Codex 식 참조 줄은 없다)', async () => {
    const h = makeRuntime();
    const images = await run(items(3), h, { referenceImage: reference });
    expect(images.map((i) => i.heading)).toEqual(['소제목 1', '소제목 2', '소제목 3']);
    expect(h.sessions).toHaveLength(3);
    for (const { options } of h.sessions) {
      expect(options.referenceImage).toEqual({ buffer: reference.buffer, fileName: 'reference-01.png' });
    }
    // One cleaned photo for the whole call, not one copy per slot.
    expect(new Set(h.sessions.map((s) => s.options.referenceImage?.buffer)).size).toBe(1);
    expect(h.sessions.map((s) => s.prompt).sort()).toEqual([1, 2, 3].map((n) => `exact english prompt ${n}${SQUARE}`));
    expect(h.sessions.every((s) => !s.prompt.includes('PRODUCT REFERENCE'))).toBe(true);
  });

  it('"🛒 상품 사진 1장을 참고로 붙여 N장 생성" 로그를 남긴다', async () => {
    const h = makeRuntime();
    await run(items(3), h, { referenceImage: reference });
    expect(logText(h.log)).toContain('🛒 상품 사진 1장을 참고로 붙여 3장 생성');
  });

  it('참고 사진이 없으면 지금 동작 그대로다 — 세션 옵션에 키도, 로그도, 복사본 검사도 없다', async () => {
    const h = makeRuntime();
    await run(items(2), h);
    for (const { options, prompt } of h.sessions) {
      expect('referenceImage' in options).toBe(false);
      expect(prompt.endsWith(SQUARE)).toBe(true);
    }
    expect(logText(h.log)).not.toContain('🛒');
    expect(h.runtime.isReferenceCopy).not.toHaveBeenCalled();
  });

  it('결과가 참고 사진의 복사본이면 그 칸만 실패한다 — 저장하지 않고 다른 엔진으로 채우지도 않는다', async () => {
    const h = makeRuntime((file) => file.endsWith('/2.jpg'));
    await expect(run(items(3), h, { referenceImage: reference })).rejects.toThrow(/2번 이미지를 받지 못함/);
    expect(h.save).toHaveBeenCalledTimes(2);
    expect(logText(h.log)).toContain('참고 사진을 그대로 복사한 결과라 버렸습니다');
    expect(logText(h.log)).toContain('다른 엔진으로 채우지 않았습니다');
    expect(h.sessions).toHaveLength(3); // nothing was sent again
  });

  it('일부 칸이 복사본이어도 allowPartial 이면 받은 장은 돌려준다', async () => {
    const h = makeRuntime((file) => file.endsWith('/2.jpg'));
    const images = await run(items(3), h, { referenceImage: reference, allowPartial: true });
    expect(images.map((i) => i.heading)).toEqual(['소제목 1', '소제목 3']);
  });

  it('복사본인지 확인하지 못하면 그 칸은 실패다 (확인 못 한 그림을 쓰지 않는다)', async () => {
    const h = makeRuntime(async (file) => { if (file.endsWith('/1.jpg')) throw new Error('EIO'); return false; });
    await expect(run(items(2), h, { referenceImage: reference })).rejects.toThrow(/1번 이미지를 받지 못함/);
    expect(logText(h.log)).toContain('결과 파일을 확인하지 못함');
    expect(h.save).toHaveBeenCalledTimes(1);
  });

  it('참고 사진이 있어도 도구 준비 확인과 한도 처리는 그대로다 (한도 오류면 새 세션을 더 시작하지 않는다)', async () => {
    const h = makeRuntime();
    await run(items(1), h, { referenceImage: reference });
    expect(h.runtime.assertReady).toHaveBeenCalledTimes(1);
  });
});
