/**
 * 홈판 신호 탭 계약(사장님 명령서 STORY RADAR v2.0, 2026-09-16).
 *
 * 지키는 것:
 *   1. 탭은 실검 틈새 바로 뒤에 있고 이용권 탭이다 — 비로그인 맛보기 목록 · 실검 틈새 탭 렌더는 그대로다.
 *   2. 데이터는 앱 브리지(/v1/bridge/homefeed/*)로만 받는다 — 워커 · 외부 AI 를 부르지 않는다.
 *   3. 목록을 그릴 때 AI · 이미지 생성을 부르지 않는다 — 버튼을 눌러야 부른다.
 *   4. 가짜 정밀도(노출 확률 · 점수 숫자) · 사용 허가 단정 · 워터마크 제거 권유 · "/10" 분모 문구가 없다.
 *   5. AI 이미지는 실제 사진이 아니라고, 기사 사진은 권리 확인 필요로 보여 준다. 못 잰 값은 화면 모델(미측정)을 거친다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (path) => readFileSync(join(SRC, path), 'utf8');
const DIR = 'components/leword/homefeed';
const homefeedFiles = () => readdirSync(join(SRC, DIR)).filter((name) => name.endsWith('.tsx')).map((name) => `${DIR}/${name}`);

test('홈판 신호 탭은 실검 틈새 바로 뒤의 이용권 탭이고, 실검 틈새 탭은 그대로다', () => {
    const page = read('pages/LewordPage.tsx');
    const issueAt = page.indexOf("{ id: 'issue',");
    const homefeedAt = page.indexOf("{ id: 'homefeed', label: '홈판 신호'");
    const picksAt = page.indexOf("{ id: 'picks',");
    assert.ok(issueAt > 0 && issueAt < homefeedAt && homefeedAt < picksAt, '탭 순서');
    assert.match(page, /const GUEST_TABS: ReadonlySet<string> = new Set\(\['golden', 'issue'\]\);/);
    assert.match(page, /activeTab === 'homefeed' && <HomefeedTab \/>/);
    assert.match(page, /activeTab === 'issue' && <IssueNicheTab key=\{session \? session\.userId : 'guest'\} onAnalyze=\{sendToAnalyze\} \/>/);
    assert.match(read('components/leword/LewordStyles.tsx'), /\.lw-navi-homefeed \{ --tabc:/);
});

test('데이터는 앱 브리지 homefeed 경로로만 받고 워커 · 외부 AI 를 부르지 않는다', () => {
    const bridge = read('lib/homefeedBridge.ts');
    for (const route of ['stories', 'story', 'collect', 'review', 'titles', 'visual', 'select', 'draft', 'image', 'publish', 'performance', 'calibration', 'settings']) {
        assert.match(bridge, new RegExp(`\\$\\{ROUTE\\}${route}\``), route);
    }
    assert.match(bridge, /image-file\?id=\$\{encodeURIComponent\(id\)\}/);
    for (const file of [...homefeedFiles(), 'lib/homefeedBridge.ts', 'lib/homefeedModel.mjs']) {
        assert.doesNotMatch(read(file), /lib\/keywordApi|workers\.dev|api\.openai\.com|api\.anthropic\.com|generativelanguage/, file);
    }
});

test('목록 · 카드는 AI · 이미지 생성을 부르지 않고, 제목 · 원고는 버튼을 눌러야 부른다', () => {
    for (const file of [`${DIR}/HomefeedTab.tsx`, `${DIR}/HomefeedCard.tsx`]) {
        assert.doesNotMatch(read(file), /hfTitles|hfDraft|hfImage\(|hfReview|hfVisual/, file);
    }
    const write = read(`${DIR}/HomefeedTitlesDraft.tsx`);
    assert.match(write, /onClick=\{\(\) => makeTitles\(Boolean\(titles\)\)\}/);
    assert.match(write, /onClick=\{makeDraft\}/);
    assert.doesNotMatch(write, /useEffect/);
    assert.match(read(`${DIR}/HomefeedVisual.tsx`), /onClick=\{\(\) => generate\(plan\)\}/);
});

test('가짜 정밀도 · 사용 허가 단정 · 워터마크 제거 권유 · /10 분모 문구가 없다', () => {
    for (const file of [...homefeedFiles(), 'lib/homefeedBridge.ts', 'lib/homefeedModel.mjs']) {
        const text = read(file);
        assert.doesNotMatch(text, /노출\s?확률|성공\s?확률|점수\s*[:：]?\s*\d|\d+\s?점\b/, file);
        assert.doesNotMatch(text, /사용\s?가능/, file);
        assert.doesNotMatch(text, /워터마크\S{0,3}\s?(?:지우|제거|없애)/, file);
        assert.doesNotMatch(text, /\/10\b/, file);
    }
});

test('AI 이미지 · 기사 사진 표기, 못 잰 값은 화면 모델을 거친다', () => {
    const visual = read(`${DIR}/HomefeedVisual.tsx`);
    assert.match(visual, /\{record\.label\}/);
    assert.match(visual, /RIGHTS_LABEL\[item\.rightsStatus\]/);
    assert.match(visual, /WATERMARK_LABEL\[item\.watermark\]/);
    assert.match(read(`${DIR}/HomefeedFirstCard.tsx`), /AI 생성 이미지 자리/);
    const card = read(`${DIR}/HomefeedCard.tsx`);
    assert.match(card, /formatSigned\(s\.docDelta30m, '건'\)/);
    assert.match(card, /UNMEASURED/);
    assert.doesNotMatch(card, /\?\? 0\b|\|\| 0\b/);
});
