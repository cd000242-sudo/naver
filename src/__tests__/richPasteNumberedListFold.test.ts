/**
 * richPasteNumberedListFold.test.ts
 *
 * [2026-07-03] 번호목록 접힘 방지: "1. 글문단"이 모바일 변환에서 "1." + 빈 줄 + "글문단"으로
 * 갈라지지 않아야 한다. 원인: splitSentencesForMobile이 "1."의 마침표를 문장 끝으로 오인해
 * 마커를 홀로 분리 → 각각 문단이 됨. 마커만 남은 조각을 다음 조각에 붙여 한 줄로 유지한다.
 * (목록 블록으로 안 묶이는 blank-분리 항목 경로 대비)
 */
import { describe, it, expect } from 'vitest';
import { buildMobileRichHtml } from '../automation/richTextPaste';

describe('리치입력 번호목록 마커 접힘 방지', () => {
  it('blank-분리 번호목록에서 "1."이 내용과 분리되지 않는다', () => {
    const text = ['1. 첫 번째 항목입니다', '', '2. 두 번째 항목입니다', '', '3. 세 번째 항목입니다'].join('\n');
    const { plainText } = buildMobileRichHtml(text);

    // 마커와 내용이 같은 줄에 붙어 있어야 한다
    expect(plainText).toMatch(/1[.)]\s+첫 번째 항목/);
    expect(plainText).toMatch(/2[.)]\s+두 번째 항목/);
    // "1."이 홀로 한 줄을 차지하면 안 된다(접힘 재발 방지)
    expect(plainText).not.toMatch(/(^|\n)\s*1\.\s*\n/);
    // 내용 텍스트 자체는 보존
    expect(plainText).toContain('첫 번째 항목입니다');
    expect(plainText).toContain('세 번째 항목입니다');
  });

  it('단일 번호 항목 "1. 글문단"도 마커가 분리되지 않는다', () => {
    const { plainText } = buildMobileRichHtml('1. 글문단 내용입니다.');
    expect(plainText).toMatch(/1[.)]\s+글문단 내용/);
    expect(plainText).not.toMatch(/(^|\n)\s*1\.\s*\n/);
  });

  it('일반 문장의 마침표 분리는 그대로 동작(오탐 없음)', () => {
    const { plainText } = buildMobileRichHtml('첫 문장입니다. 둘째 문장입니다.');
    expect(plainText).toContain('첫 문장입니다');
    expect(plainText).toContain('둘째 문장입니다');
  });
});
