import { describe, expect, it } from 'vitest';

import {
  appendClaudeStrongAbstentionBlock,
  buildClaudeStrongAbstentionBlock,
} from '../contentPromptAddons.js';

describe('contentPromptAddons', () => {
  it('builds the Claude-only strong abstention block', () => {
    const block = buildClaudeStrongAbstentionBlock();

    expect(block).toContain('[SECTION -3 STRONG ABSTENTION]');
    expect(block).toContain('자료에 명시되지 않은 사실은 절대 추측 금지');
    expect(block).toContain('(자료 부족)');
  });

  it('keeps the prompt unchanged when the addon is disabled', () => {
    expect(appendClaudeStrongAbstentionBlock('base prompt', false)).toBe('base prompt');
  });

  it('appends the addon once when enabled', () => {
    const once = appendClaudeStrongAbstentionBlock('base prompt', true);
    const twice = appendClaudeStrongAbstentionBlock(once, true);

    expect(once).toContain('base prompt');
    expect(once).toContain('[SECTION -3 STRONG ABSTENTION]');
    expect(twice).toBe(once);
  });
});
