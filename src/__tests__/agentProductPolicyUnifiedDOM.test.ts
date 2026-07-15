import { afterEach, describe, expect, it } from 'vitest';
import { UnifiedDOMCache } from '../renderer/modules/unifiedDOMCache';

describe('UnifiedDOMCache agent product-policy defense', () => {
  const originalDocument = globalThis.document;

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    });
    UnifiedDOMCache.unifiedGenerator = null;
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
