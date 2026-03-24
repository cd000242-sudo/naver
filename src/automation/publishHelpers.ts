/**
 * publishHelpers.ts - 발행/카테고리/예약 관련 함수
 * naverBlogAutomation.ts에서 추출됨
 */
import { Page, Frame, ElementHandle } from 'puppeteer';

// PublishMode type from naverBlogAutomation
type PublishMode = 'draft' | 'publish' | 'schedule';

// ── selectCategoryInPublishModal ──

// ✅ [2026-02-19] 카테고리 자동 선택 — 스톨 방지 최적화 버전
// 통합 CSS 쿼리, 전체 15초 타임아웃, ESC 정리 일관성
export async function selectCategoryInPublishModal(self: any, frame: Frame, page: Page): Promise<void> {
  if (!self.options.categoryName) {
    self.log('📂 [카테고리] categoryName이 전달되지 않음 — 기본 카테고리로 발행');
    return;
  }

  const targetName = self.options.categoryName!;
  const stripCategoryDecorations = (s: string) =>
    s.replace(/[└├│─]+/g, '')
      .replace(/하위\s*카테고리/g, '')
      .replace(/[\s·_\-\/\\,]+/g, '')
      .toLowerCase();
  const normalizedTarget = stripCategoryDecorations(targetName);
  const MAX_RETRIES = 3;
  const TOTAL_TIMEOUT = 15000; // ✅ [2026-02-19] 전체 15초 타임아웃 가드
  const totalStart = Date.now();

  // ✅ [2026-03-05 FIX] ESC 키 대신 모달 내부 중립 영역 클릭으로 드롭다운 닫기
  // ESC는 카테고리 드롭다운뿐 아니라 발행 모달 자체를 닫아버리는 부작용이 있음
  const closeCategoryDropdown = async () => {
    try {
      const clicked = await frame.evaluate(() => {
        // 발행 모달 내 중립 제목 영역 클릭 → 드롭다운 비활성화 + 모달 유지
        const headings = document.querySelectorAll('h4');
        for (const h of headings) {
          const text = h.textContent?.trim() || '';
          if (text === '공개 설정' || text === '발행 설정' || text === '발행 시간') {
            (h as HTMLElement).click();
            return true;
          }
        }
        // 폴백: 모달 하단 버튼 영역 클릭
        const btnArea = document.querySelector('[class*="btn_area"]') as HTMLElement;
        if (btnArea) { btnArea.click(); return true; }
        return false;
      }).catch(() => false);

      if (!clicked) {
        // 최후: frame body 클릭 (모달 내부이므로 모달은 닫히지 않음)
        await frame.click('body').catch(() => { });
      }
      await self.delay(200);
    } catch {
      // 닫기 실패해도 계속 진행
    }
  };

  self.log(`📂 [카테고리] 자동 선택 시도: "${targetName}" (정규화: "${normalizedTarget}")`);

  // ✅ [2026-02-25 FIX] 발행 모달이 DOM에 렌더링될 때까지 대기
  // 카테고리 드롭다운은 발행 모달 내부에 존재하므로, 모달이 열리지 않으면 찾을 수 없음
  const publishModalSelectors = [
    '[data-testid="seOnePublishBtn"]',                // 발행 확인 버튼 (모달 내부)
    'button[data-click-area="tpb*i.publish"]',        // 발행 확인 버튼 (대체)
    'button.confirm_btn__WEaBq',                      // 발행 확인 버튼 (CSS)
    '[data-click-area="tpb*i.category"]',             // 카테고리 버튼 자체
    'input#radio_time1',                              // 즉시발행 라디오 (모달 내부)
  ];
  let modalReady = false;
  for (const sel of publishModalSelectors) {
    const el = await frame.$(sel).catch(() => null) || await page.$(sel).catch(() => null);
    if (el) {
      modalReady = true;
      self.log(`📂 [카테고리] 발행 모달 확인됨 (${sel})`);
      break;
    }
  }
  if (!modalReady) {
    self.log('📂 [카테고리] 발행 모달이 아직 열리지 않음 → 최대 5초 대기...');
    const modalWaitStart = Date.now();
    const MODAL_WAIT_TIMEOUT = 5000;
    while (Date.now() - modalWaitStart < MODAL_WAIT_TIMEOUT) {
      await self.delay(500);
      for (const sel of publishModalSelectors) {
        const el = await frame.$(sel).catch(() => null) || await page.$(sel).catch(() => null);
        if (el) {
          modalReady = true;
          self.log(`📂 [카테고리] 발행 모달 열림 확인 (${Date.now() - modalWaitStart}ms 후, ${sel})`);
          break;
        }
      }
      if (modalReady) break;
    }
    if (!modalReady) {
      self.log('📂 [카테고리] ⚠️ 발행 모달 대기 타임아웃 (5초) → 기본 카테고리로 진행');
      return;
    }
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // ✅ [2026-02-19] 전체 타임아웃 가드 — 15초 초과 시 즉시 리턴
      if (Date.now() - totalStart > TOTAL_TIMEOUT) {
        self.log('📂 [카테고리] 전체 타임아웃 (15초) → 기본 카테고리로 진행');
        await closeCategoryDropdown();
        return;
      }

      if (attempt > 1) {
        self.log(`📂 [카테고리] 재시도 ${attempt}/${MAX_RETRIES}...`);
        await self.delay(1000);
        await closeCategoryDropdown();
        await self.delay(300);
      }

      // ─── 1단계: 카테고리 드롭다운 버튼 찾기 (통합 CSS 쿼리) ───
      self.log(`   📂 [시도 ${attempt}/${MAX_RETRIES}] 카테고리 드롭다운 탐색 중...`);

      // ✅ [2026-02-19] 검증된 핵심 셀렉터 (순차 waitForSelector → 통합 $ 쿼리)
      const categoryBtnSelectors = [
        '[data-click-area="tpb*i.category"]',
        'button[aria-label="카테고리 목록 버튼"]',
        '[data-testid="seOneCategoryBtn"]',
        'button[class*="selectbox_button"]',
      ];

      const fallbackBtnSelectors = [
        '[class*="category_selector"]',
        '[class*="categoryArea"] button',
        'button[class*="select_btn"]',
        '[class*="category"][class*="wrap"] button',
      ];

      let categorySelector: any = null;
      let searchContext: 'frame' | 'page' = 'frame';

      // ✅ [2026-02-19] 즉시 쿼리: $()는 waitForSelector와 달리 즉시 반환
      // 우선 셀렉터 → frame → page 순으로 시도
      for (const pattern of categoryBtnSelectors) {
        categorySelector = await frame.$(pattern).catch(() => null);
        if (categorySelector) {
          self.log(`   ✅ 카테고리 드롭다운 발견 (frame): ${pattern}`);
          searchContext = 'frame';
          break;
        }
      }

      if (!categorySelector) {
        for (const pattern of categoryBtnSelectors) {
          categorySelector = await page.$(pattern).catch(() => null);
          if (categorySelector) {
            self.log(`   ✅ 카테고리 드롭다운 발견 (page): ${pattern}`);
            searchContext = 'page';
            break;
          }
        }
      }

      // 핵심 셀렉터에서 못 찾으면 fallback ($ 즉시 쿼리)
      if (!categorySelector) {
        for (const pattern of fallbackBtnSelectors) {
          categorySelector = await frame.$(pattern).catch(() => null);
          if (categorySelector) {
            self.log(`   ✅ 카테고리 드롭다운 발견 (frame, 폴백): ${pattern}`);
            searchContext = 'frame';
            break;
          }
        }
      }

      if (!categorySelector) {
        for (const pattern of fallbackBtnSelectors) {
          categorySelector = await page.$(pattern).catch(() => null);
          if (categorySelector) {
            self.log(`   ✅ 카테고리 드롭다운 발견 (page, 폴백): ${pattern}`);
            searchContext = 'page';
            break;
          }
        }
      }

      // ✅ [2026-02-19] 즉시 쿼리 실패 → 짧은 waitForSelector (3초)로 한번만 대기
      if (!categorySelector) {
        const primaryWaitSelector = '[data-click-area="tpb*i.category"], button[aria-label="카테고리 목록 버튼"], [data-testid="seOneCategoryBtn"]';
        categorySelector = await frame.waitForSelector(primaryWaitSelector, { visible: true, timeout: 3000 }).catch(() => null);
        if (categorySelector) {
          self.log(`   ✅ 카테고리 드롭다운 발견 (frame, 대기 후)`);
          searchContext = 'frame';
        } else {
          categorySelector = await page.waitForSelector(primaryWaitSelector, { visible: true, timeout: 2000 }).catch(() => null);
          if (categorySelector) {
            self.log(`   ✅ 카테고리 드롭다운 발견 (page, 대기 후)`);
            searchContext = 'page';
          }
        }
      }

      if (!categorySelector) {
        self.log(`   ⚠️ [시도 ${attempt}/${MAX_RETRIES}] 카테고리 드롭다운 버튼 미발견`);
        if (attempt === MAX_RETRIES) {
          self.log('   💡 기본 카테고리로 진행합니다.');
          await self.debugCategoryElements(frame, page);
        }
        continue;
      }

      // ─── 2단계: 드롭다운 클릭 + 열림 확인 ───
      const ctx0 = searchContext === 'frame' ? frame : page;
      const beforeText = await ctx0.evaluate(
        (el: Element) => (el as HTMLElement).innerText?.trim() || (el as HTMLElement).textContent?.trim() || '', categorySelector
      ).catch(() => '');

      let clickSuccess = false;
      try {
        await categorySelector.click();
        clickSuccess = true;
      } catch {
        self.log('   ⚠️ Puppeteer 클릭 실패, JS 직접 클릭 시도...');
        clickSuccess = await ctx0.evaluate(
          (el: Element) => { try { (el as HTMLElement).click(); return true; } catch { return false; } }, categorySelector
        ).catch(() => false);
      }

      if (!clickSuccess) {
        self.log(`   ⚠️ [시도 ${attempt}/${MAX_RETRIES}] 드롭다운 클릭 실패`);
        await closeCategoryDropdown();
        continue;
      }

      // ─── 3단계: 카테고리 항목 polling (4초) ───
      const categoryItemPatterns = [
        '[data-click-area="tpb*i.category"] ~ [class*="option_list_layer"] li',
        '[data-click-area="tpb*i.category"] ~ * li[class*="item"]',
        '[class*="category"] [class*="option_list_layer"] li',
        '[class*="category"] [class*="option_list_layer"] li[class*="item"]',
        '[class*="category"] li[class*="item__"] button',
        '[class*="option_list_layer"] li[class*="item"]',
        '[class*="option_list_layer"] li',
        '[data-testid^="categoryItemText_"]',
        'ul[class*="category"] li',
      ];

      let categoryItems: any[] = [];
      let usedPattern = '';
      const pollStart = Date.now();
      const POLL_TIMEOUT = 4000;
      const POLL_INTERVAL = 300;

      const NON_CATEGORY_KEYWORDS = ['도움말', '허용', '설정', '안내'];
      const filterNonCategoryItems = async (items: any[], ctx: Frame | Page): Promise<any[]> => {
        const filtered: any[] = [];
        for (const item of items) {
          const text = await ctx.evaluate(
            (el: Element) => (el as HTMLElement).innerText?.trim() || (el as HTMLElement).textContent?.trim() || '', item
          ).catch(() => '');
          const isNonCategory = NON_CATEGORY_KEYWORDS.some(kw => text.includes(kw));
          if (!isNonCategory && text.length > 0) {
            filtered.push(item);
          }
        }
        return filtered;
      };

      while (Date.now() - pollStart < POLL_TIMEOUT) {
        // ✅ [2026-02-19] 전체 타임아웃 가드 (polling 루프 내)
        if (Date.now() - totalStart > TOTAL_TIMEOUT) {
          self.log('📂 [카테고리] polling 중 전체 타임아웃 → 기본 카테고리로 진행');
          await closeCategoryDropdown();
          return;
        }

        const primaryCtx = searchContext === 'frame' ? frame : page;
        const secondaryCtx = searchContext === 'frame' ? page : frame;

        for (const pattern of categoryItemPatterns) {
          let rawItems = await primaryCtx.$$(pattern).catch(() => []);
          if (rawItems.length > 1) {
            categoryItems = await filterNonCategoryItems(rawItems, primaryCtx);
            if (categoryItems.length > 1) {
              usedPattern = pattern;
              break;
            }
          }
        }

        if (categoryItems.length <= 1) {
          for (const pattern of categoryItemPatterns) {
            let rawItems = await secondaryCtx.$$(pattern).catch(() => []);
            if (rawItems.length > 1) {
              categoryItems = await filterNonCategoryItems(rawItems, secondaryCtx);
              if (categoryItems.length > 1) {
                usedPattern = pattern;
                self.log(`   🔄 카테고리 항목을 ${searchContext === 'frame' ? 'page' : 'frame'}에서 발견`);
                searchContext = searchContext === 'frame' ? 'page' : 'frame';
                break;
              }
            }
          }
        }

        if (categoryItems.length > 1) break;
        await self.delay(POLL_INTERVAL);
      }

      if (categoryItems.length === 0) {
        self.log(`   ⚠️ [시도 ${attempt}/${MAX_RETRIES}] 카테고리 항목 0개 — 드롭다운이 안 열렸을 수 있음`);
        // ✅ [2026-03-05 FIX] ESC 대신 모달 내부 클릭으로 드롭다운만 닫기
        await closeCategoryDropdown();
        await self.delay(300);
        continue;
      }

      self.log(`   ✅ 카테고리 항목 ${categoryItems.length}개 발견: ${usedPattern} (${Date.now() - pollStart}ms)`);

      // ─── 4단계: 카테고리 매칭 + 클릭 ───
      const ctx = searchContext === 'frame' ? frame : page;
      let found = false;
      const allCandidates: string[] = [];

      for (const item of categoryItems) {
        const text = await ctx.evaluate(
          (el: Element) => (el as HTMLElement).innerText?.trim() || (el as HTMLElement).textContent?.trim() || '', item
        ).catch(() => '');

        if (!text || text.length < 1) continue;
        allCandidates.push(text);

        const normalizedText = stripCategoryDecorations(text);

        if (
          text === targetName ||
          normalizedText === normalizedTarget ||
          text.includes(targetName) ||
          normalizedText.includes(normalizedTarget) ||
          targetName.includes(text) ||
          normalizedTarget.includes(normalizedText)
        ) {
          let itemClicked = false;
          try {
            await item.click();
            itemClicked = true;
          } catch {
            self.log('   ⚠️ Puppeteer 항목 클릭 실패, JS 직접 클릭 시도...');
            itemClicked = await ctx.evaluate(
              (el: Element) => { try { (el as HTMLElement).click(); return true; } catch { return false; } }, item
            ).catch(() => false);
          }

          if (itemClicked) {
            self.log(`   ✅ 카테고리 "${targetName}" → "${text}" 선택 완료!`);
            found = true;
            await self.delay(500);

            try {
              await self.delay(300);
              const verifySelectors = [...categoryBtnSelectors];
              const afterText = await (searchContext === 'frame' ? frame : page).evaluate(
                (sel: string[]) => {
                  for (const s of sel) {
                    const el = document.querySelector(s);
                    if (el) return (el as HTMLElement).innerText?.trim() || (el as HTMLElement).textContent?.trim() || '';
                  }
                  return '';
                }, verifySelectors
              ).catch(() => '');

              if (afterText && afterText !== beforeText) {
                self.log(`   🎯 선택 확인: 드롭다운 텍스트 "${beforeText}" → "${afterText}"`);
              } else if (afterText === beforeText && beforeText) {
                self.log(`   ℹ️ 드롭다운 텍스트 변경 없음 (이미 선택되어 있었을 수 있음)`);
              }
            } catch {
              // 검증 실패해도 클릭은 성공했으므로 계속 진행
            }

            break;
          }
        }
      }

      if (found) {
        await self.delay(500);
        return;
      }

      self.log(`   ❌ [시도 ${attempt}/${MAX_RETRIES}] 카테고리 "${targetName}" 매칭 실패`);
      self.log(`   📝 발견된 목록: [${allCandidates.join(', ')}]`);

      // ✅ [2026-03-05 FIX] ESC 대신 모달 내부 클릭으로 드롭다운만 닫기
      await closeCategoryDropdown();
      await self.delay(300);

      if (attempt === MAX_RETRIES) {
        self.log(`   💡 ${MAX_RETRIES}회 시도 모두 실패. 기본 카테고리로 발행합니다.`);
        self.log(`   💡 블로그에 "${targetName}" 카테고리가 있는지 확인해주세요.`);
      }
    } catch (catError) {
      self.log(`   ⚠️ [시도 ${attempt}/${MAX_RETRIES}] 카테고리 선택 중 오류: ${(catError as Error).message}`);
      // ✅ [2026-03-05 FIX] 예외 시에도 모달 내부 클릭으로 정리 (ESC 사용 금지)
      await closeCategoryDropdown();
      if (attempt === MAX_RETRIES) {
        self.log('   💡 기본 카테고리로 진행합니다.');
      }
    }
  }
  await self.delay(300);
}

// ── debugCategoryElements ──

// ✅ [2026-02-09] 카테고리 디버그 - 발행 모달의 DOM 구조 로그
export async function debugCategoryElements(self: any, frame: Frame, page: Page): Promise<void> {
  try {
    // frame에서 카테고리 관련 요소 탐색
    const frameInfo = await frame.evaluate(() => {
      const all = document.querySelectorAll('[class*="category"], [data-testid*="category"], [class*="Category"]');
      return Array.from(all).slice(0, 10).map(el => ({
        tag: el.tagName,
        id: el.id,
        className: el.className?.toString()?.substring(0, 80) || '',
        testId: el.getAttribute('data-testid') || '',
        text: (el as HTMLElement).innerText?.substring(0, 50) || '',
      }));
    }).catch(() => []);

    if (frameInfo.length > 0) {
      self.log('   🔍 [frame] 카테고리 관련 요소:');
      frameInfo.forEach((el: any) => {
        self.log(`      <${el.tag}> id="${el.id}" class="${el.className}" testId="${el.testId}" text="${el.text}"`);
      });
    }

    // page에서 카테고리 관련 요소 탐색
    const pageInfo = await page.evaluate(() => {
      const all = document.querySelectorAll('[class*="category"], [data-testid*="category"], [class*="Category"]');
      return Array.from(all).slice(0, 10).map(el => ({
        tag: el.tagName,
        id: el.id,
        className: el.className?.toString()?.substring(0, 80) || '',
        testId: el.getAttribute('data-testid') || '',
        text: (el as HTMLElement).innerText?.substring(0, 50) || '',
      }));
    }).catch(() => []);

    if (pageInfo.length > 0) {
      self.log('   🔍 [page] 카테고리 관련 요소:');
      pageInfo.forEach((el: any) => {
        self.log(`      <${el.tag}> id="${el.id}" class="${el.className}" testId="${el.testId}" text="${el.text}"`);
      });
    }

    if (frameInfo.length === 0 && pageInfo.length === 0) {
      self.log('   🔍 카테고리 관련 DOM 요소를 전혀 찾을 수 없습니다.');
    }
  } catch (err) {
    self.log(`   ⚠️ 카테고리 디버그 실패: ${(err as Error).message}`);
  }
}

// ── setScheduleDateTime ──

/**
 * 날짜/시간 설정 (네이버 UI에 맞춤)
 */
/**
 * 날짜/시간 설정 (수정됨 - 자동으로 3가지 방식 시도)
 */
export async function setScheduleDateTime(self: any, frame: Frame, scheduleDate: string): Promise<void> {
  const [datePart, timePart] = scheduleDate.split(' ');
  let [year, month, day] = datePart.split('-');
  const [hour, minute] = timePart.split(':');
  const page = self.ensurePage();

  self.log(`   📅 입력할 날짜: ${year}년 ${month}월 ${day}일 ${hour}:${minute}`);

  // ✅ [2026-03-21 FIX] 예약 라디오 클릭 후 날짜/시간 입력 필드가 나타날 때까지 충분히 대기
  await self.delay(2500);

  let inputSuccess = false;

  // ✅ 디버깅: 예약 UI에서 모든 input 요소 스캔 (frame + page 양쪽)
  const scanInputsFn = () => {
    const inputs = Array.from(document.querySelectorAll('input, select'));
    return inputs.map(el => ({
      tag: el.tagName,
      type: (el as HTMLInputElement).type || '',
      name: (el as HTMLInputElement).name || '',
      id: el.id || '',
      className: el.className?.substring(0, 80) || '',
      placeholder: (el as HTMLInputElement).placeholder || '',
      value: (el as HTMLInputElement).value || '',
      visible: (el as HTMLElement).offsetParent !== null,
    })).filter(i => i.visible);
  };
  let inputScan = await frame.evaluate(scanInputsFn).catch(() => []);
  if (inputScan.length === 0) {
    self.log(`   ⚠️ frame에서 input 미발견, page에서 재스캔...`);
    inputScan = await page.evaluate(scanInputsFn).catch(() => []);
  }
  self.log(`   🔍 예약 UI input 스캔 결과: ${inputScan.length}개 발견`);
  for (const inp of inputScan) {
    self.log(`      - [${inp.tag}] type=${inp.type} name=${inp.name} id=${inp.id} class=${inp.className.substring(0, 40)} placeholder=${inp.placeholder} value=${inp.value}`);
  }

  // ==========================================
  // ✅ [2026-02-07 FIX] 방법 0 (최우선): 네이버 Smart Editor 전용
  // 네이버 발행 팝업 예약 UI 구조:
  //   날짜: input.input_date__QmA0s (readonly, 달력 선택으로 값 설정)
  //   시: select.hour_option__J_heO (00~23)
  //   분: select.minute_option__Vb3xB (00, 10, 20, 30, 40, 50 - 10분 단위)
  //   발행: button.confirm_btn__WEaBq
  // ==========================================

  // ✅ 분을 10분 단위로 반올림 (네이버 select가 10분 단위만 지원)
  const minuteNum = parseInt(minute, 10);
  const roundedMinute = Math.round(minuteNum / 10) * 10;
  let adjustedHour = hour;
  let adjustedMinute = String(roundedMinute).padStart(2, '0');
  let adjustedDatePart = datePart; // ✅ [BUG-5 FIX] 자정 교차 대비
  if (roundedMinute >= 60) {
    adjustedMinute = '00';
    const newHour = parseInt(hour, 10) + 1;
    adjustedHour = String(newHour % 24).padStart(2, '0');
    // ✅ [2026-03-22 BUG-5 FIX] 자정 교차 시 날짜도 +1일 (23:55 → 00:00 → 다음 날)
    if (newHour >= 24) {
      const nextDay = new Date(`${datePart}T00:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      adjustedDatePart = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
      self.log(`   ⚠️ [BUG-5 FIX] 자정 교차 감지: ${datePart} → ${adjustedDatePart} (시간: ${adjustedHour}:${adjustedMinute})`);
    }
  }
  if (minute !== adjustedMinute) {
    self.log(`   ⏰ 분 반올림: ${minute}분 → ${adjustedMinute}분 (네이버 10분 단위 제한)`);
  }

  // ✅ [BUG-5 FIX] 자정 교차로 날짜가 변경된 경우 year/month/day 재파생
  if (adjustedDatePart !== datePart) {
    [year, month, day] = adjustedDatePart.split('-');
    self.log(`   📅 [BUG-5 FIX] 날짜 변수 갱신: ${year}년 ${month}월 ${day}일`);
  }

  self.log(`   📝 방법 0 (최우선): 네이버 Smart Editor 전용 시간 입력 시도 (${adjustedHour}:${adjustedMinute})`);

  // ✅ [2026-02-08 FIX] Puppeteer 네이티브 select() 사용 (React 호환)
  // frame.evaluate()로 select.value를 직접 설정하면 React 내부 상태에 반영 안됨
  // 또한 발행 모달이 iframe 밖(page 레벨)에 렌더링될 수 있으므로 frame → page 순서로 시도
  const hourSelectorStr = 'select[class*="hour_option"]';
  const minuteSelectorStr = 'select[class*="minute_option"]';

  // ✅ frame과 page 양쪽에서 select 찾기 시도
  const contexts: Array<{ name: string; ctx: any }> = [
    { name: 'frame', ctx: frame },
    { name: 'page', ctx: page },
  ];

  for (const { name, ctx } of contexts) {
    if (inputSuccess) break;

    try {
      const hourSelect = await ctx.$(hourSelectorStr);
      const minuteSelect = await ctx.$(minuteSelectorStr);

      if (hourSelect && minuteSelect) {
        self.log(`   ✅ [${name}] select 드롭다운 발견!`);
        // ✅ option value 포맷 자동 감지 ("0" vs "00", "9" vs "09")
        const hourOptions = await ctx.evaluate((sel: string) => {
          const select = document.querySelector(sel) as HTMLSelectElement;
          if (!select) return [];
          return Array.from(select.options).map(o => o.value);
        }, hourSelectorStr);

        const minuteOptions = await ctx.evaluate((sel: string) => {
          const select = document.querySelector(sel) as HTMLSelectElement;
          if (!select) return [];
          return Array.from(select.options).map(o => o.value);
        }, minuteSelectorStr);

        self.log(`   🔍 시 옵션: [${hourOptions.slice(0, 5).join(', ')}...], 분 옵션: [${minuteOptions.join(', ')}]`);

        // 시(hour) value 매칭: "09" or "9" 형태 모두 대응
        let hourValue = adjustedHour;
        if (!hourOptions.includes(hourValue)) {
          // 패딩 제거 시도 ("09" → "9")
          const unpadded = String(parseInt(hourValue, 10));
          if (hourOptions.includes(unpadded)) {
            hourValue = unpadded;
          }
        }

        // 분(minute) value 매칭: "00" or "0" 형태 모두 대응
        let minuteValue = adjustedMinute;
        if (!minuteOptions.includes(minuteValue)) {
          const unpadded = String(parseInt(minuteValue, 10));
          if (minuteOptions.includes(unpadded)) {
            minuteValue = unpadded;
          }
        }

        self.log(`   📝 시 설정: ${hourValue}, 분 설정: ${minuteValue}`);

        // ✅ Puppeteer select() 사용 - React와 호환되는 유일한 방법
        await ctx.select(hourSelectorStr, hourValue);
        await self.delay(300);
        await ctx.select(minuteSelectorStr, minuteValue);
        await self.delay(300);

        // 설정 결과 확인
        const actualHour = await ctx.evaluate((sel: string) => {
          const select = document.querySelector(sel) as HTMLSelectElement;
          return select?.value || 'N/A';
        }, hourSelectorStr);

        const actualMinute = await ctx.evaluate((sel: string) => {
          const select = document.querySelector(sel) as HTMLSelectElement;
          return select?.value || 'N/A';
        }, minuteSelectorStr);

        self.log(`   ✅ [${name}] 시간 설정 성공: 시=${actualHour}, 분=${actualMinute}`);
        inputSuccess = true;
      } else {
        self.log(`   ⚠️ [${name}] select 드롭다운 미발견 (hour: ${!!hourSelect}, minute: ${!!minuteSelect})`);
      }
    } catch (selectErr) {
      self.log(`   ⚠️ [${name}] select 시도 실패: ${(selectErr as Error).message}`);
    }
  }

  // ✅ [2026-02-18 FIX] 날짜 설정 — 달력 클릭 방식 (React 캘린더 호환) + 재시도 + 검증
  // readonly input이므로 nativeInputValueSetter만으로는 React 내부 상태에 반영 안됨
  // inputSuccess 여부와 무관하게 날짜는 항상 설정 시도
  {
    const targetYearNum = parseInt(year, 10);
    const targetMonthNum = parseInt(month, 10);
    const targetDayNum = parseInt(day, 10);

    // 먼저 오늘 날짜와 비교 — 같은 날이면 날짜 변경 불필요
    const today = new Date();
    const isToday = today.getFullYear() === targetYearNum &&
      (today.getMonth() + 1) === targetMonthNum &&
      today.getDate() === targetDayNum;

    if (isToday) {
      self.log(`   📅 예약 날짜가 오늘이므로 날짜 변경 불필요`);
    } else {
      self.log(`   📅 날짜 변경 필요: 오늘 → ${year}-${month}-${day}`);

      // ✅ [2026-02-18 FIX] 재시도 루프 (최대 3회) — silent catch 제거
      const MAX_DATE_RETRIES = 2; // 0, 1, 2 = 총 3회
      let dateSetSuccess = false;

      for (let dateAttempt = 0; dateAttempt <= MAX_DATE_RETRIES; dateAttempt++) {
        try {
          if (dateAttempt > 0) {
            self.log(`   🔁 날짜 설정 재시도 (${dateAttempt + 1}/${MAX_DATE_RETRIES + 1})`);
            await self.delay(1000);
          }

          // 1단계: 날짜 input 클릭하여 달력 열기 (✅ [2026-03-21 FIX] 재시도 포함)
          const dateInputSelectors = [
            'input[class*="input_date"]',
            'button[class*="calendar"]',
            'button[class*="date"]',
            '[class*="date_area"] input',
            '[class*="date_area"] button',
          ];

          let calendarOpened = false;
          for (let calAttempt = 0; calAttempt < 2 && !calendarOpened; calAttempt++) {
            if (calAttempt > 0) {
              self.log(`   🔁 달력 열기 재시도 (${calAttempt + 1}/2)...`);
              await self.delay(1000);
            }
            for (const sel of dateInputSelectors) {
              const dateEl = await frame.$(sel) || await page.$(sel);
              if (dateEl) {
                await dateEl.click();
                await self.delay(1500);
                // 달력이 실제로 열렸는지 확인
                const calendarVisible = await frame.evaluate(() => {
                  const dp = document.querySelector('.ui-datepicker');
                  return dp && (dp as HTMLElement).offsetParent !== null;
                }).catch(() => false) || await page.evaluate(() => {
                  const dp = document.querySelector('.ui-datepicker');
                  return dp && (dp as HTMLElement).offsetParent !== null;
                }).catch(() => false);
                if (calendarVisible) {
                  calendarOpened = true;
                  self.log(`   📅 달력 열기 성공: ${sel}`);
                  break;
                } else {
                  self.log(`   ⚠️ ${sel} 클릭했으나 달력 미표시, 다음 시도...`);
                }
              }
            }
          }

          if (calendarOpened) {
            {
              // 달력 월 이동 + 날짜 클릭 방식 (네이버는 jQuery 미로드이므로 직접 클릭)

              // 2단계: jQuery UI Datepicker 전용 월 이동
              const calendarNavFn = (tYear: number, tMonth: number, _tDay: number) => {
                const results: string[] = [];

                // jQuery UI Datepicker 전용 셀렉터
                const calendarHeader = document.querySelector('.ui-datepicker-title');
                const headerFallback = !calendarHeader
                  ? document.querySelector('[class*="datepicker"] [class*="title"], [class*="calendar"] [class*="header"]')
                  : null;
                const effectiveHeader = calendarHeader || headerFallback;
                results.push(`calendar header: ${effectiveHeader?.textContent?.trim() || 'not found'}`);

                // jQuery UI: .ui-datepicker-year / .ui-datepicker-month
                const yearSpan = document.querySelector('.ui-datepicker-year');
                const monthSpan = document.querySelector('.ui-datepicker-month');

                let currentYear: number;
                let currentMonth: number;

                if (yearSpan && monthSpan) {
                  currentYear = parseInt(yearSpan.textContent || '', 10);
                  const monthText = monthSpan.textContent || '';
                  const monthNum = monthText.match(/(\d{1,2})/);
                  currentMonth = monthNum ? parseInt(monthNum[1], 10) : (new Date().getMonth() + 1);
                } else {
                  const headerText = effectiveHeader?.textContent || '';
                  const yearMatch = headerText.match(/(\d{4})/);
                  const monthMatch = headerText.match(/(\d{1,2})\s*월/);
                  currentYear = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
                  currentMonth = monthMatch ? parseInt(monthMatch[1], 10) : (new Date().getMonth() + 1);
                }

                results.push(`current: ${currentYear}년 ${currentMonth}월, target: ${tYear}년 ${tMonth}월`);

                const monthDiff = (tYear - currentYear) * 12 + (tMonth - currentMonth);
                results.push(`month diff: ${monthDiff}`);

                // ✅ [2026-03-12 FIX] 월 이동은 1회만 클릭하고 리턴 (외부에서 delay 후 재확인)
                if (monthDiff > 0) {
                  const btn = document.querySelector('.ui-datepicker-next:not(.ui-state-disabled)') as HTMLElement
                    || document.querySelector('a.ui-datepicker-next') as HTMLElement;
                  if (btn) { btn.click(); results.push(`clicked next 1 time (remaining: ${monthDiff - 1})`); }
                  else { results.push(`next button not found`); }
                } else if (monthDiff < 0) {
                  const btn = document.querySelector('.ui-datepicker-prev:not(.ui-state-disabled)') as HTMLElement
                    || document.querySelector('a.ui-datepicker-prev') as HTMLElement;
                  if (btn) { btn.click(); results.push(`clicked prev 1 time (remaining: ${Math.abs(monthDiff) - 1})`); }
                  else { results.push(`prev button not found`); }
                }

                return { results, monthDiff };
              };

              // ✅ [2026-03-21 FIX] 월 이동: 한 번에 1칸씩 이동하고 매번 delay + 재확인
              let remainingMonths = 99; // 초기값 (루프 진입용)
              for (let navStep = 0; navStep < 24 && remainingMonths !== 0; navStep++) {
                let calendarDateSet = await frame.evaluate(calendarNavFn, targetYearNum, targetMonthNum, targetDayNum)
                  .catch(() => null);
                if (!calendarDateSet || calendarDateSet.results.includes('calendar header: not found')) {
                  calendarDateSet = await page.evaluate(calendarNavFn, targetYearNum, targetMonthNum, targetDayNum)
                    .catch((e: any) => ({ results: [e.message], monthDiff: 0 }));
                }

                remainingMonths = calendarDateSet!.monthDiff;
                self.log(`   📅 달력 월 이동 (step ${navStep + 1}): ${calendarDateSet!.results.join(' | ')}`);

                if (remainingMonths !== 0) {
                  await self.delay(500); // ✅ 매 클릭마다 DOM 재렌더 대기
                }
              }

              // ✅ [2026-03-12 FIX] 3단계: 날짜 셀 클릭 — <a> + <button> 양쪽 지원
              // jQuery UI Datepicker 표준: <a class="ui-state-default"> (활성), <span class="ui-state-default"> (비활성)
              // 네이버 커스텀: <button class="ui-state-default"> 일 수 있음
              const dayClickFn = (tDay: number) => {
                // ✅ 방법 1a: jQuery UI 표준 — <a> 태그 (가장 일반적)
                const activeAnchors = Array.from(document.querySelectorAll(
                  '.ui-datepicker td:not(.ui-datepicker-unselectable):not(.ui-state-disabled) a.ui-state-default'
                )).filter(el => el.textContent?.trim() === String(tDay));

                if (activeAnchors.length > 0) {
                  (activeAnchors[0] as HTMLElement).click();
                  return `clicked day ${tDay} via ui-datepicker <a> (${activeAnchors.length} candidates)`;
                }

                // ✅ 방법 1b: 네이버 커스텀 — <button> 태그
                const activeButtons = Array.from(document.querySelectorAll(
                  '.ui-datepicker td:not(.ui-datepicker-unselectable):not(.ui-state-disabled) button.ui-state-default'
                )).filter(el => el.textContent?.trim() === String(tDay));

                if (activeButtons.length > 0) {
                  (activeButtons[0] as HTMLElement).click();
                  return `clicked day ${tDay} via ui-datepicker <button> (${activeButtons.length} candidates)`;
                }

                // ✅ 방법 2: 클래스 무관 — .ui-datepicker 내 모든 클릭 가능한 날짜 요소
                const anyDateElements = Array.from(document.querySelectorAll(
                  '.ui-datepicker td:not(.ui-datepicker-unselectable):not(.ui-state-disabled) > *'
                )).filter(el => {
                  const text = el.textContent?.trim();
                  if (text !== String(tDay)) return false;
                  const tag = el.tagName.toLowerCase();
                  return tag === 'a' || tag === 'button' || tag === 'span';
                });

                if (anyDateElements.length > 0) {
                  (anyDateElements[0] as HTMLElement).click();
                  return `clicked day ${tDay} via generic selector (${anyDateElements.length} candidates, tag: ${anyDateElements[0].tagName})`;
                }

                // ✅ 방법 3: 최종 폴백 — jQuery UI 없는 달력 대비
                const fallbackCells = Array.from(document.querySelectorAll(
                  'table td a, table td button, [class*="datepicker"] td a, [class*="datepicker"] td button, [class*="calendar"] td a, [class*="calendar"] td button'
                )).filter(el => {
                  const text = el.textContent?.trim();
                  if (text !== String(tDay)) return false;
                  const parentTd = el.closest('td');
                  if (parentTd?.classList.contains('ui-state-disabled')) return false;
                  if (parentTd?.classList.contains('ui-datepicker-unselectable')) return false;
                  return true;
                });

                if (fallbackCells.length > 0) {
                  (fallbackCells[0] as HTMLElement).click();
                  return `clicked day ${tDay} via table fallback (${fallbackCells.length} candidates, tag: ${fallbackCells[0].tagName})`;
                }

                // 디버그 정보 수집
                const allTds = document.querySelectorAll('.ui-datepicker td');
                const tdInfo = Array.from(allTds).slice(0, 3).map(td => {
                  const child = td.firstElementChild;
                  return `td.${td.className}>${child?.tagName}.${child?.className}="${child?.textContent?.trim()}"`;
                }).join('; ');
                return `day ${tDay} not found (${allTds.length} tds, sample: ${tdInfo})`;
              };

              let dayClicked = await frame.evaluate(dayClickFn, targetDayNum).catch((e: any) => `frame error: ${e.message}`);
              if (dayClicked.includes('not found') || dayClicked.includes('error')) {
                dayClicked = await page.evaluate(dayClickFn, targetDayNum).catch((e: any) => `page error: ${e.message}`);
              }

              self.log(`   📅 달력 날짜 클릭: ${dayClicked}`);
              await self.delay(500);
            }
          }

          // 폴백: 달력이 안 열렸거나 클릭 실패 시 nativeInputValueSetter 시도 (frame + page)
          const dateFallbackFn = (targetYear: string, targetMonth: string, targetDay: string) => {
            const dateTextInput = document.querySelector('input[class*="input_date"]') as HTMLInputElement;
            if (dateTextInput) {
              const currentValue = dateTextInput.value;
              const expectedDate = `${targetYear}. ${targetMonth}. ${targetDay}`;
              // ✅ [2026-02-18 FIX] year + month + day 모두 검증 (기존에는 month 누락)
              if (currentValue.includes(targetYear) && currentValue.includes(targetMonth) && currentValue.includes(targetDay)) {
                return `date already correct: ${currentValue}`;
              }
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
              )?.set;
              if (nativeInputValueSetter) {
                nativeInputValueSetter.call(dateTextInput, expectedDate);
              } else {
                dateTextInput.value = expectedDate;
              }
              dateTextInput.dispatchEvent(new Event('input', { bubbles: true }));
              dateTextInput.dispatchEvent(new Event('change', { bubbles: true }));
              dateTextInput.dispatchEvent(new Event('blur', { bubbles: true }));
              return `date fallback set: ${expectedDate} (actual: ${dateTextInput.value})`;
            }
            return 'date input not found';
          };
          let dateResult = await frame.evaluate(dateFallbackFn, year, month, day);
          if (dateResult === 'date input not found') {
            dateResult = await page.evaluate(dateFallbackFn, year, month, day);
          }
          self.log(`   📅 날짜 결과: ${dateResult}`);

          // ✅ [2026-02-18 FIX] 날짜 설정 검증 — year + month + day 모두 확인
          const verifyDateFn = (tYear: string, tMonth: string, tDay: string) => {
            const dateInput = document.querySelector('input[class*="input_date"]') as HTMLInputElement;
            if (!dateInput) return { ok: false, value: '(input not found)', reason: 'input not found' };
            const v = dateInput.value;
            const hasYear = v.includes(tYear);
            const hasMonth = v.includes(tMonth);
            const hasDay = v.includes(tDay);
            return { ok: hasYear && hasMonth && hasDay, value: v, reason: `year=${hasYear},month=${hasMonth},day=${hasDay}` };
          };
          let verifyResult = await frame.evaluate(verifyDateFn, year, month, day).catch(() => ({ ok: false, value: '(eval error)', reason: 'frame eval error' }));
          if (!verifyResult.ok) {
            const pageVerify = await page.evaluate(verifyDateFn, year, month, day).catch(() => ({ ok: false, value: '(eval error)', reason: 'page eval error' }));
            if (pageVerify.ok) verifyResult = pageVerify;
          }

          if (verifyResult.ok) {
            self.log(`   ✅ 날짜 설정 검증 성공: UI="${verifyResult.value}", 목표="${year}-${month}-${day}"`);
            dateSetSuccess = true;
            break; // 재시도 루프 탈출
          } else {
            self.log(`   ⚠️ 날짜 설정 검증 실패 (시도 ${dateAttempt + 1}/${MAX_DATE_RETRIES + 1}): UI="${verifyResult.value}", 목표="${year}-${month}-${day}" (${verifyResult.reason})`);
          }
        } catch (dateErr) {
          self.log(`   ⚠️ 날짜 설정 에러 (시도 ${dateAttempt + 1}/${MAX_DATE_RETRIES + 1}): ${(dateErr as Error).message}`);
        }
      }

      // ✅ [2026-02-18 FIX] 모든 재시도 실패 시 에러 throw (기존: 조용히 오늘 날짜로 진행)
      if (!dateSetSuccess) {
        throw new Error(`예약 날짜 설정 실패: 목표 ${year}-${month}-${day} (${MAX_DATE_RETRIES + 1}회 시도 후 UI 검증 실패)`);
      }
    }
  }

  // ✅ 방법 0 실패 시 기존 evaluate 폴백
  if (!inputSuccess) {
    self.log(`   ⚠️ 방법 0 실패, 기존 evaluate 폴백 시도...`);
    const naverResult = await frame.evaluate((targetYear: string, targetMonth: string, targetDay: string, targetHour: string, targetMinute: string) => {
      const results: string[] = [];
      let timeSet = false;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;

      function setInputValue(input: HTMLInputElement, value: string): boolean {
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(input, value);
        } else {
          input.value = value;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      }

      // 날짜/시간 입력 시도
      const dateInputs = Array.from(document.querySelectorAll('input')).filter(el => {
        const input = el as HTMLInputElement;
        const htmlEl = el as HTMLElement;
        return (input.type === 'date' || input.type === 'datetime-local') && htmlEl.offsetParent !== null;
      });

      if (dateInputs.length > 0) {
        const dateInput = dateInputs[0] as HTMLInputElement;
        if (dateInput.type === 'datetime-local') {
          setInputValue(dateInput, `${targetYear}-${targetMonth}-${targetDay}T${targetHour}:${targetMinute}`);
          results.push(`datetime-local: ${dateInput.value}`);
          timeSet = true;
        } else {
          setInputValue(dateInput, `${targetYear}-${targetMonth}-${targetDay}`);
          results.push(`date: ${dateInput.value}`);
        }
      }

      return { count: results.length, details: results, timeSet };
    }, year, month, day, adjustedHour, adjustedMinute).catch((err) => ({ count: 0, details: [`Error: ${err.message}`], timeSet: false }));

    if (naverResult.timeSet) {
      inputSuccess = true;
      self.log(`   ✅ evaluate 폴백 성공: ${naverResult.details.join(', ')}`);
    } else {
      self.log(`   ⚠️ evaluate 폴백 결과: ${naverResult.details.join(', ')}`);
    }
  }

  // 방법 1: datetime-local input (일반적인 HTML5 방식)
  // ✅ [2026-03-24 FIX] 반올림된 시간 사용 + frame/page 양쪽 탐색
  if (!inputSuccess) {
    let dateTimeInput = await frame.waitForSelector('input[type="datetime-local"]', {
      visible: true,
      timeout: 2000
    }).catch(() => null);
    if (!dateTimeInput) {
      dateTimeInput = await page.waitForSelector('input[type="datetime-local"]', {
        visible: true,
        timeout: 1000
      }).catch(() => null);
    }

    if (dateTimeInput) {
      const dateTimeValue = `${year}-${month}-${day}T${adjustedHour}:${adjustedMinute}`;
      self.log(`   📝 방법 1: datetime-local 입력 시도 (${dateTimeValue})`);

      const ctx = dateTimeInput;
      await (ctx as any).evaluate((el: Element, value: string) => {
        const input = el as HTMLInputElement;
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(input, value);
        } else {
          input.value = value;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, dateTimeValue);

      await self.delay(300);
      self.log(`   ✅ 방법 1 성공: 날짜/시간 입력 완료 (datetime-local: ${dateTimeValue})`);
      inputSuccess = true;
    }
  }

  // 방법 2: date + time 분리
  // ✅ [2026-03-24 FIX] 반올림된 시간 사용 + frame/page 양쪽 탐색
  if (!inputSuccess) {
    let dateInput = await frame.$('input[type="date"]').catch(() => null);
    let timeInput = await frame.$('input[type="time"]').catch(() => null);
    if (!dateInput || !timeInput) {
      dateInput = await page.$('input[type="date"]').catch(() => null);
      timeInput = await page.$('input[type="time"]').catch(() => null);
    }

    if (dateInput && timeInput) {
      const dateValue = `${year}-${month}-${day}`;
      const timeValue = `${adjustedHour}:${adjustedMinute}`;
      self.log(`   📝 방법 2: date + time 분리 입력 시도 (${dateValue} ${timeValue})`);

      const setInputFn = (dateEl: Element, timeEl: Element, dv: string, tv: string) => {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set;
        const di = dateEl as HTMLInputElement;
        const ti = timeEl as HTMLInputElement;

        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(di, dv);
          nativeInputValueSetter.call(ti, tv);
        } else {
          di.value = dv;
          ti.value = tv;
        }
        di.dispatchEvent(new Event('input', { bubbles: true }));
        di.dispatchEvent(new Event('change', { bubbles: true }));
        ti.dispatchEvent(new Event('input', { bubbles: true }));
        ti.dispatchEvent(new Event('change', { bubbles: true }));
      };

      // dateInput과 timeInput이 같은 context에 있으므로 해당 context에서 evaluate
      for (const ctx of [frame, page]) {
        try {
          const dEl = await ctx.$('input[type="date"]');
          const tEl = await ctx.$('input[type="time"]');
          if (dEl && tEl) {
            await ctx.evaluate(setInputFn, dEl, tEl, dateValue, timeValue);
            await self.delay(300);
            self.log(`   ✅ 방법 2 성공: 날짜/시간 입력 완료 (date: ${dateValue}, time: ${timeValue})`);
            inputSuccess = true;
            break;
          }
        } catch { /* 다음 context 시도 */ }
      }
    }
  }

  // ✅ 모든 방법 실패 시 에러 + 스크린샷
  if (!inputSuccess) {
    self.log(`   ❌ 모든 날짜/시간 입력 방법 실패!`);
    self.log(`   📋 input 스캔 결과: ${JSON.stringify(inputScan.slice(0, 5))}`);

    // 디버깅 스크린샷 저장
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = `./error-schedule-datetime-${timestamp}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      self.log(`   📸 디버깅 스크린샷 저장: ${screenshotPath}`);
    } catch { }

    throw new Error(`예약 날짜/시간 입력 실패: 날짜/시간 입력 필드를 찾을 수 없습니다. 네이버 에디터 UI가 변경되었을 수 있습니다. 로그의 input 스캔 결과를 확인하세요.`);
  }
}

// ── debugPublishModal ──

/**
 * 발행 모달 디버깅 (네이버 UI 구조 파악)
 */
export async function debugPublishModal(self: any): Promise<void> {
  const frame = (await self.getAttachedFrame());
  const page = self.ensurePage();

  self.log('🔍 발행 모달 디버깅 시작...');

  try {
    // 1. 모달 HTML 전체 덤프
    const modalHtml = await frame.evaluate(() => {
      const modals = document.querySelectorAll('[role="dialog"], .modal, [class*="modal"], [class*="publish"], [class*="layer"]');
      return Array.from(modals).map((m, idx) => {
        return `=== 모달 ${idx + 1} ===\n${m.outerHTML}\n`;
      }).join('\n\n');
    });

    console.log('=== 발행 모달 HTML 구조 ===');
    console.log(modalHtml);

    // 2. 모든 라디오 버튼 찾기
    const radioButtons = await frame.evaluate(() => {
      const radios = document.querySelectorAll('input[type="radio"]');
      return Array.from(radios).map(r => ({
        value: r.getAttribute('value'),
        name: r.getAttribute('name'),
        id: r.getAttribute('id'),
        checked: (r as HTMLInputElement).checked,
        labelText: r.parentElement?.textContent?.trim() || '',
      }));
    });

    console.log('=== 라디오 버튼 목록 ===');
    console.table(radioButtons);

    // 3. 모든 버튼 찾기
    const buttons = await frame.evaluate(() => {
      const btns = document.querySelectorAll('button');
      return Array.from(btns).map(b => ({
        text: b.textContent?.trim() || '',
        className: b.className,
        dataAttrs: Object.fromEntries(
          Array.from(b.attributes)
            .filter(a => a.name.startsWith('data-'))
            .map(a => [a.name, a.value])
        ),
      }));
    });

    console.log('=== 버튼 목록 ===');
    console.table(buttons);

    // 4. 모든 레이블 찾기
    const labels = await frame.evaluate(() => {
      const lbls = document.querySelectorAll('label, span');
      return Array.from(lbls)
        .filter(l => l.textContent?.includes('예약') || l.textContent?.includes('발행'))
        .map(l => ({
          tag: l.tagName,
          text: l.textContent?.trim() || '',
          className: l.className,
          htmlFor: l.getAttribute('for') || '',
        }));
    });

    console.log('=== 예약/발행 관련 레이블 ===');
    console.table(labels);

    // 5. 스크린샷 저장
    await page.screenshot({
      path: 'publish-modal-debug.png',
      fullPage: true
    });
    self.log('✅ 스크린샷 저장: publish-modal-debug.png');

  } catch (error: any) {
    self.log(`❌ 디버깅 실패: ${(error as Error).message}`);
  }
}

// ── publishScheduled ──

/**
 * 네이버 블로그 예약발행 (완벽 수정 버전 - 자동으로 최적 방식 선택)
 */
export async function publishScheduled(self: any, scheduleDate: string): Promise<void> {
  const frame = (await self.getAttachedFrame());
  const page = self.ensurePage();

  self.log(`📅 예약발행 시작: ${scheduleDate}`);

  try {
    // ✅ 날짜 유효성 검증
    self.validateScheduleDate(scheduleDate);

    // 1단계: 발행 버튼 클릭 (✅ [2026-03-24 FIX] 재시도 + 모달 열림 확인 강화)
    self.log('📌 1단계: 발행 모달 열기');
    const publishBtnSelectors = [
      'button[data-click-area="tpb.publish"]',
      'button.publish_btn__m9KHH[data-click-area="tpb.publish"]',
      'button.publish_btn__m9KHH',
    ];

    // ✅ 발행 버튼 찾기: frame + page 양쪽
    let publishButton = await self.waitForAnySelector(frame, publishBtnSelectors, 10000);
    if (!publishButton) {
      self.log('⚠️ frame에서 발행 버튼 미발견, page에서 재시도...');
      publishButton = await self.waitForAnySelectorPage(page, publishBtnSelectors, 5000);
    }
    // ✅ 텍스트 기반 폴백
    if (!publishButton) {
      self.log('⚠️ 셀렉터 실패 → 텍스트 기반 발행 버튼 탐색...');
      for (const ctx of [frame, page]) {
        publishButton = await ctx.evaluateHandle(() => {
          const buttons = document.querySelectorAll('button');
          for (const btn of buttons) {
            const text = (btn.textContent || '').trim();
            if (text === '발행' && btn.getBoundingClientRect().width > 0) return btn;
          }
          return null;
        }).catch(() => null);
        if (publishButton) {
          const isEl = await publishButton.evaluate((el: any) => el instanceof HTMLElement).catch(() => false);
          if (isEl) break;
          publishButton = null;
        }
      }
    }

    if (!publishButton) {
      await page.screenshot({ path: 'error-no-publish-btn.png', fullPage: true }).catch(() => {});
      throw new Error('발행 버튼을 찾을 수 없습니다. 스크린샷을 확인하세요.');
    }

    // ✅ [2026-03-24 FIX] 발행 모달 열기 재시도 (최대 3회)
    const modalIndicatorSelectors = [
      'input#radio_time1',
      'input#radio_time2',
      'input[name="radio_time"]',
      '[data-click-area="tpb*i.category"]',
      'button[data-testid="seOnePublishBtn"]',
      'button[data-click-area="tpb*i.publish"]',
    ];
    let modalOpened = false;
    const MAX_MODAL_CLICKS = 3;

    for (let mAttempt = 1; mAttempt <= MAX_MODAL_CLICKS; mAttempt++) {
      self.log(`📌 발행 모달 열기 시도 ${mAttempt}/${MAX_MODAL_CLICKS}...`);
      await publishButton.click();

      const waitTimeout = 3000 + (mAttempt - 1) * 2000;
      for (const sel of modalIndicatorSelectors) {
        const el = await frame.waitForSelector(sel, { visible: true, timeout: waitTimeout }).catch(() => null)
          || await page.waitForSelector(sel, { visible: true, timeout: 1000 }).catch(() => null);
        if (el) {
          modalOpened = true;
          self.log(`   ✅ 발행 모달 열림 확인 (${sel})`);
          break;
        }
      }
      if (modalOpened) break;
      if (mAttempt < MAX_MODAL_CLICKS) {
        self.log(`   ⚠️ 모달 미열림, ${mAttempt + 1}번째 시도...`);
        await self.delay(1500);
      }
    }
    if (!modalOpened) {
      self.log('⚠️ 모달 열림 확인 실패 — 그래도 진행합니다 (3초 대기)');
      await self.delay(3000);
    }
    self.log('✅ 발행 모달 열림');

    // ✅ [2026-02-09] 카테고리 자동 선택 (공통 메서드 사용)
    await self.selectCategoryInPublishModal(frame, page);

    // 2단계: 예약발행 라디오 버튼 선택 (정확한 셀렉터!)
    self.log('📌 2단계: 예약발행 옵션 선택');

    const scheduleRadioSelectors = [
      'input#radio_time2',  // ✅ 가장 확실함!
      'input[name="radio_time"][value="pre"]',
      'input[type="radio"][value="pre"]',
      'label[for="radio_time2"]',  // 레이블 클릭도 가능
    ];
    // ✅ [2026-03-24 FIX] frame + page 양쪽에서 찾기
    let scheduleRadio = await self.waitForAnySelector(frame, scheduleRadioSelectors, 5000);
    if (!scheduleRadio) {
      self.log('⚠️ frame에서 예약 라디오 버튼 미발견, page에서 재시도...');
      scheduleRadio = await self.waitForAnySelectorPage(page, scheduleRadioSelectors, 5000);
    }
    // ✅ [2026-03-24 FIX] 텍스트 기반 폴백 — '예약' 텍스트가 포함된 label 또는 라디오 찾기
    if (!scheduleRadio) {
      self.log('⚠️ 셀렉터 실패 → 텍스트 기반 예약 라디오 탐색...');
      for (const ctx of [frame, page]) {
        scheduleRadio = await ctx.evaluateHandle(() => {
          // 방법 1: label 텍스트로 찾기
          const labels = document.querySelectorAll('label');
          for (const label of labels) {
            const text = (label.textContent || '').trim();
            if (text.includes('예약') && label.getBoundingClientRect().width > 0) {
              return label;
            }
          }
          // 방법 2: 두 번째 radio_time 찾기 (첫 번째=즉시, 두 번째=예약)
          const radios = document.querySelectorAll('input[name="radio_time"]');
          if (radios.length >= 2) return radios[1];
          return null;
        }).catch(() => null);
        if (scheduleRadio) {
          const isEl = await scheduleRadio.evaluate((el: any) => el instanceof HTMLElement).catch(() => false);
          if (isEl) {
            self.log('✅ 텍스트 기반 예약 라디오 발견!');
            break;
          }
          scheduleRadio = null;
        }
      }
    }

    if (!scheduleRadio) {
      await page.screenshot({ path: 'error-no-schedule-radio.png', fullPage: true }).catch(() => {});
      throw new Error('예약 라디오 버튼을 찾을 수 없습니다.');
    }

    // 라디오 버튼 클릭
    try {
      await scheduleRadio.click();
      self.log('✅ 라디오 버튼 클릭 성공');
    } catch {
      // ✅ [2026-02-09 FIX] 레이블 클릭도 frame + page 양쪽 시도
      const label = await frame.$('label[for="radio_time2"]') || await page.$('label[for="radio_time2"]');
      if (label) {
        await label.click();
        self.log('✅ 레이블 클릭 성공');
      }
    }

    // ✅ [2026-03-21 FIX] 중요: 예약 UI가 나타날 때까지 충분히 대기!
    await self.delay(3000);

    // ✅ [2026-02-09 FIX] 예약 라디오 버튼이 실제로 선택되었는지 검증 (frame + page 양쪽)
    const radioCheckFn = () => {
      const radioTime2 = document.querySelector('input#radio_time2') as HTMLInputElement;
      if (radioTime2) return radioTime2.checked;
      const radioButtons = document.querySelectorAll('input[name="radio_time"]');
      for (const rb of Array.from(radioButtons)) {
        const radio = rb as HTMLInputElement;
        if (radio.value === 'pre' && radio.checked) return true;
      }
      return false;
    };
    let isScheduleRadioSelected = await frame.evaluate(radioCheckFn).catch(() => false);
    if (!isScheduleRadioSelected) {
      isScheduleRadioSelected = await page.evaluate(radioCheckFn).catch(() => false);
    }

    if (!isScheduleRadioSelected) {
      self.log('⚠️ 예약 라디오 버튼이 선택되지 않았습니다. JavaScript로 직접 선택 시도...');

      const radioSetFn = () => {
        const radioTime2 = document.querySelector('input#radio_time2') as HTMLInputElement;
        if (radioTime2) {
          radioTime2.checked = true;
          radioTime2.dispatchEvent(new Event('change', { bubbles: true }));
          radioTime2.dispatchEvent(new Event('click', { bubbles: true }));
          return true;
        }
        const preRadio = document.querySelector('input[name="radio_time"][value="pre"]') as HTMLInputElement;
        if (preRadio) {
          preRadio.checked = true;
          preRadio.dispatchEvent(new Event('change', { bubbles: true }));
          preRadio.dispatchEvent(new Event('click', { bubbles: true }));
          return true;
        }
        return false;
      };
      // frame + page 양쪽에서 시도
      let setResult = await frame.evaluate(radioSetFn).catch(() => false);
      if (!setResult) {
        setResult = await page.evaluate(radioSetFn).catch(() => false);
      }
      await self.delay(1500);

      // 재확인
      let isNowSelected = await frame.evaluate(radioCheckFn).catch(() => false);
      if (!isNowSelected) isNowSelected = await page.evaluate(radioCheckFn).catch(() => false);

      if (isNowSelected) {
        self.log('✅ JavaScript로 예약 라디오 버튼 선택 성공');
      } else {
        await page.screenshot({ path: 'error-schedule-radio-not-selected.png', fullPage: true });
        throw new Error('예약 라디오 버튼을 선택할 수 없습니다. 네이버 UI가 변경되었을 수 있습니다.');
      }
    }

    self.log('✅ 예약발행 옵션 선택됨, 날짜/시간 UI 대기 중...');

    // 3단계: 날짜/시간 입력 (자동으로 3가지 방식 시도)
    self.log('📌 3단계: 날짜/시간 설정 (자동으로 최적 방식 선택)');
    await self.setScheduleDateTime(frame, scheduleDate);

    // ✅ [2026-02-18 FIX] 날짜/시간 설정 후 UI 상태 진단 로그
    await self.delay(1000);
    try {
      const diagResult = await frame.evaluate(() => {
        const dateInput = document.querySelector('input[class*="input_date"]') as HTMLInputElement;
        const hourSelect = document.querySelector('select[class*="hour_option"]') as HTMLSelectElement;
        const minuteSelect = document.querySelector('select[class*="minute_option"]') as HTMLSelectElement;
        return {
          date: dateInput?.value || 'N/A',
          hour: hourSelect?.value || 'N/A',
          minute: minuteSelect?.value || 'N/A',
        };
      }).catch(() => ({ date: 'eval-error', hour: 'eval-error', minute: 'eval-error' }));
      self.log(`🔍 [진단] setScheduleDateTime 완료 → UI 실제값: 날짜="${diagResult.date}", 시="${diagResult.hour}", 분="${diagResult.minute}"`);
      self.log(`🔍 [진단] 목표 scheduleDate: "${scheduleDate}"`);
    } catch (diagErr) {
      self.log(`🔍 [진단] UI 상태 확인 실패: ${(diagErr as Error).message}`);
    }

    // 4단계: 확인 버튼 클릭
    self.log('📌 4단계: 예약발행 확인');

    // ✅ [2026-03-24 FIX] 확인 버튼 — frame + page 양쪽 + 텍스트 폴백
    const confirmSelectors = [
      'button[data-testid="seOnePublishBtn"]',
      'button[data-click-area="tpb*i.publish"]',
      'button.confirm_btn__WEaBq',
    ];
    let confirmButton = await self.waitForAnySelector(frame, confirmSelectors, 5000);
    if (!confirmButton) {
      self.log('⚠️ frame에서 확인 버튼 미발견, page에서 재시도...');
      confirmButton = await self.waitForAnySelectorPage(page, confirmSelectors, 5000);
    }
    // ✅ [2026-03-24 FIX] 텍스트 기반 폴백
    if (!confirmButton) {
      self.log('⚠️ 셀렉터 실패 → 텍스트 기반 확인 버튼 탐색...');
      for (const ctx of [frame, page]) {
        confirmButton = await ctx.evaluateHandle(() => {
          const buttons = document.querySelectorAll('button');
          for (const btn of buttons) {
            const text = (btn.textContent || '').trim();
            if ((text === '발행' || text === '확인' || text.includes('예약발행')) && !btn.hasAttribute('disabled')) {
              const rect = btn.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) return btn;
            }
          }
          return null;
        }).catch(() => null);
        if (confirmButton) {
          const isEl = await confirmButton.evaluate((el: any) => el instanceof HTMLElement).catch(() => false);
          if (isEl) {
            self.log('✅ 텍스트 기반 확인 버튼 발견!');
            break;
          }
          confirmButton = null;
        }
      }
    }

    if (!confirmButton) {
      await page.screenshot({ path: 'error-no-confirm-btn.png', fullPage: true }).catch(() => {});

      // 디버깅: frame + page 모든 버튼 찾기
      const scanButtons = () => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons
          .filter(b => b.textContent?.includes('발행') || b.textContent?.includes('확인'))
          .map(b => ({
            text: b.textContent?.trim(),
            className: b.className,
            testId: b.getAttribute('data-testid'),
          }));
      };
      const frameButtons = await frame.evaluate(scanButtons).catch(() => []);
      const pageButtons = await page.evaluate(scanButtons).catch(() => []);
      self.log(`🔍 발행/확인 버튼 목록 (frame): ${JSON.stringify(frameButtons)}`);
      self.log(`🔍 발행/확인 버튼 목록 (page): ${JSON.stringify(pageButtons)}`);

      throw new Error('확인 버튼을 찾을 수 없습니다. 스크린샷을 확인하세요.');
    }

    await confirmButton.click();
    await self.delay(2000);

    self.log(`✅ 블로그 글이 예약발행되었습니다: ${scheduleDate}`);

    // 예약 완료 후 URL 로깅
    try {
      const pageUrl = page.url();
      if (pageUrl && /blog\.naver\.com/i.test(pageUrl)) {
        self.log(`POST_URL_SCHEDULED: ${pageUrl} @ ${scheduleDate}`);
      } else {
        self.log(`POST_URL_SCHEDULED: (예약 완료, URL 미확정) @ ${scheduleDate}`);
      }
    } catch { }

  } catch (error: any) {
    self.log(`❌ 예약발행 실패: ${(error as Error).message}`);

    // ✅ 에러 발생 시 자동으로 스크린샷 저장
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = `./error-schedule-${timestamp}.png`;

      await page.screenshot({
        path: screenshotPath,
        fullPage: true
      });

      self.log(`📸 에러 스크린샷 저장됨: ${screenshotPath}`);
    } catch (screenshotError) {
      self.log('⚠️ 스크린샷 저장 실패 (무시됨)');
    }

    await page.keyboard.press('Escape').catch(() => { });
    throw error;
  }
}

// ── publishBlogPost ──

export async function publishBlogPost(self: any, mode: PublishMode, scheduleDate?: string, scheduleMethod: 'datetime-local' | 'individual-inputs' = 'datetime-local'): Promise<void> {
  // ✅ [2026-02-07 FIX] 발행 모드 명시적 로깅 (디버깅용)
  self.log(`📋 publishBlogPost 호출됨 → mode: "${mode}", scheduleDate: "${scheduleDate || 'undefined'}", scheduleMethod: "${scheduleMethod}"`);
  // ✅ [2026-02-16 DEBUG] 카테고리 이름 확인
  console.log(`[publishBlogPost] 📂 self.options.categoryName: "${self.options.categoryName || '(없음)'}"`);
  self.log(`📂 현재 카테고리: "${self.options.categoryName || '(미설정)'}"`);
  await self.retry(async () => {
    const frame = (await self.getAttachedFrame());
    self.ensureNotCancelled();

    // ✅ [2026-01-22 FIX] 발행 직전 모든 이미지에 '문서 너비' 적용 (버튼 클릭 방식)
    try {
      self.log('🖼️ 발행 전 모든 이미지에 문서 너비 적용 중...');

      // 모든 이미지 요소 찾기
      const imageElements = await frame.$$('img.se-image-resource, .se-module-image img, .se-component-image img');

      if (imageElements.length > 0) {
        self.log(`   📷 ${imageElements.length}개 이미지 발견, 문서 너비 적용 시작...`);

        let appliedCount = 0;
        const imageWidthStartTime = Date.now();
        const IMAGE_WIDTH_TIMEOUT = 10000; // 10초 제한
        for (let i = 0; i < imageElements.length; i++) {
          // ✅ [2026-02-17] 타임아웃 가드: 이미지 너비 적용이 너무 오래 걸리면 중단
          if (Date.now() - imageWidthStartTime > IMAGE_WIDTH_TIMEOUT) {
            self.log(`   ⏱️ 이미지 너비 적용 시간 초과 (${i}/${imageElements.length}개 완료, 10초 제한). 나머지 건너뜁니다.`);
            break;
          }
          try {
            // 1. 이미지 클릭하여 선택
            await imageElements[i].click();
            await self.delay(300);

            // 2. 문서 너비 버튼 찾기 및 클릭
            // 버튼이 이미 '문서 너비' 상태인지 확인 (se-object-arrangement-fit-toolbar-button 클래스 존재 여부)
            const fitButton = await frame.$('button[data-value="fit"][data-name="content-mode-without-pagefull"], button.se-object-arrangement-fit-toolbar-button[data-value="fit"]');

            if (fitButton) {
              // 버튼이 이미 활성화 상태인지 확인
              const isAlreadyActive = await frame.evaluate((btn: Element) => {
                return btn.classList.contains('se-toolbar-button-active') ||
                  btn.getAttribute('aria-pressed') === 'true';
              }, fitButton);

              if (!isAlreadyActive) {
                await fitButton.click();
                await self.delay(200);
                self.log(`   ✅ ${i + 1}/${imageElements.length} 이미지 문서 너비 적용`);
              } else {
                self.log(`   ⏭️ ${i + 1}/${imageElements.length} 이미지 이미 문서 너비 상태`);
              }
              appliedCount++;
            } else {
              // 폴백: CSS 스타일로 직접 적용
              await frame.evaluate((imgEl: Element) => {
                const img = imgEl as HTMLImageElement;
                let el: HTMLElement | null = img;
                while (el && el !== document.body) {
                  if (el.classList.contains('se-section') || el.classList.contains('se-module') || el.classList.contains('se-component')) {
                    el.classList.remove('se-l-left', 'se-l-right', 'se-l-original');
                    el.classList.add('se-l-default');
                    el.style.width = '100%';
                    el.style.maxWidth = '100%';
                    el.setAttribute('data-size', 'document-width');
                  }
                  el = el.parentElement;
                }
                img.style.width = '100%';
                img.style.maxWidth = '100%';
                img.style.height = 'auto';
              }, imageElements[i]);
              self.log(`   ⚠️ ${i + 1}/${imageElements.length} 이미지 CSS 폴백 적용`);
              appliedCount++;
            }

            // 이미지 선택 해제 (다른 곳 클릭)
            await frame.click('body').catch(() => { });
            await self.delay(100);
          } catch (imgErr) {
            self.log(`   ⚠️ ${i + 1}/${imageElements.length} 이미지 처리 중 오류 (무시): ${(imgErr as Error).message}`);
          }
        }

        if (appliedCount > 0) {
          self.log(`   ✅ ${appliedCount}개 이미지에 문서 너비 적용 완료`);
        }
      } else {
        self.log('   ℹ️ 적용할 이미지가 없습니다.');
      }

      await self.delay(300);
    } catch (imgError) {
      self.log(`   ⚠️ 이미지 문서 너비 적용 중 오류 (계속 진행): ${(imgError as Error).message}`);
    }

    if (mode === 'draft') {
      self.log('🔄 블로그 글 임시저장 중...');
      // 임시저장 버튼 찾기 (제공된 셀렉터 사용)
      const saveButtonSelectors = [
        'button.save_btn__bzc5B[data-click-area="tpb.save"]',
        'button.save_btn__bzc5B',
        'button[data-click-area="tpb.save"]',
      ];

      let saveButton: ElementHandle<Element> | null = null;
      for (const selector of saveButtonSelectors) {
        saveButton = await frame.waitForSelector(selector, { visible: true, timeout: 3000 }).catch((error: any) => {
          self.log(`⚠️ [저장 버튼 찾기] 실패 (${selector}): ${(error as Error).message}`);
          return null;
        });
        if (saveButton) break;
      }

      if (!saveButton) {
        throw new Error('저장 버튼을 찾을 수 없습니다.');
      }

      // 순차 실행: 클릭 먼저, 그 다음 네비게이션 대기
      await saveButton.click();
      await self.delay(self.DELAYS.MEDIUM); // 클릭 후 안정화 대기
      await frame.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => undefined);

      self.log('✅ 블로그 글이 임시저장되었습니다.');
    } else if (mode === 'publish') {
      self.log('🔄 블로그 글 즉시발행 중...');

      // ✅ 발행 버튼 찾기 (안정적인 data-* 속성 우선, CSS 클래스명은 네이버 업데이트 시 변경 가능)
      self.log('📌 발행 버튼 탐색 시작...');
      const publishButtonSelectors = [
        // 1순위: data-* 속성 (네이버 업데이트에도 안정적)
        'button[data-click-area="tpb.publish"]',
        '[data-click-area="tpb.publish"]',
        // 2순위: 기존 CSS 클래스 셀렉터
        'button.publish_btn__m9KHH[data-click-area="tpb.publish"]',
        ...self.PUBLISH_BUTTON_SELECTORS,
        'button.publish_btn__m9KHH',
        '.publish_btn__bzc5B',
        '[data-testid="publish-button"]',
      ];

      let publishButton: ElementHandle<Element> | null = null;
      for (const selector of publishButtonSelectors) {
        publishButton = await frame.waitForSelector(selector, { visible: true, timeout: 3000 }).catch(() => null);
        if (publishButton) {
          self.log(`   ✅ 발행 버튼 발견: ${selector.substring(0, 60)}`);
          break;
        }
      }

      // ✅ [2026-02-17] 모든 셀렉터 실패 시 텍스트 기반 폴백
      if (!publishButton) {
        self.log('   ⚠️ 셀렉터 기반 탐색 실패 → 텍스트 기반 폴백 시도...');
        try {
          publishButton = await frame.evaluateHandle(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
              const text = (btn.textContent || '').trim();
              if (text === '발행' || text.includes('발행')) {
                const rect = btn.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  return btn;
                }
              }
            }
            return null;
          }) as ElementHandle<Element> | null;

          // evaluateHandle가 null JSHandle을 반환할 수 있으므로 실제 Element인지 확인
          if (publishButton) {
            const isElement = await publishButton.evaluate(el => el instanceof HTMLElement).catch(() => false);
            if (!isElement) publishButton = null;
          }

          if (publishButton) {
            self.log('   ✅ 텍스트 기반 폴백으로 발행 버튼 발견!');
          }
        } catch (fallbackErr) {
          self.log(`   ❌ 텍스트 기반 폴백 오류: ${(fallbackErr as Error).message}`);
        }
      }

      if (!publishButton) {
        // ✅ [2026-02-17] 디버깅: 툴바 영역 HTML 덤프
        self.log('   ❌ 모든 발행 버튼 탐색 실패 — 폴백 경로로 진행');
        try {
          const toolbarHTML = await frame.evaluate(() => {
            // 상단 툴바 영역의 버튼들 확인
            const allButtons = document.querySelectorAll('button');
            const buttonInfo: string[] = [];
            allButtons.forEach(btn => {
              const text = (btn.textContent || '').trim().substring(0, 20);
              const cls = btn.className.substring(0, 40);
              const area = btn.getAttribute('data-click-area') || '';
              const testId = btn.getAttribute('data-testid') || '';
              if (text || area || testId) {
                buttonInfo.push(`[${text}] cls=${cls} area=${area} testid=${testId}`);
              }
            });
            return buttonInfo.slice(0, 15).join('\n');
          });
          self.log(`   🔍 현재 페이지 버튼 목록:\n${toolbarHTML}`);
        } catch { }
      }

      if (publishButton) {
        // ✅ [2026-02-27 FIX v2] 발행 모달 열기 — Playwright waitForSelector 기반
        // delay 폴링 대신 Playwright 네이티브 대기로 모달 트랜지션 완료까지 정확히 대기
        const modalIndicatorSelectors = [
          '[data-testid="seOnePublishBtn"]',           // 모달 내 최종 발행 버튼
          'button[data-click-area="tpb*i.publish"]',   // 모달 내 발행 확인
          'button.confirm_btn__WEaBq',                 // 모달 확인 버튼 클래스
          '[data-click-area="tpb*i.category"]',        // 카테고리 선택 영역
          'input#radio_time1',                          // 즉시발행 라디오
        ];
        const MAX_MODAL_CLICKS = 3;
        let modalOpened = false;

        for (let attempt = 1; attempt <= MAX_MODAL_CLICKS; attempt++) {
          self.log(`📌 발행 모달 열기 시도 ${attempt}/${MAX_MODAL_CLICKS}...`);
          await publishButton.click();

          // ✅ Playwright waitForSelector로 모달 요소가 DOM에 나타날 때까지 대기
          // 각 시도마다 타임아웃을 점진 증가 (3초 → 5초 → 7초)
          const waitTimeout = 3000 + (attempt - 1) * 2000;

          for (const sel of modalIndicatorSelectors) {
            try {
              const el = await frame.waitForSelector(sel, { visible: true, timeout: waitTimeout });
              if (el) {
                modalOpened = true;
                self.log(`   ✅ 발행 모달 열림 확인 — waitForSelector 성공 (${sel}, ${waitTimeout}ms)`);
                break;
              }
            } catch {
              // 이 셀렉터로는 못 찾음 → 다음 셀렉터 시도
            }

            // frame에서 못 찾으면 page에서도 시도
            if (!modalOpened) {
              try {
                const el = await self.ensurePage().waitForSelector(sel, { visible: true, timeout: 1000 });
                if (el) {
                  modalOpened = true;
                  self.log(`   ✅ 발행 모달 열림 확인 — page waitForSelector 성공 (${sel})`);
                  break;
                }
              } catch {
                // page에서도 못 찾음
              }
            }
          }

          if (modalOpened) break;

          // 안 열렸으면 로그 + 재클릭 전 안정화 대기
          if (attempt < MAX_MODAL_CLICKS) {
            self.log(`   ⚠️ 발행 모달 미열림 (${waitTimeout}ms 대기 후) → ${attempt + 1}번째 클릭 시도`);
            await self.delay(1500);
          }
        }

        if (!modalOpened) {
          self.log('   ❌ 발행 모달 열기 3회 시도 모두 실패 — 카테고리 선택 건너뜀 가능');
        }

        // ✅ [2026-02-09] 카테고리 자동 선택 (공통 메서드 사용)
        await self.selectCategoryInPublishModal(frame, self.ensurePage());

        // ✅ 최종 발행 확인 버튼 찾기 (data-* 속성 우선)
        self.log('📌 발행 확인 버튼 탐색 시작...');
        const confirmPublishSelectors = [
          // 1순위: data-* 속성 (안정적)
          'button[data-testid="seOnePublishBtn"]',
          // ✅ [2026-02-23 FIX] *= (contains) → = (exact) 변경
          // *= 사용 시 툴바 토글 버튼(tpb.publish)까지 매칭되어 모달 열고닫기 반복 버그 발생
          'button[data-click-area="tpb*i.publish"]',
          '[data-testid="seOnePublishBtn"]',
          // 2순위: CSS 클래스
          'button.confirm_btn__WEaBq[data-testid="seOnePublishBtn"]',
          'button.confirm_btn__WEaBq[data-click-area="tpb*i.publish"]',
          'button.confirm_btn__WEaBq',
        ];

        let confirmPublishButton: ElementHandle<Element> | null = null;
        for (const selector of confirmPublishSelectors) {
          confirmPublishButton = await frame.waitForSelector(selector, { visible: true, timeout: 5000 }).catch(() => null);
          if (confirmPublishButton) {
            self.log(`   ✅ 확인 버튼 발견: ${selector.substring(0, 60)}`);
            break;
          }
        }

        // ✅ [2026-02-17] 모든 셀렉터 실패 시 텍스트 기반 폴백 (모달 내 '발행' 버튼)
        if (!confirmPublishButton) {
          self.log('   ⚠️ 확인 버튼 셀렉터 실패 → 텍스트 기반 폴백 시도...');
          try {
            confirmPublishButton = await frame.evaluateHandle(() => {
              // 발행 모달 내 '발행' 버튼 찾기 (모달이 열린 상태)
              const buttons = document.querySelectorAll('button');
              for (const btn of buttons) {
                const text = (btn.textContent || '').trim();
                // '발행' 텍스트를 가진 활성화된 버튼 찾기 (모달 내)
                if ((text === '발행' || text === '확인') && !btn.hasAttribute('disabled')) {
                  const rect = btn.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0) {
                    return btn;
                  }
                }
              }
              return null;
            }) as ElementHandle<Element> | null;

            if (confirmPublishButton) {
              const isElement = await confirmPublishButton.evaluate(el => el instanceof HTMLElement).catch(() => false);
              if (!isElement) confirmPublishButton = null;
            }

            if (confirmPublishButton) {
              self.log('   ✅ 텍스트 기반 폴백으로 확인 버튼 발견!');
            }
          } catch (fallbackErr) {
            self.log(`   ❌ 텍스트 기반 폴백 오류: ${(fallbackErr as Error).message}`);
          }
        }

        if (!confirmPublishButton) {
          self.log('   ❌ 모든 확인 버튼 셀렉터 실패 — 임시저장 폴백 시도');
        }

        if (confirmPublishButton) {
          // ✅ 버튼이 클릭 가능한지 확인
          const isClickable = await frame.evaluate((btn: Element) => {
            const button = btn as HTMLElement;
            return button && !button.hasAttribute('disabled') && button.offsetParent !== null;
          }, confirmPublishButton).catch(() => false);

          if (isClickable) {
            // ✅ 발행 전 URL 저장
            const beforeUrl = self.ensurePage().url();
            self.log(`📌 발행 전 URL: ${beforeUrl}`);

            await confirmPublishButton.click();
            await self.delay(1000); // ✅ 클릭 후 대기 시간 증가

            // ✅ 네비게이션 대기 (더 긴 타임아웃)
            let navigationSuccess = false;
            try {
              await Promise.race([
                frame.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
                new Promise(resolve => setTimeout(resolve, 30000)) // 최대 30초 대기
              ]);
              navigationSuccess = true;
            } catch (navError) {
              self.log(`⚠️ 네비게이션 대기 중 오류: ${(navError as Error).message}`);
            }

            // ✅ 발행 완료 확인 (URL 변경 및 실제 발행 여부 확인)
            await self.delay(2000); // 페이지 로드 대기
            const afterUrl = self.ensurePage().url();
            self.log(`📌 발행 후 URL: ${afterUrl}`);

            // ✅ URL이 변경되었는지 확인
            const urlChanged = beforeUrl !== afterUrl;
            const isBlogPostUrl = /blog\.naver\.com\/[^\/]+\/\d+/.test(afterUrl);

            if (urlChanged && isBlogPostUrl) {
              self.log(`✅ 블로그 글이 즉시발행되었습니다.`);
              self.log(`POST_URL: ${afterUrl}`);
              self.publishedUrl = afterUrl; // ✅ URL 저장
            } else if (urlChanged) {
              // URL은 변경되었지만 블로그 포스트 URL이 아닌 경우
              self.log(`⚠️ URL이 변경되었지만 블로그 포스트 URL이 아닙니다: ${afterUrl}`);
              // 추가 확인: 에디터 페이지가 아닌지 확인
              if (!afterUrl.includes('GoBlogWrite') && !afterUrl.includes('blogPostWrite')) {
                self.log(`✅ 블로그 글이 발행되었습니다. (URL: ${afterUrl})`);
                self.log(`POST_URL: ${afterUrl}`);
                self.publishedUrl = afterUrl; // ✅ URL 저장
              } else {
                throw new Error('발행이 완료되지 않았습니다. 에디터 페이지에 머물러 있습니다.');
              }
            } else {
              // URL이 변경되지 않은 경우 - 발행 실패 가능성
              self.log(`⚠️ URL이 변경되지 않았습니다. 발행 상태를 확인합니다...`);

              // ✅ 발행 성공 메시지 또는 에러 메시지 확인
              const publishStatus = await frame.evaluate(() => {
                // 성공 메시지 찾기
                const successMessages = Array.from(document.querySelectorAll('*')).filter(el => {
                  const text = el.textContent || '';
                  return text.includes('발행되었습니다') || text.includes('발행 완료') || text.includes('게시되었습니다');
                });

                // 에러 메시지 찾기
                const errorMessages = Array.from(document.querySelectorAll('*')).filter(el => {
                  const text = el.textContent || '';
                  return text.includes('오류') || text.includes('실패') || text.includes('에러');
                });

                return {
                  success: successMessages.length > 0,
                  error: errorMessages.length > 0,
                  successText: successMessages[0]?.textContent?.substring(0, 100) || '',
                  errorText: errorMessages[0]?.textContent?.substring(0, 100) || ''
                };
              }).catch(() => ({ success: false, error: false, successText: '', errorText: '' }));

              if (publishStatus.success) {
                self.log(`✅ 발행 성공 메시지 확인: ${publishStatus.successText}`);
                // 추가 대기 후 URL 재확인
                await self.delay(3000);
                const finalUrl = self.ensurePage().url();
                if (finalUrl !== beforeUrl) {
                  self.log(`✅ 최종 URL: ${finalUrl}`);
                  self.log(`POST_URL: ${finalUrl}`);
                  self.publishedUrl = finalUrl; // ✅ URL 저장
                } else {
                  self.log(`⚠️ URL이 여전히 변경되지 않았습니다. 발행이 완료되었는지 수동으로 확인해주세요.`);
                }
              } else if (publishStatus.error) {
                throw new Error(`발행 실패: ${publishStatus.errorText}`);
              } else {
                // 메시지가 없는 경우 - 추가 대기 후 재확인
                self.log(`⚠️ 발행 상태 메시지를 찾을 수 없습니다. 추가 대기 후 재확인합니다...`);
                await self.delay(5000);
                const retryUrl = self.ensurePage().url();
                if (retryUrl !== beforeUrl && /blog\.naver\.com/i.test(retryUrl)) {
                  self.log(`✅ 재확인 후 URL 변경 확인: ${retryUrl}`);
                  self.log(`POST_URL: ${retryUrl}`);
                } else {
                  throw new Error('발행이 완료되지 않았습니다. 발행 버튼을 다시 클릭하거나 수동으로 확인해주세요.');
                }
              }
            }
          } else {
            self.log('⚠️ 발행 확인 버튼이 비활성화 상태입니다. 잠시 후 다시 시도합니다...');
            await self.delay(2000);

            // ✅ 재시도 전 버튼 상태 재확인
            const retryClickable = await frame.evaluate((btn: Element) => {
              const button = btn as HTMLElement;
              return button && !button.hasAttribute('disabled') && button.offsetParent !== null;
            }, confirmPublishButton).catch(() => false);

            if (retryClickable) {
              const beforeUrl = self.ensurePage().url();
              await confirmPublishButton.click();
              await self.delay(1000);

              let navigationSuccess = false;
              try {
                await Promise.race([
                  frame.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
                  new Promise(resolve => setTimeout(resolve, 30000))
                ]);
                navigationSuccess = true;
              } catch (navError) {
                self.log(`⚠️ 네비게이션 대기 중 오류: ${(navError as Error).message}`);
              }

              await self.delay(2000);
              const afterUrl = self.ensurePage().url();

              if (beforeUrl !== afterUrl && /blog\.naver\.com/i.test(afterUrl)) {
                self.log('✅ 블로그 글이 즉시발행되었습니다.');
                self.log(`POST_URL: ${afterUrl}`);
              } else {
                throw new Error('발행이 완료되지 않았습니다. 발행 버튼이 비활성화되어 있거나 네비게이션이 발생하지 않았습니다.');
              }
            } else {
              throw new Error('발행 확인 버튼이 계속 비활성화되어 있습니다. 발행 조건을 확인해주세요.');
            }
          }
        } else {
          // ✅ 즉시 발행 실패 시 임시저장으로 폴백
          self.log('⚠️ 즉시 발행 확인 버튼을 찾지 못했습니다. 임시저장으로 폴백합니다...');

          // 모달 닫기
          const page = self.ensurePage();
          await page.keyboard.press('Escape').catch(() => { });
          await self.delay(500);

          // 임시저장 시도
          try {
            const saveButtonSelectors = [
              'button.save_btn__bzc5B[data-click-area="tpb.save"]',
              'button.save_btn__bzc5B',
              'button[data-click-area="tpb.save"]',
            ];

            let saveButton: ElementHandle<Element> | null = null;
            for (const selector of saveButtonSelectors) {
              saveButton = await frame.waitForSelector(selector, { visible: true, timeout: 5000 }).catch(() => null); // ✅ 타임아웃 3초 → 5초 증가
              if (saveButton) break;
            }

            if (saveButton) {
              await saveButton.click();
              await self.delay(self.DELAYS.MEDIUM);
              await frame.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => undefined);
              self.log('✅ 즉시 발행 실패 → 임시저장 성공! 글을 나중에 수동으로 발행할 수 있습니다.');
            } else {
              throw new Error('임시저장 버튼도 찾을 수 없습니다.');
            }
          } catch (fallbackError) {
            self.log(`❌ 임시저장 폴백도 실패: ${(fallbackError as Error).message}`);
            throw new Error(`즉시 발행 실패: 발행 확인 버튼을 찾을 수 없습니다. 임시저장 폴백도 실패: ${(fallbackError as Error).message}`);
          }
        }
      } else {
        // ✅ 발행 버튼을 찾지 못하면 저장 버튼 클릭 후 발행 모달 처리 (사용자가 제공한 정확한 셀렉터 사용)
        const saveButton = await frame.waitForSelector(
          'button.save_btn__bzc5B[data-click-area="tpb.save"]', // ✅ 최우선: 사용자가 제공한 정확한 셀렉터
          { visible: true, timeout: 5000 } // ✅ 타임아웃 3초 → 5초 증가
        ).catch(() => null);

        if (!saveButton) {
          // 폴백: 다른 저장 버튼 선택자 시도
          await frame.waitForSelector('button.save_btn__bzc5B', { visible: true, timeout: 5000 }).catch(() => null);
        }
        if (!saveButton) {
          throw new Error('저장 버튼을 찾을 수 없습니다.');
        }
        await saveButton.click();
        await self.delay(self.DELAYS.LONG);

        // ✅ 발행 옵션 선택 (모달이 열릴 때까지 충분히 대기)
        await self.delay(500); // 모달이 열릴 때까지 추가 대기
        const publishOption = await frame.waitForSelector(
          '[data-value="publish"], button:has-text("발행")',
          { visible: true, timeout: 5000 } // ✅ 타임아웃 3초 → 5초 증가
        ).catch(() => null);

        if (publishOption) {
          await publishOption.click();
          await self.delay(1000); // ✅ 대기 시간 증가

          // 최종 발행 확인 버튼 찾기
          const confirmPublishSelectors = [
            'button.confirm_btn__WEaBq[data-testid="seOnePublishBtn"][data-click-area="tpb*i.publish"]',
            'button.confirm_btn__WEaBq[data-testid="seOnePublishBtn"]',
            'button[data-testid="seOnePublishBtn"]',
            // ✅ [2026-02-23 FIX] *= → = 정확 매칭 (토글 버튼 혼동 방지)
            'button.confirm_btn__WEaBq[data-click-area="tpb*i.publish"]',
            'button.confirm_btn__WEaBq',
          ];

          let confirmPublishButton: ElementHandle<Element> | null = null;
          for (const selector of confirmPublishSelectors) {
            confirmPublishButton = await frame.waitForSelector(selector, { visible: true, timeout: 5000 }).catch(() => null); // ✅ 타임아웃 3초 → 5초 증가
            if (confirmPublishButton) break;
          }

          if (confirmPublishButton) {
            // ✅ 발행 전 URL 저장
            const beforeUrl = self.ensurePage().url();
            self.log(`📌 발행 전 URL: ${beforeUrl}`);

            await confirmPublishButton.click();
            await self.delay(1000);

            // ✅ 네비게이션 대기
            let navigationSuccess = false;
            try {
              await Promise.race([
                frame.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
                new Promise(resolve => setTimeout(resolve, 30000))
              ]);
              navigationSuccess = true;
            } catch (navError) {
              self.log(`⚠️ 네비게이션 대기 중 오류: ${(navError as Error).message}`);
            }

            // ✅ 발행 완료 확인
            await self.delay(2000);
            const afterUrl = self.ensurePage().url();
            self.log(`📌 발행 후 URL: ${afterUrl}`);

            if (beforeUrl !== afterUrl && /blog\.naver\.com/i.test(afterUrl)) {
              self.log('✅ 블로그 글이 즉시발행되었습니다.');
              self.log(`POST_URL: ${afterUrl}`);
            } else if (!afterUrl.includes('GoBlogWrite') && !afterUrl.includes('blogPostWrite')) {
              self.log('✅ 블로그 글이 발행되었습니다.');
              self.log(`POST_URL: ${afterUrl}`);
            } else {
              // 추가 확인
              await self.delay(3000);
              const finalUrl = self.ensurePage().url();
              if (finalUrl !== beforeUrl) {
                self.log('✅ 블로그 글이 즉시발행되었습니다.');
                self.log(`POST_URL: ${finalUrl}`);
              } else {
                throw new Error('발행이 완료되지 않았습니다. 에디터 페이지에 머물러 있습니다.');
              }
            }
          } else {
            // ✅ 즉시 발행 실패 시 임시저장으로 폴백
            self.log('⚠️ 즉시 발행 확인 버튼을 찾지 못했습니다. 임시저장으로 폴백합니다...');

            // 모달 닫기
            const page = self.ensurePage();
            await page.keyboard.press('Escape').catch(() => { });
            await self.delay(500);

            // 임시저장 시도
            try {
              const saveButtonSelectors = [
                'button.save_btn__bzc5B[data-click-area="tpb.save"]',
                'button.save_btn__bzc5B',
                'button[data-click-area="tpb.save"]',
              ];

              let saveButton: ElementHandle<Element> | null = null;
              for (const selector of saveButtonSelectors) {
                saveButton = await frame.waitForSelector(selector, { visible: true, timeout: 5000 }).catch(() => null); // ✅ 타임아웃 3초 → 5초 증가
                if (saveButton) break;
              }

              if (saveButton) {
                await saveButton.click();
                await self.delay(self.DELAYS.MEDIUM);
                await frame.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => undefined);
                self.log('✅ 즉시 발행 실패 → 임시저장 성공! 글을 나중에 수동으로 발행할 수 있습니다.');
              } else {
                throw new Error('임시저장 버튼도 찾을 수 없습니다.');
              }
            } catch (fallbackError) {
              self.log(`❌ 임시저장 폴백도 실패: ${(fallbackError as Error).message}`);
              throw new Error(`즉시 발행 실패: 발행 확인 버튼을 찾을 수 없습니다. 임시저장 폴백도 실패: ${(fallbackError as Error).message}`);
            }
          }
        } else {
          // ✅ 발행 옵션을 찾지 못한 경우 임시저장으로 폴백
          self.log('⚠️ 발행 옵션을 찾지 못했습니다. 임시저장으로 폴백합니다...');

          try {
            const saveButtonSelectors = [
              'button.save_btn__bzc5B[data-click-area="tpb.save"]',
              'button.save_btn__bzc5B',
              'button[data-click-area="tpb.save"]',
            ];

            let saveButton: ElementHandle<Element> | null = null;
            for (const selector of saveButtonSelectors) {
              saveButton = await frame.waitForSelector(selector, { visible: true, timeout: 5000 }).catch(() => null); // ✅ 타임아웃 3초 → 5초 증가
              if (saveButton) break;
            }

            if (saveButton) {
              await saveButton.click();
              await self.delay(self.DELAYS.MEDIUM);
              await frame.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => undefined);
              self.log('✅ 즉시 발행 실패 → 임시저장 성공! 글을 나중에 수동으로 발행할 수 있습니다.');
            } else {
              throw new Error('임시저장 버튼도 찾을 수 없습니다.');
            }
          } catch (fallbackError) {
            self.log(`❌ 임시저장 폴백도 실패: ${(fallbackError as Error).message}`);
            throw new Error(`즉시 발행 실패: 발행 옵션을 찾을 수 없습니다. 임시저장 폴백도 실패: ${(fallbackError as Error).message}`);
          }
        }
      }
    } else if (mode === 'schedule') {
      if (!scheduleDate) {
        throw new Error('예약발행 날짜가 지정되지 않았습니다.');
      }

      // ✅ [2026-03-21 FIX] 예약발행 재시도 (최대 3회, 임시저장 폴백 제거)
      const MAX_SCHEDULE_RETRIES = 3;
      let scheduleSuccess = false;
      let lastScheduleError: Error | null = null;

      for (let scheduleAttempt = 1; scheduleAttempt <= MAX_SCHEDULE_RETRIES; scheduleAttempt++) {
        try {
          if (scheduleAttempt > 1) {
            self.log(`🔁 예약발행 재시도 (${scheduleAttempt}/${MAX_SCHEDULE_RETRIES})...`);
          }
          await self.publishScheduled(scheduleDate);
          scheduleSuccess = true;
          break;
        } catch (scheduleError) {
          lastScheduleError = scheduleError as Error;
          self.log(`❌ 예약발행 실패 (시도 ${scheduleAttempt}/${MAX_SCHEDULE_RETRIES}, 목표: ${scheduleDate}): ${lastScheduleError.message}`);

          if (scheduleAttempt < MAX_SCHEDULE_RETRIES) {
            const page = self.ensurePage();
            await page.keyboard.press('Escape').catch(() => { });
            await self.delay(500);
            await page.keyboard.press('Escape').catch(() => { });
            await self.delay(2000 * scheduleAttempt);
            self.log(`⏳ ${2 * scheduleAttempt}초 대기 후 재시도합니다...`);
          }
        }
      }

      if (!scheduleSuccess) {
        throw new Error(`예약발행 ${MAX_SCHEDULE_RETRIES}회 시도 모두 실패: ${lastScheduleError?.message || '알 수 없는 오류'}`);
      }
    }
  }, 3, '블로그 발행');
}
