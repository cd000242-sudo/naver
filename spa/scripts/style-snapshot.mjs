// 시각 회귀 하네스 — 각 라우트를 렌더한 뒤 요소별 computed style을 덤프한다.
// 토큰 리팩터는 "값 보존" 변경이므로, 전/후 스냅샷은 완전히 동일해야 한다.
//
//   node scripts/style-snapshot.mjs <출력파일> [포트]
//
// 결정성 확보:
//   - 외부(cross-origin) 요청 차단 → 항상 같은 폴백 경로로 렌더
//   - prefers-reduced-motion 강제 → 난수로 DOM 을 만드는 장식 요소
//     (SummerEffect 입자, ParticlesCanvas)가 아예 붙지 않는다
//   - 애니메이션/트랜지션 정지
//   - 텍스트/기하(width·height)가 아니라 스타일 값만 기록
//     → 실측 데이터 문구 길이 변동이 잡음으로 새지 않는다
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const OUT = process.argv[2];
const PORT = process.argv[3] || '4173';
const BASE = `http://localhost:${PORT}`;

const ROUTES = [
    '/', '/products', '/detail', '/leword-detail', '/leword', '/briefing',
    '/orbit', '/pricing', '/download', '/chatbots', '/reviews', '/community',
    '/lookup', '/refund', '/terms', '/privacy', '/bank-order', '/no-such-page',
];

const VIEWPORTS = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
];

// 관찰 대상 — 토큰화가 건드릴 수 있는 모든 시각 속성.
const PROPS = [
    'backgroundColor', 'backgroundImage', 'color', 'borderTopColor', 'borderRightColor',
    'borderBottomColor', 'borderLeftColor', 'borderTopWidth', 'borderStyle',
    'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'marginTop', 'marginBottom', 'gap', 'fontSize', 'fontWeight', 'lineHeight',
    'boxShadow', 'display', 'flexDirection', 'alignItems', 'justifyContent',
    'letterSpacing', 'textAlign', 'gridTemplateColumns', 'backdropFilter',
];

const collect = (props) => {
    const rows = [];
    const walk = (el, path) => {
        const cs = getComputedStyle(el);
        const style = {};
        for (const p of props) style[p] = cs[p];
        rows.push({
            path,
            tag: el.tagName,
            cls: el.getAttribute('class') || '',
            style,
        });
        [...el.children].forEach((child, i) => walk(child, `${path}>${child.tagName}[${i}]`));
    };
    walk(document.body, 'BODY');
    return rows;
};

const browser = await chromium.launch();
const snapshot = {};

for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
    });
    // 외부 호출 차단 — 라이브 데이터가 렌더를 흔들지 않게.
    await context.route('**/*', (route) => {
        const url = route.request().url();
        if (url.startsWith(BASE) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
        return route.abort();
    });
    await context.addInitScript(() => {
        const kill = document.createElement('style');
        kill.textContent = '*,*::before,*::after{animation:none !important;transition:none !important;caret-color:transparent !important}';
        document.documentElement.appendChild(kill);
    });

    const page = await context.newPage();
    for (const route of ROUTES) {
        await page.goto(BASE + route, { waitUntil: 'load', timeout: 45000 });
        // DOM 이 멈출 때까지 대기. lazy 라우트 청크와
        // requestIdleCallback 으로 늦게 붙는 장식(ParticlesCanvas)까지 확실히 정착시킨다.
        await page.waitForFunction(() => {
            const w = window;
            const n = document.querySelectorAll('*').length;
            const stable = w.__snapPrev === n ? (w.__snapStable || 0) + 1 : 0;
            w.__snapPrev = n;
            w.__snapStable = stable;
            return stable >= 4;
        }, null, { timeout: 40000, polling: 400 });
        await page.evaluate(() => { window.__snapPrev = undefined; window.__snapStable = 0; });
        await page.evaluate(() => window.scrollTo(0, 0));
        const rows = await page.evaluate(collect, PROPS);
        snapshot[`${vp.name}${route}`] = rows;
        process.stderr.write(`  ${vp.name} ${route} → ${rows.length} nodes\n`);
    }
    await context.close();
}

await browser.close();
writeFileSync(OUT, JSON.stringify(snapshot, null, 1));
console.log(`snapshot written: ${OUT} (${Object.keys(snapshot).length} route/viewport pairs)`);
