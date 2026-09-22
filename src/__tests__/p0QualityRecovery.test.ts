// [2026-09-22] P0 quality recovery — integration-level regression guards for the audit fixes
// (docs/CONTENT_QUALITY_AUDIT_2026-09-22.md). Pure-module tests plus source guards on the god
// files where behaviour is wired.
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

import { prepareSourceMaterial } from '../content/sourcePipeline';
import { evaluatePipelineIntegrity } from '../content/pipelineIntegrityGate';
import { OutputTruncatedError, isOutputTruncatedError, isTruncatedFinishReason, raisedOutputBudget } from '../content/outputTruncation';
import { contentTextOf, diffDeletedSentences, tracePostProcessStep } from '../content/postProcessTrace';
import { buildAttributionEvidence } from '../content/attributionEvidence';
import { resolveQualityTierModel, resolveSelectedEngineRoute } from '../main/ipc/paraphraseAnalysisHandlers';
import type { SourceDocument } from '../content/sourceDocument';

function read(rel: string): string {
  return readFileSync(resolve(__dirname, '..', rel), 'utf8');
}

function doc(id: string, body: string, extra: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id, title: `${id} 제목`, sourceType: 'news', sourceName: '연합뉴스', url: `https://www.yna.co.kr/${id}`,
    pubDate: '2026-09-20', dateStatus: 'KNOWN', body, sourceTier: 'NEWS', ...extra,
  };
}

const KEYWORD = '청약통장 금리';
const ON_TOPIC = '청약통장 금리가 올해 2.5%에서 3.0%로 오른다. 국토교통부 발표에 따르면 청약통장 가입자 2,700만명이 대상이다. 금리 인상은 9월 1일부터 적용된다.';

describe('sourcePipeline — 자료 블록 단위 정제·라벨·손실 계측', () => {
  it('structured documents are cleaned per block and rendered with source labels', () => {
    // [P1 relevance v2] Each doc carries enough distinct elaboration that the new duplicate-body
    // detector (sourceRelevanceDuplicate.ts) — which correctly flags near-byte-identical articles —
    // doesn't mistake "3 articles quoting the same official statement" for "the same article 3 times".
    const docs = [
      doc('S01', `${ON_TOPIC} 발표 직후 청약 상담 창구에는 문의가 몰렸다고 담당자는 전했다.\n관련 기사\n무단 전재 및 재배포 금지\n인기 기사 1위 2위 3위`),
      doc('S02', `${ON_TOPIC} 두 번째 기사 본문입니다. 이 조치는 무주택 서민의 자산 형성을 돕기 위한 것으로, 국토교통부는 후속 대책도 순차적으로 발표할 계획이라고 밝혔다. 전문가들은 이번 인상이 청약 경쟁률에 영향을 줄 것으로 내다봤다.`),
      doc('S03', `${ON_TOPIC} 세 번째 기사 본문입니다. 지역 부동산 업계에서는 이번 금리 인상이 청약 시장 전반에 미칠 파급 효과를 주목하고 있으며, 실수요자들의 자금 계획에도 변화가 예상된다는 분석이 나온다.`, { pubDate: undefined, dateStatus: 'UNKNOWN_DATE' }),
    ];
    const result = prepareSourceMaterial({ rawText: '', contentMode: 'seo', metadata: { sourceDocuments: docs } }, KEYWORD);
    expect(result.metrics.usedStructured).toBe(true);
    expect(result.metrics.rawSources).toBe(3);
    expect(result.metrics.acceptedSources).toBe(3);
    expect(result.metrics.unknownDateSources).toBe(1);
    expect(result.rawText).toContain('[자료 S01]');
    expect(result.rawText).toContain('[자료 S03]');
    expect(result.rawText).toContain('출처: 연합뉴스');
    expect(result.rawText).toContain('| UNKNOWN_DATE');
    expect(result.rawText).toContain('실제 출처 귀속은');
    expect(result.rawText).toContain('두 번째 기사 본문입니다');
    expect(result.rawText).toContain('세 번째 기사 본문입니다');
    expect(result.metrics.removedRatio).toBeLessThan(0.3);
    expect(result.logLine).toMatch(/\[SourcePipeline\] raw_sources=3 raw_chars=\d+ clean_chars=\d+ removed_chars=\d+ removed_ratio=\d+\.\d%/);
  });

  it('a legacy 29k bundle with chrome inside doc 1 keeps ≥90% of the material (the 73%-loss bug)', () => {
    const chromeTail = '\n관련 기사\n무단 전재 및 재배포 금지\n최신 뉴스 1위 2위 3위 4위';
    const parts: string[] = [];
    for (let i = 1; i <= 8; i += 1) {
      // [P1 relevance v2] Each doc's filler must differ from the others' — otherwise the new
      // duplicate-body detector (sourceRelevanceDuplicate.ts) correctly flags near-identical
      // articles as REJECT_DUPLICATE, which isn't what this fixture is testing (loss-prevention).
      // A single-digit-substitution filler is too periodic to actually differ shingle-wise, so
      // vary a running index (k) through the whole filler instead of just the doc number (i).
      const filler = Array.from({ length: 320 }, (_, k) => `자료 ${i}-${k} 세부 설명 문장입니다. `).join('');
      const body = `${ON_TOPIC} ${filler}`.slice(0, 3600);
      parts.push(`[자료 ${i} — 청약통장 금리 기사 ${i}]\n[2026-09-20 작성 · 2일 전]\n${body}${i === 1 ? chromeTail : ''}`);
    }
    const bundle = `[자료 등급 — 이 글의 재료가 어디서 왔는지]\n기사 8건이 근거를 받칩니다.\n\n=== 사실 자료 (수치·조건·절차는 이 범위에서만 사용) ===\n※ 번호표 안내\n${parts.join('\n\n')}\n\n=== 검색 결과 스니펫 (맥락 참고용) ===\n【스니펫】\n청약통장 금리 인상 안내`;
    expect(bundle.length).toBeGreaterThan(29000);
    const result = prepareSourceMaterial({ rawText: bundle, contentMode: 'seo', metadata: {} }, KEYWORD);
    expect(result.metrics.usedStructured).toBe(false);
    expect(result.metrics.rawSources).toBe(8);
    expect(result.rawText.length).toBeGreaterThan(bundle.length * 0.9);
    expect(result.rawText).toContain('[자료 S08]');
    expect(result.rawText).toContain('【스니펫】');
    expect(result.metrics.level).toBe('ok');
  });

  it('rejects an off-topic document but never drops every document', () => {
    const docs = [
      doc('S01', ON_TOPIC),
      doc('S02', '쌍꺼풀 수술 비용과 사각턱 보톡스 후기입니다. 병원 선택 기준을 정리했습니다.', { sourceType: 'blog', sourceTier: 'BLOG', sourceName: '티스토리' }),
    ];
    const result = prepareSourceMaterial({ rawText: '', contentMode: 'seo', metadata: { sourceDocuments: docs } }, KEYWORD);
    expect(result.metrics.acceptedSources).toBe(1);
    expect(result.metrics.rejectedSources).toBe(1);
    expect(result.rawText).not.toContain('쌍꺼풀 수술');
    const allOff = prepareSourceMaterial({ rawText: '', contentMode: 'seo', metadata: { sourceDocuments: [docs[1]] } }, KEYWORD);
    expect(allOff.rawText).toContain('쌍꺼풀 수술');
    expect(allOff.metrics.rejectedReasons.ALL_REJECTED_KEPT).toBe(1);
  });

  it('URL mode keeps the legacy string path (block-aware noise strip only)', () => {
    const result = prepareSourceMaterial({ rawText: `${ON_TOPIC}\n무단 전재 및 재배포 금지`, contentMode: 'custom', url: 'https://n.news.naver.com/x', metadata: {} }, KEYWORD);
    expect(result.metrics.usedStructured).toBe(false);
    expect(result.rawText).toContain('국토교통부 발표에 따르면');
  });
});

describe('pipelineIntegrityGate — 치명 실패는 MANUAL_REVIEW', () => {
  const base = {
    sourceBased: true, searchStatus: 'SEARCH_OK', sourceCount: 6, sourceRetentionRatio: 0.95,
    selectedProvider: 'openai', actualModelsUsed: [{ stage: 'body', provider: 'openai', model: 'gpt-5.6-terra' }],
    destructiveScrubApplied: false, jsonComplete: true, outputTruncated: false,
  };
  it('passes a healthy run', () => {
    const r = evaluatePipelineIntegrity(base);
    expect(r.publishDecision).toBe('AUTO_PUBLISH_OK');
    expect(r.criticalFailures).toEqual([]);
  });
  it('SEARCH_EMPTY / RATE_LIMITED on a source-based article blocks auto publish', () => {
    expect(evaluatePipelineIntegrity({ ...base, searchStatus: 'SEARCH_EMPTY', sourceCount: 0 }).publishDecision).toBe('MANUAL_REVIEW');
    expect(evaluatePipelineIntegrity({ ...base, searchStatus: 'SEARCH_RATE_LIMITED', sourceCount: 0 }).criticalFailures).toContain('SEARCH_STATUS_OK');
  });
  it('a silent model override on a quality stage is critical; utility stages are not', () => {
    const r = evaluatePipelineIntegrity({ ...base, actualModelsUsed: [...base.actualModelsUsed, { stage: 'blueprint(quality)', provider: 'gemini', model: 'gemini-3.1-flash-lite' }] });
    expect(r.criticalFailures).toContain('NO_SILENT_MODEL_OVERRIDE');
    const ok = evaluatePipelineIntegrity({ ...base, actualModelsUsed: [...base.actualModelsUsed, { stage: 'url-keyword(utility)', provider: 'gemini', model: 'gemini-3.1-flash-lite' }] });
    expect(ok.criticalFailures).toEqual([]);
  });
  it('truncated output, incomplete JSON and destructive scrub are critical; >50% retention loss is critical', () => {
    expect(evaluatePipelineIntegrity({ ...base, outputTruncated: true }).criticalFailures).toContain('OUTPUT_NOT_TRUNCATED');
    expect(evaluatePipelineIntegrity({ ...base, jsonComplete: false }).criticalFailures).toContain('JSON_COMPLETE');
    expect(evaluatePipelineIntegrity({ ...base, destructiveScrubApplied: true }).criticalFailures).toContain('NO_DESTRUCTIVE_SCRUB');
    expect(evaluatePipelineIntegrity({ ...base, sourceRetentionRatio: 0.27 }).criticalFailures).toContain('SOURCE_RETENTION_OK');
    expect(evaluatePipelineIntegrity({ ...base, sourceRetentionRatio: 0.6 }).warnings).toContain('SOURCE_RETENTION_OK');
  });
  it('a non-source article (semi-auto paste) is not judged on search status', () => {
    expect(evaluatePipelineIntegrity({ ...base, sourceBased: false, searchStatus: 'SEARCH_EMPTY', sourceCount: 0 }).publishDecision).toBe('AUTO_PUBLISH_OK');
  });
});

describe('outputTruncation — 잘린 응답은 성공이 아니다', () => {
  it('maps every provider finish reason', () => {
    expect(isTruncatedFinishReason('gemini', 'MAX_TOKENS')).toBe(true);
    expect(isTruncatedFinishReason('gemini', 'STOP')).toBe(false);
    expect(isTruncatedFinishReason('openai', 'length')).toBe(true);
    expect(isTruncatedFinishReason('claude', 'max_tokens')).toBe(true);
    expect(isTruncatedFinishReason('perplexity', 'length')).toBe(true);
    expect(isTruncatedFinishReason('openai', '')).toBe(false);
  });
  it('carries the partial text and a stable code; budget raise is bounded', () => {
    const err = new OutputTruncatedError('openai', 'gpt-5.6-terra', 'length', '{"selectedTitle":"…', 4080);
    expect(err.code).toBe('OUTPUT_TRUNCATED');
    expect(isOutputTruncatedError(err)).toBe(true);
    expect(err.message).toContain('OUTPUT_TRUNCATED');
    expect(raisedOutputBudget(4080, 32000)).toBe(6120);
    expect(raisedOutputBudget(30000, 32000)).toBe(32000);
  });
  it('contentGenerator checks finish reasons on NON-empty responses for all four providers', () => {
    const src = read('contentGenerator.ts');
    expect(src).toMatch(/isTruncatedFinishReason\('gemini', nonEmptyFinishReason\)/);
    expect(src).toMatch(/isTruncatedFinishReason\('openai', nonEmptyFinishReason\)/);
    expect(src).toMatch(/isTruncatedFinishReason\('claude', claudeStopReason\)/);
    expect(src).toMatch(/isTruncatedFinishReason\('perplexity', pplxFinishReason\)/);
    expect(src).toMatch(/if \(error instanceof OutputTruncatedError\) throw error;/);
  });
});

describe('postProcessTrace — 삭제 문장 추적', () => {
  it('reports deleted sentences and char deltas', () => {
    const before = '보건복지부 발표에 따르면 월 30만원이 지급된다. 신청은 9월 1일부터다. 마지막 문장입니다.';
    const after = '월 30만원이 지급된다. 마지막 문장입니다.';
    const trace = tracePostProcessStep('sanitize', before, after);
    expect(trace.deletedChars).toBe(before.length - after.length);
    expect(diffDeletedSentences(before, after)).toContain('신청은 9월 1일부터다.');
    expect(contentTextOf({ selectedTitle: '제목', headings: [{ title: 'h', content: 'c' }], bodyPlain: 'b' })).toBe('제목\nh\nc\nb');
  });
});

describe('attributionEvidence — Writer가 받은 출처 이름', () => {
  it('collects source names from structured docs and the legacy bundle', () => {
    const structured = buildAttributionEvidence({ rawText: '본문', metadata: { sourceDocuments: [doc('S01', ON_TOPIC, { sourceName: '보건복지부', url: 'https://www.mohw.go.kr/a' })] } });
    expect(structured.sourceNames).toContain('보건복지부');
    expect(structured.corpus).toContain('본문');
    const legacy = buildAttributionEvidence({ rawText: '[자료 1 — 기사 제목]\n국토교통부 발표에 따르면 3.0%다.', metadata: {} });
    expect(legacy.corpus).toContain('국토교통부');
  });
});

describe('선택 엔진 — 품질 단계는 사용자 모델, 유틸 단계만 저가 모델', () => {
  const config = { primaryGeminiTextModel: 'openai-gpt56-sol', openaiApiKey: 'sk-test-xxxxxxxxxxxxxxxxxxxx', claudeApiKey: 'sk-ant-test', geminiApiKey: 'AIza-test' };
  it('quality tier resolves the selected primary model instead of gpt-4.1-mini', () => {
    const quality = resolveSelectedEngineRoute('openai', config, { tier: 'quality' });
    const utility = resolveSelectedEngineRoute('openai', config);
    expect(quality?.tier).toBe('quality');
    expect(quality?.engine).not.toBe('gpt-4.1-mini');
    expect(quality?.engine).toBe(resolveQualityTierModel('openai', config));
    expect(utility?.engine).toBe('gpt-4.1-mini');
  });
  it('contentGenerator routes blueprint/judge/heading-repair/issue-discipline on the quality tier and keyword picking on utility', () => {
    const src = read('contentGenerator.ts');
    expect(src).toContain("resolveSideTaskRoute(source, 'blueprint')");
    expect(src).toContain("resolveSideTaskRoute(source, 'throughline-judge')");
    expect(src).toContain("resolveSideTaskRoute(source, 'heading-repair')");
    expect(src).toContain("resolveSideTaskRoute(source, 'issue-discipline')");
    expect(src).toContain("resolveSideTaskRoute(source, 'url-keyword', 'utility')");
    expect(src).toMatch(/tier: 'quality' \| 'utility' = 'quality'/);
  });
});

describe('소스 가드 — 거짓 성공을 남기지 않는다', () => {
  it('body grounding is reported honestly (no "Grounding: ON (강제)" log) and recorded in the run meta', () => {
    const src = read('contentGenerator.ts');
    expect(src).not.toContain('🧠 Grounding: ON (강제) | mode=');
    expect(src).toContain('const primaryDraftGrounding = false;');
    expect(src).toMatch(/run\.updateMeta\(\{ groundingRequested, groundingActuallyUsed \}\)/);
  });
  it('collectContentFromPlatforms never returns success:true with no material', () => {
    const src = read('sourceAssembler.ts');
    expect(src).not.toContain('success: true, // ✅ 성공으로 처리하여 AI 생성 진행');
    expect(src).toMatch(/collectedText: '',\s*sourceCount: 0,\s*urls: \[\],\s*success: false,/);
    expect(src).toMatch(/collectedText: '',\s*sourceCount: 0,\s*urls,\s*success: false,/);
    expect(src).toContain('resetSearchStatusLedger();');
    expect(src).toContain('searchStatus: buildSearchStatus()');
  });
  it('news full texts get their date from resolveSourceDate and become SourceDocuments', () => {
    const src = read('sourceAssembler.ts');
    expect(src).toContain('const sourceDate = resolveSourceDate(candidate as { postdate?: unknown; pubDate?: unknown });');
    expect(src).toMatch(/documents\.push\(\{\s*id: makeSourceId\(documents\.length \+ 1\)/);
    expect(src).not.toContain('(최근 30일 이내 자료만 수집)');
  });
  it('the renderer log no longer claims a 30-day filter and forwards structured sources', () => {
    const src = read('renderer/modules/contentGeneration.ts');
    expect(src).not.toContain('(최근 30일 이내 자료만 수집)');
    expect(src).toContain('sourceDocuments: collectedSourceDocuments');
    expect(src).toContain('realtimeCrawlRequested: useRealtimeCrawl === true');
  });
  it('PARTIAL_RESPONSE is fatal when the title or body is missing; MANUAL_REVIEW gate is wired at the publish boundary', () => {
    const gen = read('contentGenerator.ts');
    expect(gen).toMatch(/throw new PartialResponseError\(`PARTIAL_RESPONSE: \$\{detail\}`, 'body'/);
    const exec = read('main/services/BlogExecutor.ts');
    expect(exec).toContain('resolveIntegrityManualReview(effectivePayload)');
    expect(exec).toContain("preparedPolicy.manualReviewReasons.includes('SOURCE_MATERIALS_MISSING')");
    expect(exec).toContain('manualReviewRequired: true,');
    expect(exec).toContain('run?.writePublishedPayload(');
  });
  it('platitudes never trigger a paid full regeneration on their own; only overlapTooLow does', () => {
    const gen = read('contentGenerator.ts');
    expect(gen).toMatch(/platitudeReportRef\.overlapTooLow && attempt < QUALITY_ATTEMPT_LIMIT/);
    expect(gen).not.toMatch(/platitudeReportRef\.exceedsThreshold && attempt < QUALITY_ATTEMPT_LIMIT/);
  });
  it('LLM-expanded keywords are labelled as such in the body prompt', () => {
    const gen = read('contentGenerator.ts');
    expect(gen).toContain('(LLM 확장 보조어 — 실제 연관검색어 아님)');
    expect(read('content/paraphraseSourceAnalysis.ts')).not.toContain('본문에 실제로 깔린 연관 검색어');
  });
  it('prompt diet: "숫자 없는 문장이 낫다" rules are gone and HW has no count minimum', () => {
    expect(read('prompts/seo/geo-overlay.prompt')).not.toContain('수치가 없는 H2 하나가');
    expect(read('contentJsonPromptFormat.ts')).not.toContain('숫자가 없는 문장이 지어낸 숫자가 든 문장보다 낫다');
    expect(read('promptLoader.ts')).not.toContain('수치가 없는 소제목 하나가 뜻 없는 숫자가 박힌 소제목보다 낫다');
    const base = read('prompts/seo/base.prompt');
    expect(base).not.toContain('의무 8개+');
    expect(base).toContain('평가 우선순위: ① 팩트(자료 일치)');
  });
});
