import { normalizeManualTitleOverride } from '../contentManualTitlePolicy.js';
import {
  resolveKeywordAsTitleValue,
  type KeywordTitleSourceLike,
} from '../contentKeywordTitlePolicy.js';

export type ContentQualityV3TitleContractKind = 'manual' | 'keyword';

export const CONTENT_QUALITY_V3_TITLE_MAX_CHARS = 120;

export interface ContentQualityV3TitleContract {
  readonly kind: ContentQualityV3TitleContractKind;
  readonly expectedTitle: string;
  readonly issueCode: 'manual_title_mismatch' | 'keyword_title_mismatch';
}

export interface ContentQualityV3TitleContractSource extends KeywordTitleSourceLike {
  readonly manualTitleOverride?: unknown;
}

export function resolveContentQualityV3TitleContract(
  source: ContentQualityV3TitleContractSource,
): ContentQualityV3TitleContract | undefined {
  const manualTitle = normalizeManualTitleOverride(
    source?.manualTitleOverride,
    CONTENT_QUALITY_V3_TITLE_MAX_CHARS,
  );
  if (manualTitle) {
    return Object.freeze({
      kind: 'manual',
      expectedTitle: manualTitle,
      issueCode: 'manual_title_mismatch',
    });
  }

  const keywordTitle = normalizeManualTitleOverride(
    resolveKeywordAsTitleValue(source),
    CONTENT_QUALITY_V3_TITLE_MAX_CHARS,
  );
  if (!keywordTitle) return undefined;

  return Object.freeze({
    kind: 'keyword',
    expectedTitle: keywordTitle,
    issueCode: 'keyword_title_mismatch',
  });
}
