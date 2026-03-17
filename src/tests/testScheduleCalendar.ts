/**
 * 📅 네이버 블로그 예약 발행 - 달력 DOM 진단 테스트
 * 
 * 목적: 예약 발행 모달에서 달력 UI의 실제 DOM 구조를 캡처하여
 *       정확한 Puppeteer 셀렉터를 확정하기 위한 진단 스크립트
 * 
 * 실행: npx ts-node src/tests/testScheduleCalendar.ts
 * 
 * 결과:
 *   - 콘솔에 달력 DOM 구조 상세 출력
 *   - ./schedule-calendar-dom.png 스크린샷 저장
 */

import { NaverBlogAutomation } from '../naverBlogAutomation.js';
import dotenv from 'dotenv';

dotenv.config();

async function testScheduleCalendar(): Promise<void> {
  console.log('🧪 네이버 예약 발행 달력 DOM 진단 테스트\n');
  console.log('=' .repeat(60));

  const naverId = process.env.NAVER_ID;
  const naverPassword = process.env.NAVER_PASSWORD;

  if (!naverId || !naverPassword) {
    console.error('❌ .env 파일에 NAVER_ID와 NAVER_PASSWORD를 설정하세요.');
    process.exit(1);
  }

  console.log(`✅ 네이버 계정: ${naverId.substring(0, 3)}***`);

  const automation = new NaverBlogAutomation(
    {
      naverId,
      naverPassword,
      headless: false, // 브라우저를 보면서 진단
      slowMo: 50,
    },
    (message) => console.log(`[Automation] ${message}`),
  );

  try {
    // 로그인 + 에디터 진입
    console.log('\n📝 1단계: 로그인 + 에디터 진입...');
    await (automation as any).initBrowser();
    await (automation as any).login();
    await (automation as any).navigateToEditor();
    
    // 간단한 제목 입력 (발행 모달은 최소한의 글이 있어야 열림)
    const frame = await (automation as any).getAttachedFrame();
    const page = (automation as any).ensurePage();

    // 제목 입력
    console.log('\n📝 2단계: 테스트 제목 입력...');
    try {
      await (automation as any).inputTitle('[진단테스트] 달력 DOM 확인용 - 삭제할 글');
    } catch (e) {
      console.log(`⚠️ 제목 입력 실패 (무시): ${(e as Error).message}`);
    }
    
    await new Promise(r => setTimeout(r, 2000));

    // 발행 모달 열기
    console.log('\n📝 3단계: 발행 모달 열기...');
    const publishBtnSelectors = [
      'button.publish_btn__m9KHH[data-click-area="tpb.publish"]',
      'button[data-click-area="tpb.publish"]',
      'button[class*="publish_btn"]',
    ];

    let publishButton = null;
    for (const sel of publishBtnSelectors) {
      publishButton = await frame.$(sel) || await page.$(sel);
      if (publishButton) {
        console.log(`   ✅ 발행 버튼 발견: ${sel}`);
        break;
      }
    }

    if (!publishButton) {
      console.error('❌ 발행 버튼을 찾을 수 없습니다.');
      await page.screenshot({ path: 'error-no-publish-btn-diag.png', fullPage: true });
      process.exit(1);
    }

    await publishButton.click();
    await new Promise(r => setTimeout(r, 3000)); // 모달이 열릴 때까지 충분히 대기

    console.log('\n📝 4단계: 예약 라디오 버튼 선택...');
    
    // 예약 라디오 버튼 찾기 + 클릭
    const scheduleRadioSelectors = [
      'input#radio_time2',
      'input[name="radio_time"][value="pre"]',
      'input[type="radio"][value="pre"]',
      'label[for="radio_time2"]',
    ];

    let scheduleRadio = null;
    let usedSelector = '';
    for (const sel of scheduleRadioSelectors) {
      scheduleRadio = await frame.$(sel) || await page.$(sel);
      if (scheduleRadio) {
        usedSelector = sel;
        console.log(`   ✅ 예약 라디오 발견: ${sel}`);
        break;
      }
    }

    if (!scheduleRadio) {
      console.error('❌ 예약 라디오 버튼을 찾을 수 없습니다.');

      // 모든 라디오 버튼 스캔
      const allRadios = await frame.evaluate(() => {
        return Array.from(document.querySelectorAll('input[type="radio"]')).map(r => ({
          id: r.id,
          name: (r as HTMLInputElement).name,
          value: (r as HTMLInputElement).value,
          checked: (r as HTMLInputElement).checked,
          className: r.className,
          parentText: r.parentElement?.textContent?.trim()?.substring(0, 100) || '',
        }));
      }).catch(() => []);
      console.log('🔍 모든 라디오 버튼:', JSON.stringify(allRadios, null, 2));

      await page.screenshot({ path: 'error-no-schedule-radio-diag.png', fullPage: true });
      process.exit(1);
    }

    await scheduleRadio.click();
    await new Promise(r => setTimeout(r, 3000)); // 예약 UI가 나타날 때까지 대기

    console.log('\n' + '='.repeat(60));
    console.log('📅 5단계: 달력 DOM 진단 시작!');
    console.log('='.repeat(60));

    // ==========================================
    // 진단 A: 모든 input/select 요소 스캔
    // ==========================================
    console.log('\n--- A. 예약 UI의 모든 input/select 요소 ---');
    
    const scanAllInputsFn = () => {
      const elements = Array.from(document.querySelectorAll('input, select, button'));
      return elements.map(el => {
        const htmlEl = el as HTMLElement;
        return {
          tag: el.tagName,
          type: (el as HTMLInputElement).type || '',
          name: (el as HTMLInputElement).name || '',
          id: el.id || '',
          className: el.className?.substring(0, 100) || '',
          placeholder: (el as HTMLInputElement).placeholder || '',
          value: (el as HTMLInputElement).value || '',
          readOnly: (el as HTMLInputElement).readOnly || false,
          visible: htmlEl.offsetParent !== null,
          rect: (() => {
            const r = htmlEl.getBoundingClientRect();
            return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
          })(),
          dataAttrs: Object.fromEntries(
            Array.from(el.attributes)
              .filter(a => a.name.startsWith('data-'))
              .map(a => [a.name, a.value])
          ),
        };
      }).filter(i => i.visible && i.rect.width > 0 && i.rect.height > 0);
    };

    let allInputs = await frame.evaluate(scanAllInputsFn).catch(() => []);
    if (allInputs.length === 0) {
      allInputs = await page.evaluate(scanAllInputsFn).catch(() => []);
      console.log('   (page에서 스캔)');
    } else {
      console.log('   (frame에서 스캔)');
    }

    console.log(`   총 ${allInputs.length}개 발견:`);
    for (const inp of allInputs) {
      if (inp.tag === 'BUTTON' && !inp.className.includes('date') && !inp.className.includes('calendar') && !inp.className.includes('next') && !inp.className.includes('prev')) continue;
      console.log(`   [${inp.tag}] type=${inp.type} id="${inp.id}" class="${inp.className}" name="${inp.name}" value="${inp.value}" readOnly=${inp.readOnly} rect=${JSON.stringify(inp.rect)} data=${JSON.stringify(inp.dataAttrs)}`);
    }

    // ==========================================
    // 진단 B: 달력 관련 요소 스캔 (class에 calendar, date, datepicker, day 포함)
    // ==========================================
    console.log('\n--- B. 달력 관련 DOM 요소 (class에 calendar/date/datepicker/day/month/year 포함) ---');
    
    const scanCalendarFn = () => {
      const selectors = [
        '[class*="calendar"]', '[class*="Calendar"]',
        '[class*="datepicker"]', '[class*="DatePicker"]', '[class*="Datepicker"]',
        '[class*="date_area"]', '[class*="dateArea"]',
        '[class*="day"]', '[class*="Day"]',
        '[class*="month"]', '[class*="Month"]',
        '[class*="year"]', '[class*="Year"]',
        '[class*="prev"]', '[class*="next"]',
        '[class*="input_date"]',
        '[class*="schedule"]', '[class*="Schedule"]',
        '[class*="reservation"]', '[class*="Reservation"]',
      ];

      const found: any[] = [];
      const seen = new Set<Element>();

      for (const sel of selectors) {
        try {
          const els = document.querySelectorAll(sel);
          els.forEach(el => {
            if (seen.has(el)) return;
            seen.add(el);
            const htmlEl = el as HTMLElement;
            found.push({
              matchedSelector: sel,
              tag: el.tagName,
              id: el.id || '',
              className: el.className?.toString()?.substring(0, 120) || '',
              text: htmlEl.innerText?.substring(0, 80) || htmlEl.textContent?.substring(0, 80) || '',
              childCount: el.children.length,
              visible: htmlEl.offsetParent !== null,
              rect: (() => {
                const r = htmlEl.getBoundingClientRect();
                return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
              })(),
            });
          });
        } catch { /* ignore */ }
      }

      return found.filter(f => f.visible);
    };

    let calendarElements = await frame.evaluate(scanCalendarFn).catch(() => []);
    if (calendarElements.length === 0) {
      calendarElements = await page.evaluate(scanCalendarFn).catch(() => []);
      console.log('   (page에서 스캔)');
    } else {
      console.log('   (frame에서 스캔)');
    }

    console.log(`   총 ${calendarElements.length}개 발견:`);
    for (const el of calendarElements) {
      console.log(`   [${el.tag}] matched="${el.matchedSelector}" id="${el.id}" class="${el.className}" text="${el.text.substring(0, 50)}" children=${el.childCount} rect=${JSON.stringify(el.rect)}`);
    }

    // ==========================================
    // 진단 C: 달력 컨테이너의 outerHTML 캡처
    // ==========================================
    console.log('\n--- C. 달력 컨테이너 HTML 구조 (최대 3000자) ---');

    const captureCalendarHTML = () => {
      // 달력 컨테이너 후보들
      const candidates = [
        document.querySelector('[class*="calendar"]'),
        document.querySelector('[class*="datepicker"]'),
        document.querySelector('[class*="DatePicker"]'),
        document.querySelector('[class*="date_area"]'),
        document.querySelector('[class*="schedule_date"]'),
        document.querySelector('[class*="reservation_area"]'),
      ].filter(Boolean);

      if (candidates.length === 0) {
        // 날짜 input 근처의 부모 요소 탐색
        const dateInput = document.querySelector('input[class*="input_date"]');
        if (dateInput) {
          let parent = dateInput.parentElement;
          for (let i = 0; i < 5 && parent; i++) {
            if (parent.children.length >= 3) {
              return {
                found: true,
                method: `dateInput parent level ${i}`,
                html: parent.outerHTML.substring(0, 3000),
                className: parent.className,
              };
            }
            parent = parent.parentElement;
          }
        }
        return { found: false, method: 'none', html: '', className: '' };
      }

      // 가장 큰 (children이 가장 많은) 컨테이너 사용
      const best = candidates.reduce((a, b) => 
        (a?.children.length || 0) >= (b?.children.length || 0) ? a : b
      );
      
      return {
        found: true,
        method: 'direct selector',
        html: best!.outerHTML.substring(0, 3000),
        className: (best as HTMLElement).className || '',
      };
    };

    let calendarHTML = await frame.evaluate(captureCalendarHTML).catch(() => ({ found: false, method: 'frame error', html: '', className: '' }));
    if (!calendarHTML.found) {
      calendarHTML = await page.evaluate(captureCalendarHTML).catch(() => ({ found: false, method: 'page error', html: '', className: '' }));
      if (calendarHTML.found) console.log('   (page에서 발견)');
    } else {
      console.log('   (frame에서 발견)');
    }

    if (calendarHTML.found) {
      console.log(`   발견 방법: ${calendarHTML.method}`);
      console.log(`   클래스: ${calendarHTML.className}`);
      console.log(`   HTML 구조:\n${calendarHTML.html}`);
    } else {
      console.log('   ❌ 달력 컨테이너를 찾을 수 없습니다.');
    }

    // ==========================================
    // 진단 D: 날짜 input 주변의 전체 예약 UI 영역
    // ==========================================
    console.log('\n--- D. 예약 UI 전체 영역 (날짜 input의 최상위 컨테이너) ---');

    const captureScheduleArea = () => {
      // 예약 라디오가 선택된 영역 찾기
      const radioTime2 = document.querySelector('input#radio_time2') as HTMLInputElement;
      if (radioTime2) {
        // radio의 부모를 따라 올라가면서 예약 영역 전체를 찾기
        let parent = radioTime2.parentElement;
        for (let i = 0; i < 8 && parent; i++) {
          if (parent.querySelectorAll('input, select').length >= 3) {
            return {
              found: true,
              level: i,
              html: parent.outerHTML.substring(0, 4000),
              inputCount: parent.querySelectorAll('input').length,
              selectCount: parent.querySelectorAll('select').length,
              buttonCount: parent.querySelectorAll('button').length,
            };
          }
          parent = parent.parentElement;
        }
      }

      // 폴백: select[class*="hour_option"] 근처
      const hourSelect = document.querySelector('select[class*="hour_option"]');
      if (hourSelect) {
        let parent = hourSelect.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          if (parent.querySelectorAll('input, select').length >= 3) {
            return {
              found: true,
              level: i,
              html: parent.outerHTML.substring(0, 4000),
              inputCount: parent.querySelectorAll('input').length,
              selectCount: parent.querySelectorAll('select').length,
              buttonCount: parent.querySelectorAll('button').length,
            };
          }
          parent = parent.parentElement;
        }
      }

      return { found: false, level: -1, html: '', inputCount: 0, selectCount: 0, buttonCount: 0 };
    };

    let scheduleArea = await frame.evaluate(captureScheduleArea).catch(() => ({ found: false, level: -1, html: '', inputCount: 0, selectCount: 0, buttonCount: 0 }));
    if (!scheduleArea.found) {
      scheduleArea = await page.evaluate(captureScheduleArea).catch(() => ({ found: false, level: -1, html: '', inputCount: 0, selectCount: 0, buttonCount: 0 }));
    }

    if (scheduleArea.found) {
      console.log(`   레벨: ${scheduleArea.level}, input: ${scheduleArea.inputCount}, select: ${scheduleArea.selectCount}, button: ${scheduleArea.buttonCount}`);
      console.log(`   HTML:\n${scheduleArea.html}`);
    } else {
      console.log('   ❌ 예약 UI 영역을 찾을 수 없습니다.');
    }

    // ==========================================
    // 진단 E: 날짜 input 클릭 후 달력 팝업 캡처
    // ==========================================
    console.log('\n--- E. 날짜 input 클릭 후 달력 팝업 캡처 ---');

    const dateInputSels = [
      'input[class*="input_date"]',
      '[class*="date_area"] input',
      'button[class*="calendar"]',
    ];

    let dateInputEl = null;
    for (const sel of dateInputSels) {
      dateInputEl = await frame.$(sel) || await page.$(sel);
      if (dateInputEl) {
        console.log(`   날짜 input 발견: ${sel}`);
        break;
      }
    }

    if (dateInputEl) {
      await dateInputEl.click();
      await new Promise(r => setTimeout(r, 2000)); // 달력 팝업이 열릴 때까지 대기

      // 달력 팝업 DOM 캡처
      const captureCalendarPopup = () => {
        // 새로 나타난 요소 탐색 (달력 팝업)
        const candidates = [
          ...Array.from(document.querySelectorAll('[class*="calendar"]')),
          ...Array.from(document.querySelectorAll('[class*="datepicker"]')),
          ...Array.from(document.querySelectorAll('[class*="DatePicker"]')),
          ...Array.from(document.querySelectorAll('[class*="layer"]')),
          ...Array.from(document.querySelectorAll('[class*="popup"]')),
          ...Array.from(document.querySelectorAll('[class*="Popup"]')),
        ].filter(el => {
          const htmlEl = el as HTMLElement;
          return htmlEl.offsetParent !== null &&
                 htmlEl.getBoundingClientRect().width > 100 &&
                 htmlEl.getBoundingClientRect().height > 100;
        });

        // td가 있는 요소를 우선 (달력 테이블)
        const withTd = candidates.filter(el => el.querySelectorAll('td').length > 7);
        const best = withTd.length > 0 ? withTd[0] : candidates[0];

        if (best) {
          return {
            found: true,
            html: best.outerHTML.substring(0, 5000),
            className: (best as HTMLElement).className || '',
            tdCount: best.querySelectorAll('td').length,
            buttonCount: best.querySelectorAll('button').length,
            thCount: best.querySelectorAll('th').length,
          };
        }
        return { found: false, html: '', className: '', tdCount: 0, buttonCount: 0, thCount: 0 };
      };

      let calendarPopup = await frame.evaluate(captureCalendarPopup).catch(() => ({ found: false, html: '', className: '', tdCount: 0, buttonCount: 0, thCount: 0 }));
      if (!calendarPopup.found) {
        calendarPopup = await page.evaluate(captureCalendarPopup).catch(() => ({ found: false, html: '', className: '', tdCount: 0, buttonCount: 0, thCount: 0 }));
      }

      if (calendarPopup.found) {
        console.log(`   ✅ 달력 팝업 발견! td=${calendarPopup.tdCount}, button=${calendarPopup.buttonCount}, th=${calendarPopup.thCount}`);
        console.log(`   클래스: ${calendarPopup.className}`);
        console.log(`   HTML:\n${calendarPopup.html}`);
      } else {
        console.log('   ❌ 달력 팝업을 찾을 수 없습니다.');
        
        // 전체 문서에서 table 요소 찾기
        const scanTables = () => {
          const tables = document.querySelectorAll('table');
          return Array.from(tables).map(t => ({
            className: t.className?.substring(0, 100) || '',
            parentClass: t.parentElement?.className?.substring(0, 100) || '',
            rows: t.rows.length,
            cells: t.querySelectorAll('td').length,
            visible: (t as HTMLElement).offsetParent !== null,
            rect: (() => {
              const r = t.getBoundingClientRect();
              return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
            })(),
          })).filter(t => t.visible);
        };

        const tables = await frame.evaluate(scanTables).catch(() => []);
        console.log(`   대체 스캔 - 보이는 table 요소: ${tables.length}개`);
        for (const t of tables) {
          console.log(`   [TABLE] class="${t.className}" parentClass="${t.parentClass}" rows=${t.rows} cells=${t.cells} rect=${JSON.stringify(t.rect)}`);
        }
      }

      // 스크린샷 저장 (달력 팝업이 열린 상태)
      await page.screenshot({ path: 'schedule-calendar-dom.png', fullPage: true });
      console.log('\n📸 스크린샷 저장: schedule-calendar-dom.png');
    } else {
      console.log('   ❌ 날짜 input을 찾을 수 없습니다.');
      await page.screenshot({ path: 'schedule-calendar-dom-no-input.png', fullPage: true });
    }

    // ==========================================
    // 진단 완료
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('🎉 달력 DOM 진단 완료!');
    console.log('='.repeat(60));
    console.log('\n다음 단계:');
    console.log('1. 위 로그와 스크린샷(schedule-calendar-dom.png)을 확인');
    console.log('2. 달력 요소의 실제 클래스/ID를 publishHelpers.ts에 반영');
    console.log('\n⚠️ 발행 모달이 열려 있으니 ESC를 눌러 닫아주세요.');
    console.log('⚠️ "[진단테스트] 달력 DOM 확인용" 글은 임시저장하지 않았으니 그냥 닫으면 됩니다.');

    // 브라우저를 바로 닫지 않고 사용자가 확인할 수 있게 대기
    console.log('\n⏳ 30초 후 자동 종료됩니다. (Ctrl+C로 즉시 종료 가능)');
    await new Promise(r => setTimeout(r, 30000));

  } catch (error) {
    console.error('\n❌ 진단 테스트 실패:', (error as Error).message);
    if ((error as Error).stack) {
      console.error('스택:', (error as Error).stack);
    }
  } finally {
    try {
      await (automation as any).close();
    } catch { }
  }
}

testScheduleCalendar().catch((error) => {
  console.error('❌ 예상치 못한 오류:', error);
  process.exit(1);
});
