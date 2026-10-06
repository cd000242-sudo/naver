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
  assert.match(page, /\{!lockedTab && activeTab === 'plan' && <PostPlanTab \/>\}/);
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
