// [2026-10-10] 젠스파크 모델 표 시험.
import { describe, expect, it } from 'vitest';
import {
  GENSPARK_DEFAULT_MODEL_ID,
  gensparkDefaultModel,
  gensparkFindModelById,
  gensparkFindModelByMenuLabel,
  gensparkListModels,
  gensparkModelDisplayLabel,
  gensparkNormalizeModelId,
} from '../image/genspark/gensparkModels';
import {
  GENSPARK_ABORTED,
  GENSPARK_DOWNLOAD_FAILED,
  GENSPARK_JOB_TIMEOUT,
  GENSPARK_LOGIN_REQUIRED,
  GENSPARK_MODEL_NOT_FOUND,
  GensparkError,
  gensparkIsBatchFatal,
} from '../image/genspark/gensparkErrors';

describe('gensparkModels', () => {
  it('모델 15개: 무료 8 / 크레딧 차감 7', () => {
    const list = gensparkListModels();
    expect(list).toHaveLength(15);
    expect(list.filter((m) => m.creditFree)).toHaveLength(8);
    expect(list.filter((m) => !m.creditFree)).toHaveLength(7);
  });

  it('id·메뉴 글자가 겹치지 않는다', () => {
    const list = gensparkListModels();
    expect(new Set(list.map((m) => m.id)).size).toBe(15);
    expect(new Set(list.map((m) => m.menuLabel)).size).toBe(15);
  });

  it('기본 모델은 GPT Image 2.5', () => {
    expect(GENSPARK_DEFAULT_MODEL_ID).toBe('gpt-image-2.5');
    expect(gensparkDefaultModel().menuLabel).toBe('GPT Image 2.5');
    expect(gensparkDefaultModel().creditFree).toBe(true);
  });

  it('한글을 직접 그리는 모델은 5개뿐(10/10 실측: Flash Lite 포함)', () => {
    const korean = gensparkListModels().filter((m) => m.drawsKorean).map((m) => m.menuLabel).sort();
    expect(korean).toEqual(['GPT Image 2', 'GPT Image 2.5', 'Nano Banana 2 Flash Lite', 'Nano Banana 2.1', 'Nano Banana Pro']);
  });

  it('New 배지 모델 3개', () => {
    const news = gensparkListModels().filter((m) => m.isNew).map((m) => m.menuLabel).sort();
    expect(news).toEqual(['FLUX 3 Image', 'Ideogram V4.5', 'Nano Banana 2.1']);
  });

  it('메뉴 글자는 정확 일치: GPT Image 2 ≠ 2.5, Ideogram V4 ≠ V4.5', () => {
    expect(gensparkFindModelByMenuLabel('GPT Image 2')?.id).toBe('gpt-image-2');
    expect(gensparkFindModelByMenuLabel('GPT Image 2.5')?.id).toBe('gpt-image-2.5');
    expect(gensparkFindModelByMenuLabel('Ideogram V4')?.creditFree).toBe(true);
    expect(gensparkFindModelByMenuLabel('Ideogram V4.5')?.creditFree).toBe(false);
    expect(gensparkFindModelByMenuLabel('GPT Image')).toBeNull();
    expect(gensparkFindModelByMenuLabel('모델 자동 선택')).toBeNull();
    expect(gensparkFindModelByMenuLabel(undefined)).toBeNull();
  });

  it('제외 대상 도구는 목록에 없다', () => {
    for (const label of ['Recraft Clarity Upscale', 'Bria Background Remover', 'Text Removal', 'Flux Pro Erase']) {
      expect(gensparkFindModelByMenuLabel(label)).toBeNull();
    }
  });

  it('크레딧 모델만 (크레딧 차감) 표시가 붙는다', () => {
    expect(gensparkModelDisplayLabel(gensparkFindModelById('gpt-image-2.5')!)).toBe('GPT Image 2.5');
    expect(gensparkModelDisplayLabel(gensparkFindModelById('nano-banana-pro')!)).toBe('Nano Banana Pro (크레딧 차감)');
  });

  it('id 조회: 없으면 null', () => {
    expect(gensparkFindModelById('nope')).toBeNull();
    expect(gensparkFindModelById(123)).toBeNull();
  });

  it('정규화: 빈 값은 기본값, 모르는 값은 null(조용히 바꾸지 않는다)', () => {
    expect(gensparkNormalizeModelId(undefined)?.id).toBe('gpt-image-2.5');
    expect(gensparkNormalizeModelId(null)?.id).toBe('gpt-image-2.5');
    expect(gensparkNormalizeModelId('')?.id).toBe('gpt-image-2.5');
    expect(gensparkNormalizeModelId('   ')?.id).toBe('gpt-image-2.5');
    expect(gensparkNormalizeModelId(' flux-3-image ')?.id).toBe('flux-3-image');
    expect(gensparkNormalizeModelId('unknown-model')).toBeNull();
    expect(gensparkNormalizeModelId(42)).toBeNull();
  });
});

describe('gensparkErrors', () => {
  it('문구는 [젠스파크] 로 시작하고 code 를 가진다', () => {
    const e = new GensparkError(GENSPARK_MODEL_NOT_FOUND, 'Krea 2 Turbo');
    expect(e.code).toBe(GENSPARK_MODEL_NOT_FOUND);
    expect(e.userMessage.startsWith('[젠스파크] ')).toBe(true);
    expect(e.message).toContain('Krea 2 Turbo');
    expect(e instanceof GensparkError).toBe(true);
  });

  it('배치 전체 중단 vs 항목만 실패', () => {
    expect(gensparkIsBatchFatal(new GensparkError(GENSPARK_LOGIN_REQUIRED))).toBe(true);
    expect(gensparkIsBatchFatal(new GensparkError(GENSPARK_ABORTED))).toBe(true);
    expect(gensparkIsBatchFatal(new GensparkError(GENSPARK_JOB_TIMEOUT))).toBe(false);
    expect(gensparkIsBatchFatal(new GensparkError(GENSPARK_DOWNLOAD_FAILED))).toBe(false);
    expect(gensparkIsBatchFatal(new Error('x'))).toBe(false);
  });
});
