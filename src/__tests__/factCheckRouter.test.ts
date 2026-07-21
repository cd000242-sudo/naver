/**
 * [v2.11.134] 팩트체크 엔진 드롭다운 + 자동 폴백 라우터 잠금.
 *
 * 사용자 계약: 비용 저렴한 순 선택지, 자동은 크롤링→네이버→퍼플렉시티(키
 * 있을 때)만 승격하고 고비용 그라운딩은 절대 자동 실행하지 않는다.
 * 팩트체크 실패는 발행을 막지 않는다(경고-only).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  resolveFactCheckEngine,
  shouldEscalateEvidence,
  parseSuspicious,
  applyCorrections,
  runFactCheck,
  AUTO_ESCALATE_BELOW_CHARS,
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

describe('응답 파싱과 교정 적용', () => {
  it('마크다운 펜스로 감싼 JSON도 파싱한다', () => {
    const raw = '```json\n{"suspicious":[{"original":"2020년에 출시됐다","replacement":"2021년에 출시됐다","reason":"연도 오류"}]}\n```';
    const items = parseSuspicious(raw);
    expect(items).toHaveLength(1);
    expect(items[0].replacement).toContain('2021');
  });

  it('잡음/짧은 원문은 걸러지고, 실패 시 빈 배열(발행 무해)', () => {
    expect(parseSuspicious('JSON 아님')).toEqual([]);
    expect(parseSuspicious('{"suspicious":[{"original":"짧","replacement":"x"}]}')).toEqual([]);
  });

  it('applyCorrections는 본문 내 일치 문장만 교체한다', () => {
    const body = '서론. 2020년에 출시됐다. 결론.';
    const out = applyCorrections(body, [
      { original: '2020년에 출시됐다', replacement: '2021년에 출시됐다', reason: 'r' },
      { original: '본문에 없는 문장', replacement: 'x', reason: 'r' },
    ]);
    expect(out).toContain('2021년에 출시됐다');
    expect(out).toContain('결론.');
  });
});

describe('runFactCheck — 오프라인 안전 경로 (LLM 키 없음)', () => {
  const LONG_BODY = '검증 대상 본문입니다. '.repeat(20);

  it('off는 원문 그대로 통과한다', async () => {
    const out = await runFactCheck('off', { bodyPlain: LONG_BODY });
    expect(out.corrected).toBe(LONG_BODY);
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

describe('배선 잠금', () => {
  it('auto 체인 소스에 gemini-grounding 승격 경로가 없다 (고비용 자동 실행 금지)', () => {
    const code = read('factCheckRouter.ts');
    const autoSection = code.slice(code.indexOf('// auto — cheap-first chain'));
    expect(autoSection).not.toContain('callGeminiJson');
    expect(autoSection).toContain('perplexityApiKey');
  });

  it('contentGenerator가 라우터를 통해 팩트체크를 실행한다', () => {
    const code = read('contentGenerator.ts');
    expect(code).toContain("import('./factCheckRouter.js')");
    expect(code).toMatch(/resolveFactCheckEngine\(_config/);
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
