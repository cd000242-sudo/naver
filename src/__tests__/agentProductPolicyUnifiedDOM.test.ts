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

  it('stored engine settings win over the image management dropdown and nothing is written back', () => {
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
        getItem: (key: string) => key === 'globalImageSource' ? 'flow' : key === 'fullAutoImageSource' ? 'nano-banana-pro' : null,
        setItem: (key: string, value: string) => writes.set(key, value),
      },
    });

    expect(UnifiedDOMCache.getImageSource()).toBe('flow');
    expect(writes.size).toBe(0);
  });

  it('keeps local-folder from storage even though the dropdown only displays another engine', () => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { querySelector: () => null, getElementById: (id: string) => id === 'image-source-select' ? { value: 'openai-image' } : null },
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (key: string) => key === 'globalImageSource' ? 'local-folder' : null, setItem: () => undefined },
    });

    expect(UnifiedDOMCache.getImageSource()).toBe('local-folder');
  });

  it('reads the screen only when nothing is stored, and still never writes', () => {
    const writes: string[] = [];
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
      value: { getItem: () => null, setItem: (key: string) => writes.push(key) },
    });

    expect(UnifiedDOMCache.getImageSource()).toBe('openai-image');
    expect(writes).toEqual([]);
  });

  it('a selected image-vault (saved) button is a one-run choice and beats the stored engine', () => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        querySelector: (selector: string) => selector.includes('.image-source-btn.selected')
          ? { getAttribute: () => 'saved' }
          : null,
        getElementById: () => null,
      },
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => 'flow', setItem: () => undefined },
    });

    expect(UnifiedDOMCache.getImageSource()).toBe('saved');
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
