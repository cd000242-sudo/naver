// SPEC-NAVER-IMAGE-2026 — section image role planner.
// Owner complaint: every section image is "person + laptop / phone / product on a similar backdrop",
// so the whole set reads as AI. Each heading's prompt was generated independently with no sibling data.
import { describe, expect, it } from 'vitest';
import {
  findPlannedRole,
  inferArticleVisualKind,
  isMetaImageHeading,
  normalizePlanHeading,
  planSectionRoles,
  type SectionVisualRole,
} from '../image/director/sectionRolePlanner';
import { assignSectionRoles } from '../image/director/sectionRoleAssignment';

const roles = (headings: string[], kind?: Parameters<typeof planSectionRoles>[1]['kind']): SectionVisualRole[] =>
  planSectionRoles(headings, { kind }).map((entry) => entry.role);

describe('planSectionRoles — cues', () => {
  it('maps Korean heading cues to roles', () => {
    expect(roles(['전세보증보험 가입 방법'])).toEqual(['procedure']);
    expect(roles(['보증금 반환받을 수 있는 조건'])).toEqual(['criteria']);
    expect(roles(['공개된 판결문에 적힌 내용'])).toEqual(['closeup']);
    expect(roles(['두 요금제의 차이'])).toEqual(['comparison']);
    expect(roles(['계약 전 놓치기 쉬운 사기 피해'])).toEqual(['problem']);
    expect(roles(['가는 길과 주차'])).toEqual(['place']);
    expect(roles(['사건 당시 현장'])).toEqual(['scene']);
  });

  it('two money or percent values in one heading mean comparison', () => {
    const plan = planSectionRoles(['출고가 4200만원, 보조금 받으면 3866만원']);
    expect(plan[0].role).toBe('comparison');
    expect(plan[0].cue).toContain('만원');
  });

  it('a heading with more cue hits for one role wins that role', () => {
    // 자격·조건 (criteria ×2) beats 신청 (procedure ×1)
    expect(roles(['신청 자격과 소득 조건'])).toEqual(['criteria']);
  });
});

describe('planSectionRoles — set diversity', () => {
  it('headings without cues still get distinct roles (info default order)', () => {
    const plan = roles(['첫째 이야기', '둘째 이야기', '셋째 이야기', '넷째 이야기', '다섯째 이야기']);
    expect(new Set(plan).size).toBe(5);
    expect(plan).toEqual(['scene', 'closeup', 'procedure', 'criteria', 'place']);
  });

  it('never makes up a comparison without comparison evidence', () => {
    const plan = roles(Array.from({ length: 9 }, (_, i) => `평범한 소제목 ${'가나다라마바사아자'[i]}`));
    expect(plan).not.toContain('comparison');
  });

  it('adjacent sections never share a role, even beyond seven sections', () => {
    const plan = roles(Array.from({ length: 11 }, (_, i) => `평범한 소제목 ${i}`));
    for (let i = 1; i < plan.length; i++) expect(plan[i]).not.toBe(plan[i - 1]);
  });

  it('a second heading with the same cue does not take the same role', () => {
    const plan = roles(['신청 방법', '온라인 신청 방법', '마지막 이야기']);
    expect(plan[0]).toBe('procedure');
    expect(plan[1]).not.toBe('procedure');
    expect(new Set(plan).size).toBe(3);
  });

  it('issue articles default to scene/place/closeup/problem', () => {
    expect(roles(['그날 무슨 일이', '이후 벌어진 일', '남은 것', '앞으로'], 'issue'))
      .toEqual(['scene', 'place', 'closeup', 'problem']);
  });
});

describe('planSectionRoles — inputs', () => {
  it('drops meta headings and normalizes numbered / marked lines', () => {
    const plan = planSectionRoles(['🖼️ 썸네일', '## 1. 신청 방법', '2) 준비 서류']);
    expect(plan.map((e) => e.heading)).toEqual(['신청 방법', '준비 서류']);
    expect(isMetaImageHeading('🖼️ 썸네일')).toBe(true);
    expect(normalizePlanHeading('## 3. 제목')).toBe('제목');
  });

  it('is deterministic and a single heading resolves the same role as inside the batch', () => {
    const headings = ['사건 당시 현장', '공개된 판결문', '항소심 일정'];
    const a = planSectionRoles(headings);
    const b = planSectionRoles(headings);
    expect(a).toEqual(b);
    expect(findPlannedRole(a, '2. 공개된 판결문')).toBe('closeup');
    expect(findPlannedRole(a, '없는 소제목')).toBeNull();
  });

  it('infers the article kind from category and title', () => {
    expect(inferArticleVisualKind('연예', '')).toBe('issue');
    expect(inferArticleVisualKind('', '제주 3박4일 여행 코스')).toBe('travel');
    expect(inferArticleVisualKind('쇼핑', '')).toBe('product');
    expect(inferArticleVisualKind('', '청년월세지원 신청 자격')).toBe('info');
  });
});

describe('assignSectionRoles — one generateImages call', () => {
  const list = ['사건 당시 현장', '공개된 판결문', '항소심 일정'];

  it('a lone-item call gets its role from the full heading list', () => {
    expect(assignSectionRoles([{ heading: '공개된 판결문' }], { sectionPlanHeadings: list })).toEqual(['closeup']);
  });

  it('thumbnails never get a section role', () => {
    expect(assignSectionRoles(
      [{ heading: '🖼️ 썸네일' }, { heading: '제목', isThumbnail: true }, { heading: '사건 당시 현장' }],
      { sectionPlanHeadings: list },
    )).toEqual([null, null, 'scene']);
  });

  it('a stale list from another article is ignored — falls back to the call items', () => {
    const got = assignSectionRoles([{ heading: '신청 방법' }, { heading: '필요 서류' }], { sectionPlanHeadings: list });
    expect(got).toEqual(['procedure', 'closeup']);
  });

  it('a lone item without a matching list keeps today\'s behaviour (no role)', () => {
    expect(assignSectionRoles([{ heading: '신청 방법' }], {})).toEqual([null]);
    expect(assignSectionRoles([{ heading: '신청 방법' }], { sectionPlanHeadings: list })).toEqual([null]);
  });
});
