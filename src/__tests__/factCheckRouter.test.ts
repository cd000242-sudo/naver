/**
 * [v2.11.134] 팩트체크 엔진 드롭다운 + 자동 폴백 라우터 잠금.
 *
 * 사용자 계약: 비용 저렴한 순 선택지, 자동은 크롤링→네이버→퍼플렉시티(키
 * 있을 때)만 승격하고 고비용 그라운딩은 절대 자동 실행하지 않는다.
 * 팩트체크 실패는 발행을 막지 않는다(경고-only).
 *
 * [2026-09-22] 검수자는 삭제자가 아니다. `parseSuspicious`/`applyCorrections`
 * (원문/replacement 계약, 빈 문자열 replacement = 삭제 지시)를 제거하고
 * `parseFactIssues` (claim/status/issue/suggestedCorrection 계약)로 교체했다.
 * 이 라우터는 더 이상 스스로 본문을 고치지 않는다 — issues 만 보고한다.
 */
import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  resolveFactCheckEngine,
  shouldEscalateEvidence,
  parseFactIssues,
  runFactCheck,
  buildAssemblyErrorAxes,
  AUTO_ESCALATE_BELOW_CHARS,
  MAX_EVIDENCE_CHARS,
  FACT_CHECK_ENGINE_VALUES,
} from '../factCheckRouter';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('엔진 해석 (드롭다운 + 레거시 마이그레이션)', () => {
  it('유효한 선택값은 그대로 쓴다', () => {
    expect(resolveFactCheckEngine({ factCheckEngine: 'gemini-grounding' })).toBe('gemini-grounding');
    expect(resolveFactCheckEngine({ factCheckEngine: 'off' })).toBe('off');
  });

  it('구버전 Perplexity 체크박스 ON은 perplexity로 마이그레이션된다', () => {
    expect(resolveFactCheckEngine({ usePerplexityFactCheck: true })).toBe('perplexity');
  });

  it('기본값은 auto', () => {
    expect(resolveFactCheckEngine({})).toBe('auto');
    expect(resolveFactCheckEngine(null)).toBe('auto');
    expect(resolveFactCheckEngine({ factCheckEngine: '이상한값' })).toBe('auto');
  });
});

describe('자동 승격 규칙 (순수 함수)', () => {
  it('자료 500자 미만이면 승격한다', () => {
    expect(shouldEscalateEvidence(0)).toBe(true);
    expect(shouldEscalateEvidence(AUTO_ESCALATE_BELOW_CHARS - 1)).toBe(true);
    expect(shouldEscalateEvidence(AUTO_ESCALATE_BELOW_CHARS)).toBe(false);
    expect(shouldEscalateEvidence(5000)).toBe(false);
  });
});

describe('parseFactIssues — 새 issue 계약 파싱', () => {
  it('마크다운 펜스로 감싼 JSON도 파싱한다', () => {
    const raw = '```json\n{"issues":[{"claim":"2020년에 출시됐다","status":"UNSUPPORTED","issue":"연도 오류","suggestedCorrection":"2021년에 출시됐다"}]}\n```';
    const items = parseFactIssues(raw);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('UNSUPPORTED');
    expect(items[0].suggestedCorrection).toContain('2021');
  });

  it('잡음/짧은 claim은 걸러지고, 실패 시 빈 배열(발행 무해)', () => {
    expect(parseFactIssues('JSON 아님')).toEqual([]);
    expect(parseFactIssues('{"issues":[{"claim":"짧","status":"UNSUPPORTED"}]}')).toEqual([]);
  });

  it('알 수 없는 status는 UNVERIFIABLE로 안전하게 대체한다', () => {
    const raw = '{"issues":[{"claim":"충분히 긴 원문 인용","status":"WHATEVER","issue":"이유"}]}';
    expect(parseFactIssues(raw)[0].status).toBe('UNVERIFIABLE');
  });

  it('suggestedCorrection이 빈 문자열이면 undefined로 정규화한다 (삭제 지시 금지)', () => {
    const raw = '{"issues":[{"claim":"충분히 긴 원문 인용","status":"OVERCLAIM","issue":"근거 없음","suggestedCorrection":""}]}';
    expect(parseFactIssues(raw)[0].suggestedCorrection).toBeUndefined();
  });
});

describe('buildAssemblyErrorAxes — 삭제 지시 제거 확인', () => {
  it('더 이상 문장을 삭제하라고 지시하지 않는다', () => {
    const axes = buildAssemblyErrorAxes();
    expect(axes).not.toContain('그 문장을 삭제합니다');
    expect(axes).not.toContain('replacement 를 빈 문자열');
  });
});

describe('runFactCheck — 오프라인 안전 경로 (LLM 키 없음)', () => {
  const LONG_BODY = '검증 대상 본문입니다. '.repeat(20);

  it('off는 원문 그대로 통과하고 issues가 비어 있다', async () => {
    const out = await runFactCheck('off', { bodyPlain: LONG_BODY });
    expect(out.corrected).toBe(LONG_BODY);
    expect(out.issues).toEqual([]);
    expect(out.engineUsed).toBe('off');
  });

  it('crawl은 수집 자료가 없으면 건너뛴다 (발행 계속)', async () => {
    const out = await runFactCheck('crawl', { bodyPlain: LONG_BODY, rawText: '' });
    expect(out.corrected).toBe(LONG_BODY);
    expect(out.notes.join(' ')).toContain('건너뜀');
  });

  it('auto는 자료·키워드·키가 전부 없으면 그라운딩으로 승격하지 않고 스킵한다', async () => {
    const out = await runFactCheck('auto', { bodyPlain: LONG_BODY, rawText: '', config: {} });
    expect(out.corrected).toBe(LONG_BODY);
    expect(out.engineUsed).toBe('auto→skip');
    expect(out.notes.join(' ')).toContain('그라운딩은 비용상 자동 제외');
  });

  it('gemini-grounding은 키 없으면 무해 통과 (명시 선택에도 실패≠발행중단)', async () => {
    const out = await runFactCheck('gemini-grounding', { bodyPlain: LONG_BODY, config: {} });
    expect(out.corrected).toBe(LONG_BODY);
    expect(out.notes.join(' ')).toContain('키 없음');
  });
});

describe('runFactCheck — caller 라우팅 (보조 호출도 선택 엔진으로)', () => {
  const LONG_BODY = '검증 대상 본문입니다. '.repeat(30);

  it('caller가 있으면 키 순서 체인을 타지 않는다', async () => {
    const callText = vi.fn().mockResolvedValue('{"issues":[]}');
    const out = await runFactCheck('crawl', {
      bodyPlain: LONG_BODY,
      rawText: '충분히 긴 수집 자료입니다. '.repeat(30),
      // All three keys present — if the key-order chain ran, this would not
      // matter which one is used, but callText must be the only thing called.
      config: { openaiApiKey: 'k1', geminiApiKey: 'k2', claudeApiKey: 'k3' },
      caller: { engine: 'selected-model', callText },
    });
    expect(callText).toHaveBeenCalledTimes(1);
    expect(out.model).toBe('selected-model');
    expect(out.notes.join(' ')).toContain('engine=selected-model (selected)');
  });

  it('evidence가 8000자를 넘으면 잘라내고 로그를 남긴다', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const callText = vi.fn().mockResolvedValue('{"issues":[]}');
    const longEvidence = '자'.repeat(MAX_EVIDENCE_CHARS + 500);
    await runFactCheck('crawl', {
      bodyPlain: LONG_BODY,
      rawText: longEvidence,
      caller: { engine: 'selected-model', callText },
    });
    const truncationLog = logSpy.mock.calls.map((call) => call.join(' ')).find((line) => line.includes('evidence truncated'));
    expect(truncationLog).toContain(`evidence truncated ${longEvidence.length}→${MAX_EVIDENCE_CHARS} chars`);
    logSpy.mockRestore();
  });
});

describe('배선 잠금', () => {
  it('auto 체인 소스에 gemini-grounding 승격 경로가 없다 (고비용 자동 실행 금지)', () => {
    const code = read('factCheckRouter.ts');
    const autoSection = code.slice(code.indexOf('// auto — cheap-first chain'));
    expect(autoSection).not.toContain('callGeminiJson');
    expect(autoSection).toContain('perplexityApiKey');
  });

  it('contentGenerator가 라우터를 통해 팩트체크를 실행한다', () => {
    // [2026-08-28] 호출부가 content/postDraftFactCheck 로 옮겨갔다.
    //   단순 이동이 아니라 **두 분기 모두**에서 불려야 하는 게 계약이다:
    //   분량이 목표를 넘은 경로와, 미달로 "글자수 경고 (최종)" 을 타는 경로.
    //   후자가 팩트체크를 통째로 건너뛰고 있었다(실측 2026-08-28, gemini 770자).
    const router = read('content/postDraftFactCheck.ts');
    expect(router).toContain("import('../factCheckRouter.js')");
    expect(router).toMatch(/resolveFactCheckEngine\(config\)/);
    expect(router).toMatch(/runFactCheck\(engine,/);

    const code = read('contentGenerator.ts');
    expect(code).toContain("import { applyPostDraftFactCheck } from './content/postDraftFactCheck.js'");
    const calls = code.match(/applyPostDraftFactCheck\(optimized as any/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it('UI 드롭다운이 7개 선택지·기본 auto로 존재한다', () => {
    const html = fs.readFileSync(path.join(ROOT, '..', 'public/index.html'), 'utf-8');
    expect(html).toContain('id="fact-check-engine"');
    for (const value of FACT_CHECK_ENGINE_VALUES) {
      expect(html).toContain(`option value="${value}"`);
    }
    expect(html).toMatch(/value="auto" selected/);
  });

  it('설정 저장이 factCheckEngine과 하위호환 미러를 함께 보낸다', () => {
    const code = read('renderer/modules/priceInfoModal.ts');
    expect(code).toContain("factCheckEngine: (document.getElementById('fact-check-engine')");
    expect(code).toMatch(/usePerplexityFactCheck: .*=== 'perplexity'/);
  });
});
