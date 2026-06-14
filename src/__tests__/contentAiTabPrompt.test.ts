import { describe, expect, it } from 'vitest';

import {
  appendAiTabFriendlyPrompt,
  loadAiTabFriendlyPrompt,
  shouldApplyAiTabFriendlyPrompt,
} from '../contentAiTabPrompt.js';

const createDeps = (files: Record<string, string>) => ({
  appPath: 'C:/app',
  currentDir: 'C:/app/dist',
  existsSync: (filePath: string) => Object.prototype.hasOwnProperty.call(files, filePath.replace(/\\/g, '/')),
  readFileSync: (filePath: string) => files[filePath.replace(/\\/g, '/')],
});

describe('contentAiTabPrompt', () => {
  it('applies only to seo and mate when the source flag is enabled', () => {
    expect(shouldApplyAiTabFriendlyPrompt({ aiTabFriendly: true }, 'seo')).toBe(true);
    expect(shouldApplyAiTabFriendlyPrompt({ aiTabFriendly: true }, 'mate')).toBe(true);
    expect(shouldApplyAiTabFriendlyPrompt({ aiTabFriendly: true }, 'homefeed')).toBe(false);
    expect(shouldApplyAiTabFriendlyPrompt({ aiTabFriendly: false }, 'seo')).toBe(false);
  });

  it('loads the packaged dist prompt before the dev fallback', () => {
    const result = loadAiTabFriendlyPrompt(createDeps({
      'C:/app/dist/prompts/seo/ai-tab-friendly.prompt': 'DIST PROMPT',
      'C:/app/src/prompts/seo/ai-tab-friendly.prompt': 'DEV PROMPT',
    }));

    expect(result).toEqual({ source: 'dist', prompt: 'DIST PROMPT' });
  });

  it('falls back to the dev source prompt when dist is missing', () => {
    const result = loadAiTabFriendlyPrompt(createDeps({
      'C:/app/src/prompts/seo/ai-tab-friendly.prompt': 'DEV PROMPT',
    }));

    expect(result).toEqual({ source: 'dev', prompt: 'DEV PROMPT' });
  });

  it('appends only when a prompt is available', () => {
    expect(appendAiTabFriendlyPrompt('BASE', { source: 'dist', prompt: 'ADDON' })).toBe('BASE\n\nADDON');
    expect(appendAiTabFriendlyPrompt('BASE', { source: 'missing' })).toBe('BASE');
  });
});
