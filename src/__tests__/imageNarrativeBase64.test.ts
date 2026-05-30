import { describe, it, expect } from 'vitest';
import { uint8ToBase64 } from '../renderer/modules/imageNarrativeUpload';

// Regression: 대용량 이미지 업로드 시 "Maximum call stack size exceeded"
// (btoa(String.fromCharCode(...bytes)) 스프레드가 스택 초과) 재발 방지.

describe('uint8ToBase64', () => {
  it('matches btoa for a small ASCII input', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(uint8ToBase64(bytes)).toBe(btoa('Hello'));
  });

  it('round-trips arbitrary byte values', () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 200, 254, 255]);
    const back = Uint8Array.from(atob(uint8ToBase64(bytes)), (c) => c.charCodeAt(0));
    expect(Array.from(back)).toEqual(Array.from(bytes));
  });

  it('handles an empty array', () => {
    expect(uint8ToBase64(new Uint8Array([]))).toBe('');
  });

  it('handles a 5MB buffer without throwing (stack-overflow regression)', () => {
    const big = new Uint8Array(5 * 1024 * 1024);
    for (let i = 0; i < big.length; i++) big[i] = i & 0xff;
    let b64 = '';
    expect(() => {
      b64 = uint8ToBase64(big);
    }).not.toThrow();
    const back = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(back.length).toBe(big.length);
    expect(back[0]).toBe(0);
    expect(back[255]).toBe(255);
    expect(back[big.length - 1]).toBe((big.length - 1) & 0xff);
  });
});
