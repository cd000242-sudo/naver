import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageLibrary, type LibraryImage } from '../imageLibrary';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('image library batch quota result', () => {
  it('returns zero for an empty batch so callers do not consume quota', async () => {
    const library = new ImageLibrary({ storageDir: 'C:/unused' }, () => undefined);
    await expect(library.batchCollect([])).resolves.toBe(0);
  });

  it('returns the number of images actually collected across categories', async () => {
    vi.useFakeTimers();
    const library = new ImageLibrary({ storageDir: 'C:/unused' }, () => undefined);
    const image = { id: 'one' } as LibraryImage;
    vi.spyOn(library, 'collectImages')
      .mockResolvedValueOnce([image])
      .mockResolvedValueOnce([]);

    const pending = library.batchCollect(['one', 'two']);
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toBe(1);
  });

  it('wires the batch handler to charge only when at least one image exists', () => {
    const mainSource = fs.readFileSync(path.resolve(__dirname, '..', 'main.ts'), 'utf8');
    const start = mainSource.indexOf("ipcMain.handle('library:batchCollect'");
    const end = mainSource.indexOf("ipcMain.handle('library:getStats'", start);
    const handlerSource = mainSource.slice(start, end);

    expect(handlerSource).toContain('const collectedCount = await imageLibrary.batchCollect(categories);');
    expect(handlerSource).toContain('const result = { success: collectedCount > 0, count: collectedCount };');
    expect(handlerSource).toContain('if (result.count > 0 && (await isFreeTierUser()))');
  });
});
