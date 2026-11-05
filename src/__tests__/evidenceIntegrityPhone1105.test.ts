/**
 * [2026-11-05] 업체 실측(after3 bath-rich-a): 품질 게이트가 "-0201 주" 를 근거 없는 수치로 잡아 안전 35 → 재생성.
 * The phone "010-0000-0201" ended a line and the next line began with "주소:" — the claim pattern read the
 * phone's tail plus "주" (week) across the line break. Phone numbers are contact details, not claims, and a
 * number never pairs with a unit on the next line.
 */
import { describe, expect, it } from 'vitest';
import { collectSupportedConcreteClaims, collectUnsupportedConcreteClaims } from '../content/evidenceIntegrity';

describe('concrete-claim extraction ignores phone numbers and line breaks', () => {
  it('does not read "010-0000-0201\\n주소" as a week count', () => {
    expect(collectUnsupportedConcreteClaims('- 전화: 010-0000-0201\n- 주소: 경기 수원시 영통구', '')).toEqual([]);
  });

  it('does not read a phone number followed by 주말 as a claim', () => {
    expect(collectUnsupportedConcreteClaims('전화 031-123-4567 주말에도 받습니다', '')).toEqual([]);
  });

  it('never pairs a number with a unit on the next line', () => {
    expect(collectUnsupportedConcreteClaims('대표 메뉴 3\n일반 메뉴', '')).toEqual([]);
  });

  it('still flags real unsupported figures (control)', () => {
    expect(collectUnsupportedConcreteClaims('하자 보증 2년, 시공 300건', '')).toEqual(['2년', '300건']);
  });

  it('still matches supported figures written with a space (control)', () => {
    expect(collectSupportedConcreteClaims('실측은 약 30 분 걸립니다', '현장 실측 약 30분')).toEqual(['30 분']);
  });
});
