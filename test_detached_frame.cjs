/**
 * Detached Frame 수정 검증 테스트
 * 네이버 블로그 에디터에서 이미지 삽입 + 소제목 입력 시 frame detach 발생 여부 확인
 */

const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

// 시스템 Chrome 경로
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const IMAGE_DIR = String.raw`C:\Users\박성현\Desktop\리더 네이버 자동화\test_images\안산 맘편한산후조리원 솔직한 이용 후기 2주, 제 몸이 이렇게 달라졌어요`;

const imageFiles = fs.readdirSync(IMAGE_DIR)
    .filter(f => /\.(jpe?g|png|gif|webp)$/i.test(f))
    .sort()
    .slice(0, 6);

console.log(`\n📷 테스트용 이미지 ${imageFiles.length}개:`);
imageFiles.forEach((f, i) => {
    const size = fs.statSync(path.join(IMAGE_DIR, f)).size;
    console.log(`   [${i + 1}] ${f} (${(size / 1024).toFixed(0)}KB)`);
});

const HEADINGS = [
    '안산 맘편한산후조리원 첫인상',
    '시설 및 객실 둘러보기',
    '산후 관리 프로그램',
    '식사와 간식 퀄리티',
    '아기 돌봄 서비스',
    '2주 후기 솔직한 총평'
];

async function main() {
    console.log('\n🚀 Playwright 테스트 시작...');

    const browser = await chromium.launch({
        headless: false,
        executablePath: CHROME_PATH,
        args: ['--start-maximized'],
    });

    const context = await browser.newContext({
        viewport: null,
        locale: 'ko-KR',
    });

    const page = await context.newPage();

    // 1단계: 네이버 로그인
    console.log('\n📌 1단계: 네이버 로그인');
    await page.goto('https://nid.naver.com/nidlogin.login');

    console.log('');
    console.log('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
    console.log('⚠️  브라우저에서 직접 로그인해주세요!');
    console.log('   로그인 완료 후 자동으로 진행됩니다.');
    console.log('   (최대 5분 대기)');
    console.log('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
    console.log('');

    try {
        await page.waitForURL((url) => {
            const u = url.toString();
            return !u.includes('nidlogin') && !u.includes('nid.naver.com/nidlogin');
        }, { timeout: 300000 });
        console.log('✅ 로그인 성공!');
    } catch {
        console.log('❌ 로그인 타임아웃. 종료합니다.');
        await browser.close();
        process.exit(1);
    }

    await page.waitForTimeout(2000);

    // 2단계: 블로그 글쓰기
    console.log('\n📌 2단계: 블로그 글쓰기 페이지 이동');
    await page.goto('https://blog.naver.com/GoBlogWrite.naver', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // 3단계: mainFrame 찾기
    console.log('\n📌 3단계: 에디터 mainFrame 찾기');

    let mainFrame = null;
    for (let attempt = 0; attempt < 5; attempt++) {
        const frameHandle = await page.waitForSelector('#mainFrame', {
            visible: true,
            timeout: 5000,
        }).catch(() => null);

        if (frameHandle) {
            const frame = await frameHandle.contentFrame();
            if (frame) {
                mainFrame = frame;
                console.log(`✅ mainFrame 찾기 성공 (${attempt + 1}번째 시도)`);
                break;
            }
        }
        console.log(`   ⚠️ mainFrame 찾기 실패 (${attempt + 1}/5), 재시도...`);
        await page.waitForTimeout(2000);
    }

    if (!mainFrame) {
        console.log('❌ mainFrame을 찾을 수 없습니다.');
        await browser.close();
        process.exit(1);
    }

    // 4단계: 팝업 닫기
    console.log('\n📌 4단계: 팝업 닫기');
    await page.waitForTimeout(2000);

    try {
        const draftPopup = await mainFrame.$('.se-popup-button-cancel');
        if (draftPopup) {
            await draftPopup.click();
            console.log('   ✅ 작성중인 글 팝업 닫기');
            await page.waitForTimeout(1000);
        }
    } catch { }

    try {
        const helpBtn = await mainFrame.$('.se-help-panel-close-button');
        if (helpBtn) {
            await helpBtn.click();
            console.log('   ✅ 도움말 패널 닫기');
            await page.waitForTimeout(500);
        }
    } catch { }

    // 5단계: 제목 입력
    console.log('\n📌 5단계: 제목 입력');
    try {
        const titleArea = await mainFrame.waitForSelector('.se-documentTitle .se-text-paragraph', { timeout: 5000 });
        await titleArea.click();
        await page.waitForTimeout(300);
        await page.keyboard.type('[테스트] 안산 맘편한산후조리원 이용 후기', { delay: 30 });
        console.log('✅ 제목 입력 완료');
    } catch (e) {
        console.log(`⚠️ 제목 입력 실패: ${e.message}`);
    }

    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);

    // 6단계: 핵심 — 소제목 + 이미지 반복
    console.log('\n📌 6단계: 소제목 + 이미지 삽입 (Detached Frame 테스트)');
    console.log('   ℹ️ 각 소제목마다 frame 유효성을 체크합니다.\n');

    let detachedErrors = 0;
    let frameReconnections = 0;
    let successfulInserts = 0;

    // frame 재연결 헬퍼
    async function reconnectFrame() {
        const fh = await page.waitForSelector('#mainFrame', { visible: true, timeout: 10000 }).catch(() => null);
        if (fh) {
            const nf = await fh.contentFrame();
            if (nf) {
                mainFrame = nf;
                frameReconnections++;
                console.log(`   ✅ frame 재연결 성공!`);
                await page.waitForTimeout(1000);
                return true;
            }
        }
        return false;
    }

    for (let i = 0; i < HEADINGS.length && i < imageFiles.length; i++) {
        const heading = HEADINGS[i];
        const imageFile = imageFiles[i];
        const imagePath = path.join(IMAGE_DIR, imageFile);

        console.log(`\n   ── [${i + 1}/${HEADINGS.length}] "${heading}" ──`);

        // ✅ 핵심: frame 유효성 체크
        try {
            await mainFrame.evaluate(() => true);
            console.log(`   ✅ frame 유효 확인`);
        } catch (e) {
            detachedErrors++;
            console.log(`   ⚠️ frame DETACHED! 재연결 시도...`);
            await reconnectFrame();
        }

        // a) 소제목 입력
        try {
            await page.keyboard.press('Enter');
            await page.waitForTimeout(200);
            await page.keyboard.type(heading, { delay: 20 });
            await page.waitForTimeout(300);
            console.log(`   ✅ 소제목 입력: "${heading}"`);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(300);
        } catch (e) {
            console.log(`   ❌ 소제목 입력 실패: ${e.message.substring(0, 80)}`);
        }

        // b) 이미지 업로드
        try {
            console.log(`   📷 이미지 업로드: ${imageFile}`);

            const photoBtn = await mainFrame.$('.se-toolbar-item-image button')
                || await mainFrame.$('button[data-name="image"]');

            if (photoBtn) {
                const [fileChooser] = await Promise.all([
                    page.waitForEvent('filechooser', { timeout: 10000 }),
                    photoBtn.click(),
                ]);

                await fileChooser.setFiles(imagePath);
                console.log(`   📤 파일 선택 완료, 업로드 대기중...`);

                // 업로드 완료 대기
                await page.waitForTimeout(4000);

                // ✅ 업로드 후 frame 유효성 재확인
                try {
                    await mainFrame.evaluate(() => true);
                    console.log(`   ✅ 이미지 업로드 후 frame 유효`);
                } catch (e) {
                    detachedErrors++;
                    console.log(`   ⚠️⚠️ 이미지 업로드 후 frame DETACHED!`);
                    await reconnectFrame();
                }

                successfulInserts++;
                console.log(`   ✅ 이미지 삽입 완료`);
            } else {
                console.log(`   ⚠️ 사진 버튼을 찾을 수 없음`);
            }

            await page.keyboard.press('Enter');
            await page.waitForTimeout(500);

        } catch (e) {
            console.log(`   ❌ 이미지 업로드 실패: ${e.message.substring(0, 100)}`);
        }

        // c) 본문 텍스트
        try {
            await page.keyboard.type(`${heading}에 대한 솔직한 후기입니다. 정말 만족스러웠어요!`, { delay: 15 });
            await page.keyboard.press('Enter');
            await page.waitForTimeout(300);
        } catch (e) {
            console.log(`   ⚠️ 본문 입력 실패: ${e.message.substring(0, 60)}`);
        }
    }

    // 7단계: 결과
    console.log('\n');
    console.log('════════════════════════════════════════════════════');
    console.log('   📊 Detached Frame 테스트 결과');
    console.log('════════════════════════════════════════════════════');
    console.log(`   🖼️  이미지 삽입 시도: ${imageFiles.length}개`);
    console.log(`   ✅ 성공적 삽입: ${successfulInserts}개`);
    console.log(`   ⚠️  Detached Frame 감지: ${detachedErrors}회`);
    console.log(`   🔄 Frame 재연결 성공: ${frameReconnections}회`);
    console.log(`   📝 소제목 입력: ${HEADINGS.length}개`);
    console.log('');

    if (detachedErrors === 0) {
        console.log('   🎉 결과: Frame DETACH 없이 모든 작업 완료! ✅');
    } else if (frameReconnections === detachedErrors) {
        console.log(`   ⚠️ 결과: ${detachedErrors}회 detach 발생 but 모두 재연결 성공 ✅`);
    } else {
        console.log(`   ❌ 결과: ${detachedErrors - frameReconnections}회 재연결 실패`);
    }

    console.log('');
    console.log('   ℹ️ 브라우저는 열려 있습니다. 확인 후 Ctrl+C로 종료하세요.');
    console.log('════════════════════════════════════════════════════');

    await new Promise(() => { });
}

main().catch(e => {
    console.error('❌ 테스트 실패:', e);
    process.exit(1);
});
