// 제품 페이지 리디자인(2026-10-07 사장님 "제품정보들 너무 짜쳐" · "디자인과 함께 사실 정정" · "구매 관련 페이지엔 광고 없음").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickVsSample, VS_SNAPSHOT } from '../src/components/products/vsSample.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const card = (over = {}) => ({
    metrics: { query: '검색어', searchVolume: 3000, documentCount: 900 },
    sources: [{ title: '고수 1' }, { title: '고수 2' }, { title: '고수 3' }],
    titles: ['우리 1', '우리 2', '우리 3'],
    titleEdges: ['나은 점 1', '나은 점 2', '나은 점 3'],
    ...over,
});

test('비교 판 — ★ 카드를 먼저, 고수 제목 3 · 우리 제목 3 · 나은 점을 그대로 옮긴다', () => {
    const plain = card({ metrics: { query: '보통', searchVolume: 5000, documentCount: 10 } });
    const starred = card({ recommended: true, metrics: { query: '별표', searchVolume: 1200, documentCount: null } });
    const picked = pickVsSample([plain, starred], '2026-10-07');
    assert.equal(picked.query, '별표');
    assert.equal(picked.documentCount, null);
    assert.deepEqual(picked.theirs, ['고수 1', '고수 2', '고수 3']);
    assert.deepEqual(picked.ours[2], { text: '우리 3', edge: '나은 점 3' });
    assert.equal(picked.asOf, '2026-10-07');
    assert.equal(picked.sourceCount, 3);
    assert.equal(pickVsSample([card({ sources: [1, 2, 3, 4, 5].map((n) => ({ title: `고수 ${n}` })) })], 'd').sourceCount, 5);
});

test('비교 판 — 실측 검색량이 없거나 1,000 미만 · 나은 점이 모자란 카드는 쓰지 않는다(없으면 사본)', () => {
    assert.equal(pickVsSample([card({ metrics: { query: 'x', searchVolume: null } })], 'd'), null);
    assert.equal(pickVsSample([card({ metrics: { query: 'x', searchVolume: 999 } })], 'd'), null);
    assert.equal(pickVsSample([card({ titleEdges: ['하나', '', '셋'] })], 'd'), null);
    assert.equal(pickVsSample([card({ sources: [{ title: 'a' }, { title: 'b' }] })], 'd'), null);
    assert.equal(pickVsSample(null, 'd'), null);
    assert.equal(VS_SNAPSHOT.theirs.length, 3);
    assert.ok(VS_SNAPSHOT.ours.every((row) => row.text && row.edge));
});

const RETIRED = /영구제만|100만원|올인원 라이선스|올인원 코드 하나로|3개월|Pro로 전체|Pro 헌터|올인원 구매 후|보유자용/;

test('제품 페이지 · 미리 렌더링 글에 끝난 옛 사실이 없다(단품 구매 · LEWORD 영구제 중지)', () => {
    for (const file of ['../src/pages/LewordDetailPage.tsx', '../src/pages/DetailPage.tsx', '../src/pages/OrbitPage.tsx', '../src/pages/ProductsPage.tsx']) {
        const hit = read(file).match(RETIRED);
        assert.equal(hit, null, `${file} 에 옛 문구: ${hit && hit[0]}`);
    }
    const prerender = JSON.parse(read('../scripts/prerender-content.json'));
    for (const [key, html] of Object.entries(prerender)) {
        const hit = String(html).match(RETIRED);
        assert.equal(hit, null, `prerender ${key} 에 옛 문구: ${hit && hit[0]}`);
    }
});

test('다운로드 안내 — 관리자에 옛 문구가 저장돼 있어도 화면엔 새 기본 문구', () => {
    const src = read('../src/pages/DownloadPage.tsx');
    assert.match(src, /page\.note && !RETIRED_COPY\.test\(page\.note\) \? page\.note : DEFAULT_NOTE/);
    const retired = new RegExp(/const RETIRED_COPY = \/(.+)\/;/.exec(src)[1]);
    assert.ok(retired.test('무료 체험은 Better Life Naver만 제공됩니다. LEWORD는 올인원 라이선스 보유자용입니다.'));
    const defaultNote = /const DEFAULT_NOTE = '([^']+)'/.exec(src)[1];
    assert.equal(retired.test(defaultNote), false);
});

test('구매 관련 페이지는 첫 진입에 광고를 불러오지 않는다', () => {
    const html = read('../index.html');
    const rule = /if \(\/(\^\\\/\(products.*?)\/\.test\(window/.exec(html);
    assert.ok(rule, '구매 페이지 광고 제외 규칙이 없다');
    const re = new RegExp(rule[1]);
    for (const path of ['/products', '/detail', '/leword-detail', '/orbit', '/pricing', '/bank-order', '/lookup', '/download', '/pricing/']) {
        assert.ok(re.test(path), `${path} 에서 광고가 뜬다`);
    }
    for (const path of ['/', '/reviews', '/community', '/briefing']) assert.equal(re.test(path), false, `${path} 광고가 꺼졌다`);
});
