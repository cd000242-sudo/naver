// src/main/paraphraseUpgradeForUrl.ts
// URL 로 넣은 상위노출 글에 1단 노출 분석을 붙인다.
//
// [2026-08-29] 페러프레이징 2단 체인(왜 떴는가 → 상위호환)은 붙여넣기 UI 버튼에만
// 연결돼 있었다. URL 을 넣으면 크롤링은 하되 그 분석은 건너뛰어서, 상위노출 글을
// 가져와도 "원본이 비운 곳"을 채우지 않는 단순 재작성이 나왔다.
//
// 상위노출 글은 네이버가 이미 고른 글이다. URL 하나로 그 이점을 쓰게 한다.
//
// 보조 단계다 — 실패해도 던지지 않는다. 분석이 없으면 기존 URL 모드 그대로 간다.

import { analyzeParaphraseSource, buildParaphraseUpgradeBrief } from '../content/paraphraseSourceAnalysis.js';
import { resolveRoute } from './ipc/paraphraseAnalysisHandlers.js';

/** 이보다 짧은 원문은 노출 요인을 읽을 재료가 못 된다. */
const MIN_BODY_CHARS = 1000;

export interface UpgradeAttachInput {
  readonly title?: unknown;
  readonly rawText?: unknown;
  readonly url?: unknown;
}

export interface UpgradeAttachResult {
  readonly attached: boolean;
  readonly brief: string;
  /** 원본이 실제로 노리는 키워드. 제목 앞단어 추측을 대체한다. */
  readonly mainKeyword: string;
  readonly subKeywords: readonly string[];
  readonly reason: string;
}

const SKIPPED = (reason: string): UpgradeAttachResult =>
  ({ attached: false, brief: '', mainKeyword: '', subKeywords: [], reason });

/** URL 모드이고 본문이 충분할 때만 분석한다. */
export function shouldAnalyzeUrlSource(source: UpgradeAttachInput): boolean {
  const hasUrl = String(source?.url ?? '').trim().length > 0;
  return hasUrl && String(source?.rawText ?? '').trim().length >= MIN_BODY_CHARS;
}

export async function attachParaphraseUpgradeBrief(
  source: UpgradeAttachInput,
  config: Record<string, unknown>,
  generator: string,
): Promise<UpgradeAttachResult> {
  try {
    if (!shouldAnalyzeUrlSource(source)) return SKIPPED('URL 모드가 아니거나 원문이 짧음');

    const route = resolveRoute(String(generator || ''), config);
    if (!route) return SKIPPED('분석에 쓸 엔진 없음');

    const analysis = await analyzeParaphraseSource({ callModel: route.callModel }, {
      title: String(source.title ?? ''),
      body: String(source.rawText ?? ''),
    });
    if (!analysis) return SKIPPED('분석 결과를 읽지 못함');

    return {
      attached: true,
      brief: buildParaphraseUpgradeBrief(analysis),
      mainKeyword: String(analysis.mainKeyword || '').trim(),
      subKeywords: (analysis.subKeywords || []).map((k) => String(k || '').trim()).filter(Boolean),
      reason: `엔진 ${route.engine}`,
    };
  } catch (error) {
    return SKIPPED(`분석 실패: ${(error as Error)?.message || error}`);
  }
}
