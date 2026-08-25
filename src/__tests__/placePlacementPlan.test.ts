import { describe, expect, it } from 'vitest';

import {
  MAX_PLACES_PER_POST,
  placementsForHeading,
  placementsForTail,
  planPlacePlacements,
  type HeadingText,
} from '../automation/placePlacementPlan';

/**
 * [2026-08-25 사용자 요청] 글 중간중간 다녀온 곳을 지도로 표시하고 싶다. 그런데
 * 풀오토는 설정 시점에 소제목이 무엇이 될지 모른다 — "본문 도중이나 이상한 위치에
 * 들어가면 절대 안 된다"는 조건이 붙었다.
 *
 * 그래서 자동 배치는 추측하지 않는다. 본문이 그 가게를 실제로 언급한 소제목 아래에만
 * 넣고, 언급이 없으면 글 맨 끝으로 보낸다. 근거가 없으면 자리를 만들지 않는다.
 */
const 맛집글: HeadingText[] = [
  { title: '거제도 2박3일 일정 짜기', body: '숙소는 지세포 쪽으로 잡았습니다.' },
  { title: '점심은 한꼬막두꼬막에서', body: '꼬막비빔밥이 유명한 집이라 웨이팅을 각오했는데 평일이라 바로 앉았어요.' },
  { title: '오후에 들른 카페 어쩌구', body: '바다뷰가 좋아서 한참 앉아 있었습니다.' },
  { title: '주차와 이동 팁', body: '렌터카가 편합니다.' },
];

describe('planPlacePlacements — 자동(언급 근거)', () => {
  it('본문이 언급한 소제목 아래에 붙인다', () => {
    const [p] = planPlacePlacements(
      [{ name: '한꼬막두꼬막 송파점', address: '서울특별시 송파구 백제고분로33길 16' }],
      맛집글,
    );
    expect(p.headingNumber).toBe(2);
    expect(p.reason).toBe('name-mention');
  });

  it('지점 꼬리가 달라도 본점명으로 찾는다', () => {
    // 지역검색은 "송파점"을 주지만 본문은 "한꼬막두꼬막"이라고만 쓴다.
    const [p] = planPlacePlacements([{ name: '한꼬막두꼬막 지세포 본점' }], 맛집글);
    expect(p.headingNumber).toBe(2);
  });

  it('언급이 없으면 아무 데나 넣지 않고 맨 끝으로 보낸다 (핵심 계약)', () => {
    const [p] = planPlacePlacements([{ name: '전혀등장하지않는가게이름' }], 맛집글);
    expect(p.headingNumber).toBe(0);
    expect(p.reason).toBe('no-evidence');
  });

  it('두 글자 이름은 우연히 걸려도 근거로 치지 않는다', () => {
    const [p] = planPlacePlacements(
      [{ name: '팁' }],  // '주차와 이동 팁'에 들어 있지만 근거가 될 수 없다
      맛집글,
    );
    expect(p.headingNumber).toBe(0);
  });

  it('제목에 나온 소제목을 본문에만 나온 소제목보다 우선한다', () => {
    const headings: HeadingText[] = [
      { title: '가는 길', body: '가다가 한꼬막두꼬막 간판을 봤어요.' },
      { title: '한꼬막두꼬막 후기', body: '맛있었습니다.' },
    ];
    const [p] = planPlacePlacements([{ name: '한꼬막두꼬막' }], headings);
    expect(p.headingNumber).toBe(2);
  });

  it('이름이 안 걸리면 주소로 찾는다', () => {
    const headings: HeadingText[] = [
      { title: '첫째 날', body: '별 일 없었습니다.' },
      { title: '둘째 날', body: '백제고분로33길 16 에 있는 집이었어요.' },
    ];
    const [p] = planPlacePlacements(
      [{ name: '이름이본문에없는집', address: '서울특별시 송파구 백제고분로33길 16' }],
      headings,
    );
    expect(p.headingNumber).toBe(2);
    expect(p.reason).toBe('address-mention');
  });

  it('시·구까지만 겹치는 주소는 근거가 아니다', () => {
    const headings: HeadingText[] = [{ title: '송파 나들이', body: '서울특별시 송파구를 걸었습니다.' }];
    const [p] = planPlacePlacements(
      [{ name: '없는가게', address: '서울특별시 송파구 백제고분로33길 16' }],
      headings,
    );
    expect(p.headingNumber).toBe(0);
  });
});

describe('planPlacePlacements — 명시 위치', () => {
  it('고른 번호를 그대로 존중한다', () => {
    const [p] = planPlacePlacements([{ name: '한꼬막두꼬막', position: 'heading-3' }], 맛집글);
    expect(p.headingNumber).toBe(3);
    expect(p.reason).toBe('explicit-heading');
  });

  it('그 번호의 소제목이 없으면 버리지 않고 맨 끝에 넣는다', () => {
    const [p] = planPlacePlacements([{ name: '한꼬막두꼬막', position: 'heading-9' }], 맛집글);
    expect(p.headingNumber).toBe(0);
    expect(p.reason).toBe('heading-missing');
  });

  it('맨 끝을 고르면 언급이 있어도 맨 끝이다', () => {
    const [p] = planPlacePlacements([{ name: '한꼬막두꼬막', position: 'bottom' }], 맛집글);
    expect(p.headingNumber).toBe(0);
    expect(p.reason).toBe('explicit-bottom');
  });
});

describe('planPlacePlacements — 여러 곳', () => {
  it('중간 두 곳 + 맛집은 맨 끝, 요청한 모양대로 나온다', () => {
    const plan = planPlacePlacements(
      [
        { name: '한꼬막두꼬막' },
        { name: '카페 어쩌구' },
        { name: '마무리로 들른 집', position: 'bottom' },
      ],
      맛집글,
    );
    expect(plan.map((p) => p.headingNumber)).toEqual([2, 3, 0]);
    expect(placementsForHeading(plan, 2)).toHaveLength(1);
    expect(placementsForHeading(plan, 3)).toHaveLength(1);
    expect(placementsForTail(plan)).toHaveLength(1);
  });

  it('같은 소제목에 두 곳이 걸리면 순서대로 둘 다 넣는다', () => {
    const headings: HeadingText[] = [{ title: '하루 코스', body: '한꼬막두꼬막 갔다가 카페 어쩌구 들렀어요.' }];
    const plan = planPlacePlacements([{ name: '한꼬막두꼬막' }, { name: '카페 어쩌구' }], headings);
    expect(placementsForHeading(plan, 1).map((p) => p.place.name)).toEqual(['한꼬막두꼬막', '카페 어쩌구']);
  });

  it('같은 가게를 두 번 넣지 않는다', () => {
    const plan = planPlacePlacements(
      [{ name: '한꼬막두꼬막' }, { name: '한꼬막두꼬막' }],
      맛집글,
    );
    expect(plan).toHaveLength(1);
  });

  it('상한을 넘기면 앞에서부터만 취한다 (지도 도배 방지)', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `가게${i}번집` }));
    expect(planPlacePlacements(many, 맛집글)).toHaveLength(MAX_PLACES_PER_POST);
  });

  it('이름 없는 항목은 무시한다', () => {
    expect(planPlacePlacements([{ name: '' }, { name: '   ' }], 맛집글)).toHaveLength(0);
  });
});

describe('planPlacePlacements — 방어', () => {
  it('소제목이 하나도 없으면 전부 맨 끝으로 간다', () => {
    const plan = planPlacePlacements([{ name: '한꼬막두꼬막' }, { name: '카페 어쩌구' }], []);
    expect(plan.every((p) => p.headingNumber === 0)).toBe(true);
  });

  it('빈 입력에 터지지 않는다', () => {
    expect(planPlacePlacements([], 맛집글)).toEqual([]);
    expect(planPlacePlacements([], [])).toEqual([]);
  });
});
