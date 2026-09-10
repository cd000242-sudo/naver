/**
 * [2026-09-10 사장님 실측 재발] "문단정리 어색한 부분이 보여서, 이거 저번에 고친 것 같은데 또 재발하네."
 *
 * 발행된 본문:
 *   ...브라운 색상은 발매가의
 *                                ← 빈 문단
 *   1. 5배에서 2배 수준으로 거래됐다는 내용이 언급됐습니다.
 *
 * 2026-08-27 에 고친 것은 **문장 분리기**가 소수점을 종결로 오인하던 경로였고
 * (contentDuplicateCleanup 의 protectDecimalPoints), 그 보호는 그 함수 안에서만 산다.
 * 이번 자국은 다른 곳에서 났다 — 리치입력의 인라인 번호목록 확장기다.
 *
 * 재현: "…발매가의 1. 5배에서…" 한 줄에 마커 "1. " 이 하나 있고 줄 시작이 아니면,
 * 확장기가 마커 앞 공백을 빈 줄로 바꿔 한 문장을 두 문단으로 갈랐다.
 *
 * 계약: 줄 가운데 홀로 있는 번호 하나는 목록이 아니다. 진짜 인라인 목록은 마커가 둘 이상이다.
 * (앞단에서 "1.5" 가 "1. 5" 로 벌어져 들어오는 경로가 있어도 이 규칙이 최종적으로 막는다)
 */
import { describe, it, expect } from 'vitest';
import { buildMobileRichHtml } from '../automation/richTextPaste';

describe('인라인 번호목록 — 줄 가운데 홀로 있는 번호는 목록이 아니다', () => {
  it('벌어진 소수점("1. 5배")에서 문단이 갈리지 않는다 (실측 재현)', () => {
    const text = '뮬 슈 SP 브라운 색상은 발매가의 1. 5배에서 2배 수준으로 거래됐다는 내용이 언급됐습니다.';
    const { plainText } = buildMobileRichHtml(text);
    expect(plainText).not.toMatch(/발매가의\s*\n\s*\n\s*1\./);
    expect(plainText.replace(/\s+/g, ' ')).toContain('발매가의 1. 5배에서');
  });

  it('소수점이 붙어 있으면 당연히 안 건드린다', () => {
    const { plainText } = buildMobileRichHtml('발매가의 1.5배에서 2배 수준으로 거래됐습니다.');
    expect(plainText.replace(/\s+/g, ' ')).toContain('발매가의 1.5배에서');
  });

  it('줄 가운데 번호가 하나뿐이면 어떤 경우에도 쪼개지 않는다', () => {
    const { plainText } = buildMobileRichHtml('준비물은 여기 있습니다 1. 지갑만 챙기면 됩니다.');
    expect(plainText).not.toMatch(/있습니다\s*\n\s*\n\s*1\./);
  });

  it('마커가 둘 이상인 진짜 인라인 목록은 예전처럼 문단으로 편다', () => {
    const { plainText } = buildMobileRichHtml('순서는 이렇습니다 1. 예열하기 2. 굽기 3. 식히기');
    expect(plainText).toMatch(/1[.)]\s*예열하기/);
    expect(plainText).toMatch(/2[.)]\s*굽기/);
    expect(plainText).toMatch(/3[.)]\s*식히기/);
    // 마커와 내용이 갈라지면 안 된다
    expect(plainText).not.toMatch(/(^|\n)\s*1\.\s*\n/);
  });

  it('줄 시작 번호목록은 종전 그대로 (기존 계약 유지)', () => {
    const { plainText } = buildMobileRichHtml(['1. 첫 항목입니다', '2. 둘째 항목입니다'].join('\n'));
    expect(plainText).toMatch(/1[.)]\s+첫 항목/);
    expect(plainText).toMatch(/2[.)]\s+둘째 항목/);
  });
});
