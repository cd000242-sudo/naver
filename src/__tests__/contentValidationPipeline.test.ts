import { describe, it, expect } from 'vitest';
import { validateContent } from '../services/contentValidationPipeline';
import type { CheckableContent } from '../contentQualityChecker';

const GOOD_CONCLUSION = `
이번에 써보고 든 인상은 기대 이상이었어요.
핵심만 뽑아보면 1) 빠른 반응 2) 콤팩트한 크기 3) 간편한 세팅이에요.
여러분은 A 쪽이세요, B 쪽이세요? 비슷한 경험 있으신 분 댓글 남겨주세요.
주변에 고민하시는 분 있으면 보여주세요. 알고 있었으면 좀 더 빨리 샀을 정보예요.
`;

const WEAK_CONCLUSION = `
잘 모르겠네요. 그냥 그랬어요.
다음에 또 써보겠습니다.
`;

function buildContent(overrides: Partial<CheckableContent> = {}): CheckableContent {
  return {
    introduction: overrides.introduction ?? '오늘 이야기 드릴 건 간단한 정리예요. 그래도 꼭 알아두세요.',
    headings: overrides.headings ?? [
      { title: '첫 번째 요소', body: '구체적인 팩트가 있어요. 이유도 함께 설명하겠습니다.' },
      { title: '두 번째 포인트', body: '이 부분이 실제로 가장 중요합니다.' },
    ],
    conclusion: overrides.conclusion ?? GOOD_CONCLUSION,
  };
}

describe('contentValidationPipeline — baseline', () => {
  it('passes clean content without critical issues', () => {
    const result = validateContent(buildContent(), { skipFingerprint: true });
    expect(result.pass).toBe(true);
    expect(result.metrics.criticalIssueCount).toBe(0);
  });

  it('reports verification-loop misses for a weak conclusion', () => {
    const result = validateContent(
      buildContent({ conclusion: WEAK_CONCLUSION }),
      { skipFingerprint: true },
    );
    expect(result.metrics.verificationLoopTriggersFound).toBeLessThan(3);
    expect(
      result.issues.some((i) => i.category === 'verification_loop'),
    ).toBe(true);
  });
});

describe('contentValidationPipeline — price artifact scanner (2nd-line defense)', () => {
  it('flags "0원에 판매 중" as critical', () => {
    const result = validateContent(
      buildContent({
        headings: [{ title: '제품 정보', body: '현재 0원에 판매 중인 제품이에요.' }],
      }),
      { skipFingerprint: true },
    );
    expect(result.pass).toBe(false);
    expect(result.metrics.priceArtifactFound).toBe(true);
    expect(
      result.issues.some(
        (i) => i.category === 'price_artifact' && i.severity === 'critical',
      ),
    ).toBe(true);
  });

  it('flags "가격 정보 없음" as critical', () => {
    const result = validateContent(
      buildContent({
        headings: [{ title: '가격', body: '가격 정보 없음 상태로 표시됐어요.' }],
      }),
      { skipFingerprint: true },
    );
    expect(result.pass).toBe(false);
    expect(result.metrics.priceArtifactFound).toBe(true);
  });

  it('does not flag legitimate price mention like "15,370원에 판매 중"', () => {
    const result = validateContent(
      buildContent({
        headings: [{ title: '가격 정보', body: '현재 15,370원에 판매 중인 제품이에요.' }],
      }),
      { skipFingerprint: true },
    );
    expect(result.metrics.priceArtifactFound).toBe(false);
  });

  it('flags extended body patterns (0원 할인/특가/구매/세일)', () => {
    const patterns = [
      '현재 0원 할인으로 특가 진행 중입니다.',
      '지금 0원 특가 세일 중이에요.',
      '0원 구매 기회를 놓치지 마세요.',
      '0원으로 판매가 시작됐습니다.',
    ];
    for (const body of patterns) {
      const result = validateContent(
        buildContent({ headings: [{ title: '안내', body }] }),
        { skipFingerprint: true },
      );
      expect(result.metrics.priceArtifactFound).toBe(true);
    }
  });

  it('flags "0원" artifact in heading title (short form bypass guard)', () => {
    const result = validateContent(
      buildContent({
        headings: [
          { title: '0원 특가 시작', body: '제품이 출시됐습니다.' },
          { title: '두 번째', body: '계속 설명.' },
        ],
      }),
      { skipFingerprint: true },
    );
    expect(result.pass).toBe(false);
    expect(result.metrics.priceArtifactFound).toBe(true);
    expect(
      result.issues.some(
        (i) =>
          i.category === 'price_artifact' &&
          i.location === 'heading' &&
          i.message.includes('0원 특가 시작'),
      ),
    ).toBe(true);
  });

  it('flags "가격 정보 없음" even if it only appears in a heading', () => {
    const result = validateContent(
      buildContent({
        headings: [
          { title: '가격 정보 없음', body: '이 제품은 현재 가격 확인이 어렵습니다.' },
        ],
      }),
      { skipFingerprint: true },
    );
    expect(result.pass).toBe(false);
    expect(
      result.issues.some(
        (i) => i.category === 'price_artifact' && i.location === 'heading',
      ),
    ).toBe(true);
  });

  it('does NOT flag headings containing legitimate "10,000원" pricing', () => {
    const result = validateContent(
      buildContent({
        headings: [
          { title: '가격 10,000원 비교', body: '공식가는 15,000원입니다.' },
        ],
      }),
      { skipFingerprint: true },
    );
    expect(result.metrics.priceArtifactFound).toBe(false);
  });
});

describe('contentValidationPipeline — QUMA anchor scanner', () => {
  it('warns when image count > 0 but anchor keywords are absent', () => {
    const result = validateContent(
      buildContent({
        headings: [
          { title: '첫 번째', body: '이 제품은 정말 놀라운 성능을 보여줍니다.' },
          { title: '두 번째', body: '가격 대비 만족도가 높아요.' },
        ],
      }),
      { skipFingerprint: true, imageCount: 3 },
    );
    expect(result.metrics.qumaAnchorMissCount).toBeGreaterThan(0);
  });

  it('does not warn when imageCount is 0', () => {
    const result = validateContent(buildContent(), {
      skipFingerprint: true,
      imageCount: 0,
    });
    expect(result.metrics.qumaAnchorMissCount).toBe(0);
  });
});

describe('contentValidationPipeline — non-blocking contract', () => {
  it('never mutates the input content', () => {
    const content = buildContent();
    const snapshot = JSON.stringify(content);
    validateContent(content, { skipFingerprint: true });
    expect(JSON.stringify(content)).toBe(snapshot);
  });

  it('is deterministic across repeated calls (pure function)', () => {
    const content = buildContent({ conclusion: WEAK_CONCLUSION });
    const r1 = validateContent(content, { skipFingerprint: true });
    const r2 = validateContent(content, { skipFingerprint: true });
    expect(r1).toEqual(r2);
  });
});
