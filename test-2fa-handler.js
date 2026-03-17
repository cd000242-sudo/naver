/**
 * 2단계 인증 핸들러 테스트
 * 실제 네이버 2FA 페이지와 동일한 구조의 모의 페이지를 만들어
 * 감지 로직 + 체크박스 자동 클릭이 정상 작동하는지 검증
 */
const puppeteer = require('puppeteer');

// 실제 네이버 2FA 페이지와 유사한 HTML (스크린샷 기반 재현)
const MOCK_2FA_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>네이버 2단계 인증</title></head>
<body style="font-family: sans-serif; text-align: center; padding: 40px;">
  <h1 style="color: #03c75a; font-size: 36px; font-weight: bold;">NAVER</h1>
  <h2>2단계 인증 알림 발송 완료</h2>
  <p>설정한 기기에서 인증 알림을 확인하세요.</p>
  <div style="margin: 30px auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; max-width: 300px;">
    <p>[네이버 회원정보]</p>
    <p>2단계 인증요청을 승인하시겠습니까?</p>
    <p>유효시간 59초</p>
  </div>
  <div style="margin: 20px 0;">
    <label id="skip-2fa-label" style="cursor: pointer; color: #666;">
      <input type="checkbox" id="skip-2fa-checkbox" />
      이 브라우저는 "2단계 인증" 없이 로그인 합니다.
    </label>
  </div>
  <button style="width: 80%; padding: 15px; background: #03c75a; color: white; border: none; border-radius: 8px; font-size: 18px;">
    알림 다시 보내기
  </button>
  <div style="margin-top: 15px; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
    OTP 인증번호를 입력하여 로그인 하기
  </div>
</body>
</html>`;

// 일반 페이지 (2FA 아닌 페이지 - false positive 테스트)
const MOCK_NORMAL_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>네이버 블로그</title></head>
<body>
  <h1>네이버 블로그</h1>
  <p>일반 블로그 페이지입니다.</p>
</body>
</html>`;

// handleTwoFactorAuthPage에서 사용하는 핵심 로직 추출
async function test2FADetection(page) {
    const is2FA = await page.evaluate(() => {
        const bodyText = document.body.innerText || '';
        return (bodyText.includes('2단계 인증') &&
            (bodyText.includes('알림 발송') || bodyText.includes('인증요청') ||
                bodyText.includes('인증 알림') || bodyText.includes('승인하시겠습니까')));
    }).catch(() => false);
    return is2FA;
}

async function testCheckboxClick(page) {
    const result = await page.evaluate(() => {
        // 방법 1: 표준 checkbox
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        for (const cb of checkboxes) {
            const parent = cb.closest('label') || cb.parentElement;
            const nearbyText = parent?.textContent || '';
            if (nearbyText.includes('2단계') && nearbyText.includes('없이')) {
                if (!cb.checked) {
                    cb.click();
                }
                return { method: 'checkbox', checked: cb.checked };
            }
        }
        // 방법 2: 텍스트 기반 클릭 (커스텀 체크박스)
        const allEls = document.querySelectorAll('label, span, div, a, button, p');
        for (const el of allEls) {
            const text = (el.textContent || '').trim();
            if (text.includes('2단계') && text.includes('없이') && text.includes('로그인')) {
                const innerCb = el.querySelector('input[type="checkbox"]');
                if (innerCb) {
                    if (!innerCb.checked) {
                        innerCb.click();
                    }
                    return { method: 'inner-checkbox', checked: innerCb.checked };
                }
                el.click();
                return { method: 'element-click', checked: true };
            }
        }
        return null;
    }).catch(() => null);
    return result;
}

async function runTests() {
    console.log('═══════════════════════════════════════════');
    console.log('🧪 2단계 인증 핸들러 테스트 시작');
    console.log('═══════════════════════════════════════════');
    console.log('');

    const browser = await puppeteer.launch({ headless: true });
    let passed = 0;
    let failed = 0;

    try {
        // ========================================
        // 테스트 1: 2FA 페이지 감지 (TRUE 예상)
        // ========================================
        console.log('📋 테스트 1: 2FA 페이지 감지');
        const page1 = await browser.newPage();
        await page1.setContent(MOCK_2FA_HTML);

        const detected = await test2FADetection(page1);
        if (detected) {
            console.log('   ✅ PASS — 2FA 페이지 정상 감지됨');
            passed++;
        } else {
            console.log('   ❌ FAIL — 2FA 페이지를 감지하지 못함!');
            failed++;
        }
        await page1.close();

        // ========================================
        // 테스트 2: 일반 페이지 비감지 (FALSE 예상)
        // ========================================
        console.log('📋 테스트 2: 일반 페이지 비감지 (false positive 검증)');
        const page2 = await browser.newPage();
        await page2.setContent(MOCK_NORMAL_HTML);

        const falsePositive = await test2FADetection(page2);
        if (!falsePositive) {
            console.log('   ✅ PASS — 일반 페이지에서 2FA 오감지 없음');
            passed++;
        } else {
            console.log('   ❌ FAIL — 일반 페이지를 2FA로 잘못 감지!');
            failed++;
        }
        await page2.close();

        // ========================================
        // 테스트 3: 체크박스 자동 클릭
        // ========================================
        console.log('📋 테스트 3: "2단계 인증 없이 로그인" 체크박스 자동 클릭');
        const page3 = await browser.newPage();
        await page3.setContent(MOCK_2FA_HTML);

        // 클릭 전 상태 확인
        const beforeCheck = await page3.$eval('#skip-2fa-checkbox', el => el.checked);
        console.log(`   클릭 전 체크 상태: ${beforeCheck ? '✓' : '✗'}`);

        const clickResult = await testCheckboxClick(page3);

        if (clickResult && clickResult.checked) {
            console.log(`   ✅ PASS — 체크박스 자동 클릭 성공! (방법: ${clickResult.method})`);
            passed++;
        } else {
            console.log(`   ❌ FAIL — 체크박스 클릭 실패! result=${JSON.stringify(clickResult)}`);
            failed++;
        }

        // 클릭 후 상태 재확인
        const afterCheck = await page3.$eval('#skip-2fa-checkbox', el => el.checked);
        console.log(`   클릭 후 체크 상태: ${afterCheck ? '✓' : '✗'}`);
        await page3.close();

        // ========================================
        // 테스트 4: 이미 체크된 체크박스 (중복 클릭 방지)
        // ========================================
        console.log('📋 테스트 4: 이미 체크된 체크박스 중복 클릭 방지');
        const page4 = await browser.newPage();
        // 이미 체크된 상태의 HTML
        const preCheckedHtml = MOCK_2FA_HTML.replace(
            'type="checkbox" id="skip-2fa-checkbox"',
            'type="checkbox" id="skip-2fa-checkbox" checked'
        );
        await page4.setContent(preCheckedHtml);

        const preCheckResult = await testCheckboxClick(page4);
        const stillChecked = await page4.$eval('#skip-2fa-checkbox', el => el.checked);

        if (stillChecked) {
            console.log('   ✅ PASS — 이미 체크된 체크박스 상태 유지됨');
            passed++;
        } else {
            console.log('   ❌ FAIL — 이미 체크된 체크박스가 해제됨!');
            failed++;
        }
        await page4.close();

        // ========================================
        // 테스트 5: 다양한 텍스트 패턴 감지
        // ========================================
        console.log('📋 테스트 5: 다양한 2FA 텍스트 패턴 감지');
        const variants = [
            { name: '"인증요청" 포함', text: '2단계 인증 인증요청을 승인하시겠습니까' },
            { name: '"인증 알림" 포함', text: '2단계 인증 인증 알림이 발송되었습니다' },
            { name: '"알림 발송" 포함', text: '2단계 인증 알림 발송 완료' },
        ];

        let allVariantsPassed = true;
        for (const v of variants) {
            const page5 = await browser.newPage();
            await page5.setContent(`<html><body>${v.text}</body></html>`);
            const det = await test2FADetection(page5);
            if (det) {
                console.log(`   ✅ "${v.name}" — 감지 성공`);
            } else {
                console.log(`   ❌ "${v.name}" — 감지 실패!`);
                allVariantsPassed = false;
            }
            await page5.close();
        }
        if (allVariantsPassed) { passed++; } else { failed++; }

        // ========================================
        // 테스트 6: 커스텀 체크박스 (label 없이 div/span으로 구성)
        // ========================================
        console.log('📋 테스트 6: 커스텀 스타일 체크박스 (label 없이 span)');
        const page6 = await browser.newPage();
        await page6.setContent(`<!DOCTYPE html>
      <html><body style="font-family: sans-serif; padding: 40px;">
        <h2>2단계 인증 알림 발송 완료</h2>
        <p>승인하시겠습니까?</p>
        <div class="custom-check-area">
          <span class="custom-checkbox">
            <input type="checkbox" id="custom-cb" />
            이 브라우저는 "2단계 인증" 없이 로그인 합니다.
          </span>
        </div>
      </body></html>`);

        const customResult = await testCheckboxClick(page6);
        const customChecked = await page6.$eval('#custom-cb', el => el.checked);

        if (customResult && customChecked) {
            console.log(`   ✅ PASS — 커스텀 체크박스 클릭 성공! (방법: ${customResult.method})`);
            passed++;
        } else {
            console.log(`   ❌ FAIL — 커스텀 체크박스 클릭 실패!`);
            failed++;
        }
        await page6.close();

    } finally {
        await browser.close();
    }

    // 결과 요약
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(`🧪 테스트 결과: ${passed} PASSED / ${failed} FAILED`);
    if (failed === 0) {
        console.log('🎉 모든 테스트 통과! 2FA 핸들러가 정상 작동합니다.');
    } else {
        console.log('⚠️  일부 테스트 실패! 코드 수정이 필요합니다.');
    }
    console.log('═══════════════════════════════════════════');

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('테스트 실행 오류:', err);
    process.exit(1);
});
