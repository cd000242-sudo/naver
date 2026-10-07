/**
 * 사이트판 글 한 편 유입 설계실(2026-10-06 4차).
 * 제목 엔진은 앱 레포 title-forge/varied.ts 의 묶음 사본(titleForge.generated.mjs) — 같은 입력이면 앱과 같은 제목이어야 한다.
 * 기대값(fixtures/title-forge-cases.json)은 앱 원본으로 만든 것이다. 사본이 낡으면 여기서 깨진다(다시 만들기: spa/scripts/build-title-forge.mjs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forgeVariedTitles } from '../src/lib/titleForge.generated.mjs';

const cases = JSON.parse(readFileSync(new URL('./fixtures/title-forge-cases.json', import.meta.url), 'utf8'));

test('사이트 제목 엔진 사본은 앱 원본과 같은 제목을 낸다', () => {
  for (const c of cases) {
    assert.deepEqual(forgeVariedTitles(c.keyword, c.derived, c.serpTitles), c.expected, c.keyword);
  }
});

import { affiliateCandidates, matchAppPlan, questionChecklist } from '../src/lib/postPlanSiteModel.mjs';

test('질문 체크리스트 — 앱과 같은 규칙(작성일 · 키워드 낱말 절반 · 최근 순 · 출처 이름)', () => {
  const at = (title, i, extra = {}) => ({ source: 'cafearticle', title, link: `https://cafe.naver.com/a/${i}`, postdate: '2026-10-06', postedAt: `2026-10-06T0${i}:00:00Z`, ...extra });
  const items = [at('개인회생 신청자격 조건', 1), at('KB다이렉트 자동차보험 대중교통 할인', 3, { cafeName: '차 카페' }), at('개인택시 자동차보험 다이렉트', 4), { source: 'kin', title: '자동차 보험 갱신 날짜 없음', link: 'x', postdate: '' }];
  const list = questionChecklist(items, 10, '자동차 보험 갱신');
  assert.deepEqual(list.map((q) => q.title), ['개인택시 자동차보험 다이렉트', 'KB다이렉트 자동차보험 대중교통 할인']);
  assert.equal(list[1].where, '카페 · 차 카페');
});

test('제휴 후보 — 겹친 낱말 길이 합 순 · 없으면 빈 목록', () => {
  const snapshot = { sites: { toss: { label: '토스쇼핑', items: [{ name: '차량용 블랙박스', keyword: '블랙박스' }, { name: '자동차 방향제', keyword: '방향제' }] } } };
  assert.deepEqual(affiliateCandidates('자동차 블랙박스 할인', snapshot, 3).map((a) => a.name), ['차량용 블랙박스', '자동차 방향제']);
  assert.deepEqual(affiliateCandidates('엑셀 함수', snapshot, 3), []);
});

test('앱 설계 덧붙이기 — 띄어쓰기 무시하고 같은 키워드의 가장 최근 설계', () => {
  const plans = [{ keyword: '자동차 보험 갱신', updatedAt: '2026-10-06T01:00:00Z' }, { keyword: '자동차보험 갱신', updatedAt: '2026-10-06T05:00:00Z' }, { keyword: '엑셀', updatedAt: '2026-10-06T09:00:00Z' }];
  assert.equal(matchAppPlan(plans, '자동차 보험갱신').updatedAt, '2026-10-06T05:00:00Z');
  assert.equal(matchAppPlan(plans, '전기차'), null);
});

const readSrc = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
test('설계실 탭은 키워드 분석 바로 뒤 · 로그인 탭 · 화면이 붙어 있다', () => {
  const page = readSrc('../src/pages/LewordPage.tsx');
  assert.ok(page.indexOf("id: 'analyze'") < page.indexOf("id: 'plan'") && page.indexOf("id: 'plan'") < page.indexOf("id: 'kin'"));
  assert.match(page, /\{!lockedTab && activeTab === 'plan' && <PostPlanTab initialKeyword=\{handoffKeyword\} \/>\}/);
  // 제목이 없는 카드 → 설계실로 키워드를 넘긴다(2026-10-06)
  assert.match(page, /const sendToPlan = \(keyword: string\) => selectTab\('plan', keyword\);/);
  assert.doesNotMatch(page, /GUEST_TABS[^\n]*'plan'/);
});
test('설계실 ③ 질문은 키를 싣지 않는 호출(유료 커뮤니티 검색이 돌지 않게)', () => {
  const tab = readSrc('../src/components/leword/PostPlanTab.tsx');
  assert.match(tab, /callWorkerRaw\('radar-search'/);
  assert.doesNotMatch(tab, /fetchRadarSearch/);
});

import { relatedForTitles, volumeOf } from '../src/lib/postPlanSiteModel.mjs';
// 실서비스 실주행(2026-10-06 '자동차 보험 갱신'): 검색량 칸이 비었고(워커는 띄어쓰기 없는 키로 준다),
// 제목 재료에 '현대차'(665,800)가 섞여 '자동차 보험 갱신 현대차 어떤 정보가 있는지'가 나왔다.
test('검색량은 띄어쓰기를 무시하고 찾는다', () => {
  assert.equal(volumeOf({ '자동차보험갱신': 1600 }, '자동차 보험 갱신'), 1600);
  assert.equal(volumeOf({ '자동차 보험 갱신': 1600 }, '자동차 보험 갱신'), 1600);
  assert.equal(volumeOf({}, '자동차 보험 갱신'), null);
});
test('제목 재료 연관어는 키워드 낱말 절반 이상을 담은 것만 · 검색량 큰 순 20개', () => {
  const items = [{ keyword: '현대차', searchVolume: 665800 }, { keyword: '자동차보험비교', searchVolume: 88000 }, { keyword: '자동차 보험 갱신 방법', searchVolume: 320 }, { keyword: '자동차 보험 갱신', searchVolume: 1600 }, { keyword: '보험', searchVolume: null }];
  assert.deepEqual(relatedForTitles('자동차 보험 갱신', items), [{ keyword: '자동차보험비교', searchVolume: 88000 }, { keyword: '자동차 보험 갱신 방법', searchVolume: 320 }]);
});

/*
 * ③ 검색에서 궁금해하는 것(2026-10-07 사장님 "지식인 · 카페만 볼 게 아니라 실제 검색에서 사람들이 뭘 궁금해하는지").
 * 앱 레포 src/utils/__tests__/post-plan-model.test.ts 와 같은 사례 — 두 곳 규칙이 같아야 앱 · 사이트가 같은 목록을 낸다.
 */
import { expansionRetryQueries, searchCuriosities, spaceOutKeyword } from '../src/lib/postPlanSiteModel.mjs';

test('검색 궁금증 — 띄어쓰기 없는 긴 키워드는 흔한 앞말 · 뒷말 자리에 띄어쓰기, 다시 찾을 말은 직업 앞말 뗀 것 먼저', () => {
  assert.equal(spaceOutKeyword('가수주현미별세이유'), '가수 주현미 별세 이유');
  assert.equal(spaceOutKeyword('청년도약계좌신청방법'), '청년도약계좌 신청 방법');
  assert.equal(spaceOutKeyword('자동차 보험 갱신'), null);
  assert.equal(spaceOutKeyword('주현미'), null);
  assert.deepEqual(expansionRetryQueries('가수주현미별세이유'), ['주현미 별세 이유', '가수 주현미 별세 이유']);
  assert.deepEqual(expansionRetryQueries('자동차 보험 갱신'), []);
});

test('검색 궁금증 — 낱말 많이 든 말 먼저 → 검색량 순 · 자기 자신 · 번진 말 · 3자 이상 안 겹치는 말 제외 · 못 잰 검색량 null', () => {
  const rows = searchCuriosities('가수주현미별세이유', [
    { keyword: '가수주현미별세', searchVolume: 301600 },
    { keyword: '가수주현미별세이유', searchVolume: 19560 },
    { keyword: '주현미', searchVolume: 118900 },
    { keyword: '주현미 죽음', searchVolume: 250 },
    { keyword: '주현미 콘서트', searchVolume: 3360 },
    { keyword: '주현민', searchVolume: 900 },
    { keyword: '가수 김호중', searchVolume: 50000 },
    { keyword: '가수별세', searchVolume: 7000 },
    { keyword: '현대차', searchVolume: 665800, drifted: true },
    { keyword: '주현미 근황 2026', searchVolume: null },
  ], 10);
  assert.deepEqual(rows.map((r) => r.keyword), ['가수주현미별세', '주현미', '주현미 콘서트', '주현미 죽음', '주현미 근황 2026']);
  assert.equal(rows[rows.length - 1].searchVolume, null);
  const insurance = searchCuriosities('자동차 보험 갱신', [
    { keyword: 'KB자동차보험', searchVolume: 115300 },
    { keyword: '자동차보험 갱신 기간', searchVolume: 2100 },
    { keyword: '자동차보험료계산', searchVolume: 8290 },
    { keyword: '보험 비교', searchVolume: 40000 },
  ], 10);
  assert.deepEqual(insurance.map((r) => r.keyword), ['자동차보험 갱신 기간', 'KB자동차보험', '자동차보험료계산']);
});

test('질문 체크리스트 — 띄운 말(alsoKeywords)로도 관련성을 본다(띄어쓰기 없는 키워드가 늘 0건이던 결함)', () => {
  const items = [
    { source: 'kin', title: '주현미 별세 소식 사실인가요', link: 'k1', postdate: '2026-10-06' },
    { source: 'kin', title: '트로트 가수 추천해 주세요', link: 'k2', postdate: '2026-10-06' },
  ];
  assert.deepEqual(questionChecklist(items, 10, '가수주현미별세이유'), []);
  assert.deepEqual(questionChecklist(items, 10, '가수주현미별세이유', ['가수 주현미 별세 이유']).map((q) => q.link), ['k1']);
});
