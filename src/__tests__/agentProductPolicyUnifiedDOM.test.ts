import { afterEach, describe, expect, it } from 'vitest';
import { UnifiedDOMCache } from '../renderer/modules/unifiedDOMCache';

describe('UnifiedDOMCache agent product-policy defense', () => {
  const originalDocument = globalThis.document;
  const originalLocalStorage = globalThis.localStorage;

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
    UnifiedDOMCache.unifiedGenerator = null;
    UnifiedDOMCache.unifiedImageSource = null;
  });

  it('uses the actual image management dropdown before stale stored engine settings', () => {
    const writes = new Map<string, string>();
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        querySelector: () => null,
        getElementById: (id: string) => id === 'image-source-select'
          ? { value: 'openai-image' }
          : null,
      },
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => key === 'fullAutoImageSource' || key === 'globalImageSource'
          ? 'nano-banana-pro'
          : null,
        setItem: (key: string, value: string) => writes.set(key, value),
      },
    });

    expect(UnifiedDOMCache.getImageSource()).toBe('openai-image');
    expect(writes.get('fullAutoImageSource')).toBe('openai-image');
    expect(writes.get('globalImageSource')).toBe('openai-image');
  });

  it('uses a newly selected image source button before a stale dropdown', () => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        querySelector: (selector: string) => selector.includes('.image-source-btn.selected')
          ? { getAttribute: () => 'openai-image' }
          : null,
        getElementById: (id: string) => id === 'image-source-select'
          ? { value: 'nano-banana-pro' }
          : null,
      },
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => 'nano-banana-pro',
        setItem: () => undefined,
      },
    });

    expect(UnifiedDOMCache.getImageSource()).toBe('openai-image');
  });

  it('never routes a stale checked but disabled Claude subscription radio', () => {
    const staleRadio = { value: 'agent-claude', disabled: true } as HTMLInputElement;
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        querySelector: (selector: string) => selector.includes(':checked') ? staleRadio : null,
      },
    });
    UnifiedDOMCache.unifiedGenerator = { value: 'gemini' } as HTMLSelectElement;

    expect(UnifiedDOMCache.getGenerator()).toBe('gemini');
    expect(UnifiedDOMCache.unifiedGenerator.value).toBe('gemini');
  });

  it('preserves an explicitly enabled development Claude subscription route', () => {
    const enabledRadio = { value: 'agent-claude', disabled: false } as HTMLInputElement;
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        querySelector: (selector: string) => selector.includes(':checked') ? enabledRadio : null,
      },
    });
    UnifiedDOMCache.unifiedGenerator = { value: 'gemini' } as HTMLSelectElement;

    expect(UnifiedDOMCache.getGenerator()).toBe('agent-claude');
  });

  it('rejects a stale hidden Claude provider when the checked model is safe', () => {
    const safeRadio = { value: 'gemini-3.5-flash', disabled: false } as HTMLInputElement;
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        querySelector: (selector: string) => selector.includes(':checked') ? safeRadio : null,
      },
    });
    UnifiedDOMCache.unifiedGenerator = { value: 'agent-claude' } as HTMLSelectElement;

    expect(UnifiedDOMCache.getGenerator()).toBe('gemini');
    expect(UnifiedDOMCache.unifiedGenerator.value).toBe('gemini');
  });
});
