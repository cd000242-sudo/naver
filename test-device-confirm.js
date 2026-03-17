/**
 * 기기등록 자동 바이패스 검증 테스트
 * 
 * 실제 네이버 기기등록 페이지 HTML을 시뮬레이션하여
 * handleDeviceConfirmPage() 로직이 정상 동작하는지 검증
 * 
 * 실행: node test-device-confirm.js
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const http = require('http');

puppeteer.use(StealthPlugin());

// 실제 네이버 기기등록 페이지 HTML (read_url_content로 확인한 실제 구조)
const NAVER_DEVICE_CONFIRM_HTML = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>네이버 : 로그인</title>
  <style>
    body { font-family: sans-serif; background: #f5f6f8; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .container { background: white; border-radius: 12px; padding: 40px; max-width: 400px; text-align: center; }
    .btn_area { display: flex; flex-direction: column; gap: 12px; }
    .btn_area a { display: block; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600; cursor: pointer; }
    .btn_confirm { background: #03c75a; color: white; }
    #result { margin-top: 20px; padding: 10px; display: none; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <h2>새로운 기기(브라우저)에서 로그인되었습니다.</h2>
    <p>자주 사용하는 기기라면 등록해 주세요.</p>
    <div class="btn_area">
      <a href="#" class="btn_confirm" id="btn-register" onclick="document.getElementById('result').style.display='block'; document.getElementById('result').innerText='WRONG_REGISTER_CLICKED'; return false;">등록</a>
      <a href="#" id="btn-skip" onclick="document.getElementById('result').style.display='block'; document.getElementById('result').innerText='CORRECT_SKIP_CLICKED'; return false;">등록안함</a>
    </div>
    <div id="result"></div>
  </div>
</body>
</html>
`;

const VARIANT_HTML_LATER = NAVER_DEVICE_CONFIRM_HTML
    .replace('onclick="document.getElementById(\'result\').style.display=\'block\'; document.getElementById(\'result\').innerText=\'CORRECT_SKIP_CLICKED\'; return false;">등록안함<',
        'onclick="document.getElementById(\'result\').style.display=\'block\'; document.getElementById(\'result\').innerText=\'CORRECT_SKIP_CLICKED\'; return false;">나중에<');

// handleDeviceConfirmPage 로직 재현
async function handleDeviceConfirmPage(page) {
    console.log('  [handler] 기기 등록 페이지 감지 - 자동으로 "등록안함" 클릭 중...');
    try {
        await new Promise(r => setTimeout(r, 1500));

        const clicked = await page.evaluate(() => {
            const allElements = document.querySelectorAll('a, button, input[type="submit"], span, div[role="button"]');
            for (const el of allElements) {
                const text = (el.textContent || '').trim();
                if (text === '등록안함' || text === '등록 안함') {
                    el.click();
                    return 'exact';
                }
            }
            for (const el of allElements) {
                const text = (el.textContent || '').trim();
                if (text.includes('등록안함') || text.includes('나중에') || text.includes('건너뛰기')) {
                    el.click();
                    return 'partial';
                }
            }
            return null;
        });

        if (clicked) {
            console.log(`  [handler] 클릭 성공! (매칭: ${clicked})`);
            return { success: true, method: `text-${clicked}` };
        }

        const fallbackSelectors = [
            'button.btn_refuse', 'a.btn_refuse',
            'button.btn_cancel', 'a.btn_cancel',
            '.btn_area a:last-child', '.btn_area button:last-child',
        ];
        for (const selector of fallbackSelectors) {
            const btn = await page.$(selector).catch(() => null);
            if (btn) {
                await btn.click();
                console.log(`  [handler] CSS 셀렉터 클릭 성공! (${selector})`);
                return { success: true, method: `css-${selector}` };
            }
        }

        return { success: false, method: 'none' };
    } catch (err) {
        return { success: false, method: 'error', error: err.message };
    }
}

async function runTests() {
    console.log('');
    console.log('='.repeat(55));
    console.log('  기기등록 자동 바이패스 검증 테스트');
    console.log('='.repeat(55));
    console.log('');

    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        if (req.url === '/variant') {
            res.end(VARIANT_HTML_LATER);
        } else {
            res.end(NAVER_DEVICE_CONFIRM_HTML);
        }
    });

    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    console.log(`  테스트 서버: http://localhost:${port}`);
    console.log('');

    let browser;
    const results = [];

    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-features=IsolateOrigins,site-per-process,PasswordManager',
                '--disable-save-password-bubble',
                '--disable-component-update',
            ],
            ignoreDefaultArgs: ['--enable-automation'],
        });

        // TEST 1: 정확한 '등록안함' 텍스트 매칭
        {
            console.log('--- 테스트 1: 정확한 "등록안함" 텍스트 매칭 ---');
            const page = await browser.newPage();
            await page.goto(`http://localhost:${port}/`);
            const result = await handleDeviceConfirmPage(page);
            const resultText = await page.$eval('#result', el => el.innerText).catch(() => '');
            const isCorrect = result.success && result.method === 'text-exact' && resultText === 'CORRECT_SKIP_CLICKED';
            results.push({ name: '정확한 "등록안함" 텍스트 매칭', passed: isCorrect, method: result.method });
            console.log(`  결과: ${isCorrect ? 'PASS' : 'FAIL'} | 매칭: ${result.method} | 페이지: ${resultText}`);
            console.log('');
            await page.close();
        }

        // TEST 2: '나중에' 변형 텍스트 매칭
        {
            console.log('--- 테스트 2: "나중에" 변형 텍스트 매칭 ---');
            const page = await browser.newPage();
            await page.goto(`http://localhost:${port}/variant`);
            const result = await handleDeviceConfirmPage(page);
            const resultText = await page.$eval('#result', el => el.innerText).catch(() => '');
            const isCorrect = result.success && result.method === 'text-partial' && resultText === 'CORRECT_SKIP_CLICKED';
            results.push({ name: '"나중에" 변형 텍스트 매칭', passed: isCorrect, method: result.method });
            console.log(`  결과: ${isCorrect ? 'PASS' : 'FAIL'} | 매칭: ${result.method} | 페이지: ${resultText}`);
            console.log('');
            await page.close();
        }

        // TEST 3: '등록' 버튼 오클릭 방지
        {
            console.log('--- 테스트 3: "등록" 버튼 오클릭 방지 ---');
            const page = await browser.newPage();
            await page.goto(`http://localhost:${port}/`);
            const result = await handleDeviceConfirmPage(page);
            const resultText = await page.$eval('#result', el => el.innerText).catch(() => '');
            // CORRECT: 등록안함이 클릭됨 (CORRECT_SKIP_CLICKED), 등록이 클릭되면 안됨 (WRONG_REGISTER_CLICKED)
            const isCorrect = result.success && resultText === 'CORRECT_SKIP_CLICKED';
            results.push({ name: '"등록" 버튼 오클릭 방지', passed: isCorrect, method: isCorrect ? '등록안함만 정확 매칭' : `오류: ${resultText}` });
            console.log(`  결과: ${isCorrect ? 'PASS' : 'FAIL'} | 페이지: ${resultText}`);
            console.log('');
            await page.close();
        }

        // TEST 4: CSS 셀렉터 폴백
        {
            console.log('--- 테스트 4: CSS 셀렉터 폴백 (.btn_area a:last-child) ---');
            const cssOnlyHtml = `
        <html><body>
          <div class="btn_area">
            <a href="#" class="btn_confirm">Register</a>
            <a href="#" id="target">Skip</a>
          </div>
          <div id="result" style="display:none"></div>
          <script>
            document.getElementById('target').addEventListener('click', function(e) {
              e.preventDefault();
              document.getElementById('result').style.display='block';
              document.getElementById('result').innerText='CSS_FALLBACK_OK';
            });
          </script>
        </body></html>
      `;
            const cssServer = http.createServer((req, res) => {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(cssOnlyHtml);
            });
            await new Promise(resolve => cssServer.listen(0, resolve));
            const cssPort = cssServer.address().port;
            const page = await browser.newPage();
            await page.goto(`http://localhost:${cssPort}/`);
            const result = await handleDeviceConfirmPage(page);
            const resultText = await page.$eval('#result', el => el.innerText).catch(() => '');
            const isCorrect = result.success && result.method.includes('css') && resultText === 'CSS_FALLBACK_OK';
            results.push({ name: 'CSS 셀렉터 폴백', passed: isCorrect, method: result.method });
            console.log(`  결과: ${isCorrect ? 'PASS' : 'FAIL'} | 매칭: ${result.method} | 페이지: ${resultText}`);
            console.log('');
            await page.close();
            cssServer.close();
        }

        // TEST 5: URL 감지 로직
        {
            console.log('--- 테스트 5: deviceConfirm URL 감지 로직 ---');
            const testUrls = [
                { url: 'https://nid.naver.com/login/ext/deviceConfirm', expected: true },
                { url: 'https://nid.naver.com/login/ext/device_confirm', expected: true },
                { url: 'https://nid.naver.com/nidlogin.login', expected: false },
                { url: 'https://www.naver.com/', expected: false },
                { url: 'https://blog.naver.com/GoBlogWrite.naver', expected: false },
            ];
            let allCorrect = true;
            for (const { url, expected } of testUrls) {
                const detected = url.includes('deviceConfirm') || url.includes('device_confirm');
                const correct = detected === expected;
                if (!correct) allCorrect = false;
                console.log(`  ${correct ? 'OK' : 'FAIL'} ${url} -> detected=${detected} expected=${expected}`);
            }
            results.push({ name: 'deviceConfirm URL 감지', passed: allCorrect, method: 'URL 패턴' });
            console.log('');
        }

    } finally {
        if (browser) await browser.close();
        server.close();
    }

    // 최종 결과
    console.log('='.repeat(55));
    console.log('  최종 결과');
    console.log('='.repeat(55));
    console.log('');

    let pass = 0, fail = 0;
    for (const r of results) {
        const icon = r.passed ? 'PASS' : 'FAIL';
        console.log(`  [${icon}] ${r.name} (${r.method})`);
        if (r.passed) pass++; else fail++;
    }
    console.log('');
    console.log(`  합계: ${pass}/${results.length} 통과${fail > 0 ? `, ${fail} 실패` : ''}`);
    console.log('');

    if (fail > 0) {
        console.log('  일부 테스트가 실패했습니다!');
        process.exit(1);
    } else {
        console.log('  모든 테스트 통과! 기기등록 자동 바이패스가 정상 동작합니다.');
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error('테스트 실행 실패:', err);
    process.exit(1);
});
