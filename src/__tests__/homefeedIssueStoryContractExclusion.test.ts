import { describe, expect, it } from 'vitest';

import { buildFullPrompt } from '../promptLoader';
import { buildEvidenceAndIntentFinalContract } from '../content/evidenceIntegrity';

/**
 * [2026-08-04] 홈판 실배선 감사 P0 2건 잠금 — 승자 패턴(이슈픽 인용 훅 골격)을
 * 뒤따르는 블록이 도로 잠그던 충돌 해소.
 *
 * A1: FINAL CONTRACT("이 블록과 충돌하는 앞선 규칙은 무효")가 issue-story 도입
 *     C형("왜 그런지 알아볼게요" 예고 1회 허용 — 골격이 명시 해제한 규칙)을
 *     재잠금하던 문제. 이슈픽일 때만 예고 1회 허용 문구로 교체한다.
 * A2: neoHook 블록이 mode만 보고 주입되어 이슈픽에서 인용 훅 골격과 충돌
 *     (블랙리스트 "폭로·공개" vs 인용 훅, "하나라도 아니오면 재생성" 자가검토).
 *     situationTitleContract와 동일한 카테고리 배타를 적용한다.
 */
describe('homefeed issue-story contract exclusion (P0)', () => {
  it('A2: 이슈픽 카테고리(연예)는 neoHook 제약을 주입하지 않는다', () => {
    const issue = buildFullPrompt('homefeed', '연예', false, 'friendly');
    expect(issue).not.toContain('[홈판 제목 제약]');
  });

  it('A2: 일반 카테고리(일상)는 neoHook 제약을 유지한다', () => {
    const normal = buildFullPrompt('homefeed', '일상', false, 'friendly');
    expect(normal).toContain('[홈판 제목 제약]');
  });

  it('경고 헤더의 죽은 라벨 제거 — 블록이 있을 때만 실제 이름으로 안내한다', () => {
    const normal = buildFullPrompt('homefeed', '일상', false, 'friendly');
    expect(normal).not.toContain('[NEO-HOOK TITLE]');
    expect(normal).toContain('[홈판 제목 제약]은 제목 보조 규칙');
    // 블록이 없는 모드/카테고리에서는 안내 줄 자체가 사라진다
    const issue = buildFullPrompt('homefeed', '연예', false, 'friendly');
    expect(issue).not.toContain('제목 보조 규칙');
    const seo = buildFullPrompt('seo', 'it', false, 'friendly');
    expect(seo).not.toContain('제목 보조 규칙');
    expect(seo).not.toContain('[NEO-HOOK TITLE]');
  });

  it('A1: 이슈픽 골격일 때 FINAL CONTRACT가 도입 예고 1회를 허용한다', () => {
    const issueContract = buildEvidenceAndIntentFinalContract(
      { rawText: '자료 원문입니다. '.repeat(20) } as any,
      'homefeed',
      { usesIssueStorySkeleton: true },
    );
    expect(issueContract).toContain('예고 문구는 도입에서 1회만 허용');
    expect(issueContract).not.toContain('확인 절차 안내로 답을 대체하지 않는다');
    // 정체·핵심 사건 공개 의무는 유지 (낚시 방지)
    expect(issueContract).toContain('도입부 첫 3~5문장 안에서 직접 공개');
  });

  it('A1: 일반 홈판은 기존 진행 문구 금지를 유지한다', () => {
    const normalContract = buildEvidenceAndIntentFinalContract(
      { rawText: '자료 원문입니다. '.repeat(20) } as any,
      'homefeed',
      { usesIssueStorySkeleton: false },
    );
    expect(normalContract).toContain('확인 절차 안내로 답을 대체하지 않는다');
    expect(normalContract).not.toContain('예고 문구는 도입에서 1회만 허용');
    // 옵션 미전달(타 호출부 하위호환)도 기존 동작
    const legacy = buildEvidenceAndIntentFinalContract(
      { rawText: '자료 원문입니다. '.repeat(20) } as any,
      'homefeed',
    );
    expect(legacy).toContain('확인 절차 안내로 답을 대체하지 않는다');
  });

  it('A1: SEO 등 다른 모드는 옵션과 무관하게 영향이 없다', () => {
    const seoContract = buildEvidenceAndIntentFinalContract(
      { rawText: '자료 원문입니다. '.repeat(20) } as any,
      'seo',
      { usesIssueStorySkeleton: true },
    );
    expect(seoContract).toContain('근거로 답할 수 없는 약속은 제목에서 뺀다');
    expect(seoContract).not.toContain('예고 문구는 도입에서 1회만 허용');
  });
});
