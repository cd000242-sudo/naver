export interface ManualTitleContentLike {
  title?: string;
  selectedTitle?: string;
  titleAlternatives?: string[];
  titleCandidates?: Array<{ text: string; score: number; reasoning?: string }>;
  manualTitleLocked?: boolean;
  manualTitleValue?: string;
  [key: string]: any;
}

export interface ManualTitleOverrideOptions {
  maxLength?: number;
  reasoning?: string;
}

const DEFAULT_MANUAL_TITLE_MAX_LENGTH = 120;
const DEFAULT_MANUAL_TITLE_REASONING = '사용자 지정 제목';

export function normalizeManualTitleOverride(value: unknown, maxLength = DEFAULT_MANUAL_TITLE_MAX_LENGTH): string | undefined {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, Math.max(1, maxLength))
    .trim();

  return normalized || undefined;
}

export function applyManualTitleOverride<T extends ManualTitleContentLike | null | undefined>(
  content: T,
  manualTitle: unknown,
  options: ManualTitleOverrideOptions = {}
): T {
  const title = normalizeManualTitleOverride(manualTitle, options.maxLength);
  if (!content || !title) return content;

  return {
    ...content,
    title,
    selectedTitle: title,
    manualTitleLocked: true,
    manualTitleValue: title,
    titleAlternatives: [title],
    titleCandidates: [{
      text: title,
      score: 100,
      reasoning: options.reasoning || DEFAULT_MANUAL_TITLE_REASONING,
    }],
  };
}

export function applyManualTitleOverrideInPlace<T extends ManualTitleContentLike | null | undefined>(
  content: T,
  manualTitle: unknown,
  options: ManualTitleOverrideOptions = {}
): T {
  const next = applyManualTitleOverride(content, manualTitle, options);
  if (!content || next === content) return content;

  Object.assign(content, next);
  return content;
}
