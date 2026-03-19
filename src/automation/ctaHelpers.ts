/**
 * CTA(Call-To-Action) 삽입 헬퍼
 * naverBlogAutomation.ts에서 추출된 CTA 관련 메서드들
 * 
 * 모든 함수는 첫 번째 인자로 NaverBlogAutomation 인스턴스(self)를 받습니다.
 * self를 통해 this.log(), this.delay(), this.ensurePage() 등에 접근합니다.
 */
import { Frame, Page } from 'puppeteer';
import { safeKeyboardType } from './typingUtils.js';
import { generateCtaBannerImage } from '../image/tableImageGenerator.js';

// ✅ [2026-03-20] 이전글 후킹 문구 공유 상수 (editorHelpers에서도 import하여 사용)
export const PREV_POST_HOOKS = [
  '✨ 이런 글도 많이 봤어요!',
  '📚 다음 글도 궁금하다면?',
  '🔥 이 글도 인기 있어요!',
  '💡 맛있게 읽었다면 이것도!',
  '👀 놓치면 아까운 추천 글!',
] as const;

// ========== CTA 삽입 확인 ==========

export async function verifyCtaInsertion(self: any, frame: any, ctaText: string): Promise<boolean> {
    try {
        const verified = await frame.evaluate((buttonText: string) => {
            // 여러 방법으로 CTA 버튼 확인
            const paragraphs = document.querySelectorAll('.se-text-paragraph');
            const allElements = document.querySelectorAll('.se-section-text *, .se-main-container *');

            // 1. paragraph 내에서 확인
            for (let i = paragraphs.length - 1; i >= 0; i--) {
                const p = paragraphs[i] as HTMLElement;
                const html = p.innerHTML || '';
                const text = p.innerText || p.textContent || '';

                // 다양한 패턴으로 확인
                if (html.includes(buttonText) ||
                    text.includes(buttonText) ||
                    html.includes('background:') ||
                    html.includes('linear-gradient') ||
                    html.includes('border-radius:') ||
                    (html.includes('href=') && html.includes('display: inline-block')) ||
                    (html.includes('href=') && html.includes('padding:'))) {
                    console.log('[CTA 확인] ✅ CTA 버튼 발견:', buttonText);
                    return true;
                }
            }

            // 2. 모든 요소에서 확인 (더 넓은 범위)
            for (const el of Array.from(allElements)) {
                const html = (el as HTMLElement).innerHTML || '';
                const text = (el as HTMLElement).innerText || (el as HTMLElement).textContent || '';

                if (html.includes(buttonText) ||
                    text.includes(buttonText) ||
                    (html.includes('href=') && (html.includes('background:') || html.includes('linear-gradient')))) {
                    console.log('[CTA 확인] ✅ CTA 버튼 발견 (전체 검색):', buttonText);
                    return true;
                }
            }

            console.log('[CTA 확인] ❌ CTA 버튼을 찾을 수 없습니다:', buttonText);
            return false;
        }, ctaText).catch(() => false);

        return verified || false;
    } catch (error) {
        self.log(`⚠️ CTA 확인 중 오류: ${(error as Error).message}`);
        return false;
    }
}

// ========== Enhanced CTA (배너 + 텍스트) ==========

export async function insertEnhancedCta(
    self: any,
    url: string,
    hookText: string,
    productName: string,
    previousPostTitle?: string,
    previousPostUrl?: string,
    hashtags?: string[],
    useAiBanner?: boolean,
    customBannerPath?: string,
    autoBannerGenerate?: boolean
): Promise<void> {
    const page = self.ensurePage();
    self.ensureNotCancelled();

    if (!url || !hookText) {
        return;
    }

    // ✅ 안전 검사: 열린 패널/모달 닫기
    for (let i = 0; i < 2; i++) {
        await page.keyboard.press('Escape');
        await self.delay(50);
    }

    // ✅ [FIX] 배너용 후킹 문구 (랜덤)
    const bannerHooks = [
        '✓ 할인가 확인하기 →',
        '[공식] 최저가 보러가기 →',
        '지금 바로 구매하기 →',
        '▶ 상품 자세히 보기',
        '할인 혜택 확인 →',
    ];
    const bannerHook = bannerHooks[Math.floor(Math.random() * bannerHooks.length)];

    // ✅ [신규] CTA용 후킹 문구 (배너와 다르게, 더 구체적이고 강력한 구매 결심 유도)
    const ctaHooks = [
        '🔥 지금 안사면 내일은 품절! 장바구니 담기',
        '💸 이 가격에 이 퀄리티? 리뷰 4.8점 인증 제품',
        '⚡ 오늘만 이 가격! 무료배송에 추가 할인까지',
        '🛒 수만 명이 선택한 인기템, 고민 말고 바로 구매',
        '💥 이번 달 가장 잘 팔린 베스트셀러, 놓치면 후회',
        '✨ 가성비 최고! 다른 제품과 비교 불가',
        '🎁 지금 구매하면 사은품 증정 이벤트 중',
        '🏃 남은 재고 얼마 없어요! 서두르세요',
    ];
    const ctaHook = ctaHooks[Math.floor(Math.random() * ctaHooks.length)];

    const displayProductName = productName || '상품 상세보기';

    self.log(`🔗 [Enhanced CTA] 배너+CTA 삽입 중: 배너="${bannerHook}", CTA="${ctaHook}" → ${url}`);

    try {
        // ✅ [2026-01-19] 커스텀 배너가 있으면 우선 사용 (쇼핑커넥트 배너 생성기로 만든 배너)
        let bannerImagePath: string;
        if (autoBannerGenerate) {
            // ✅ [2026-01-21] 연속발행: 매번 새로운 랜덤 배너 생성
            self.log(`   🎲 [연속발행] 랜덤 배너 자동 생성 중...`);
            bannerImagePath = await generateCtaBannerImage(bannerHook, displayProductName);
            self.log(`   ✅ [연속발행] 새 랜덤 배너 생성 완료: ${bannerImagePath.split(/[/\\\\]/).pop()}`);
        } else if (customBannerPath) {
            bannerImagePath = customBannerPath;
            self.log(`   🎨 커스텀 배너 사용: ${customBannerPath.split(/[/\\]/).pop()}`);
        } else if (useAiBanner) {
            // ✅ [2026-01-18] useAiBanner 옵션에 따라 AI 배너 생성
            const { generateCtaBannerWithAI } = await import('../image/nanoBananaProGenerator.js');
            const aiBannerPath = await generateCtaBannerWithAI(displayProductName, bannerHook);
            if (aiBannerPath) {
                bannerImagePath = aiBannerPath;
                self.log(`   🤖 AI CTA 배너 생성 완료: ${bannerImagePath}`);
            } else {
                bannerImagePath = await generateCtaBannerImage(bannerHook, displayProductName);
                self.log(`   📸 AI 실패 → HTML 배너로 폴백: ${bannerImagePath}`);
            }
        } else {
            bannerImagePath = await generateCtaBannerImage(bannerHook, displayProductName);
            self.log(`   📸 CTA 배너 이미지 생성 완료: ${bannerImagePath}`);
        }

        await page.keyboard.press('Enter'); // ✅ [2026-01-19] 엔터 1회로 축소
        await self.insertBase64ImageAtCursor(bannerImagePath);

        // ✅ 이미지 렌더링 완료 대기 (2초)
        self.log(`   ⏳ 배너 이미지 렌더링 대기 중...`);
        await self.delay(2000);

        // ✅ 배너 이미지에 제휴 링크 삽입
        await self.attachLinkToLastImage(url);
        self.log(`   ✅ 배너 이미지 + 제휴 링크 삽입 완료`);

        // ✅ [핵심] 이미지 선택 해제 - Escape 눌러서 커서를 텍스트 모드로 전환
        await page.keyboard.press('Escape');
        await self.delay(300);
        await page.keyboard.press('Escape');
        await self.delay(200);

        // ✅ 2. 구분선 삽입
        const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
        await page.keyboard.press('Enter'); // ✅ [2026-01-19] 엔터 1회로 축소
        await safeKeyboardType(page, divider, { delay: 5 });
        await page.keyboard.press('Enter');
        self.log(`   ✅ 구분선 1 삽입 완료`);

        // ✅ 3. [신규] CTA 텍스트 삽입 (📎 후킹문구 + 제휴링크)
        // 배너와 다른 강력한 구매 결심 유도 문구!
        self.log(`   🛒 CTA 텍스트 삽입 중: "${ctaHook}"`);
        await page.keyboard.press('Enter');
        await safeKeyboardType(page, `📎 ${ctaHook}`, { delay: 10 });
        await page.keyboard.press('Enter');
        await safeKeyboardType(page, `👉 ${url}`, { delay: 10 });
        await page.keyboard.press('Enter');
        self.log(`   ✅ CTA 텍스트 + 제휴링크 삽입 완료`);

        // ✅ 4. [신규] 링크 카드 로딩 대기 (polling 방식)
        self.log(`   ⏳ 링크 카드 로딩 대기 중...`);
        await self.waitForLinkCard(15000, 500);

        // ✅ [2026-03-20] 이전글 삽입은 editorHelpers.ts에서 일원화 처리 (이중 삽입 방지)
        // insertEnhancedCta에서는 CTA 배너+텍스트만 담당, 이전글은 editorHelpers에서 삽입
        if (previousPostTitle && previousPostUrl) {
            self.log(`   ℹ️ 이전글 정보 있음 ("${previousPostTitle}") — editorHelpers에서 삽입 예정`);
        }

        // ✅ [2026-01-18 수정] 해시태그는 본문 작성 후 별도로 삽입됨 (6291행)
        // 여기서는 엔터 5번만 추가하여 공간 확보
        self.log(`   📏 CTA 하단 여백 추가 (Enter 5회)...`);
        for (let i = 0; i < 5; i++) {
            await page.keyboard.press('Enter');
            await self.delay(50);
        }
    } catch (error) {
        self.log(`⚠️ CTA 배너 생성/삽입 실패: ${(error as Error).message}`);
        // 폴백: 기존 텍스트 방식으로 삽입
        self.log(`   🔄 폴백: 텍스트 CTA로 대체합니다.`);
        try {
            const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
            await page.keyboard.press('Enter');
            await safeKeyboardType(page, divider, { delay: 5 });
            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            await safeKeyboardType(page, ctaHook, { delay: 10 });
            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            await safeKeyboardType(page, `🔗 ${displayProductName}`, { delay: 10 });
            await page.keyboard.press('Enter');
            await safeKeyboardType(page, `👉 ${url}`, { delay: 10 });
            await page.keyboard.press('Enter');
            self.log(`   ✅ 텍스트 CTA 폴백 완료`);
        } catch (fallbackError) {
            self.log(`⚠️ 텍스트 CTA 폴백도 실패: ${(fallbackError as Error).message}`);
        }
    }
}

// ========== CTA 링크 삽입 (텍스트 기반) ==========

export async function insertCtaLink(
    self: any,
    url: string,
    text: string,
    position: 'top' | 'middle' | 'bottom' = 'bottom'
): Promise<void> {
    const frame = (await self.getAttachedFrame());
    const page = self.ensurePage();
    self.ensureNotCancelled();

    if (!text) {
        return;
    }

    // ✅ 안전 검사: 열린 패널/모달 닫기 (ABOUT, 지도, 함수 등 방지)
    for (let i = 0; i < 2; i++) {
        await page.keyboard.press('Escape');
        await self.delay(50);
    }

    // 열린 패널 강제 닫기
    await frame.evaluate(() => {
        const panels = document.querySelectorAll('.se-popup, .se-panel, .se-layer, .se-modal, [class*="popup"], [class*="layer"]');
        panels.forEach((panel: any) => {
            if (panel instanceof HTMLElement && panel.style.display !== 'none') {
                const closeBtn = panel.querySelector('button[class*="close"], .close, [aria-label*="닫기"]');
                if (closeBtn instanceof HTMLElement) {
                    closeBtn.click();
                }
            }
        });
    }).catch(() => { });

    // URL이 없으면 텍스트만 표시
    const finalUrl = url || '#';

    // ✅ [수정] CTA 텍스트에서 줄바꿈 문자 제거 (형식 깨짐 방지)
    const cleanText = text.replace(/[\r\n]+/g, ' ').trim();

    self.log(`🔗 CTA 텍스트 삽입 중: ${cleanText} → ${finalUrl} (위치: ${position})`);

    try {
        // ✅ 네이버 블로그용 텍스트 형식 CTA (세로 정렬)
        const divider = '━━━━━━━━━━━━━━━━━━━';

        // 위치에 따라 텍스트 타이핑 (각 요소를 개별 줄에 배치)
        if (position === 'top') {
            self.log(`   → 상단 위치에 CTA 텍스트 삽입 중...`);
            await safeKeyboardType(page, divider, { delay: 5 });
            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            await safeKeyboardType(page, `🔗 ${cleanText}`, { delay: 10 });
            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            await safeKeyboardType(page, `👉 ${finalUrl}`, { delay: 10 });
            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
        } else if (position === 'middle') {
            self.log(`   → 중간 위치에 CTA 텍스트 삽입 중...`);
            await safeKeyboardType(page, divider, { delay: 5 });
            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            await safeKeyboardType(page, `🔗 ${cleanText}`, { delay: 10 });
            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            await safeKeyboardType(page, `👉 ${finalUrl}`, { delay: 10 });
            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
        } else {
            self.log(`   → 하단 위치에 CTA 텍스트 삽입 중...`);
            await safeKeyboardType(page, divider, { delay: 5 });
            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            await safeKeyboardType(page, `🔗 ${cleanText}`, { delay: 10 });
            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            await safeKeyboardType(page, `👉 ${finalUrl}`, { delay: 10 });
            await page.keyboard.press('Enter');
        }

        await self.delay(300);
        self.log(`   ✅ CTA 텍스트 삽입 완료 (세로 정렬)`)

    } catch (error) {
        self.log(`⚠️ CTA 버튼 삽입 실패: ${(error as Error).message}`);
        // 실패해도 계속 진행
    }
}

// ========== 상단 CTA HTML 삽입 ==========

export async function insertCtaHtmlAtTop(self: any, frame: any, html: string): Promise<void> {
    // 줄바꿈 2회 (제목과 CTA 사이 간격)
    const page = self.ensurePage();
    await page.keyboard.press('Enter');
    await self.delay(15);
    await page.keyboard.press('Enter');
    await self.delay(15);

    const success = await frame.evaluate((markup: string) => {
        const sectionText = document.querySelector('.se-section-text');
        if (!sectionText) {
            console.error('[CTA] .se-section-text를 찾을 수 없습니다');
            return false;
        }

        let contentContainer = sectionText.querySelector('.se-module-text') ||
            sectionText.querySelector('.se-module.se-module-text');

        if (!contentContainer) {
            const firstParagraph = sectionText.querySelector('.se-text-paragraph');
            if (firstParagraph && firstParagraph.parentElement) {
                contentContainer = firstParagraph.parentElement;
            } else {
                contentContainer = sectionText;
            }
        }

        const temp = document.createElement('div');
        temp.innerHTML = markup;
        const fragment = document.createDocumentFragment();
        while (temp.firstChild) {
            fragment.appendChild(temp.firstChild);
        }

        // 새로운 paragraph 생성
        const newParagraph = document.createElement('div');
        newParagraph.className = 'se-text-paragraph';
        newParagraph.setAttribute('data-module', 'se2_text_paragraph');
        newParagraph.appendChild(fragment);

        // 첫 번째 paragraph 앞에 삽입
        const firstParagraph = contentContainer.querySelector('.se-text-paragraph');
        if (firstParagraph && firstParagraph.parentElement) {
            firstParagraph.parentElement.insertBefore(newParagraph, firstParagraph);
        } else {
            contentContainer.insertBefore(newParagraph, contentContainer.firstChild);
        }

        // 에디터에 변경사항 알리기
        const event = new Event('input', { bubbles: true });
        newParagraph.dispatchEvent(event);

        return true;
    }, html);

    if (!success) {
        throw new Error('상단에 CTA 삽입 실패');
    }

    await self.delay(100);
}

// ========== 중간 CTA HTML 삽입 ==========

export async function insertCtaHtmlInMiddle(self: any, frame: any, html: string): Promise<void> {
    // 줄바꿈 2회 (본문과 CTA 사이 간격)
    const page = self.ensurePage();
    await page.keyboard.press('Enter');
    await self.delay(15);
    await page.keyboard.press('Enter');
    await self.delay(15);

    const success = await frame.evaluate((markup: string) => {
        const sectionText = document.querySelector('.se-section-text');
        if (!sectionText) {
            console.error('[CTA] .se-section-text를 찾을 수 없습니다');
            return false;
        }

        let contentContainer = sectionText.querySelector('.se-module-text') ||
            sectionText.querySelector('.se-module.se-module-text');

        if (!contentContainer) {
            const firstParagraph = sectionText.querySelector('.se-text-paragraph');
            if (firstParagraph && firstParagraph.parentElement) {
                contentContainer = firstParagraph.parentElement;
            } else {
                contentContainer = sectionText;
            }
        }

        const paragraphs = Array.from(contentContainer.querySelectorAll('.se-text-paragraph'));
        if (paragraphs.length === 0) {
            console.error('[CTA] paragraph를 찾을 수 없습니다');
            return false;
        }

        // 중간 지점 계산
        const middleIndex = Math.floor(paragraphs.length / 2);
        const targetParagraph = paragraphs[middleIndex] as HTMLElement;

        const temp = document.createElement('div');
        temp.innerHTML = markup;
        const fragment = document.createDocumentFragment();
        while (temp.firstChild) {
            fragment.appendChild(temp.firstChild);
        }

        // 새로운 paragraph 생성
        const newParagraph = document.createElement('div');
        newParagraph.className = 'se-text-paragraph';
        newParagraph.setAttribute('data-module', 'se2_text_paragraph');
        newParagraph.appendChild(fragment);

        // 중간 paragraph 다음에 삽입
        if (targetParagraph.parentElement) {
            targetParagraph.parentElement.insertBefore(newParagraph, targetParagraph.nextSibling);
        } else {
            contentContainer.appendChild(newParagraph);
        }

        // 에디터에 변경사항 알리기
        const event = new Event('input', { bubbles: true });
        newParagraph.dispatchEvent(event);

        return true;
    }, html);

    if (!success) {
        throw new Error('중간에 CTA 삽입 실패');
    }

    await self.delay(100);
}

// ========== 하단 CTA HTML 삽입 ==========

export async function insertCtaHtmlAtBottom(self: any, frame: any, page: any, html: string): Promise<void> {
    self.log(`🔗 CTA 버튼 HTML 삽입 시작...`);

    // 줄바꿈 2회 (해시태그와 CTA 사이 간격)
    await page.keyboard.press('Enter');
    await self.delay(100);
    await page.keyboard.press('Enter');
    await self.delay(100);

    // HTML에서 텍스트와 링크 추출
    const textMatch = html.match(/<a[^>]*>([^<]+)<\/a>/);
    const linkMatch = html.match(/href=["']([^"']+)["']/);
    const ctaText = textMatch ? textMatch[1] : '더 알아보기';
    const ctaLink = linkMatch ? linkMatch[1] : '#';

    self.log(`   → CTA 텍스트: "${ctaText}", 링크: "${ctaLink}"`);

    // 여러 방법으로 시도 (최대 3회)
    let success = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
        self.log(`   → 삽입 시도 ${attempt}/3...`);

        // 방법 1: 네이버 에디터 구조에 맞게 직접 DOM 삽입
        const result = await frame.evaluate((markup: string, buttonText: string) => {
            try {
                // 네이버 블로그 에디터 구조에 맞게 삽입
                const sectionText = document.querySelector('.se-section-text') ||
                    document.querySelector('.se-main-container') ||
                    document.querySelector('[contenteditable="true"]');

                if (!sectionText) {
                    console.error('[CTA] 에디터 영역을 찾을 수 없습니다');
                    return { success: false, method: 'no-editor' };
                }

                // 본문 컨테이너 찾기
                let contentContainer: Element | null = sectionText.querySelector('.se-module-text') ||
                    sectionText.querySelector('.se-module.se-module-text') ||
                    sectionText.querySelector('.se-component-content') ||
                    sectionText;

                if (!contentContainer) {
                    const firstParagraph = sectionText.querySelector('.se-text-paragraph');
                    if (firstParagraph && firstParagraph.parentElement) {
                        contentContainer = firstParagraph.parentElement;
                    } else {
                        contentContainer = sectionText;
                    }
                }

                // 마지막 paragraph 찾기
                const paragraphs = contentContainer.querySelectorAll('.se-text-paragraph');
                let insertAfter: Element | null = null;

                if (paragraphs.length > 0) {
                    insertAfter = paragraphs[paragraphs.length - 1];
                }

                // HTML 파싱하여 버튼 생성
                const temp = document.createElement('div');
                temp.innerHTML = markup.trim();
                const buttonElement = temp.querySelector('a') || temp.firstElementChild;

                if (!buttonElement) {
                    console.error('[CTA] 버튼 요소를 생성할 수 없습니다');
                    return { success: false, method: 'no-button' };
                }

                // 네이버 에디터 구조에 맞는 paragraph 생성
                const newParagraph = document.createElement('div');
                newParagraph.className = 'se-text-paragraph';
                newParagraph.setAttribute('data-module', 'se2_text_paragraph');
                newParagraph.style.textAlign = 'center';
                newParagraph.style.margin = '40px 0';

                // 버튼을 paragraph 안에 삽입
                newParagraph.appendChild(buttonElement.cloneNode(true) as Node);

                // 마지막 paragraph 다음에 삽입
                if (insertAfter && insertAfter.parentElement) {
                    insertAfter.parentElement.insertBefore(newParagraph, insertAfter.nextSibling);
                } else {
                    contentContainer.appendChild(newParagraph);
                }

                // 에디터에 변경사항 알리기
                const events = ['input', 'change', 'keyup', 'blur'];
                events.forEach(eventType => {
                    const event = new Event(eventType, { bubbles: true, cancelable: true });
                    newParagraph.dispatchEvent(event);
                    contentContainer?.dispatchEvent(event);
                });

                // 네이버 에디터 내부 업데이트 시도
                try {
                    const editor = (window as any).editor ||
                        (window as any).se2Editor ||
                        (window as any).__se2Editor__;
                    if (editor) {
                        if (typeof editor.update === 'function') editor.update();
                        if (typeof editor.sync === 'function') editor.sync();
                        if (typeof editor.triggerChange === 'function') editor.triggerChange();
                    }
                } catch (e) {
                    console.log('[CTA] 에디터 업데이트 함수 호출 실패 (무시)');
                }

                // 삽입 확인 - 실제로 DOM에 있는지 체크 (바로 확인)
                const insertedElements = contentContainer.querySelectorAll('.se-text-paragraph');
                for (let i = insertedElements.length - 1; i >= 0; i--) {
                    const p = insertedElements[i] as HTMLElement;
                    const innerHTML = p.innerHTML || '';
                    if (innerHTML.includes(buttonText) ||
                        innerHTML.includes('background:') ||
                        innerHTML.includes('linear-gradient') ||
                        innerHTML.includes('href=')) {
                        return { success: true, method: 'direct-insert' };
                    }
                }

                return { success: false, method: 'not-found' };
            } catch (error) {
                console.error('[CTA] 삽입 중 오류:', error);
                return { success: false, method: 'error', error: String(error) };
            }
        }, html, ctaText).catch(() => ({ success: false, method: 'exception' }));

        if (result && result.success) {
            self.log(`   ✅ CTA 버튼 삽입 성공 (방법: ${result.method})`);
            success = true;
            break;
        } else {
            self.log(`   ⚠️ 삽입 시도 ${attempt} 실패 (방법: ${result?.method || 'unknown'})`);
            await self.delay(500);
        }
    }

    if (!success) {
        self.log(`⚠️ 직접 삽입 실패, 타이핑 방식으로 재시도...`);
        await insertCtaViaTyping(self, page, html);
    } else {
        // 삽입 확인 (더 강력한 확인)
        await self.delay(500);
        const verified = await frame.evaluate((buttonText: string) => {
            const paragraphs = document.querySelectorAll('.se-text-paragraph');
            for (let i = paragraphs.length - 1; i >= 0; i--) {
                const p = paragraphs[i] as HTMLElement;
                const html = p.innerHTML || '';
                // 다양한 패턴으로 확인
                if (html.includes(buttonText) ||
                    html.includes('background:') ||
                    html.includes('linear-gradient') ||
                    html.includes('border-radius:') ||
                    (html.includes('href=') && html.includes('display: inline-block'))) {
                    return true;
                }
            }
            return false;
        }, ctaText).catch(() => false);

        if (!verified) {
            self.log(`⚠️ CTA 삽입 확인 실패, 최종 재시도...`);
            await self.delay(300);
            await insertCtaViaTyping(self, page, html);
        } else {
            self.log(`   ✅ CTA 버튼 삽입 및 확인 완료`);
        }
    }

    // 삽입 후 충분한 대기 (에디터 렌더링 대기)
    await self.delay(500);
}

// ========== 타이핑 방식 CTA 삽입 (폴백) ==========

export async function insertCtaViaTyping(self: any, page: any, html: string): Promise<void> {
    try {
        // HTML에서 텍스트와 링크 추출
        const match = html.match(/<a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/);
        if (!match) {
            throw new Error('CTA HTML 파싱 실패');
        }

        const link = match[1];
        const text = match[2];

        // 텍스트 입력
        await safeKeyboardType(page, text, { delay: 30 });
        await self.delay(100);

        // 텍스트 선택
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await self.delay(100);

        // 링크 버튼 찾기 및 클릭
        const frame = (await self.getAttachedFrame());
        const linkButtonSelectors = [
            'button.se-toolbar-button[data-name="link"]',
            'button[data-name="link"]',
            'button[aria-label*="링크"]',
            'button[aria-label*="Link"]',
        ];

        for (const selector of linkButtonSelectors) {
            try {
                const linkButton = await frame.$(selector).catch(() => null);
                if (linkButton) {
                    await linkButton.click();
                    await self.delay(200);

                    // 링크 입력 필드 찾기
                    const linkInput = await frame.$('input[type="url"], input[placeholder*="링크"], input[placeholder*="URL"]').catch(() => null);
                    if (linkInput) {
                        await linkInput.click();
                        await self.delay(50);
                        await linkInput.type(link, { delay: 30 });
                        await self.delay(100);

                        // 확인 버튼 클릭
                        const confirmButton = await frame.$('button:has-text("확인"), button:has-text("OK"), button[type="submit"]').catch(() => null);
                        if (confirmButton) {
                            await confirmButton.click();
                            await self.delay(200);
                        }
                    }
                    break;
                }
            } catch {
                continue;
            }
        }

        // 중앙 정렬
        await page.keyboard.down('Control');
        await page.keyboard.press('e');
        await page.keyboard.up('Control');
        await self.delay(100);

    } catch (error) {
        self.log(`⚠️ 타이핑 방식 CTA 삽입도 실패: ${(error as Error).message}`);
    }
}
