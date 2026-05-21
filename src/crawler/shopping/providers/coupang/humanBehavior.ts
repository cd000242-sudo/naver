/**
 * The Absolute Human Engine — anti-detection human-behavior helpers for Coupang.
 * @module crawler/shopping/providers/coupang/humanBehavior
 *
 * Extracted verbatim from CoupangProvider.ts. These module-level helpers
 * simulate human input (ghost-cursor style mouse paths, Gaussian click
 * coordinates, distraction actions, variable-speed scrolling) to reduce
 * bot detection. Behavior is unchanged — this is a pure relocation.
 */

// ✅ User-Agent 목록 (최신 Chrome 버전 반영)
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
];

/** 가우스 분포 난수 (Box-Muller 변환) */
export function gaussianRandom(mean: number, stdev: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return Math.max(0, z0 * stdev + mean);
}

/** 랜덤 딜레이 (가우스 분포) */
export function randomDelay(min = 1000, max = 3000): number {
    const mean = (min + max) / 2;
    const stdev = (max - min) / 4;
    return Math.max(min, Math.min(max, gaussianRandom(mean, stdev)));
}

/** 랜덤 User-Agent */
export function getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * ✅ ghost-cursor 스타일 인간 마우스 이동
 * Bézier 곡선 + 미세 떨림(jitter) + 오버슈팅(overshoot)
 */
export async function humanMouseMove(page: any, targetX: number, targetY: number): Promise<void> {
    const mouse = page.mouse;

    // 현재 위치에서 목표까지의 경로를 여러 단계로 분할
    const steps = 8 + Math.floor(Math.random() * 6); // 8~13 단계
    const startX = 100 + Math.random() * 800;
    const startY = 100 + Math.random() * 400;

    // ✅ 오버슈팅: 목표를 약간 지나쳤다 돌아오기 (30% 확률)
    const overshoot = Math.random() < 0.3;
    const overshootX = overshoot ? targetX + (Math.random() - 0.5) * 40 : targetX;
    const overshootY = overshoot ? targetY + (Math.random() - 0.5) * 30 : targetY;

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Bézier 곡선 보간
        const easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        let x = startX + (overshootX - startX) * easeT;
        let y = startY + (overshootY - startY) * easeT;

        // ✅ 미세 떨림 (jitter) - 인간 손떨림 모방
        x += (Math.random() - 0.5) * 3;
        y += (Math.random() - 0.5) * 2;

        await mouse.move(Math.round(x), Math.round(y));
        await page.waitForTimeout(10 + Math.random() * 25);
    }

    // 오버슈팅했으면 원래 목표로 돌아오기
    if (overshoot) {
        await page.waitForTimeout(50 + Math.random() * 100);
        await mouse.move(Math.round(targetX), Math.round(targetY));
    }
}

/**
 * ✅ Bounding Box 랜덤 좌표 클릭 (정중앙 아닌 가우스 분포)
 */
export async function humanClick(page: any, selector: string): Promise<boolean> {
    try {
        const el = await page.$(selector);
        if (!el) return false;

        const box = await el.boundingBox();
        if (!box) return false;

        // 가우스 분포로 클릭 좌표 결정 (중앙 근처에 높은 확률)
        const clickX = gaussianRandom(box.x + box.width / 2, box.width / 6);
        const clickY = gaussianRandom(box.y + box.height / 2, box.height / 6);

        // 클릭 범위 보정
        const safeX = Math.max(box.x + 2, Math.min(box.x + box.width - 2, clickX));
        const safeY = Math.max(box.y + 2, Math.min(box.y + box.height - 2, clickY));

        await humanMouseMove(page, safeX, safeY);
        await page.waitForTimeout(50 + Math.random() * 100);
        await page.mouse.click(safeX, safeY);

        return true;
    } catch {
        return false;
    }
}

/**
 * ✅ Distraction Logic: 15% 확률로 무의미한 인간 행동 수행
 */
export async function performDistraction(page: any): Promise<void> {
    if (Math.random() > 0.15) return; // 85%는 그냥 통과

    const actions = [
        // 1. 무의미한 스크롤
        async () => {
            const scrollY = 100 + Math.random() * 300;
            await page.mouse.wheel(0, scrollY);
            await page.waitForTimeout(randomDelay(300, 700));
            await page.mouse.wheel(0, -scrollY * 0.7); // 살짝 올라오기
            console.log(`[Distraction] 📜 무작위 스크롤 수행`);
        },
        // 2. 텍스트 드래그 (선택 후 해제)
        async () => {
            const x = 200 + Math.random() * 600;
            const y = 200 + Math.random() * 300;
            await humanMouseMove(page, x, y);
            await page.mouse.down();
            await humanMouseMove(page, x + 80 + Math.random() * 100, y + 5);
            await page.mouse.up();
            await page.waitForTimeout(randomDelay(200, 500));
            // 선택 해제
            await page.mouse.click(x - 50, y - 50);
            console.log(`[Distraction] 📝 텍스트 드래그 수행`);
        },
        // 3. 마우스를 페이지 구석으로 이동
        async () => {
            const corners = [
                { x: 50, y: 50 },
                { x: 1800, y: 50 },
                { x: 50, y: 900 },
                { x: 1800, y: 900 },
            ];
            const corner = corners[Math.floor(Math.random() * corners.length)];
            await humanMouseMove(page, corner.x, corner.y);
            await page.waitForTimeout(randomDelay(300, 800));
            console.log(`[Distraction] 🖱️ 구석 이동 수행`);
        },
    ];

    const action = actions[Math.floor(Math.random() * actions.length)];
    await action();
}

/**
 * ✅ 인간 스크롤 (가변 속도 + 일시 정지)
 */
export async function humanScroll(page: any, totalDistance: number): Promise<void> {
    let scrolled = 0;
    while (scrolled < totalDistance) {
        const chunk = 80 + Math.random() * 200;
        await page.mouse.wheel(0, chunk);
        scrolled += chunk;

        // 가변 속도 대기
        await page.waitForTimeout(50 + Math.random() * 150);

        // 5% 확률로 잠시 멈춤 (글 읽는 척)
        if (Math.random() < 0.05) {
            await page.waitForTimeout(randomDelay(800, 2000));
        }
    }
}
