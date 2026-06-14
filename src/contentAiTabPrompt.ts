import path from 'path';

export type AiTabPromptSource = 'dist' | 'dev' | 'missing';

export interface AiTabPromptLoaderDeps {
  appPath: string;
  currentDir: string;
  existsSync: (filePath: string) => boolean;
  readFileSync: (filePath: string, encoding: BufferEncoding) => string;
}

export interface AiTabPromptLoadResult {
  source: AiTabPromptSource;
  prompt?: string;
}

export function shouldApplyAiTabFriendlyPrompt(source: { aiTabFriendly?: boolean }, contentMode: string): boolean {
  return source.aiTabFriendly === true && (contentMode === 'seo' || contentMode === 'mate');
}

export function loadAiTabFriendlyPrompt(deps: AiTabPromptLoaderDeps): AiTabPromptLoadResult {
  const distPath = path.join(deps.appPath, 'dist', 'prompts', 'seo', 'ai-tab-friendly.prompt');
  if (deps.existsSync(distPath)) {
    return { source: 'dist', prompt: deps.readFileSync(distPath, 'utf-8') };
  }

  const devPath = path.join(deps.currentDir, '..', 'src', 'prompts', 'seo', 'ai-tab-friendly.prompt');
  if (deps.existsSync(devPath)) {
    return { source: 'dev', prompt: deps.readFileSync(devPath, 'utf-8') };
  }

  return { source: 'missing' };
}

export function appendAiTabFriendlyPrompt(systemPrompt: string, result: AiTabPromptLoadResult): string {
  if (!result.prompt) return systemPrompt;
  return `${systemPrompt}\n\n${result.prompt}`;
}
