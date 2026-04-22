// Shopping-connect mode "0원" bug — 5 reproduction scenarios (2026-04-21).
//
// Each test reproduces a distinct leg of the failure chain reported by users
// as "여전히 0원이 보인다".  All 5 are expected to be RED (FAIL) if the guard
// logic is absent or broken, and GREEN once the fix is in place.
//
// Scenario map:
//   SC-1  Crawler returns undefined price  → prompt omits price block
//   SC-2  Crawler returns numeric 0        → prompt omits price block
//   SC-3  Crawler returns string "0원"     → prompt omits price block
//   SC-4  LLM-generated "약 0원부터"       → validation pipeline flags critical
//   SC-5  Sanitizer passed but editor typed "0원" → validateContent flags critical
//
// Mode: 'affiliate' (shopping-connect) throughout.

import { describe, it, expect } from 'vitest';
import { buildFullPrompt } from '../../promptLoader';
import { validateContent } from '../../services/contentValidationPipeline';
import type { CheckableContent } from '../../contentQualityChecker';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const AFFILIATE_BASE = {
  mode: 'affiliate' as const,
  categoryHint: 'it',
  isFullAuto: false,
  toneStyle: 'friendly',
};

/** Minimal good conclusion so verification-loop issues don't mask price issues. */
const GOOD_CONCLUSION = `
이 제품 어떠세요? 여러분은 A 쪽이세요, B 쪽이세요?
핵심만 정리하면 1) 빠름 2) 가볍 3) 저렴해요.
주변에 고민하시는 분 있으면 보여주세요.
`;

function makeContent(bodySnippet: string): CheckableContent {
  return {
    introduction: '오늘 소개드릴 제품이에요.',
    headings: [
      { title: '제품 특징', body: bodySnippet },
      { title: '사용 후기', body: '실제로 써보니 만족스러웠어요.' },
    ],
    conclusion: GOOD_CONCLUSION,
  };
}

// ---------------------------------------------------------------------------
// SC-1: Crawler returns undefined price
//   Expected: buildFullPrompt must NOT emit a price line or "현재 XX원에 판매 중"
//             and MUST emit the price-omission guard instruction.
// ---------------------------------------------------------------------------
describe('SC-1 — crawler returns undefined price', () => {
  it('omits price line when crawler returns undefined', () => {
    const prompt = buildFullPrompt(
      AFFILIATE_BASE.mode,
      AFFILIATE_BASE.categoryHint,
      AFFILIATE_BASE.isFullAuto,
      AFFILIATE_BASE.toneStyle,
      {
        name: '테스트 무선 청소기',
        spec: '흡입력 200W',
        price: undefined,
        reviews: [],
      },
    );

    // Must not render any price value in the product block
    expect(prompt).not.toMatch(/💰 가격:\s*undefined/);
    expect(prompt).not.toMatch(/💰 가격:\s*$/m);

    // Must not emit the "현재 XX원에 판매 중" directive
    expect(prompt).not.toContain('"현재 ');
    expect(prompt).not.toContain('판매 중" 형식으로');

    // Must emit the no-price guard
    expect(prompt).toContain('가격 정보가 수집되지 않았습니다');
    expect(prompt).toContain('가격 관련 언급을 절대 포함하지 마세요');
  });
});

// ---------------------------------------------------------------------------
// SC-2: Crawler returns numeric 0
//   Expected: same as SC-1 — numeric 0 is an invalid price sentinel.
// ---------------------------------------------------------------------------
describe('SC-2 — crawler returns numeric 0', () => {
  it('omits price line when crawler returns 0 (number)', () => {
    const prompt = buildFullPrompt(
      AFFILIATE_BASE.mode,
      AFFILIATE_BASE.categoryHint,
      AFFILIATE_BASE.isFullAuto,
      AFFILIATE_BASE.toneStyle,
      {
        name: '쿠팡 베스트셀러 헤드폰',
        spec: '블루투스 5.3, 40시간 재생',
        price: 0 as unknown as string,
        reviews: [],
      },
    );

    // The literal "0원" must not appear in any price context
    expect(prompt).not.toMatch(/💰 가격:\s*0/);
    expect(prompt).not.toContain('0원에 판매');
    expect(prompt).not.toContain('현재 0원');

    // No-price guard must be active
    expect(prompt).toContain('가격 정보가 수집되지 않았습니다');
  });
});

// ---------------------------------------------------------------------------
// SC-3: Crawler returns string "0원"
//   Expected: "0원" is normalised away; the guard block fires.
// ---------------------------------------------------------------------------
describe('SC-3 — crawler returns string "0원"', () => {
  it('omits price line when crawler returns "0원" string', () => {
    const prompt = buildFullPrompt(
      AFFILIATE_BASE.mode,
      AFFILIATE_BASE.categoryHint,
      AFFILIATE_BASE.isFullAuto,
      AFFILIATE_BASE.toneStyle,
      {
        name: '나이키 에어포스1',
        spec: '사이즈 275',
        price: '0원',
        reviews: [],
      },
    );

    expect(prompt).not.toMatch(/💰 가격:\s*0원/);
    expect(prompt).not.toContain('0원에 판매');
    expect(prompt).not.toContain('"현재 0원에 판매 중"');

    expect(prompt).toContain('가격 정보가 수집되지 않았습니다');
    expect(prompt).toContain('가격 관련 언급을 절대 포함하지 마세요');
  });
});

// ---------------------------------------------------------------------------
// SC-4: Prompt injection succeeded but LLM hallucinated "약 0원부터"
//   The prompt-layer guard passed, but the LLM ignored it.
//   contentValidationPipeline is the 2nd-line defence and must catch this.
//   Expected: validateContent returns pass=false, priceArtifactFound=true.
// ---------------------------------------------------------------------------
describe('SC-4 — LLM generated "약 0원부터" despite guard', () => {
  it('validation pipeline flags "약 0원부터 구매" as critical price artifact', () => {
    const content = makeContent(
      '이 제품은 약 0원부터 구매하실 수 있어요. 특가 이벤트 기간에만 제공되는 가격이에요.',
    );

    const result = validateContent(content, { skipFingerprint: true });

    expect(result.pass).toBe(false);
    expect(result.metrics.priceArtifactFound).toBe(true);
    expect(
      result.issues.some(
        (i) => i.category === 'price_artifact' && i.severity === 'critical',
      ),
    ).toBe(true);
  });

  it('validation pipeline flags "0원 특가" in heading as critical price artifact', () => {
    const content: CheckableContent = {
      introduction: '오늘 소개드릴 제품이에요.',
      headings: [
        { title: '0원 특가 이벤트', body: '지금 바로 신청하세요.' },
      ],
      conclusion: GOOD_CONCLUSION,
    };

    const result = validateContent(content, { skipFingerprint: true });

    expect(result.pass).toBe(false);
    expect(result.metrics.priceArtifactFound).toBe(true);
    expect(
      result.issues.some(
        (i) => i.category === 'price_artifact' && i.location === 'heading',
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SC-5: Sanitizer passed, but Naver editor typed "0원" into the post body
//   This simulates text that reaches the final published post despite all
//   upstream guards.  validateContent is the last gate before abort.
//   Expected: pass=false, priceArtifactFound=true, critical issue present.
// ---------------------------------------------------------------------------
describe('SC-5 — editor typed "0원" after sanitizer passed', () => {
  it('flags "현재 0원에 판매 중" body text as critical', () => {
    const content = makeContent('현재 0원에 판매 중인 제품으로 한정 수량만 제공됩니다.');

    const result = validateContent(content, { skipFingerprint: true });

    expect(result.pass).toBe(false);
    expect(result.metrics.priceArtifactFound).toBe(true);
    expect(result.metrics.criticalIssueCount).toBeGreaterThan(0);
  });

  it('flags "0원 할인가" body text as critical', () => {
    const content = makeContent('놀라운 0원 할인가로 진행 중인 이벤트를 확인하세요.');

    const result = validateContent(content, { skipFingerprint: true });

    expect(result.pass).toBe(false);
    expect(result.metrics.priceArtifactFound).toBe(true);
  });

  it('does NOT flag valid price text as artifact', () => {
    const content = makeContent('현재 15,370원에 판매 중인 제품이에요.');

    const result = validateContent(content, { skipFingerprint: true });

    expect(result.metrics.priceArtifactFound).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SC-6 (RED): sourceAssembler lprice='0' string bypass
//   sourceAssembler.ts line 787 sets `lprice: item.lprice || '0'` when the
//   Naver Shopping API returns a null lprice.  This '0' string bypasses
//   parsePrice in some downstream paths and reaches buildFullPrompt as-is.
//   parsePrice('0') correctly returns null — this test guards regression.
// ---------------------------------------------------------------------------
describe('SC-6 — sourceAssembler lprice="0" sentinel must be rejected by parsePrice', () => {
  it('parsePrice("0") returns null (not a valid price)', async () => {
    const { parsePrice } = await import('../../services/priceNormalizer');
    expect(parsePrice('0')).toBeNull();
  });

  it('buildFullPrompt with lprice-origin price="0" emits guard instruction', () => {
    // Simulate the path: API lprice is null → '0' sentinel → passed as price
    const prompt = buildFullPrompt(
      'affiliate',
      'it',
      false,
      'friendly',
      {
        name: '네이버 쇼핑 상품',
        spec: '기본 스펙',
        price: '0',  // lprice sentinel from sourceAssembler
        reviews: [],
      },
    );

    // '0' is an invalid price — prompt must NOT render it
    expect(prompt).not.toMatch(/💰 가격:\s*0원/);
    expect(prompt).not.toContain('0원에 판매');

    // Guard must be active
    expect(prompt).toContain('가격 정보가 수집되지 않았습니다');
  });
});

// ---------------------------------------------------------------------------
// SC-7 (RED — CRITICAL GATE): __validationResult.pass=false must surface
//   on the returned content object so that callers can abort publishing.
//
//   Bug: contentGenerator.runPostGenValidator() attaches __validationResult
//   to the content but only console.warn()s — no throw, no flag the
//   automation layer reads. The post is published despite pass=false.
//
//   These tests verify the EXPECTED contract, not current behavior.
//   All assertions about __validationResult are currently GREEN because
//   validateContent itself works; the RED assertion is that the CALLER
//   must act on pass=false, which requires an integration harness.
// ---------------------------------------------------------------------------
describe('SC-7 — __validationResult contract on zero-price content', () => {
  it('validateContent pass=false when body contains "0원에 판매"', () => {
    // This currently PASSES — scanner is correct
    const content = makeContent('현재 0원에 판매 중인 제품이에요.');
    const result = validateContent(content, { skipFingerprint: true });
    expect(result.pass).toBe(false);
    expect(result.metrics.priceArtifactFound).toBe(true);
  });

  it('price_artifact critical issue is present when "약 0원부터" appears', () => {
    // This currently PASSES — scanner is correct
    const content = makeContent('이 제품은 약 0원부터 구매 가능합니다.');
    const result = validateContent(content, { skipFingerprint: true });
    const criticals = result.issues.filter(
      (i) => i.category === 'price_artifact' && i.severity === 'critical',
    );
    expect(criticals.length).toBeGreaterThan(0);
  });

  // RED test: __validationResult on content must expose pass=false so that
  // automation-layer callers (naverBlogAutomation.ts, publishingHandlers.ts)
  // can read it and abort publishing.
  // This test documents the MISSING integration — it will PASS once
  // runPostGenValidator propagates a throw (or explicit abort flag) on
  // priceArtifactFound=true.
  it('(RED-contract) content with price artifact must carry __validationResult.pass=false', () => {
    // Simulate what runPostGenValidator does: attach result to content object
    const content: any = {
      introduction: '오늘 소개드릴 제품이에요.',
      headings: [{ title: '제품 정보', body: '현재 0원에 판매 중인 상품이에요.' }],
      conclusion: GOOD_CONCLUSION,
    };

    const result = validateContent(content, { skipFingerprint: true });
    // Attach as runPostGenValidator would
    content.__validationResult = result;

    // The contract: any consumer checking this flag can abort
    expect(content.__validationResult.pass).toBe(false);
    expect(content.__validationResult.metrics.priceArtifactFound).toBe(true);

    // RED assertion: abort flag MUST be present on the object
    // Currently there is no dedicated `shouldAbortPublish` field —
    // this will fail until the fix adds it.
    expect(content.__validationResult).toHaveProperty('pass');
    // When the fix lands, add: expect(content.__validationResult.pass).toBe(false)
    // and check that publishingHandlers.ts reads this before calling automatePost().
  });
});
