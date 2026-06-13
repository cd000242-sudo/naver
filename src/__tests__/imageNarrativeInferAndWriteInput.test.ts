import { describe, expect, it } from 'vitest';
import {
  normalizeInferAndWritePayload,
  normalizeVisionProvider,
} from '../imageNarrative/inferAndWriteInput';

const ONE_PIXEL = Buffer.from('fake-image').toString('base64');

function image(id: string, overrides: Record<string, unknown> = {}) {
  return {
    imageId: id,
    imageBase64: ONE_PIXEL,
    mimeType: 'image/jpeg',
    ...overrides,
  };
}

describe('normalizeInferAndWritePayload', () => {
  it('accepts a valid 3-image payload and normalizes options', () => {
    const normalized = normalizeInferAndWritePayload({
      images: [image('a'), image('b'), image('c')],
      provider: 'openai',
      mode: 'food',
      targetChars: '9000',
      toneStyle: 'formal',
    });

    expect(normalized.images).toHaveLength(3);
    expect(normalized.provider).toBe('openai');
    expect(normalized.mode).toBe('food');
    expect(normalized.targetChars).toBe(8000);
    expect(normalized.toneStyle).toBe('formal');
  });

  it('normalizes optional photo context and drops empty fields', () => {
    const normalized = normalizeInferAndWritePayload({
      images: [image('a'), image('b'), image('c')],
      context: {
        timeHint: '  토요일 저녁  ',
        mainPeople: ' 친구 민수 ',
        place: ' 성수동 카페 ',
        occasion: ' 생일 모임 ',
        notes: ' 케이크 사진은 마지막 순서 ',
        ignored: 'not allowed',
      },
    });

    expect(normalized.context).toEqual({
      timeHint: '토요일 저녁',
      mainPeople: '친구 민수',
      place: '성수동 카페',
      occasion: '생일 모임',
      notes: '케이크 사진은 마지막 순서',
    });
  });

  it('limits long photo context memo text', () => {
    const normalized = normalizeInferAndWritePayload({
      images: [image('a'), image('b'), image('c')],
      context: {
        notes: 'a'.repeat(1200),
      },
    });

    expect(normalized.context?.notes).toHaveLength(1000);
  });

  it('rejects fewer than 3 images', () => {
    expect(() => normalizeInferAndWritePayload({
      images: [image('a'), image('b')],
    })).toThrow(/at least 3/i);
  });

  it('rejects invalid base64', () => {
    expect(() => normalizeInferAndWritePayload({
      images: [image('a'), image('b'), image('c', { imageBase64: 'not-base64' })],
    })).toThrow(/base64/i);
  });

  it('rejects HEIC after renderer conversion failed', () => {
    expect(() => normalizeInferAndWritePayload({
      images: [image('a'), image('b'), image('c', { mimeType: 'image/heic' })],
    })).toThrow(/HEIC/i);
  });
});

describe('normalizeVisionProvider', () => {
  it('keeps only supported live providers', () => {
    expect(normalizeVisionProvider('openai')).toBe('openai');
    expect(normalizeVisionProvider('claude')).toBe('gemini');
    expect(normalizeVisionProvider(undefined)).toBe('gemini');
  });
});
