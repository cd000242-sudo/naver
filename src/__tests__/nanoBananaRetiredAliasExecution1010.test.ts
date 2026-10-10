/**
 * [2026-10-10] 나노바나나 단일화 검토 지적: 입구 별칭(pro/2.5 → 나노바나나2)이 소스 문자열 단언으로만 잠겨 있었다.
 * generateImages 를 실제로 실행해, 옛 provider 가 와도 나노바나나2 모델 키로 생성기를 부르는지 확인한다.
 */
import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const nano = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../image/nanoBananaProGenerator.js', () => ({
  abortImageGeneration: vi.fn(),
  generateWithNanoBananaPro: nano.generate,
  resetAllImageState: vi.fn(),
}));

import { generateImages } from '../imageGenerator.js';
import { NANO_PROVIDER_TO_MODEL_KEY } from '../runtime/imageEngineCatalog.js';

const NANO2_KEY = NANO_PROVIDER_TO_MODEL_KEY['nano-banana-2'];
const PRO_KEY = NANO_PROVIDER_TO_MODEL_KEY['nano-banana-pro'];
const LEGACY_KEY = NANO_PROVIDER_TO_MODEL_KEY['nano-banana'];

describe('옛 나노바나나 provider 실행 경로', () => {
  beforeEach(() => {
    nano.generate.mockReset();
    nano.generate.mockResolvedValue([{ heading: 'h', filePath: 'C:/tmp/a.png', provider: 'nano-banana-2' }]);
  });

  it.each(['nano-banana-pro', 'nano-banana'])('%s 요청도 나노바나나2 모델 키로 생성기를 부른다', async (provider) => {
    await generateImages({ provider, items: [{ heading: 'h', prompt: 'p' }] } as any).catch(() => undefined);
    expect(nano.generate).toHaveBeenCalledTimes(1);
    const args = nano.generate.mock.calls[0];
    expect(args).toContain(NANO2_KEY);
    expect(args).not.toContain(PRO_KEY);
    expect(args).not.toContain(LEGACY_KEY);
  });

  it('나노바나나2 요청은 그대로 나노바나나2 모델 키', async () => {
    await generateImages({ provider: 'nano-banana-2', items: [{ heading: 'h', prompt: 'p' }] } as any).catch(() => undefined);
    expect(nano.generate.mock.calls[0]).toContain(NANO2_KEY);
  });

  it('세 모델 키는 서로 달라 위 단언이 의미가 있다', () => {
    expect(new Set([NANO2_KEY, PRO_KEY, LEGACY_KEY]).size).toBe(3);
  });
});

describe('설정 파일에 남은 옛 슬롯 모델', () => {
  it('main 생성기가 슬롯 모델을 읽을 때 옛 값을 나노바나나2로 정규화한다', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'image', 'nanoBananaProGenerator.ts'), 'utf8');
    expect(src).toContain('normalizeRetiredNanoSlotModel((configForKeys as any).nanoBananaMainModel)');
    expect(src).toContain('normalizeRetiredNanoSlotModel((configForKeys as any).nanoBananaSubModel)');
  });
});
