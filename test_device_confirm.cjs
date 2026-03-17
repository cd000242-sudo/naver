/**
 * 네이버 기기 등록 페이지 자동 바이패스 검증 테스트
 * 
 * 사용법: node test_device_confirm.cjs
 * 
 * 1. 크롬 브라우저가 열림
 * 2. 네이버 로그인 페이지에서 수동 로그인
 * 3. 기기 등록 페이지가 나타나면 자동으로 "등록안함" 클릭
 * 4. 결과 로그 출력
 */

const { chromium } = require('playwright');
const path = require('path');

// ============================================================
// 앱 코드와 동일한 4단계 바이패스 로직 (naverBlogAutomation.ts 복제)
// ============================================================

function isDeviceConfirmUrl(url) {
    const lower = url.toLowerCase();
    return ['deviceconfirm', 'device_confirm', 'new_device', 'register_device', 'devicereg']
        .some(p => lower.includes(p));
}

async function isDeviceConfirmPage(page) {
    // 1차: URL 패턴
    if (isDeviceConfirmUrl(page.url())) return true;
    // 2차: 페이지 텍스트 기반
    const text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    return (text.includes('새로운 기기') && text.includes('등록')) ||
        (text.includes('기기를 등록하면') && text.includes('알림'));
}

async function handleDeviceConfirmPage(page) {
    console.log('📱 기기 등록 페이지 감지 - 자동으로 "등록안함" 클릭 중...');

    try {
        // 페이지 로드 대기
        await page.waitForSelector('a.btn, button, fieldset.login_form', { timeout: 5000 }).catch(() => null);
        await new Promise(r => setTimeout(r, 500));

        // 📋 디버그: 페이지 내 클릭 가능한 요소 목록
        const pageInfo = await page.evaluate(() => {
            const els = document.querySelectorAll('a, button, input[type="submit"]');
            const info = [];
            els.forEach(el => {
                const text = (el.textContent || '').trim();
                const id = el.id || '';
                const cls = el.className || '';
                if (text && text.length < 30) {
                    info.push(`[${el.tagName}] text="${text}" id="${id}" class="${cls}"`);
                }
            });
            return info;
        }).catch(() => []);
        console.log(`   🔍 페이지 내 클릭 요소: ${pageInfo.length}개`);
        pageInfo.forEach(info => console.log(`      ${info}`));

        // ═══════════════════════════════════════════
        // 0단계: 확정 ID 셀렉터
        // <a href="#" id="new.dontsave" class="btn">등록안함</a>
        // ═══════════════════════════════════════════
        const idBtn = await page.$('[id="new.dontsave"]').catch(() => null);
        if (idBtn) {
            await idBtn.click();
            console.log('✅ "등록안함" 클릭 성공! (0단계: 확정 ID new.dontsave)');
            await new Promise(r => setTimeout(r, 2000));
            return true;
        }
        console.log('   ❌ 0단계 실패: [id="new.dontsave"] 없음');

        // ═══════════════════════════════════════════
        // 1단계: page.evaluate 텍스트 기반 직접 클릭
        // ═══════════════════════════════════════════
        const clicked = await page.evaluate(() => {
            const allElements = document.querySelectorAll('a, button, input[type="submit"], span, div[role="button"]');

            // 1차: 정확한 '등록안함' 매칭
            for (const el of allElements) {
                const text = (el.textContent || '').trim();
                if (text === '등록안함' || text === '등록 안함' || text === '등록하지 않음') {
                    el.click();
                    return 'exact';
                }
            }
            // 2차: 부분 매칭
            for (const el of allElements) {
                const text = (el.textContent || '').trim();
                if (text.includes('등록안함') || text.includes('등록 안함') ||
                    text.includes('등록하지') || text.includes('나중에') ||
                    text.includes('건너뛰기') || text.includes('다음에') ||
                    text.includes('괜찮습니다') || text.includes('넘어가기') ||
                    text.toLowerCase().includes('skip') || text.toLowerCase().includes('cancel') ||
                    text.toLowerCase().includes('not now') || text.toLowerCase().includes('dontsave')) {
                    el.click();
                    return 'partial';
                }
            }
            return null;
        }).catch(() => null);

        if (clicked) {
            console.log(`✅ "등록안함" 클릭 성공! (1단계: 텍스트 매칭 ${clicked})`);
            await new Promise(r => setTimeout(r, 2000));
            return true;
        }
        console.log('   ❌ 1단계 실패: 텍스트 매칭 없음');

        // ═══════════════════════════════════════════
        // 2단계: CSS 셀렉터 폴백
        // ═══════════════════════════════════════════
        const fallbackSelectors = [
            '.btn_cancel a',
            '.btn_cancel button',
            'span.btn_cancel a',
            'fieldset.login_form a:nth-child(2)',
            'fieldset.login_form a:last-of-type',
            '.btn_area a:last-child',
            '.btn_area button:last-child',
            'a.btn_refuse', 'button.btn_refuse',
            'a.btn_cancel', 'button.btn_cancel',
        ];
        for (const selector of fallbackSelectors) {
            const btn = await page.$(selector).catch(() => null);
            if (btn) {
                await btn.click();
                console.log(`✅ "등록안함" 클릭 성공! (2단계: CSS 셀렉터 ${selector})`);
                await new Promise(r => setTimeout(r, 2000));
                return true;
            }
        }
        console.log('   ❌ 2단계 실패: CSS 셀렉터 매칭 없음');

        // ═══════════════════════════════════════════
        // 3단계: 최후 폴백 — fieldset 내 마지막 <a> 클릭
        // ═══════════════════════════════════════════
        const lastResort = await page.evaluate(() => {
            const fieldset = document.querySelector('fieldset');
            if (fieldset) {
                const links = fieldset.querySelectorAll('a');
                if (links.length >= 2) {
                    links[links.length - 1].click();
                    return 'fieldset-last-link';
                }
            }
            const allBtns = document.querySelectorAll('a.btn');
            if (allBtns.length >= 2) {
                allBtns[allBtns.length - 1].click();
                return 'last-btn-link';
            }
            return null;
        }).catch(() => null);

        if (lastResort) {
            console.log(`✅ "등록안함" 클릭 성공! (3단계: 최후 폴백 ${lastResort})`);
            await new Promise(r => setTimeout(r, 2000));
            return true;
        }
        console.log('   ❌ 3단계 실패: 최후 폴백도 실패');

        // 실패 시 디버그 HTML
        const debugHtml = await page.evaluate(() => document.body?.innerHTML?.substring(0, 1000) || '').catch(() => '');
        console.log('   🔍 페이지 HTML (1000자):', debugHtml);
        return false;

    } catch (err) {
        console.error('❌ handleDeviceConfirmPage 에러:', err.message);
        return false;
    }
}

// ============================================================
// 메인 테스트 로직
// ============================================================

async function main() {
    console.log('==========================================');
    console.log('🧪 네이버 기기 등록 바이패스 테스트');
    console.log('==========================================');
    console.log('');

    // 시스템 Chrome 사용 (앱과 동일 환경)
    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    ];
    let chromePath = null;
    const fs = require('fs');
    for (const p of chromePaths) {
        if (fs.existsSync(p)) {
            chromePath = p;
            break;
        }
    }

    const browser = await chromium.launch({
        headless: false,
        executablePath: chromePath || undefined,
        args: ['--start-maximized'],
    });

    const context = await browser.newContext({
        viewport: null,
        locale: 'ko-KR',
    });
    const page = await context.newPage();

    // 네이버 로그인 페이지로 이동
    console.log('📌 네이버 로그인 페이지로 이동합니다...');
    console.log('   → 수동으로 로그인해주세요!');
    console.log('');

    await page.goto('https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fblog.naver.com%2FGoBlogWrite.naver', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
    });

    // 로그인 완료 또는 기기 등록 페이지 대기 (최대 5분)
    const maxWaitMs = 5 * 60 * 1000;
    const startTime = Date.now();
    let devicePageHandled = false;
    let loginCompleted = false;

    console.log('⏳ 로그인 대기 중... (최대 5분)');
    console.log('   - 기기 등록 페이지가 나타나면 자동으로 처리합니다');
    console.log('   - 블로그 에디터에 도달하면 테스트 성공!');
    console.log('');

    while (Date.now() - startTime < maxWaitMs) {
        const currentUrl = page.url();

        // 기기 등록 페이지 감지
        if (await isDeviceConfirmPage(page)) {
            console.log('');
            console.log('🎯 ========== 기기 등록 페이지 감지! ==========');
            console.log(`   URL: ${currentUrl}`);
            console.log('');

            // 스크린샷 저장 (바이패스 전)
            const screenshotBefore = path.join(__dirname, 'test_deviceconfirm_before.png');
            await page.screenshot({ path: screenshotBefore, fullPage: true });
            console.log(`   📸 바이패스 전 스크린샷: ${screenshotBefore}`);

            const result = await handleDeviceConfirmPage(page);

            // 바이패스 후 대기
            await new Promise(r => setTimeout(r, 3000));

            // 스크린샷 저장 (바이패스 후)
            const screenshotAfter = path.join(__dirname, 'test_deviceconfirm_after.png');
            await page.screenshot({ path: screenshotAfter, fullPage: true });
            console.log(`   📸 바이패스 후 스크린샷: ${screenshotAfter}`);

            const afterUrl = page.url();
            console.log(`   현재 URL: ${afterUrl}`);

            if (result) {
                console.log('');
                console.log('✅ ========== 기기 등록 바이패스 성공! ==========');
                devicePageHandled = true;
            } else {
                console.log('');
                console.log('❌ ========== 기기 등록 바이패스 실패! ==========');
                console.log('   수동으로 "등록안함"을 클릭해주세요.');
            }
        }

        // 블로그 에디터 도달 확인
        if (currentUrl.includes('blog.naver.com') &&
            (currentUrl.includes('BlogWrite') || currentUrl.includes('PostWrite') || currentUrl.includes('postwrite'))) {
            console.log('');
            console.log('🎉 ========== 블로그 에디터 도달! ==========');
            console.log(`   URL: ${currentUrl}`);
            loginCompleted = true;
            break;
        }

        // 이미 블로그 메인 페이지인 경우
        if (currentUrl.includes('blog.naver.com') && !currentUrl.includes('nidlogin')) {
            console.log('');
            console.log('🎉 ========== 블로그 페이지 도달! ==========');
            console.log(`   URL: ${currentUrl}`);
            loginCompleted = true;
            break;
        }

        await new Promise(r => setTimeout(r, 1000));
    }

    // 최종 결과
    console.log('');
    console.log('==========================================');
    console.log('📊 테스트 결과 요약');
    console.log('==========================================');
    console.log(`   기기 등록 페이지 감지: ${devicePageHandled ? '✅ 감지됨' : '⏭️ 나타나지 않음'}`);
    console.log(`   기기 등록 바이패스:    ${devicePageHandled ? '✅ 성공' : '⏭️ 해당없음'}`);
    console.log(`   로그인 완료:           ${loginCompleted ? '✅ 성공' : '❌ 시간 초과'}`);
    console.log(`   최종 URL: ${page.url()}`);
    console.log('==========================================');

    // 10초 대기 후 종료
    console.log('');
    console.log('10초 후 브라우저가 닫힙니다...');
    await new Promise(r => setTimeout(r, 10000));

    await browser.close();
    console.log('🏁 테스트 완료!');
}

main().catch(err => {
    console.error('테스트 실패:', err);
    process.exit(1);
});
