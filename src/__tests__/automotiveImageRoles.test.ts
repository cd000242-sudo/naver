// SPEC-NAVER-IMAGE-2026 extension — automotive kind, automotive role cues, info-kind cliché additions,
// and the deterministic "previous images" note. Pure functions only: no network, no LLM calls.
import { describe, expect, it } from 'vitest';
import { inferArticleVisualKind, planSectionRoles, type SectionVisualRole } from '../image/director/sectionRolePlanner';
import { assignSectionRolesWithHistory } from '../image/director/sectionRoleAssignment';
import { KIND_CONSTRAINT, buildPreviousImagesLine, toBriefVisualRole } from '../image/director/roleDirectives';

interface AutoPost {
  readonly title: string;
  readonly headings: readonly string[];
  /** Index of the heading whose role this fixture pins down. */
  readonly targetIndex: number;
  readonly targetRole: SectionVisualRole;
}

const AUTO_POSTS: readonly AutoPost[] = [
  {
    title: 'EV9 충전 커넥터가 안 빠질 때 확인할 점',
    headings: [
      '충전 커넥터 안 빠짐 증상',
      '레버를 눌러 분리하는 순서',
      '그래도 빠지지 않으면 확인할 부분',
      '계기판 경고등이 함께 뜨는 경우',
      '서비스센터 방문 전 마지막 점검',
    ],
    targetIndex: 0,
    targetRole: 'problem',
  },
  {
    title: 'EV3 실구매가, 보조금 받으면 얼마',
    headings: [
      '스탠다드와 롱레인지 실구매가 334만원 차이',
      '국비보조금 지역별로 다른 이유',
      '계약 전 알아야 할 인도 절차',
      '실내 옵션과 편의 사양',
      '총정리로 보는 트림별 구성',
    ],
    targetIndex: 0,
    targetRole: 'comparison',
  },
  {
    title: '셀토스 트림별 옵션 총정리',
    headings: [
      '실내 디스플레이와 편의 사양',
      '트렁크 적재 공간 활용법',
      '주행 모드 변경하는 방법',
      '가솔린과 하이브리드 연비 차이',
      '구매 전 체크리스트',
    ],
    targetIndex: 0,
    targetRole: 'closeup',
  },
  {
    title: '아이오닉 리콜 대상 확인 방법',
    headings: [
      '계기판에 뜨는 리콜 경고등',
      '무상 점검 예약하는 절차',
      '이번 리콜 원인이 된 부품',
      '센터 방문 전 준비물',
      '완료 후 재확인하는 법',
    ],
    targetIndex: 0,
    targetRole: 'closeup',
  },
  {
    title: 'PV7에 새로 생긴 편의 기능',
    headings: [
      '새로 생긴 디스플레이 기능',
      '적재 공간과 실내 구성',
      '충전 속도와 배터리 용량',
      '가격표에서 확인할 트림 구성',
      '사전계약 시작 시기',
    ],
    targetIndex: 0,
    targetRole: 'closeup',
  },
];

describe('automotive kind detection', () => {
  it('classifies all five car-topic titles as auto', () => {
    for (const post of AUTO_POSTS) {
      expect(inferArticleVisualKind('', post.title)).toBe('auto');
    }
  });

  it('a car price/review title is auto, not product', () => {
    expect(inferArticleVisualKind('', 'EV3 실구매가, 보조금 빼니 334만원 차이')).toBe('auto');
    expect(inferArticleVisualKind('', '셀토스 두 트림 실구매가 차이')).toBe('auto');
  });

  it('a celebrity/news title that merely mentions a car stays issue', () => {
    expect(inferArticleVisualKind('연예', '인기 가수 이모씨, 신차 그랜저 타고 공항 등장')).toBe('issue');
    expect(inferArticleVisualKind('', '배우 김모씨 음주운전 사고, 몰던 차량은 제네시스')).toBe('issue');
  });

  it('non-car titles keep their existing kind (unchanged behaviour)', () => {
    expect(inferArticleVisualKind('연예', '')).toBe('issue');
    expect(inferArticleVisualKind('', '제주 3박4일 여행 코스')).toBe('travel');
    expect(inferArticleVisualKind('쇼핑', '')).toBe('product');
    expect(inferArticleVisualKind('', '청년월세지원 신청 자격')).toBe('info');
  });
});

describe('automotive role cues', () => {
  it('adjacent sections never share a role within any of the five posts', () => {
    for (const post of AUTO_POSTS) {
      const roles = planSectionRoles(post.headings, { kind: 'auto' }).map((entry) => entry.role);
      for (let i = 1; i < roles.length; i++) expect(roles[i]).not.toBe(roles[i - 1]);
    }
  });

  it('the problem post’s symptom heading gets problem', () => {
    const post = AUTO_POSTS[0];
    const plan = planSectionRoles(post.headings, { kind: 'auto' });
    expect(plan[post.targetIndex].role).toBe(post.targetRole);
  });

  it('the price post’s price/trim heading gets comparison', () => {
    const post = AUTO_POSTS[1];
    const plan = planSectionRoles(post.headings, { kind: 'auto' });
    expect(plan[post.targetIndex].role).toBe(post.targetRole);
  });

  it('warning-light/dashboard/charging/feature headings get closeup', () => {
    for (const post of [AUTO_POSTS[2], AUTO_POSTS[3], AUTO_POSTS[4]]) {
      const plan = planSectionRoles(post.headings, { kind: 'auto' });
      expect(plan[post.targetIndex].role).toBe('closeup');
    }
  });

  it('role sequences are not all identical across the five posts', () => {
    const sequences = AUTO_POSTS.map((post) =>
      planSectionRoles(post.headings, { kind: 'auto' }).map((entry) => entry.role).join(','));
    expect(new Set(sequences).size).toBeGreaterThan(1);
  });

  it('the auto brief constraint bans the generic car-on-a-road / parked-in-scenery default', () => {
    const brief = toBriefVisualRole('closeup', { realistic: true, kind: 'auto' });
    const text = brief.constraints.join(' ');
    expect(text).toContain('generic car driving on a road');
    expect(text).toContain('car parked in front of scenery');
  });
});

describe('policy / tax / subsidy / insurance / IT titles stay non-automotive', () => {
  const titles = [
    '청년내일저축계좌 신청 조건과 지원금',
    '종합소득세 신고 방법과 가산세',
    '실손보험 갱신 보험료 인상 이유',
    '생성형 IT 인공지능 서비스 도입 가이드',
  ];

  it('kind stays info, never auto', () => {
    for (const title of titles) {
      expect(inferArticleVisualKind('', title)).toBe('info');
    }
  });

  it('the info constraint bans coin piles, cash stacks, gavel, umbrella and neon circuit clichés', () => {
    const text = KIND_CONSTRAINT.info;
    expect(text).toContain('coin piles');
    expect(text).toContain('cash stacks');
    expect(text).toContain('gavel');
    expect(text).toContain('umbrella');
    expect(text).toContain('neon circuit');
  });
});

describe('previousRoles (deterministic "previous images" note)', () => {
  const headings = ['첫 번째 이야기', '둘째 이야기', '셋째 이야기', '넷째 이야기', '다섯째 이야기'];

  it('item 3 gets the planned roles of items 1-2, oldest first', () => {
    const plan = planSectionRoles(headings);
    const items = [
      { heading: headings[0] },
      { heading: headings[1] },
      { heading: headings[2] },
    ];
    const result = assignSectionRolesWithHistory(items, { sectionPlanHeadings: headings });
    expect(result[2].role).toBe(plan[2].role);
    expect(result[2].previousRoles).toEqual([plan[0].role, plan[1].role]);
  });

  it('a thumbnail always gets an empty previousRoles', () => {
    const items = [{ heading: '🖼️ 썸네일', isThumbnail: true }, { heading: headings[0] }];
    const result = assignSectionRolesWithHistory(items, { sectionPlanHeadings: headings });
    expect(result[0]).toEqual({ role: null, previousRoles: [] });
  });

  it('a heading whose position is unknown gets an empty previousRoles', () => {
    const result = assignSectionRolesWithHistory([{ heading: '없는 소제목' }], { sectionPlanHeadings: headings });
    expect(result[0]).toEqual({ role: null, previousRoles: [] });
  });

  it('buildPreviousImagesLine is null for an empty list and one guidance line otherwise', () => {
    expect(buildPreviousImagesLine([])).toBeNull();
    const line = buildPreviousImagesLine(['scene', 'comparison']);
    expect(line).toContain('real scene');
    expect(line).toContain('comparison');
    expect(line).toContain('do not repeat');
  });

  it('toBriefVisualRole without previousRoles is byte-identical to before this change', () => {
    const withEmptyField = toBriefVisualRole('scene', { realistic: true, previousRoles: [] });
    const withoutField = toBriefVisualRole('scene', { realistic: true });
    expect(withEmptyField).toEqual(withoutField);
  });

  it('toBriefVisualRole with previousRoles appends exactly one extra constraint line', () => {
    const without = toBriefVisualRole('closeup', { realistic: true, kind: 'auto' });
    const withHistory = toBriefVisualRole('closeup', {
      realistic: true, kind: 'auto', previousRoles: ['scene', 'comparison'],
    });
    expect(withHistory.constraints.length).toBe(without.constraints.length + 1);
    expect(withHistory.constraints[withHistory.constraints.length - 1]).toBe(
      buildPreviousImagesLine(['scene', 'comparison']),
    );
  });
});
