/**
 * editorHelpers.ts - 에디터 조작/컨텐츠 적용 관련 함수
 * naverBlogAutomation.ts에서 추출됨
 */
import { Page, Frame, ElementHandle } from 'puppeteer';
import {
  SELECTORS,
  findElement,
  findAllElements,
  waitForElement,
  getAllSelectors,
  getSelectorStrings,
} from './selectors';

// Type alias for resolved run options
type ResolvedRunOptions = any;
import type { StructuredContent, ImagePlan } from '../contentGenerator.js';
import type { GhostCursor } from '../ghostCursorHelper.js';
import { PREV_POST_HOOKS } from './ctaHelpers.js';
// ✅ [Phase 4A] 공유 유틸리티 import (중복 제거)
import { extractCoreKeywords, safeKeyboardType } from './typingUtils.js';

// ── Local utility: smartTypeWithAutoHighlight ──
async function smartTypeWithAutoHighlight(
  page: Page,
  text: string,
  options: {
    baseDelay?: number;
    enableHighlight?: boolean;
  } = {}
): Promise<void> {
  const { baseDelay = 80, enableHighlight = true } = options;

  try {
    if (!text || text.trim().length === 0) {
      return;
    }

    if (!enableHighlight) {
      await safeKeyboardType(page, text, { delay: baseDelay });
      return;
    }

    const keywords = extractCoreKeywords(text);
    console.log("🤖 [SmartType] 감지된 핵심 키워드:", keywords);

    if (!keywords || keywords.length === 0) {
      console.log("⚠️ [SmartType] 키워드 없음, 일반 타이핑으로 진행");
      await safeKeyboardType(page, text, { delay: baseDelay });
      return;
    }

    const escapedKeywords = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escapedKeywords.join('|')})`, 'g');
    const parts = text.split(regex);

    let highlightCount = 0;
    for (const part of parts) {
      if (!part) continue;

      const delay = Math.floor(Math.random() * 50) + baseDelay;
      await safeKeyboardType(page, part, { delay });

      await new Promise(r => setTimeout(r, 250));

      if (keywords.includes(part)) {
        await page.keyboard.down('Shift');
        for (let i = 0; i < part.length; i++) {
          await page.keyboard.press('ArrowLeft');
        }
        await page.keyboard.up('Shift');
        await new Promise(r => setTimeout(r, 80));

        await page.keyboard.down('Control');
        await page.keyboard.press('KeyB');
        await page.keyboard.up('Control');
        await new Promise(r => setTimeout(r, 50));

        await page.keyboard.down('Control');
        await page.keyboard.press('KeyU');
        await page.keyboard.up('Control');
        await new Promise(r => setTimeout(r, 50));

        await page.keyboard.press('ArrowRight');
        await new Promise(r => setTimeout(r, 80));

        highlightCount++;
        console.log(`✨ [SmartType] 키워드 강조 완료: "${part}"`);
      }
    }

    console.log(`✅ [SmartType] 완료: ${highlightCount}개 키워드 강조됨`);
  } catch (e) {
    console.error("[SmartType] 타이핑 중 오류:", e);
    try {
      await safeKeyboardType(page, text, { delay: baseDelay });
    } catch (fallbackErr) {
      console.error("[SmartType] 폴백 타이핑도 실패:", fallbackErr);
    }
  }
}

import {
  generateProductSpecTableImage,
  generateProsConsTableImage,
  extractSpecsFromContent,
  generateCtaBannerImage,
  generateTableFromUrl
} from '../image/tableImageGenerator.js';
import { extractProsConsWithGemini } from '../image/geminiTableExtractor.js';

// ── insertQuotation ──

// 인용구 삽입 헬퍼
// style: 'line' = 인용구 1 (기본), 'underline' = 인용구 4 (쇼핑커넥트용)
export async function insertQuotation(self: any, frame: Frame, page: Page, style: string = 'line'): Promise<void> {
  // ✅ [Phase 1-1] 셀렉터 레지스트리 사용
  const selectors = [...getAllSelectors(SELECTORS.editor.quotationButton)];

  // 1) 인용구 버튼 클릭 (팝업 열기)
  const clicked = await self.clickToolbarButton(frame, page, selectors);
  if (!clicked) {
    self.log('   ⚠️ 인용구 버튼을 찾을 수 없습니다.');
    // 버튼을 못 찾았더라도 텍스트 입력은 시도해야 함
    return;
  }

  // 팝업이 렌더링될 시간을 충분히 줍니다. 네트워크/DOM 속도에 따라 다를 수 있음
  await self.delay(self.DELAYS.MEDIUM);

  // 2) 스타일에 따라 적절한 인용구 선택
  // ✅ [복구] 쇼핑커넥트 모드: 'underline' (4번, 밑줄) / 일반 모드: 'line' (2번, 버티컬 바)
  let targetStyleClass = 'quotation_line';
  let targetButtonIndex = 1; // 기본: 2번 인용구 (버티컬 바)

  if (style === 'bracket' || style === 'quotation_bracket' || style === '1') {
    // 1번 인용구 (따옴표)
    targetStyleClass = 'quotation_quote';
    targetButtonIndex = 0;
  } else if (style === 'underline' || style === 'quotation_underline' || style === '4') {
    // 4번 인용구 (밑줄) - 쇼핑커넥트 모드 전용
    targetStyleClass = 'quotation_underline';
    targetButtonIndex = 3;
  } else {
    // 기본: 2번 인용구 (버티컬 라인) - 일반 모드
    targetStyleClass = 'quotation_line';
    targetButtonIndex = 1;
  }

  self.log(`   🔸 인용구 스타일 적용: ${targetStyleClass} (Index: ${targetButtonIndex})`);

  // 3) 스타일 버튼 클릭 시도 (Retry 로직 추가)
  // 팝업이 iframe 안에 있을 수도 있고, top document에 있을 수도 있음 (SmartEditor 버전에 따라 다름)
  let styleClicked = false;

  // 시도 1: Frame 내부에서 찾기
  try {
    styleClicked = await frame.evaluate((targetClass, btnIndex) => {
      // A. 클래스명/속성으로 정확히 찾기 (사용자 제공 셀렉터 우선)
      const exactSelectors = [
        `.se-toolbar-option-insert-quotation-${targetClass}-button`,
        `button[data-value="${targetClass}"]`,
        `li[data-value="${targetClass}"]`,
        `.se-toolbar-option-${targetClass}-button`,
        // 하위 호환성
        `.se-toolbar-option-insert-quotation-${targetClass.replace('quotation_', '')}-button`,
        `.se-popup-content button:nth-child(${btnIndex + 1})`,
        `.se-popup-quotation button:nth-child(${btnIndex + 1})`
      ];

      for (const sel of exactSelectors) {
        const btn = document.querySelector(sel);
        if (btn && (btn as HTMLElement).offsetParent !== null) {
          (btn as HTMLElement).click();
          console.log(`[insertQuotation] 클릭 성공: ${sel}`);
          return true;
        }
      }

      // B. 팝업 레이어 찾아서 인덱스로 클릭 (버튼 또는 li)
      const layers = document.querySelectorAll('.se-popup-quotation, .se-toolbar-layer-quotation, .se-layer-quotation, .se-popup-layer, .se-popup-content, .se-toolbar-popup');
      for (const layer of layers) {
        if ((layer as HTMLElement).offsetParent === null) continue; // 안 보이는 레이어 제외

        // 버튼 먼저 시도
        const btns = Array.from(layer.querySelectorAll('button, li[data-value], .se-toolbar-button'));
        if (btns.length > 0) {
          const availableBtns = btns.map((b, idx) => `${idx}:${b.textContent?.trim() || (b as any).dataset?.value || b.className}`);
          console.log(`[insertQuotation] 발견된 버튼들: ${availableBtns.join(', ')}`);

          if (btns.length > btnIndex) {
            (btns[btnIndex] as HTMLElement).click();
            console.log(`[insertQuotation] 인덱스 클릭 성공: ${btnIndex} (총 ${btns.length}개)`);
            return true;
          }
        }
      }

      console.log('[insertQuotation] 팝업 내 버튼/li 찾지 못함');
      return false;
    }, targetStyleClass, targetButtonIndex);
  } catch (e) { /* ignore */ }

  // 시도 2: Page(Main Document)에서 찾기 (Frame에서 실패한 경우)
  if (!styleClicked) {
    try {
      styleClicked = await page.evaluate((targetClass, btnIndex) => {
        // A. 클래스명으로 찾기
        const exactSelectors = [
          `.se-toolbar-option-insert-quotation-${targetClass}-button`,
          `.se-toolbar-option-${targetClass}-button`,
          `button[data-value="quotation_${targetClass}"]`,
          `button[data-value="${targetClass}"]`,
          // ✅ 추가: li 기반 선택자
          `li[data-value="quotation_${targetClass}"]`,
          `li.se-toolbar-option-insert-quotation-${targetClass}`,
          `.se-popup-content button:nth-child(${btnIndex + 1})`,
          `.se-popup-quotation button:nth-child(${btnIndex + 1})`
        ];
        for (const sel of exactSelectors) {
          const btn = document.querySelector(sel);
          if (btn && (btn as HTMLElement).offsetParent !== null) {
            (btn as HTMLElement).click();
            console.log(`[insertQuotation] Page 레벨 클릭 성공: ${sel}`);
            return true;
          }
        }

        // B. 팝업 레이어에서 찾기
        const layers = document.querySelectorAll('.se-popup-quotation, .se-toolbar-layer-quotation, .se-layer-quotation, .se-popup-layer, .se-popup-content, .se-toolbar-popup');
        for (const layer of layers) {
          if ((layer as HTMLElement).offsetParent === null) continue;

          // 버튼 먼저
          const btns = Array.from(layer.querySelectorAll('button'));
          if (btns.length > btnIndex) {
            (btns[btnIndex] as HTMLElement).click();
            console.log(`[insertQuotation] Page 버튼 인덱스 클릭: ${btnIndex}`);
            return true;
          }

          // li 요소
          const lis = Array.from(layer.querySelectorAll('li[data-value]'));
          if (lis.length > btnIndex) {
            (lis[btnIndex] as HTMLElement).click();
            console.log(`[insertQuotation] Page li 인덱스 클릭: ${btnIndex}`);
            return true;
          }
        }
        return false;
      }, targetStyleClass, targetButtonIndex);
    } catch (e) { /* ignore */ }
  }

  if (!styleClicked) {
    self.log('   ⚠️ 인용구 스타일 버튼을 찾지 못했습니다. (기본 스타일로 진행 가능성 있음)');
  } else {
    self.log(`   ✅ 인용구 스타일 선택 성공: ${style}`);
  }

  await self.delay(self.DELAYS.SHORT);
}

// ── typeBodyWithRetry ──


// 본문 입력 (재시도 + 검증 포함)
export async function typeBodyWithRetry(self: any,
  frame: Frame,
  page: Page,
  text: string,
  fontSize: number = 19
): Promise<void> {
  // 🔍 디버그: 원본 텍스트 확인
  self.log(`   🔍 [디버그] typeBodyWithRetry 호출됨`);
  self.log(`   🔍 [디버그] 원본 텍스트 길이: ${text.length}자`);
  self.log(`   🔍 [디버그] 원본 텍스트 시작 50자: ${text.substring(0, 50)}...`);

  await self.retry(async () => {
    self.log(`   → 본문 입력 시작 (${text.length}자)`);

    // ✅ 안전 검사: 열린 패널/모달 닫기 (ABOUT, 지도, 함수 등 방지)
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Escape');
      await self.delay(50);
    }

    // 열린 패널 강제 닫기
    await frame.evaluate(() => {
      const panels = document.querySelectorAll('.se-popup, .se-panel, .se-layer, .se-modal, [class*="popup"], [class*="layer"]');
      panels.forEach(panel => {
        if (panel instanceof HTMLElement && panel.style.display !== 'none') {
          const closeBtn = panel.querySelector('button[class*="close"], .close, [aria-label*="닫기"]');
          if (closeBtn instanceof HTMLElement) {
            closeBtn.click();
          }
        }
      });
    }).catch(() => { });

    // ⚠️ Frame이 detached되었는지 확인 후 재연결 시도
    try {
      await frame.evaluate(() => true);
    } catch (error) {
      if ((error as Error).message.includes('detached')) {
        self.log('   ⚠️ Frame이 detached 됨. 메인 프레임을 재연결합니다...');
        await self.switchToMainFrame();
        frame = (await self.getAttachedFrame());
      } else {
        throw error;
      }
    }

    // 1. 폰트 크기 설정
    await self.setFontSize(fontSize, true);
    await self.delay(self.DELAYS.SHORT);

    // ✅ 본문은 굵게가 남지 않도록 해제
    await self.setBold(false);
    await self.delay(self.DELAYS.SHORT);

    // ✅ [2026-03-16 OVERHAUL] AI가 결정한 문단 구분을 그대로 존중
    // 기존: 3문장마다 기계적으로 끊기 → 부자연스러운 줄바꿈 발생
    // 개선: AI가 보낸 \n\n(문단 구분)과 \n(줄바꿈)을 그대로 따름
    //       타이핑 속도 20ms 유지 (대량발행 성능), Enter 딜레이만 랜덤화

    // 1단계: \r\n → \n 정규화
    const normalizedText = text.replace(/\r\n/g, '\n');

    // 2단계: \n\n 기준으로 문단(paragraph) 분리
    const paragraphs = normalizedText
      .split(/\n{2,}/)
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0);

    self.log(`   🔍 [AI 문단] 원본 ${text.length}자 → ${paragraphs.length}개 문단 감지`);

    let totalTypedChars = 0;
    let isFirstParagraph = true;

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      // ✅ [중지 체크] 각 문단 처리 전 중지 여부 확인
      self.ensureNotCancelled();

      const paragraph = paragraphs[pIdx];
      if (!paragraph) continue;

      // 3단계: 각 문단 내 단일 줄바꿈(\n) 기준으로 줄(line) 분리
      const lines = paragraph.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);

      for (let lIdx = 0; lIdx < lines.length; lIdx++) {
        const line = lines[lIdx];
        if (!line) continue;

        totalTypedChars += line.length;

        // 타이핑 (속도 20ms 유지 — 대량발행 성능)
        await smartTypeWithAutoHighlight(page, line, { baseDelay: 20, enableHighlight: false });
        await self.delay(self.DELAYS.MEDIUM);

        // ✅ 첫 문단 첫 줄만 입력 검증 (성능 최적화)
        if (isFirstParagraph && lIdx === 0) {
          isFirstParagraph = false;
          await self.delay(600);

          const firstPart = line.substring(0, Math.min(10, line.length)).trim();
          if (firstPart) {
            const inputVerified = await frame.evaluate((textPart: string) => {
              const sectionText = document.querySelector('.se-section-text');
              if (sectionText) {
                const content = (sectionText.textContent || '').trim();
                if (content.includes(textPart)) return true;
              }
              const bodyContent = (document.body.textContent || '').trim();
              return bodyContent.includes(textPart);
            }, firstPart);

            if (!inputVerified) {
              self.log(`   ⚠️ 첫 줄 입력 확인 실패 - 재확인 중...`);
              await self.delay(800);
              const retryVerified = await frame.evaluate((textPart: string) => {
                const bodyContent = (document.body.textContent || '').trim();
                return bodyContent.includes(textPart);
              }, firstPart);
              self.log(retryVerified ? `   ✅ 재확인 성공` : `   ⚠️ 확인 실패 (계속 진행)`);
            } else {
              self.log(`   ✅ 첫 줄 입력 확인 완료`);
            }
          }
        }

        // 줄 내부 구분: 단일 줄바꿈 → Enter 1회 (리스트, 강조 등 보존)
        if (lIdx < lines.length - 1) {
          try {
            const lineBreakDelay = Math.floor(Math.random() * 200) + 150; // 150~350ms 랜덤
            await page.keyboard.press('Enter');
            await self.delay(lineBreakDelay);
          } catch (e) {
            self.log(`   ⚠️ 줄바꿈 Enter 실패: ${(e as Error).message}`);
          }

          // Enter 후 폰트 크기 유지
          await self.setFontSize(fontSize, true);
          await self.delay(50);
        }
      }

      self.log(`   📝 [문단 ${pIdx + 1}/${paragraphs.length}] ${lines.length}개 줄, ${paragraph.length}자`);

      // 문단 간 구분: Enter 2회 (마지막 문단 제외)
      if (pIdx < paragraphs.length - 1) {
        try {
          // ✅ Enter 딜레이 랜덤화 (200~600ms) — 사람처럼 불규칙하게
          const enterDelay1 = Math.floor(Math.random() * 300) + 200; // 200~500ms
          const enterDelay2 = Math.floor(Math.random() * 300) + 200; // 200~500ms
          await page.keyboard.press('Enter');
          await self.delay(enterDelay1);
          await page.keyboard.press('Enter');
          await self.delay(enterDelay2);
        } catch (enterError) {
          self.log(`   ⚠️ [문단구분] Enter 입력 실패: ${(enterError as Error).message}`);
        }

        // Enter 후 폰트 크기 유지를 위해 다시 설정
        await self.setFontSize(fontSize, true);
        await self.delay(self.DELAYS.SHORT);
      }
    }

    self.log(`   🔍 [최종] 원본 ${text.length}자 → 실제 타이핑 ${totalTypedChars}자 (차이: ${text.length - totalTypedChars}자)`);

    // 3. DOM 업데이트 대기 (이미지 삽입 후 충분한 대기)
    await self.delay(self.DELAYS.LONG); // 500ms 추가 대기

    // 4. DOM 검증 (강화된 검증 로직)
    // 본문의 경우 첫 30자만 검증
    const textToVerify = text.substring(0, Math.min(30, text.length)).trim();
    if (textToVerify.length > 0) {
      // 여러 번 시도 (DOM 업데이트 지연 대비)
      let verified = false;
      for (let verifyAttempt = 0; verifyAttempt < 5; verifyAttempt++) {
        if (verifyAttempt > 0) {
          await self.delay(500); // 재시도 전 대기 시간 증가
        }

        // ✅ 개선: 더 폭넓은 선택자로 에디터 내용 확인
        const editorContent = await frame.evaluate(() => {
          const possibleSelectors = [
            '.se-section-text',
            '.se-main-container',
            '.se-component-content',
            '[contenteditable="true"]',
            '.se-text-paragraph',
            '.se-component'
          ];

          let combinedText = '';
          for (const selector of possibleSelectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              combinedText += ' ' + ((el as HTMLElement).innerText || el.textContent || '');
            });
          }
          return combinedText.trim();
        });

        if (editorContent.length > 0) {
          // 에디터에 내용이 있으면 검증 시도
          verified = await self.verifyContentInDOM(frame, textToVerify, 'body');
          if (verified) {
            self.log(`   ✅ 본문 DOM 검증 완료 (에디터 내용: ${editorContent.length}자)`);
            break;
          } else {
            // ✅ [긴급 수정] 스마트 타이핑(HTML)으로 인해 텍스트 매칭이 실패하더라도 내용은 입력된 경우 통과
            if (editorContent.length > 30) { // 30자 이상이면 입력된 것으로 간주
              self.log(`   ⚠️ 정확한 매칭 실패했으나 내용 있음 (${editorContent.length}자) - 성공으로 간주`);
              verified = true;
              break;
            }
            self.log(`   ⚠️ 검증 시도 ${verifyAttempt + 1}/5: 에디터 내용은 있음 (${editorContent.length}자)이지만 검증 실패`);
          }
        } else {
          self.log(`   ⚠️ 검증 시도 ${verifyAttempt + 1}/5: 에디터 내용이 비어있음`);
        }
      }

      if (!verified) {
        // ✅ 검증 실패 시 에러 던지기 (빈 글 발행 방지)
        // ✅ 개선:broader selectors로 최종 확인 (querySelectorAll 사용)
        const finalContent = await frame.evaluate(() => {
          const possibleSelectors = ['.se-section-text', '.se-main-container', '[contenteditable="true"]', '.se-text-paragraph', '.se-component-content'];
          let combined = '';
          possibleSelectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
              combined += ' ' + (el.textContent || '');
            });
          });
          return combined.trim();
        });

        if (finalContent.length === 0) {
          throw new Error(`본문 입력 실패: 에디터에 내용이 없습니다. (검증 시도 5회 모두 실패)`);
        } else {
          self.log(`   ⚠️ 본문 DOM 검증 실패했지만 에디터에 내용이 있음 (${finalContent.length}자) - 계속 진행`);
        }
      }
    } else {
      // 텍스트가 비어있으면 에러
      throw new Error('본문 입력 실패: 입력할 텍스트가 비어있습니다.');
    }

    // 5. 마지막 Enter 2회 (본문 입력 완료 후)
    await page.keyboard.press('Enter');
    await self.delay(self.DELAYS.MEDIUM);
    await page.keyboard.press('Enter');
    await self.delay(self.DELAYS.MEDIUM);

    // Enter 후 DOM 안정화 대기
    await self.delay(self.DELAYS.SHORT);
  }, 3, '본문 입력');
}

// ── applyStructuredContent ──

export async function applyStructuredContent(self: any, resolved: ResolvedRunOptions): Promise<void> {
  // ✅ [2026-04-06 FIX v3] 공정문구 중복 방지 플래그
  // retry 재실행 시 이미 삽입된 공정문구를 다시 타이핑하지 않도록 함
  let ftcAlreadyInserted = false;

  await self.retry(async () => {
    const structured = resolved.structuredContent;
    if (!structured) {
      await self.applyPlainContent(resolved);
      return;
    }

    // ✅ 본문에서 중복된 CTA 텍스트 제거 (🔗 더 알아보기 등)
    if (structured.bodyPlain) {
      const cleanedBody = structured.bodyPlain
        .replace(/🔗\s*더\s*알아보기[^\n]*\n?/g, '') // "🔗 더 알아보기" 제거
        .replace(/더\s*알아보기[^\n]*\n?/g, '') // "더 알아보기" 제거
        .replace(/━━━━━━━━━━━━━━━━━━━━━━[^\n]*\n?/g, '') // 구분선 제거
        .replace(/👉\s*https?:\/\/[^\n]*\n?/g, '') // CTA 링크 제거
        .trim();

      if (cleanedBody !== structured.bodyPlain) {
        self.log('🧹 본문에서 중복된 CTA 텍스트 제거 완료');
        structured.bodyPlain = cleanedBody;
        resolved.content = cleanedBody;
      }
    }

    if (structured.bodyPlain) {
      structured.bodyPlain = self.stripRepeatedHookBlocks(structured.bodyPlain);
      structured.bodyPlain = self.enforceOrdinalLineBreaks(structured.bodyPlain);
      resolved.content = structured.bodyPlain;
    }

    // ✅ 반자동 모드: 사용자가 수정한 내용이 있으면 그것을 사용하여 타이핑
    if (resolved.imageMode === 'semi-auto') {
      self.log('🔍 반자동 모드: 에디터의 현재 내용을 확인합니다...');
      const currentContent = await self.getCurrentEditorContent();

      if (currentContent && (currentContent.title.length > 0 || currentContent.content.length > 0)) {
        self.log('✅ 에디터에 사용자가 수정한 내용이 있습니다. 수정된 내용을 그대로 타이핑합니다.');
        self.log(`📝 제목: ${currentContent.title.substring(0, 50)}${currentContent.title.length > 50 ? '...' : ''}`);
        self.log(`📄 본문 길이: ${currentContent.content.length}자`);
        if (currentContent.hashtags.length > 0) {
          self.log(`🏷️ 해시태그: ${currentContent.hashtags.join(', ')}`);
        }

        // ✅ 수정된 본문에서도 중복된 CTA 텍스트 제거
        let cleanedContent = currentContent.content
          .replace(/🔗\s*더\s*알아보기[^\n]*\n?/g, '')
          .replace(/더\s*알아보기[^\n]*\n?/g, '')
          .replace(/━━━━━━━━━━━━━━━━━━━━━━[^\n]*\n?/g, '')
          .replace(/👉\s*https?:\/\/[^\n]*\n?/g, '')
          .trim();

        cleanedContent = self.stripRepeatedHookBlocks(cleanedContent);
        cleanedContent = self.enforceOrdinalLineBreaks(cleanedContent);

        // 수정된 내용으로 structuredContent 업데이트
        structured.selectedTitle = currentContent.title || structured.selectedTitle;
        structured.bodyPlain = cleanedContent || structured.bodyPlain;
        if (currentContent.hashtags.length > 0) {
          structured.hashtags = currentContent.hashtags;
        }

        // ✅ 수정된 제목을 그대로 타이핑
        if (currentContent.title && currentContent.title.length > 0) {
          structured.selectedTitle = currentContent.title;
          resolved.title = currentContent.title;
          self.log('✅ 수정된 제목을 타이핑합니다.');
        }

        // 해시태그가 있으면 설정 (나중에 입력)
        if (currentContent.hashtags.length > 0) {
          structured.hashtags = currentContent.hashtags;
          resolved.hashtags = currentContent.hashtags;
        }

        // ✅ 수정된 본문 내용을 그대로 타이핑 (덮어쓰기)
        structured.bodyPlain = cleanedContent;
        resolved.content = cleanedContent;
        self.log('✅ 수정된 본문 내용을 타이핑합니다.');
        // 본문 타이핑은 아래 로직에서 계속 진행됨
      } else {
        self.log('ℹ️ 에디터에 내용이 없습니다. 생성된 콘텐츠를 적용합니다.');
      }
    }

    self.log('🧱 구조화된 콘텐츠를 체계적으로 적용합니다 (완전 순차 실행)...');
    self.log('📋 타이핑 순서: 제목 → Enter 2회 → 소제목(28px) → Enter 2회 → 이미지 → Enter 1회 → 본문(19px) → Enter 2회 → 반복');
    self.ensureNotCancelled();

    // ✅ [2026-03-05 FIX] retry 시마다 frame을 새로 가져오도록 수정 (detached frame 복구)
    // 기존: 함수 시작 시 한 번만 가져옴 → iframe 재로드 시 stale 참조로 에러 발생
    let frame = (await self.getAttachedFrame());
    const page = self.ensurePage();

    // 0. 글 톤 설정 (있는 경우)
    if (resolved.toneStyle) {
      await self.setToneStyle(resolved.toneStyle);
    }

    // 1. 도움말 닫기 버튼 클릭 (있는 경우)
    try {
      const helpCloseSelectors = [
        '.se-help-panel-close-button',
        '.se-hlpr-panel-close-button',
        '.se-hlpe-panel-close-button',
        'button[aria-label*="도움말"][aria-label*="닫기"]',
        'button[title*="도움말"][title*="닫기"]',
        'button[class*="help"][class*="close"]',
        'button[aria-label*="닫기"]',
        '.se-help-close',
      ];

      for (const selector of helpCloseSelectors) {
        const helpCloseButton = await frame.$(selector).catch(() => null);
        if (helpCloseButton) {
          const isVisible = await helpCloseButton.evaluate((el: Element) => {
            const htmlEl = el as HTMLElement;
            return htmlEl.offsetParent !== null && htmlEl.style.display !== 'none';
          }).catch(() => false);

          if (isVisible) {
            await helpCloseButton.click();
            await self.delay(self.DELAYS.MEDIUM);
            self.log('✅ 도움말 패널을 닫았습니다.');
            break;
          }
        }
      }
    } catch {
      // 도움말이 없으면 무시
    }

    // 1. 제목 입력 (본문 영역으로 자동 이동)
    self.log('📝 [1단계] 제목 입력 중...');
    await self.inputTitle(resolved.title);
    await self.delay(200); // 500ms → 200ms

    // 1-1. 서식 초기화 (제목 입력 후, 본문에서)
    self.log('🔄 에디터 서식 초기화 중...');
    await self.clearAllFormatting();
    await self.delay(300);

    // 1-2. CTA skipCta 체크
    if (resolved.skipCta) {
      self.log(`   🚫 CTA 없이 발행하기가 선택되어 CTA를 추가하지 않습니다.`);
    }

    // 2. 서론(Introduction) 작성
    const headings = structured.headings || [];
    const bodyText = structured.bodyPlain || '';

    // ✅ [2026-03-26 DEBUG] 반자동 편집 반영 확인 — bodyText와 resolved.content 일치 검증
    self.log(`🔍 [편집 검증] _bodyManuallyEdited=${structured._bodyManuallyEdited}, bodyText길이=${bodyText.length}, resolved.content길이=${resolved.content?.length}`);
    if (bodyText.length > 0) {
      self.log(`🔍 [편집 검증] bodyText 시작 50자: ${bodyText.substring(0, 50)}...`);
    }
    if (resolved.content && bodyText !== resolved.content) {
      self.log(`⚠️ [편집 검증] bodyText≠resolved.content! bodyText(${bodyText.length}자) vs content(${resolved.content.length}자)`);
    }
    // extractBodyForHeading 복잡한 파싱을 완전 우회하여 100% 편집 반영 보장
    if (structured._bodyManuallyEdited && headings.length > 0) {
      self.log('📝 [편집 감지] 사용자가 수정한 내용을 heading 위치 기반으로 직접 분할합니다.');

      // heading title 위치를 순차적으로 찾기 (중복 방지)
      const positions: { title: string; headingIdx: number; pos: number; len: number }[] = [];
      let searchFrom = 0;
      for (let hi = 0; hi < headings.length; hi++) {
        const h = headings[hi];
        if (!h?.title) continue;
        const idx = bodyText.indexOf(h.title, searchFrom);
        if (idx >= 0) {
          positions.push({ title: h.title, headingIdx: hi, pos: idx, len: h.title.length });
          searchFrom = idx + h.title.length;
        }
      }

      if (positions.length > 0) {
        // 서론 = 첫 heading title 앞의 텍스트
        const introText = bodyText.substring(0, positions[0].pos).trim();
        structured.introduction = introText.length > 0 ? introText : '';
        self.log(`   📖 서론 재추출: ${introText.length}자`);

        // 각 heading의 content = 현재 title 끝 ~ 다음 title 시작
        for (let pi = 0; pi < positions.length; pi++) {
          const contentStart = positions[pi].pos + positions[pi].len;
          const contentEnd = pi < positions.length - 1 ? positions[pi + 1].pos : bodyText.length;
          const content = bodyText.substring(contentStart, contentEnd).trim();
          headings[positions[pi].headingIdx].content = content;
          self.log(`   📝 소제목[${pi + 1}] "${positions[pi].title.substring(0, 20)}..." 본문: ${content.length}자`);
        }

        // 마무리는 마지막 heading.content에 자연 포함됨 → 별도 타이핑 스킵
        structured.conclusion = '';
        self.log('   ✅ 편집 분할 완료 (마무리는 마지막 소제목에 통합)');
      } else {
        // ✅ [2026-02-28 FIX] heading title 매칭 실패 시 bodyText 균등 분할로 폴백
        // extractBodyForHeading이 실패해서 cleanBody가 빈 문자열이 되는 것 방지
        self.log('   ⚠️ heading title을 bodyText에서 찾지 못함 → 균등 분할 폴백');
        const lines = bodyText.split('\n').filter((l: string) => l.trim().length > 0);
        const linesPerHeading = Math.max(1, Math.ceil(lines.length / headings.length));
        for (let hi = 0; hi < headings.length; hi++) {
          const startLine = hi * linesPerHeading;
          const endLine = Math.min(startLine + linesPerHeading, lines.length);
          const chunk = lines.slice(startLine, endLine).join('\n').trim();
          if (chunk.length > 0) {
            headings[hi].content = chunk;
            self.log(`   📝 균등분할 소제목[${hi + 1}] 본문: ${chunk.length}자`);
          }
        }
        structured.conclusion = '';
      }
    }

    // ✅ 쇼핑커넥트 모드 감지 (for 루프 밖에서 미리 체크)
    const isShoppingConnectModeGlobal = resolved.contentMode === 'affiliate' || !!resolved.affiliateLink;

    // ✅ [2026-02-24 FIX] 서론에 썸네일이 실제로 삽입되었는지 추적
    let thumbnailInsertedInIntro = false;
    // ✅ [2026-02-24 FIX] 이미 삽입된 이미지 파일 경로를 추적하여 중복 삽입 방지
    const usedImagePaths = new Set<string>();

    // ✅ [2026-03-26 FIX] 서론이 존재하면 무조건 작성 (10자 제한 제거 — 서론 스킵 완전 방지)
    if (structured.introduction && structured.introduction.trim().length > 0) {
      self.log('📖 서론 작성 중...');

      // ✅ [2026-04-06 FIX v4] 공정위 문구 최상단 삽입
      // 주의: ensureBodyFocus는 호출하지 않음 — 마지막 paragraph 끝으로 커서를 이동시켜 위치가 틀어짐
      // inputTitle() → Enter 2회 직후이므로 커서는 이미 본문 첫 paragraph 시작점에 있음
      if (!ftcAlreadyInserted) {
        const ftcText = structured.ftcDisclosure?.trim();
        if (ftcText) {
          self.log(`   ⚖️ 공정위 문구 최상단 삽입 중...`);
          // 커서를 본문 시작점으로 강제 이동 (Home 키)
          await page.keyboard.press('Home').catch(() => {});
          await self.delay(100);
          await safeKeyboardType(page, ftcText, { delay: 15 });
          await self.delay(300);
          await page.keyboard.press('Enter');
          await page.keyboard.press('Enter');
          await self.delay(200);
          ftcAlreadyInserted = true;
          self.log(`   ✅ 공정위 문구 삽입 완료`);
        } else if (resolved.affiliateLink) {
          const affiliateDisclosure = '※ 이 포스팅은 제휴 마케팅의 일환으로, 구매 시 소정의 수수료를 제공받을 수 있습니다.';
          self.log(`   📋[쇼핑커넥트] 제휴 마케팅 고지 문구 최상단 삽입 중...`);
          await page.keyboard.press('Home').catch(() => {});
          await self.delay(100);
          await safeKeyboardType(page, affiliateDisclosure, { delay: 15 });
          await self.delay(300);
          await page.keyboard.press('Enter');
          await page.keyboard.press('Enter');
          await self.delay(200);
          ftcAlreadyInserted = true;
          self.log(`   ✅ 제휴 마케팅 고지 문구 최상단 삽입 완료`);
        }
      } else {
        self.log(`   ⏭️ 공정위 문구 이미 삽입됨 (retry 중복 방지)`);
      }

      // 썸네일 이미지 검색 ('🖼️ 썸네일' 키로 저장됨)
      let introImages = (resolved.images || []).filter((img: any) =>
        img.heading === '🖼️ 썸네일' || img.heading === '썸네일' || img.isThumbnail === true || img.isIntro === true
      );

      // ✅ [2026-02-24 FIX] 쇼핑커넥트: 수집 이미지 + 텍스트 오버레이 썸네일 / 비쇼핑커넥트: renderer.ts에서 생성
      if (introImages.length === 0 && !resolved.skipImages) {
        const isShoppingConnectMode = (resolved as any).isShoppingConnect || (resolved as any).contentMode === 'affiliate';

        if (isShoppingConnectMode) {
          // ✅ 쇼핑커넥트: 수집된 제품 이미지 + 텍스트 오버레이로 썸네일 생성
          self.log(`   🛒 쇼핑커넥트: 수집 이미지 기반 썸네일 생성 중...`);
          try {
            const { generateThumbnailWithTextOverlay } = await import('../image/tableImageGenerator.js');
            const blogTitle = resolved.title || structured.selectedTitle || '상품 리뷰';

            // 수집된 이미지 찾기 (collectedImages → resolved.images 중 collected → 기타)
            let productImagePath = '';

            // 1순위: collectedImages
            const collectedImages = resolved.collectedImages || [];
            if (collectedImages.length > 0) {
              const firstImg = collectedImages[0] as any;
              productImagePath = firstImg?.url || firstImg?.thumbnailUrl || firstImg?.filePath || '';
              if (productImagePath) self.log(`   📦 수집 이미지 발견 (collectedImages)`);
            }

            // 2순위: resolved.images 중 source=collected
            if (!productImagePath) {
              const allImages = resolved.images || [];
              const collectedImg = allImages.find((img: any) =>
                (img.source === 'collected' || img.isCollected === true || img.provider === 'collected') &&
                (img.url || img.filePath)
              );
              if (collectedImg) {
                productImagePath = (collectedImg as any)?.url || (collectedImg as any)?.filePath || '';
                self.log(`   📦 수집 이미지 발견 (source=collected)`);
              }
            }

            // 3순위: 네이버 쇼핑 도메인 URL
            if (!productImagePath) {
              const allImages = resolved.images || [];
              const naverImg = allImages.find((img: any) => {
                const url = (img.url || img.filePath || '').toLowerCase();
                return url.includes('shop-phinf.pstatic.net') || url.includes('pstatic.net');
              });
              if (naverImg) {
                productImagePath = (naverImg as any)?.url || (naverImg as any)?.filePath || '';
                self.log(`   📦 네이버 쇼핑 이미지 발견`);
              }
            }

            if (productImagePath) {
              const thumbnailPath = await generateThumbnailWithTextOverlay(productImagePath, blogTitle);
              if (thumbnailPath) {
                self.log(`   ✅ 수집 이미지 + 텍스트 오버레이 썸네일 생성 완료`);
                await self.insertBase64ImageAtCursor(thumbnailPath);
                // ✅ [2026-02-26 FIX] 썸네일 삽입 후 에디터 렌더링 확인 (대기 시간 500ms→2000ms + 폴링 검증)
                await self.delay(2000);
                await self.verifyImageInserted(frame, '썸네일(쇼핑커넥트)');
                thumbnailInsertedInIntro = true;
                usedImagePaths.add(thumbnailPath);
                if (resolved.affiliateLink) {
                  await self.attachLinkToLastImage(resolved.affiliateLink);
                }
              }
            } else {
              self.log(`   ⚠️ 수집 이미지 없음 → 썸네일 스킵`);
            }
          } catch (thumbError) {
            self.log(`   ⚠️ 수집 이미지 썸네일 생성 실패: ${(thumbError as Error).message}`);
          }
        } else {
          // 비쇼핑커넥트: renderer.ts에서 전용 AI 썸네일 이미 생성됨
          self.log(`   ℹ️ 서론 이미지 없음 → 전용 AI 썸네일은 renderer.ts에서 별도 생성됩니다`);
        }
      } else if (introImages.length > 0 && !resolved.skipImages) {
        // ✅ [2026-02-23 FIX] 엔진별 썸네일 텍스트 처리 분기
        const firstIntroImage = introImages[0] as any;
        const imageProvider = firstIntroImage?.provider || '';
        const isNanoBanana = imageProvider === 'nano-banana-pro' || imageProvider === 'pollinations';

        if (resolved.includeThumbnailText && !isNanoBanana) {
          // ✅ 나노바나나프로 외 엔진: AI 이미지 위에 SVG 텍스트 오버레이 적용
          self.log(`   🎨 AI 생성 썸네일에 SVG 텍스트 오버레이 적용 중... (엔진: ${imageProvider})`);
          try {
            const { generateThumbnailWithTextOverlay } = await import('../image/tableImageGenerator.js');
            const blogTitle = resolved.title || structured.selectedTitle || '';
            const imagePath = firstIntroImage?.filePath || firstIntroImage?.url || '';

            if (imagePath && blogTitle) {
              const overlayPath = await generateThumbnailWithTextOverlay(imagePath, blogTitle);
              if (overlayPath) {
                self.log(`   ✅ 텍스트 오버레이 썸네일 생성 완료`);
                await self.insertBase64ImageAtCursor(overlayPath);
                // ✅ [2026-02-26 FIX] 썸네일 삽입 후 에디터 렌더링 확인 (대기 시간 500ms→2000ms + 폴링 검증)
                await self.delay(2000);
                await self.verifyImageInserted(frame, '썸네일(오버레이)');
                thumbnailInsertedInIntro = true;
                usedImagePaths.add(overlayPath);
                if (imagePath) usedImagePaths.add(imagePath);
                if (resolved.affiliateLink) {
                  await self.attachLinkToLastImage(resolved.affiliateLink);
                }

                // ✅ [2026-03-26 FIX] 대표이미지에 추가 이미지가 있으면 오버레이 후 순차 삽입
                // introImages[0]은 오버레이 처리 완료 → 나머지(인덱스 1~)를 원본 그대로 삽입
                if (introImages.length > 1) {
                  const remainingImages = introImages.slice(1);
                  self.log(`   📸 대표이미지 추가 이미지 ${remainingImages.length}개 삽입 중...`);
                  await self.insertImagesAtCurrentCursor(remainingImages, page, frame, resolved.affiliateLink);
                  remainingImages.forEach((img: any) => { const p = img?.filePath || img?.url; if (p) usedImagePaths.add(p); });
                  self.log(`   ✅ 대표이미지 추가 이미지 ${remainingImages.length}개 삽입 완료`);
                }
              } else {
                self.log(`   ⚠️ 텍스트 오버레이 실패 → 원본 AI 이미지 삽입`);
                await self.insertImagesAtCurrentCursor(introImages, page, frame, resolved.affiliateLink);
                thumbnailInsertedInIntro = true;
                introImages.forEach((img: any) => { const p = img?.filePath || img?.url; if (p) usedImagePaths.add(p); });
              }
            } else {
              await self.insertImagesAtCurrentCursor(introImages, page, frame, resolved.affiliateLink);
              thumbnailInsertedInIntro = true;
              introImages.forEach((img: any) => { const p = img?.filePath || img?.url; if (p) usedImagePaths.add(p); });
            }
          } catch (overlayError) {
            self.log(`   ⚠️ 텍스트 오버레이 실패: ${(overlayError as Error).message} → 원본 삽입`);
            await self.insertImagesAtCurrentCursor(introImages, page, frame, resolved.affiliateLink);
          }
        } else {
          // ✅ 나노바나나프로: AI가 직접 한글 텍스트 포함 → 그대로 삽입
          // 또는 includeThumbnailText가 비활성화 → 텍스트 없이 삽입
          self.log(`   📸 서론 이미지 ${introImages.length}개 삽입 중... ${isNanoBanana ? '(나노바나나프로 한글 텍스트 포함)' : '(텍스트 없음)'}`);
          await self.insertImagesAtCurrentCursor(introImages, page, frame, resolved.affiliateLink);
          thumbnailInsertedInIntro = true;
          introImages.forEach((img: any) => { const p = img?.filePath || img?.url; if (p) usedImagePaths.add(p); });
        }
      }

      // 서론 본문 타이핑
      await self.typeBodyWithRetry(frame, page, structured.introduction.trim(), 19);
      await self.delay(self.DELAYS.MEDIUM);

      // 서론 후 구분선
      await self.insertHorizontalLine();
      await page.keyboard.press('Enter'); // ✅ [2026-01-19] 엔터 1회로 축소 (2회 → 1회)
      await self.delay(self.DELAYS.MEDIUM);

      self.log('   ✅ 서론 작성 완료');
    } else {
      self.log('   ⏭️ 서론 텍스트 없음 (서론이 비어있습니다)');

      // ✅ [2026-04-06 FIX v4] 서론이 없어도 공정위 문구/제휴 고지문 삽입
      if (!ftcAlreadyInserted) {
        const ftcTextNoIntro = structured.ftcDisclosure?.trim();
        if (ftcTextNoIntro) {
          self.log(`   ⚖️ 공정위 문구 최상단 삽입 중 (서론 없음)...`);
          await page.keyboard.press('Home').catch(() => {});
          await self.delay(100);
          await safeKeyboardType(page, ftcTextNoIntro, { delay: 15 });
          await self.delay(300);
          await page.keyboard.press('Enter');
          await page.keyboard.press('Enter');
          await self.delay(200);
          ftcAlreadyInserted = true;
          self.log(`   ✅ 공정위 문구 삽입 완료`);
        } else if (resolved.affiliateLink) {
          const affiliateDisclosure = '※ 이 포스팅은 제휴 마케팅의 일환으로, 구매 시 소정의 수수료를 제공받을 수 있습니다.';
          self.log(`   📋[쇼핑커넥트] 제휴 마케팅 고지 문구 최상단 삽입 중 (서론 없음)...`);
          await page.keyboard.press('Home').catch(() => {});
          await self.delay(100);
          await safeKeyboardType(page, affiliateDisclosure, { delay: 15 });
          await self.delay(300);
          await page.keyboard.press('Enter');
          await page.keyboard.press('Enter');
          await self.delay(200);
          ftcAlreadyInserted = true;
          self.log(`   ✅ 제휴 마케팅 고지 문구 최상단 삽입 완료`);
        }
      } else {
        self.log(`   ⏭️ 공정위 문구 이미 삽입됨 (retry 중복 방지)`);
      }

      // ✅ [2026-03-26 FIX] Safety Net: 서론이 없어도 썸네일 이미지는 반드시 삽입
      // 서론 블록 내부의 썸네일 삽입 로직이 실행되지 않으므로, 여기서 별도로 삽입
      if (!resolved.skipImages && !thumbnailInsertedInIntro) {
        const safetyNetImages = (resolved.images || []).filter((img: any) =>
          img.heading === '🖼️ 썸네일' || img.heading === '썸네일' || img.isThumbnail === true || img.isIntro === true
        );
        if (safetyNetImages.length > 0) {
          self.log(`   🖼️ [Safety Net] 서론 없이 썸네일 이미지 ${safetyNetImages.length}개 삽입 중...`);
          try {
            await self.insertImagesAtCurrentCursor(safetyNetImages, page, frame, resolved.affiliateLink);
            thumbnailInsertedInIntro = true;
            safetyNetImages.forEach((img: any) => { const p = img?.filePath || img?.url; if (p) usedImagePaths.add(p); });
            self.log('   ✅ [Safety Net] 썸네일 이미지 삽입 완료');
            // 썸네일과 첫 소제목 사이 간격 확보
            await page.keyboard.press('Enter');
            await self.delay(200);
            await page.keyboard.press('Enter');
            await self.delay(200);
          } catch (safetyNetError) {
            self.log(`   ⚠️ [Safety Net] 썸네일 삽입 실패: ${(safetyNetError as Error).message}`);
          }
        } else {
          self.log('   ℹ️ [Safety Net] 삽입할 썸네일 이미지 없음');
        }
      }
    }

    // 3. 소제목과 본문을 순차적으로 작성 (완전 순차 실행)
    self.log(`📋 총 ${headings.length}개의 섹션을 순차적으로 작성합니다.`);

    // ✅ [2026-03-26] expectedIdx 계산 헬퍼 (3곳 통합)
    const getExpectedOriginalIndex = (sectionIdx: number) =>
      thumbnailInsertedInIntro ? sectionIdx + 1 : sectionIdx;

    // for문으로 완전 순차 실행 (클릭 절대 금지, 키보드만 사용)
    for (let i = 0; i < headings.length; i++) {
      self.ensureNotCancelled();
      const heading = headings[i];

      // ✅ [2026-03-05 FIX] 매 소제목마다 frame 재취득 — 이미지 업로드 등으로 iframe이 리로드되어도 유효한 참조 보장
      try {
        await frame.evaluate(() => true);
      } catch {
        self.log(`   🔄 프레임 재연결 중 (소제목 ${i + 1} 시작 전)...`);
        frame = await self.getAttachedFrame();
        self.log(`   ✅ 프레임 재연결 완료`);
      }

      self.log(`\n📝[${i + 1}/${headings.length}] 섹션 "${heading.title}" 처리 시작...`);

      // ✅ 소제목은 heading.title을 그대로 사용 (bodyPlain에서 추출 로직 제거됨)
      // 이전의 "복구" 로직이 본문 내용을 소제목으로 잘못 추출하는 버그가 있었음
      const fullHeadingTitle = heading.title;

      try {
        // 클릭 완전 제거 - 현재 커서 위치에서 바로 시작

        // ✅ 쇼핑커넥트 모드 감지
        const isShoppingConnectMode = resolved.contentMode === 'affiliate' || !!resolved.affiliateLink;

        // ✅ 디버그 로그: 쇼핑커넥트 모드 판단 근거 출력
        self.log(`   🔍[쇼핑커넥트 체크] contentMode: "${resolved.contentMode}", affiliateLink: "${resolved.affiliateLink ? '있음' : '없음'}" → isShoppingConnectMode: ${isShoppingConnectMode} `);

        // a) 소제목 입력 (전체 소제목 사용)
        // ✅ [복구] 쇼핑커넥트 모드: 'underline' (4번, 밑줄) / 일반 모드: 'line' (2번, 버티컬 바)
        const quotationStyle = isShoppingConnectMode ? 'underline' : 'line';

        // ✅ [수정] 고지문은 이제 서론 삽입 전에 최상단에 삽입되므로 여기서는 생략

        // ✅ [수정] 모든 섹션에서 소제목 먼저 입력 (첫 번째 섹션 예외 제거)
        await self.typeSubtitleWithRetry(frame, page, fullHeadingTitle, 28, quotationStyle);
        const styleLabel = isShoppingConnectMode ? '4번-밑줄' : '2번-버티컬라인';
        self.log(`   ✅ 소제목 "${fullHeadingTitle}" 완료(인용구: ${styleLabel})`);

        // 소제목 입력 후 충분한 대기 (DOM 업데이트)
        await self.delay(2000); // 1500ms → 2000ms

        // b) 이미지 업로드 (skipImages가 false인 경우)
        if (!resolved.skipImages) {
          // ⚠️ 중요: 이미지 삽입 전 본문 영역으로 커서 이동 (제목 영역에 있으면 안 됨)
          self.log(`   🔄 본문 영역으로 커서 이동 확인 중...`);

          const cursorInfo = await frame.evaluate(() => {
            const titleElement = document.querySelector('.se-section-documentTitle');
            const bodyElement = document.querySelector('.se-section-text, .se-main-container');

            if (!bodyElement) return { inTitle: false, inBody: false };

            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
              return { inTitle: false, inBody: false, needsMove: true };
            }

            const range = selection.getRangeAt(0);
            const container = range.commonAncestorContainer;
            const node = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;

            const inTitle = titleElement && titleElement.contains(node);
            const inBody = bodyElement.contains(node);

            return { inTitle, inBody, needsMove: inTitle || !inBody };
          });

          if (cursorInfo.needsMove) {
            if (cursorInfo.inTitle) {
              self.log(`   ⚠️ 제목 영역에 커서가 있어 본문 영역으로 이동합니다.`);
            }

            await frame.evaluate(() => {
              const titleElement = document.querySelector('.se-section-documentTitle');
              const bodyElement = document.querySelector('.se-section-text, .se-main-container');

              if (!bodyElement) return;

              const selection = window.getSelection();
              if (!selection) return;

              const newRange = document.createRange();

              // 소제목 다음 위치 찾기 (최근 입력된 텍스트 다음)
              const textNodes: Node[] = [];
              const walker = document.createTreeWalker(bodyElement, NodeFilter.SHOW_TEXT);
              let textNode;
              while (textNode = walker.nextNode()) {
                if (textNode.textContent && textNode.textContent.trim().length > 0) {
                  textNodes.push(textNode);
                }
              }

              if (textNodes.length > 0) {
                const lastTextNode = textNodes[textNodes.length - 1];
                const parent = lastTextNode.parentElement;
                if (parent) {
                  newRange.setStartAfter(parent);
                  newRange.collapse(true);
                } else {
                  newRange.setStartAfter(lastTextNode);
                  newRange.collapse(true);
                }
              } else {
                // 텍스트 노드가 없으면 본문 영역 끝으로
                newRange.selectNodeContents(bodyElement);
                newRange.collapse(false);
              }

              selection.removeAllRanges();
              selection.addRange(newRange);
            });

            await self.delay(300); // 커서 이동 대기
            self.log(`   ✅ 본문 영역으로 커서 이동 완료`);
          } else {
            self.log(`   ✅ 커서가 이미 본문 영역에 있습니다.`);
          }
          // ✅ ImageManager에서 최신 이미지 가져오기 (사용자가 변경한 이미지 반영)
          // renderer.ts의 normalizeHeadingTitle과 동일한 정규화 함수 사용 (강화됨)
          const normalizeHeading = (text: string) => {
            if (!text) return '';
            return text
              .replace(/^#+\s*/, '')           // Markdown 해시 (#) 제거
              .replace(/\n/g, ' ')             // 줄바꿈을 공백으로
              .replace(/\r/g, ' ')             // 캐리지 리턴도 공백으로
              .replace(/\t/g, ' ')             // 탭도 공백으로
              .replace(/\s+/g, ' ')            // 여러 공백을 하나로
              .trim();                          // 앞뒤 공백 제거
          };

          // ✅ 더 공격적인 정규화 (소문자, 특수문자 제거)
          const aggressiveNormalize = (text: string) => {
            return normalizeHeading(text)
              .toLowerCase()                   // 소문자 변환
              .replace(/[^a-z0-9가-힣\s]/g, '') // 특수문자 제거 (한글/영문/숫자/공백만 유지)
              .replace(/\s+/g, ' ')            // 여러 공백을 하나로
              .trim();
          };

          // 원본 heading.title과 정규화된 값 모두 준비
          const originalHeadingTitle = heading.title;
          const normalizedHeadingTitle = normalizeHeading(originalHeadingTitle);

          self.log(`   🔍[ImageManager] 이미지 검색 시작`);
          self.log(`   🔍[ImageManager] 원본 소제목: "${originalHeadingTitle}"`);
          self.log(`   🔍[ImageManager] 정규화된 소제목: "${normalizedHeadingTitle}"`);

          // ImageManager에서 해당 소제목의 이미지 가져오기
          let headingImages: any[] = [];

          // 1. ImageManager에서 먼저 확인 (최우선)
          if (typeof (global as any).ImageManager !== 'undefined' && (global as any).ImageManager.imageMap) {
            const imageMap = (global as any).ImageManager.imageMap;

            self.log(`   🔍[ImageManager] ImageMap 크기: ${imageMap.size} 개`);

            // ImageMap의 모든 키 로그 출력
            const allKeys: string[] = Array.from(imageMap.keys()) as string[];
            self.log(`   🔍[ImageManager] ImageMap 키 목록(${allKeys.length}개): `);
            allKeys.forEach((key, idx) => {
              const normalizedKey = normalizeHeading(key);
              const exactMatch = key === normalizedHeadingTitle || key === originalHeadingTitle;
              const normalizedMatch = normalizedKey === normalizedHeadingTitle;
              const match = exactMatch || normalizedMatch ? '✅ 매칭!' : '';
              self.log(`      [${idx + 1}]"${key}"(정규화: "${normalizedKey}") ${match} `);
            });

            // 1-1. 정확한 키 매칭 시도 (정규화된 값)
            if (imageMap.has(normalizedHeadingTitle)) {
              const images = imageMap.get(normalizedHeadingTitle);
              if (images && images.length > 0) {
                headingImages = images;
                self.log(`   ✅[ImageManager] 정확한 키 매칭 성공(정규화): "${normalizedHeadingTitle}"에서 ${images.length}개 이미지 발견`);
              }
            }

            // 1-2. 원본 키 매칭 시도
            if (headingImages.length === 0 && imageMap.has(originalHeadingTitle)) {
              const images = imageMap.get(originalHeadingTitle);
              if (images && images.length > 0) {
                headingImages = images;
                self.log(`   ✅[ImageManager] 정확한 키 매칭 성공(원본): "${originalHeadingTitle}"에서 ${images.length}개 이미지 발견`);
              }
            }

            // 1-3. 정확한 매칭 실패 시 모든 키를 순회하며 정규화된 값으로 비교
            if (headingImages.length === 0) {
              for (const [key, images] of imageMap.entries()) {
                const normalizedKey = normalizeHeading(key);
                // 정규화된 값 비교 또는 원본 값 비교
                if ((normalizedKey === normalizedHeadingTitle || key === originalHeadingTitle || key === normalizedHeadingTitle) && images && images.length > 0) {
                  headingImages = images;
                  self.log(`   ✅[ImageManager] 정규화 매칭 성공: "${key}"(정규화: "${normalizedKey}") → "${normalizedHeadingTitle}"에서 ${images.length}개 이미지 발견`);
                  break;
                }
              }
            }

            if (headingImages.length === 0) {
              self.log(`   ℹ️[ImageManager] 이 소제목에 대한 사용자 지정 이미지가 없습니다. (Renderer 전용 기능)`);
            } else {
              self.log(`   ✅[ImageManager] 최종 매칭 성공: ${headingImages.length}개 이미지 발견`);
              headingImages.forEach((img: any, idx: number) => {
                const filePath = img.filePath || img.savedToLocal || img.url || '경로 없음';
                self.log(`      [${idx + 1}] ${filePath.substring(0, 80)}...`);
              });
            }
          } else {
            self.log(`   ℹ️[ImageManager] Main Process 컨텍스트: 전달된 이미지(resolved.images)를 사용합니다.`);
          }

          // ✅✅✅ 끝판왕 이미지 매칭 로직 ✅✅✅
          // 2. ImageManager에 없을 때 resolved.images에서 찾기
          if (headingImages.length === 0 && resolved.images && resolved.images.length > 0) {
            self.log(`   🔍[이미지 매칭] ImageManager에 이미지 없음, resolved.images에서 찾기 시도...`);
            self.log(`   🔍[이미지 매칭] 현재 소제목: "${heading.title}"(인덱스: ${i})`);
            self.log(`   🔍[이미지 매칭] 전체 이미지 수: ${resolved.images.length} 개`);

            // ✅ [2026-02-24 FIX] 서론에 이미 삽입된 이미지 + 다른 소제목에 이미 사용된 이미지 모두 제외
            const nonThumbnailImages = resolved.images.filter((img: any) => {
              if (img.isThumbnail === true) return false;
              if (img.heading === '🖼️ 썸네일' || img.heading === '썸네일') return false;
              if (img.isIntro === true) return false;
              // ✅ [2026-02-24 FIX] 이미 다른 소제목에 사용된 이미지도 제외
              const imgPath = img?.filePath || img?.url;
              if (imgPath && usedImagePaths.has(imgPath)) return false;
              return true;
            });
            self.log(`   🔍[이미지 매칭] 썸네일/사용됨 제외 후 이미지 수: ${nonThumbnailImages.length} 개`);

            // ✅ 방법 1: heading 이름으로 매칭 시도 (다양한 매칭 방법 적용)
            headingImages = nonThumbnailImages.filter((img: any) => {
              const normalizedImgHeading = normalizeHeading(img.heading);
              const aggressiveImgHeading = aggressiveNormalize(img.heading);
              const aggressiveTargetHeading = aggressiveNormalize(heading.title);

              // 1. 정확한 매칭 (original === original)
              if (img.heading === heading.title) return true;
              // 2. 정규화된 매칭
              if (normalizedImgHeading === normalizedHeadingTitle) return true;
              // 3. 공격적 정규화 매칭 (소문자, 특수문자 무시)
              if (aggressiveImgHeading === aggressiveTargetHeading) return true;
              // 4. 포함 관계 매칭 (더 긴 쪽이 짧은 쪽을 포함)
              if (aggressiveImgHeading.includes(aggressiveTargetHeading) && aggressiveTargetHeading.length > 5) return true;
              if (aggressiveTargetHeading.includes(aggressiveImgHeading) && aggressiveImgHeading.length > 5) return true;

              return false;
            });

            // ✅ [2026-03-26 FIX v2] Confidence-Gated 교차 검증
            // heading title 매칭이 성공해도, originalIndex가 현재 소제목 위치와 불일치하면 필터링
            // 검증 결과 0개 시: 정확 매칭(exact/normalized)만 유지, 정확 매칭도 없으면 폐기 (오매칭 방지)
            if (headingImages.length > 0) {
              const hasOriginalIndices = headingImages.some((img: any) => img.originalIndex !== undefined);
              if (hasOriginalIndices) {
                const expectedIdx = getExpectedOriginalIndex(i);
                const validated = headingImages.filter((img: any) =>
                  img.originalIndex === undefined || img.originalIndex === expectedIdx
                );
                if (validated.length !== headingImages.length) {
                  self.log(`   🔍[originalIndex 검증] heading title 매칭 ${headingImages.length}개 중 ${validated.length}개만 originalIndex=${expectedIdx} 일치`);
                  if (validated.length > 0) {
                    headingImages = validated;
                  } else {
                    // ✅ 교차 검증 0개: 정확 매칭(exact/normalized)만 골라서 유지
                    const exactMatched = headingImages.filter((img: any) => {
                      const normalizedImgH = normalizeHeading(img.heading);
                      return img.heading === heading.title || normalizedImgH === normalizedHeadingTitle;
                    });
                    if (exactMatched.length > 0) {
                      headingImages = exactMatched;
                      self.log(`   ⚠️[originalIndex 검증] 교차 검증 0개 → 정확 매칭 ${exactMatched.length}개만 유지`);
                    } else {
                      self.log(`   ⚠️[originalIndex 검증] 교차 검증 0개 + 정확 매칭 0개 → 전부 폐기 (오매칭 방지)`);
                      headingImages = [];
                    }
                  }
                }
              }
            }

            // ✅ [2026-02-12 FIX] GIF 이미지를 우선 정렬 (gif-from-video가 앞에 오도록)
            if (headingImages.length > 1) {
              headingImages.sort((a: any, b: any) => {
                const aIsGif = String(a?.provider || '').includes('gif') || String(a?.filePath || '').toLowerCase().endsWith('.gif');
                const bIsGif = String(b?.provider || '').includes('gif') || String(b?.filePath || '').toLowerCase().endsWith('.gif');
                if (aIsGif && !bIsGif) return -1;
                if (!aIsGif && bIsGif) return 1;
                return 0;
              });
            }

            // ✅ 디버그: 매칭 실패 시 상세 로그
            if (headingImages.length === 0) {
              self.log(`   ⚠️[매칭 실패] 소제목 "${heading.title}" 에 대응하는 이미지를 찾지 못했습니다.`);
              self.log(`   🔍 resolved.images의 heading 목록: `);
              resolved.images.forEach((img: any, idx: number) => {
                self.log(`      [${idx}]"${img.heading}"(normalized: "${normalizeHeading(img.heading)}")`);
              });
            }

            if (headingImages.length > 0) {
              self.log(`   ✅[heading 매칭] resolved.images에서 ${headingImages.length}개 이미지 발견`);
            } else {
              // ✅ Full-Auto 모드에서는 originalIndex 기반 매칭 우선 (2026-02-05 수정)
              // Main Process(ImageManager 없음) + 풀오토 모드에서는 originalIndex로 매칭
              const isMainProcess = typeof (global as any).ImageManager === 'undefined';
              const isFullAutoMode = resolved.isFullAuto === true;

              if (isMainProcess && isFullAutoMode && resolved.images && resolved.images.length > 0) {
                // ✅ [2026-02-05 FIX] headingImageMode 필터링 대응: originalIndex 기반 매칭
                // 홀수/짝수 모드에서 이미지 배열이 필터링되면 배열 인덱스와 소제목 인덱스가 불일치
                // → originalIndex를 사용하여 정확한 매칭 수행

                // ✅ [2026-02-24 FIX] 썸네일 + 이미 사용된 이미지 제외한 목록에서 매칭
                const nonThumbnailForIndex = resolved.images.filter((img: any) => {
                  if (img.isThumbnail === true || img.heading === '🖼️ 썸네일' || img.heading === '썸네일' || img.isIntro === true) return false;
                  const imgPath = img?.filePath || img?.url;
                  if (imgPath && usedImagePaths.has(imgPath)) return false;
                  return true;
                });

                // ✅ [2026-02-24 FIX] 서론에 썸네일이 실제로 삽입되었는지로 판단 (기존 usesAutoThumbnail 대체)
                const expectedOriginalIndex = getExpectedOriginalIndex(i);

                self.log(`   🔄[이미지 인덱스] 서론썸네일=${thumbnailInsertedInIntro}, 현재소제목=${i}, 예상originalIndex=${expectedOriginalIndex}`);

                // ✅ [2026-03-09 FIX] 1순위: originalIndex가 일치하는 이미지 모두 찾기 (다중 이미지 지원)
                let matchedImages = nonThumbnailForIndex.filter((img: any) =>
                  (img.originalIndex !== undefined && img.originalIndex === expectedOriginalIndex)
                );

                // 2순위: 모든 이미지에 originalIndex가 없는 경우 heading 이름 매칭 → 순차 폴백
                if (matchedImages.length === 0) {
                  const hasOriginalIndices = resolved.images.some((img: any) => img.originalIndex !== undefined);
                  if (!hasOriginalIndices) {
                    // heading 이름으로 다중 매칭 시도
                    const headingTitle = heading?.title || heading?.heading || '';
                    if (headingTitle) {
                      matchedImages = nonThumbnailForIndex.filter((img: any) =>
                        img.heading && img.heading === headingTitle
                      );
                    }
                    // heading 매칭도 없으면 순차 폴백 (1개)
                    if (matchedImages.length === 0 && i < nonThumbnailForIndex.length) {
                      matchedImages = [nonThumbnailForIndex[i]];
                      self.log(`   🔄[폴백] originalIndex 없음 → 미사용 이미지 순차[${i}] 사용`);
                    }
                  } else {
                    self.log(`   ℹ️[필터] originalIndex 매칭 실패 → headingImageMode 필터링으로 이미지 없음 (정상)`);
                  }
                }

                // filePath가 있는 유효한 이미지만 필터링
                const validMatched = matchedImages.filter((img: any) => img.filePath || img.url);
                if (validMatched.length > 0) {
                  headingImages = validMatched;
                  self.log(`   ✅[Full-Auto 매칭] ${validMatched.length}개 이미지 할당 (originalIndex=${expectedOriginalIndex})`);
                } else {
                  // 필터링으로 인해 이 소제목에 해당하는 이미지가 없는 경우 (정상 케이스)
                  self.log(`   ℹ️[Full-Auto] 소제목 ${i}번에 해당하는 이미지 없음 (headingImageMode 필터링으로 스킵됨)`);
                  headingImages = [];
                }
              } else {
                // ✅ [2026-02-24 FIX] 반자동 모드에서도 originalIndex 기반 매칭 우선
                // headingImageMode 필터링 (odd-only/even-only) 시 올바른 소제목에 이미지 배치
                if (resolved.images && resolved.images.length > 0) {
                  // ✅ 썸네일 + 이미 사용된 이미지 모두 제외
                  const nonThumbnailForFallback = resolved.images.filter((img: any) => {
                    if (img.isThumbnail === true || img.heading === '🖼️ 썸네일' || img.heading === '썸네일' || img.isIntro === true) return false;
                    const imgPath = img?.filePath || img?.url;
                    if (imgPath && usedImagePaths.has(imgPath)) return false;
                    return true;
                  });

                  // ✅ [2026-03-09 FIX] 1순위: originalIndex 기반 다중 매칭 (headingImageMode 필터링 대응)
                  const expectedIdx = getExpectedOriginalIndex(i);
                  let matchedImages = nonThumbnailForFallback.filter((img: any) =>
                    img.originalIndex !== undefined && img.originalIndex === expectedIdx
                  );

                  if (matchedImages.length > 0) {
                    const validMatched = matchedImages.filter((img: any) => img.filePath || img.url);
                    if (validMatched.length > 0) {
                      headingImages = validMatched;
                      self.log(`   ✅[반자동 매칭] ${validMatched.length}개 이미지 할당 (originalIndex=${expectedIdx})`);
                    } else {
                      headingImages = [];
                    }
                  } else {
                    // 2순위: originalIndex가 아예 없는 경우에만 순차 폴백
                    const hasOriginalIndices = resolved.images.some((img: any) => img.originalIndex !== undefined);
                    if (!hasOriginalIndices) {
                      // heading 이름으로 다중 매칭 시도
                      const headingTitle = heading?.title || heading?.heading || '';
                      if (headingTitle) {
                        matchedImages = nonThumbnailForFallback.filter((img: any) =>
                          img.heading && img.heading === headingTitle
                        );
                      }
                      if (matchedImages.length > 0) {
                        headingImages = matchedImages.filter((img: any) => img.filePath || img.url);
                        self.log(`   🔄[반자동 폴백] heading 이름 매칭 → ${headingImages.length}개 이미지 사용`);
                      } else if (i < nonThumbnailForFallback.length && nonThumbnailForFallback[i]?.filePath) {
                        headingImages = [nonThumbnailForFallback[i]];
                        self.log(`   🔄[반자동 폴백] originalIndex 없음 → 미사용 이미지 순차[${i}] 사용`);
                      } else if (nonThumbnailForFallback.length > 0 && nonThumbnailForFallback[0]?.filePath) {
                        headingImages = [nonThumbnailForFallback[0]];
                        self.log(`   🔄[반자동 폴백] 인덱스 초과 → 첫 번째 미사용 이미지 사용`);
                      } else {
                        self.log(`   ℹ️[이미지 매칭] 미사용 이미지가 없습니다 → 이미지 없이 진행`);
                        headingImages = [];
                      }
                    } else {
                      // originalIndex 있지만 매칭 실패 → headingImageMode 필터링으로 스킵 (정상)
                      self.log(`   ℹ️[반자동] 소제목 ${i}번에 해당하는 이미지 없음 (headingImageMode 필터링으로 스킵됨)`);
                      headingImages = [];
                    }
                  }
                } else {
                  self.log(`   ℹ️[이미지 매칭] resolved.images가 비어있습니다 → 이미지 없이 진행`);
                  headingImages = [];
                }
              }
            }

          } else if (headingImages.length > 0) {
            // ✅ ImageManager에서 이미지를 찾았으면 resolved.images 사용 안 함
            self.log(`   ✅[우선순위] ImageManager에서 ${headingImages.length}개 이미지 발견 → 사용자 지정 이미지 우선`);
          }

          // ✅ [2026-02-24 FIX] 이 소제목에서 사용하기로 한 이미지를 usedImagePaths에 등록
          if (headingImages.length > 0) {
            headingImages.forEach((img: any) => {
              const imgPath = img?.filePath || img?.url;
              if (imgPath) usedImagePaths.add(imgPath);
            });
          }

          // ✅ [1단계] 본문 및 이미지 데이터 준비
          const currentFrame = (await self.getAttachedFrame());
          let cleanBody = '';

          // 1-1. 본문 추출
          if (structured._bodyManuallyEdited && heading.content && heading.content.trim().length > 0) {
            // ✅ [2026-02-28 FIX] 사용자 수정 시 위에서 직접 분할한 heading.content를 그대로 사용
            // extractBodyForHeading + 필터링 완전 우회 → 100% 원문 반영
            cleanBody = heading.content.trim();
            self.log(`   ✅ [편집 반영] heading.content 직접 사용: ${cleanBody.length}자`);
          } else if (structured._bodyManuallyEdited && (!heading.content || heading.content.trim().length === 0) && bodyText.trim().length > 0) {
            // ✅ [2026-03-26 FIX] _bodyManuallyEdited=true인데 heading.content가 비어있는 경우
            // L712 재분할에서 heading title indexOf 실패했을 때 발생
            // bodyText에서 heading 인덱스 기반 균등 분배로 안전하게 추출
            self.log(`   ⚠️ [편집 안전장치] heading.content가 비어있음 → bodyText에서 균등 분배 추출`);
            const allLines = bodyText.split('\n').filter((l: string) => l.trim().length > 0);
            const lph = Math.max(1, Math.ceil(allLines.length / headings.length));
            const sl = i * lph;
            const el = Math.min(sl + lph, allLines.length);
            cleanBody = allLines.slice(sl, el).join('\n').trim();
            self.log(`   ✅ 균등 분배 추출: ${cleanBody.length}자`);
          } else {
            // ✅ [기존 로직] extractBodyForHeading 기반 추출 + 필터링
            const headingBody = self.extractBodyForHeading(bodyText, heading.title, i, headings.length, headings);
            cleanBody = headingBody.trim();

            if (cleanBody.length < 30 && heading.content && heading.content.trim().length > 30) {
              cleanBody = heading.content.trim();
            }

            if (cleanBody.length < 30) {
              const sentences = bodyText.split(/(?<=[.!?])\s+/).filter((s: any) => s.trim());
              const sentencesPerHeading = Math.max(5, Math.ceil(sentences.length / headings.length));
              const startIdx = i * sentencesPerHeading;
              const endIdx = Math.min(startIdx + sentencesPerHeading, sentences.length);
              cleanBody = sentences.slice(startIdx, endIdx).join(' ').trim();
            }

            // 제목 중복 등 기초 정리 + URL 링크 텍스트 제거
            const escapedTitleForRegex = heading.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            cleanBody = cleanBody
              .replace(new RegExp(`^\\s * ${escapedTitleForRegex} \\s *:?\\s * `, 'i'), '')
              .replace(/🔗[^\n]*\n?/g, '')
              .replace(/도움이\s*되(었|셧|셨)으면[^\n]*/gi, '')
              .replace(/https?:\/\/[^\s\n]+/g, '')
              .replace(/\n{3,}/g, '\n\n')
              .trim();
          }

          // 1-2. 이미지 분류
          const topImages = headingImages.filter((img: any) => (img.position || 'top') === 'top');
          const middleImages = headingImages.filter((img: any) => img.position === 'middle');
          const bottomImages = headingImages.filter((img: any) => img.position === 'bottom');

          // ✅ [2단계] 순차적 삽입
          // 쇼핑커넥트 첫 번째 섹션: 이미지 → 소제목 → 본문
          // 그 외: 소제목(위에서 이미 삽입됨) → 이미지 → 본문

          // A. 모든 이미지 삽입 (Top, Middle, Bottom 통합 또는 Top 우선)
          const allSectionImages = [
            ...topImages,
            ...middleImages,
            ...bottomImages
          ];

          if (allSectionImages.length > 0) {
            self.log(`   📸[이미지] 총 ${allSectionImages.length}개 이미지 삽입 중...`);
            allSectionImages.forEach((img: any, idx: number) => {
              const p = (img?.filePath || img?.url || '').replace(/^C:\\Users\\[^\\]+/, '~').replace(/^\/Users\/[^/]+/, '~');
              self.log(`      [${idx}] heading="${img?.heading}", provider="${img?.provider}", path=${p.substring(0, 80)}`);
            });
            await self.insertImagesAtCurrentCursor(allSectionImages, page, currentFrame, resolved.affiliateLink);
          }

          // B. 본문 타이핑
          // ✅ [2026-02-28 FIX] cleanBody가 비어있으면 bodyText에서 강제 추출 (최종 안전장치)
          if (!cleanBody.trim() && bodyText.trim()) {
            self.log(`   ⚠️ cleanBody가 비어있음 → bodyText에서 강제 추출 시도`);
            // heading.content가 이미 있으면 사용, 없으면 heading 인덱스 기반 균등 할당
            if (heading.content && heading.content.trim().length > 0) {
              cleanBody = heading.content.trim();
              self.log(`   ✅ heading.content 복구: ${cleanBody.length}자`);
            } else {
              const allLines = bodyText.split('\n').filter((l: string) => l.trim().length > 0);
              const lph = Math.max(1, Math.ceil(allLines.length / headings.length));
              const sl = i * lph;
              const el = Math.min(sl + lph, allLines.length);
              cleanBody = allLines.slice(sl, el).join('\n').trim();
              self.log(`   ✅ bodyText 균등 분할 복구: ${cleanBody.length}자`);
            }
          }
          if (cleanBody.trim()) {
            self.log(`   ⌨️[본문] 타이핑 시작 (${cleanBody.length}자)...`);
            await self.typeBodyWithRetry(currentFrame, page, cleanBody, 19);
          } else {
            self.log(`   ⚠️ 본문 내용이 비어있어 타이핑 건너뜀 (소제목: "${heading.title}")`);
          }

          // ✅ 쇼핑커넥트 모드: 표 이미지 삽입
          // ✅ [2026-02-19] 장단점 표 중복 방지 플래그 (첫 번째 섹션에서 이미 삽입 시 마지막 섹션 건너뜀)
          if (i === 0) self._prosConsAlreadyInserted = false;
          if (isShoppingConnectMode) {
            const productName = resolved.title?.split(' ').slice(0, 5).join(' ') || '제품';
            const fullBodyText = bodyText || cleanBody;

            // C-1. 첫 번째 섹션: 제품 스펙 표 이미지
            if (i === 0) {
              try {
                self.log(`   📊[쇼핑커넥트] 제품 스펙 표 이미지 생성 중...`);

                let specTablePath: string | null = null;

                // ✅ [핵심 수정] 공식 네이버 쇼핑 API 사용 (캡차 없음!)
                // 1차: 제휴링크에서 브랜드/스토어명 추출하여 검색
                // 2차: 제품명으로 검색
                let searchQuery = productName;
                let resolvedAffiliateUrl = resolved.affiliateLink || '';

                // ✅ [2026-02-16 FIX] naver.me 단축 URL → Playwright 전용세션으로 리다이렉트 추적
                // 기존 fetch HEAD redirect:manual 방식은 네이버 봇 감지에 의해 실패
                if (resolvedAffiliateUrl.includes('naver.me')) {
                  self.log(`   🔗 naver.me 단축 URL 감지 → Playwright로 리다이렉트 추적 중...`);
                  let pwBrowser = null;
                  try {
                    const { chromium } = await import('playwright');
                    pwBrowser = await chromium.launch({ headless: true });
                    const pwContext = await pwBrowser.newContext({
                      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
                    });
                    const pwPage = await pwContext.newPage();
                    // 리소스 차단
                    await pwPage.route('**/*', route => {
                      const type = route.request().resourceType();
                      if (['image', 'font', 'media', 'stylesheet'].includes(type)) route.abort();
                      else route.continue();
                    });
                    await pwPage.goto(resolvedAffiliateUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    // 최종 URL 대기 (최대 5초)
                    let trackedUrl = pwPage.url();
                    for (let i = 0; i < 10; i++) {
                      if (trackedUrl.includes('smartstore.naver.com') || trackedUrl.includes('brand.naver.com')) break;
                      await pwPage.waitForTimeout(500);
                      trackedUrl = pwPage.url();
                    }
                    await pwBrowser.close();
                    pwBrowser = null;
                    if (trackedUrl !== resolvedAffiliateUrl && !trackedUrl.includes('naver.me')) {
                      resolvedAffiliateUrl = trackedUrl;
                      self.log(`   ✅ Playwright 최종 스토어 URL: ${trackedUrl.substring(0, 60)}...`);
                    } else {
                      self.log(`   ⚠️ Playwright에서도 최종 URL 추출 실패`);
                    }
                  } catch (pwError) {
                    self.log(`   ⚠️ Playwright 리다이렉트 추적 실패: ${(pwError as Error).message}`);
                    if (pwBrowser) { try { await pwBrowser.close(); } catch { } }
                  }
                }

                // ✅ 제휴링크 URL에서 브랜드/스토어명 추출
                let extractedStoreName: string | null = null;
                if (resolvedAffiliateUrl) {
                  const url = resolvedAffiliateUrl;
                  // brand.naver.com 패턴
                  const brandMatch = url.match(/brand\.naver\.com\/([^\/\?]+)/);
                  if (brandMatch) {
                    const brandId = brandMatch[1];
                    const brandMap: Record<string, string> = {
                      'samsungelectronics': '삼성전자',
                      'lgelectronics': 'LG전자',
                      'dyson': '다이슨',
                      'apple': '애플',
                      'philips': '필립스',
                    };
                    const brandName = brandMap[brandId.toLowerCase()] || brandId;
                    extractedStoreName = brandName;
                    searchQuery = `${brandName} ${productName.split(' ').slice(0, 3).join(' ')} `;
                    self.log(`   📎 브랜드스토어 감지: ${brandName} `);
                  }
                  // smartstore.naver.com 패턴
                  const storeMatch = url.match(/smartstore\.naver\.com\/([^\/\?]+)/);
                  if (storeMatch) {
                    const storeName = storeMatch[1];
                    extractedStoreName = storeName;
                    searchQuery = `${storeName} ${productName.split(' ').slice(0, 3).join(' ')} `;
                    self.log(`   📎 스마트스토어 감지: ${storeName} `);
                  }
                }

                // ✅ [완벽 해결] naver.me URL인데 스토어명 추출 실패 시 Puppeteer로 재시도
                if (!extractedStoreName && resolved.affiliateLink?.includes('naver.me') && page) {
                  self.log(`   🔄 스토어명 추출 실패 → Puppeteer로 최종 URL 추적...`);
                  try {
                    // 현재 발행 중인 브라우저의 새 탭 사용
                    const trackPage = await page.browser().newPage();
                    await trackPage.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15');

                    // 리소스 차단
                    await trackPage.setRequestInterception(true);
                    trackPage.on('request', (req: any) => {
                      const type = req.resourceType();
                      if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
                        req.abort();
                      } else {
                        req.continue();
                      }
                    });

                    await trackPage.goto(resolved.affiliateLink, { waitUntil: 'domcontentloaded', timeout: 10000 });

                    // 최대 5초 대기
                    for (let wait = 0; wait < 5000; wait += 300) {
                      await self.delay(300);
                      const currentUrl = trackPage.url();
                      if (currentUrl.includes('smartstore.naver.com') || currentUrl.includes('brand.naver.com')) {
                        const storeMatch = currentUrl.match(/(?:smartstore|brand)\.naver\.com\/([^\/\?]+)/);
                        if (storeMatch) {
                          extractedStoreName = storeMatch[1];
                          searchQuery = `${extractedStoreName} ${productName.split(' ').slice(0, 3).join(' ')} `;
                          self.log(`   ✅ Puppeteer로 스토어명 확보: ${extractedStoreName} `);
                        }
                        break;
                      }
                    }

                    // ✅ [핵심 수정] 에러 페이지 감지 - OG 태그 확인
                    const ogTitle = await trackPage.evaluate(() => {
                      const meta = document.querySelector('meta[property="og:title"]');
                      return meta?.getAttribute('content') || '';
                    });

                    const errorKeywords = ['에러', '오류', 'error', '접근', '차단', '제한', '캡차', '시스템'];
                    const isErrorPage = errorKeywords.some(kw => ogTitle.toLowerCase().includes(kw.toLowerCase()));

                    if (isErrorPage) {
                      self.log(`   ❌ 에러 페이지 감지! "${ogTitle.substring(0, 30)}..."`);
                      self.log(`   🔄 제품명 기반 검색으로 폴백: "${productName}"`);
                      extractedStoreName = null;
                      searchQuery = productName;  // 제품명으로 폴백
                    }

                    await trackPage.close();
                  } catch (puppeteerError) {
                    self.log(`   ⚠️ Puppeteer 추적 실패: ${(puppeteerError as Error).message} `);
                    self.log(`   🔄 제품명 기반 검색으로 폴백: "${productName}"`);
                    searchQuery = productName;  // 실패 시 제품명으로 폴백
                  }
                }

                self.log(`   🔍 공식 API로 상품 정보 조회 중: "${searchQuery.substring(0, 40)}..."`);
                try {
                  const { searchShopping, stripHtmlTags } = await import('../naverSearchApi.js');
                  const searchResult = await searchShopping({ query: searchQuery, display: 1 });

                  if (searchResult.items.length > 0) {
                    const item = searchResult.items[0];
                    // ✅ [2026-01-18] 제품명 정리: 끝에 쉼표, 마침표 등 불필요한 문자 제거
                    const cleanTitle = stripHtmlTags(item.title)
                      .substring(0, 50)
                      .replace(/[,.\s]+$/g, '') // 끝에 쉼표, 마침표, 공백 제거
                      .trim();
                    const specs = [
                      { label: '제품명', value: cleanTitle },
                      { label: '가격', value: item.lprice ? `${parseInt(item.lprice).toLocaleString()}원` : '가격 문의' },
                      { label: '브랜드', value: item.brand || item.maker || '' },
                      { label: '판매처', value: item.mallName || '네이버 쇼핑' },
                      { label: '카테고리', value: [item.category1, item.category2].filter(Boolean).join(' > ') || '' },
                    ].filter((s: any) => s.value && s.value.length > 0);

                    self.log(`   ✅ 공식 API 조회 성공: ${specs.length}개 스펙`);
                    specTablePath = await generateProductSpecTableImage(productName, specs);
                  } else {
                    self.log(`   ⚠️ 공식 API 검색 결과 없음, 기본 스펙 사용`);
                  }
                } catch (apiError) {
                  self.log(`   ⚠️ 공식 API 호출 실패: ${(apiError as Error).message} `);
                }


                // ✅ [2026-01-18 수정] API 실패 시 스펙 표 대신 장단점 표 생성
                if (!specTablePath) {
                  self.log(`   📝 API 실패 - 본문에서 장단점 추출하여 표 생성...`);
                  // ✅ 제품명 정리: 끝에 쉼표, 마침표 등 불필요한 문자 제거
                  const cleanProductName = productName
                    .replace(/[,.\s]+$/g, '')
                    .trim();
                  // ✅ [2026-02-01 FIX] AI 기반 장단점 추출로 변경 (정규식 → Gemini)
                  const prosConsData = await extractProsConsWithGemini(cleanProductName, fullBodyText);
                  const pros = prosConsData.pros;
                  const cons = prosConsData.cons;
                  if (pros.length >= 1 || cons.length >= 1) {
                    // ✅ [2026-01-18] useAiTableImage 옵션에 따라 AI 표 또는 HTML 표 선택
                    if (resolved.useAiTableImage) {
                      const { generateProsConsWithAI } = await import('../image/nanoBananaProGenerator.js');
                      specTablePath = await generateProsConsWithAI(cleanProductName, pros, cons) || await generateProsConsTableImage(cleanProductName, pros, cons);
                      self.log(`   🤖 AI 장단점 표 생성 시도...`);
                    } else {
                      specTablePath = await generateProsConsTableImage(cleanProductName, pros, cons);
                    }
                    self.log(`   ✅ 장단점 표 생성 완료: 장점 ${pros.length}개, 단점 ${cons.length}개`);
                    self._prosConsAlreadyInserted = true; // ✅ [2026-02-19] 중복 방지
                  } else {
                    self.log(`   ⚠️ 장단점 추출 실패 - 표 생성 건너뜀`);
                  }
                }

                // ✅ 표 이미지 삽입
                if (specTablePath) {
                  await page.keyboard.press('Enter');
                  await self.delay(300);
                  await self.insertBase64ImageAtCursor(specTablePath);
                  await self.delay(1000);

                  // 표 이미지에도 제휴 링크 삽입
                  if (resolved.affiliateLink) {
                    await self.attachLinkToLastImage(resolved.affiliateLink);
                  }
                  self.log(`   ✅ 제품 스펙 표 이미지 삽입 완료`);
                } else {
                  self.log(`   ⚠️ 스펙이 없어 표 생성 건너뜀`);
                }
              } catch (tableError) {
                self.log(`   ⚠️ 제품 스펙 표 생성 실패: ${(tableError as Error).message} `);
              }
            }

            // C-2. 마지막 섹션: 장단점 비교 표 이미지
            if (i === headings.length - 1 && !self._prosConsAlreadyInserted) {
              try {
                self.log(`   📊[쇼핑커넥트] 장단점 비교 표 이미지 생성 중...`);
                // ✅ [2026-02-01 FIX] AI 기반 장단점 추출로 변경 (정규식 → Gemini)
                const prosConsData = await extractProsConsWithGemini(productName, fullBodyText);
                const pros = prosConsData.pros;
                const cons = prosConsData.cons;
                if (pros.length >= 1 && cons.length >= 1) {
                  // ✅ [2026-01-18] useAiTableImage 옵션에 따라 AI 표 또는 HTML 표 선택
                  let prosConsTablePath: string;
                  if (resolved.useAiTableImage) {
                    const { generateProsConsWithAI } = await import('../image/nanoBananaProGenerator.js');
                    prosConsTablePath = await generateProsConsWithAI(productName, pros, cons) || await generateProsConsTableImage(productName, pros, cons);
                    self.log(`   🤖 AI 장단점 표 생성 시도...`);
                  } else {
                    prosConsTablePath = await generateProsConsTableImage(productName, pros, cons);
                  }
                  await page.keyboard.press('Enter');
                  await self.delay(300);
                  await self.insertBase64ImageAtCursor(prosConsTablePath);
                  await self.delay(1000); // 렌더링 대기

                  // ✅ 장단점 표 이미지에도 제휴 링크 삽입
                  if (resolved.affiliateLink) {
                    await self.attachLinkToLastImage(resolved.affiliateLink);
                  }
                  self.log(`   ✅ 장단점 비교 표 이미지 삽입 완료`);
                }
              } catch (tableError) {
                self.log(`   ⚠️ 장단점 표 생성 실패: ${(tableError as Error).message} `);
              }
            }

            // C-3. 2번 섹션 본문 아래: CTA 배너 이미지 추가
            if (i === 1 && resolved.affiliateLink) {
              try {
                self.log(`   📢[쇼핑커넥트] 2번 섹션 본문 아래 CTA 배너 삽입 중...`);

                let ctaBannerPath: string;

                // ✅ [2026-01-22] 배너 우선순위: autoBannerGenerate > customBannerPath > 자동생성
                if (resolved.autoBannerGenerate) {
                  // 랜덤 배너 자동 생성
                  const ctaHooks = [
                    '[공식] 최저가 보러가기 →',
                    '✓ 할인가 확인하기 →',
                    '지금 바로 구매하기 →',
                    '▶ 상품 자세히 보기',
                    '할인 혜택 확인 →',
                  ];
                  const randomHook = ctaHooks[Math.floor(Math.random() * ctaHooks.length)];
                  ctaBannerPath = await generateCtaBannerImage(randomHook, productName);
                  self.log(`   🎲 [랜덤 배너] 2번 섹션 배너 자동 생성: ${randomHook}`);
                } else if (resolved.customBannerPath) {
                  // 커스텀 배너 사용
                  ctaBannerPath = resolved.customBannerPath;
                  self.log(`   🎨 커스텀 배너 사용: ${ctaBannerPath.split(/[/\\]/).pop()}`);
                } else {
                  // 기본 자동 생성 (랜덤 아닌 고정 풀에서)
                  const ctaHooks = [
                    '[공식] 최저가 보러가기 →',
                    '✓ 할인가 확인하기 →',
                    '지금 바로 구매하기 →',
                  ];
                  const randomHook = ctaHooks[Math.floor(Math.random() * ctaHooks.length)];
                  ctaBannerPath = await generateCtaBannerImage(randomHook, productName);
                }

                await page.keyboard.press('Enter');
                await self.delay(300);
                await self.insertBase64ImageAtCursor(ctaBannerPath);
                await self.delay(1000);

                // ✅ 배너에 제휴 링크 삽입
                await self.attachLinkToLastImage(resolved.affiliateLink);
                self.log(`   ✅ 2번 섹션 CTA 배너 + 제휴 링크 삽입 완료`);
              } catch (bannerError) {
                self.log(`   ⚠️ 2번 섹션 CTA 배너 생성 실패: ${(bannerError as Error).message} `);
              }
            }
          }

        } else {
          // 이미지 건너뛰기 모드일 때
          const cFrame = (await self.getAttachedFrame());
          let cBody = '';
          // ✅ [2026-02-27 FIX] bodyText 추출 우선 — heading.content는 stale할 수 있음
          cBody = self.extractBodyForHeading(bodyText, heading.title, i, headings.length, headings).trim();
          if (cBody.length < 30 && heading.content && heading.content.trim().length > 30) {
            cBody = heading.content.trim();
          }

          if (cBody.trim()) {
            self.log(`   ⌨️ 본문 타이핑 시작(이미지 없음)...`);
            await self.typeBodyWithRetry(cFrame, page, cBody, 19);
          }
        }

        // d) CTA 중간 삽입 (위치가 middle이고 중간 지점인 경우, skipCta가 false인 경우만)
        // d) CTA 특정 소제목 아래 삽입 (위치가 heading-N인 경우)
        const headingMatch = resolved.ctaPosition?.match(/^heading-(\d+)$/);
        if (!resolved.skipCta && headingMatch && resolved.ctas.length > 0) {
          const targetHeadingIndex = parseInt(headingMatch[1], 10) - 1; // 1-based → 0-based
          if (i === targetHeadingIndex) {
            self.log(`   → CTA ${i + 1}번 소제목 본문 아래 삽입 중...`);
            for (let k = 0; k < 2; k++) {
              await page.keyboard.press('Enter');
              await self.delay(self.DELAYS.MEDIUM);
            }
            for (let ci = 0; ci < resolved.ctas.length; ci++) {
              const c = resolved.ctas[ci];
              self.log(`   → CTA 삽입 (${ci + 1}/${resolved.ctas.length}, 텍스트: "${c.text}", 링크: "${resolved.affiliateLink || c.link || '#'}")`);
              await self.insertCtaLink(resolved.affiliateLink || c.link || '#', c.text, 'heading');
              await self.delay(self.DELAYS.MEDIUM);
            }
            self.log(`   ✅ ${i + 1}번 소제목 CTA 삽입 완료`);
          }
        }

        // e) 다음 섹션 준비 (마지막 섹션이 아니면 구분선 추가)
        if (i < headings.length - 1) {
          self.log(`   → 구분선 생성 중...`);
          await self.insertHorizontalLine();
          await self.delay(self.DELAYS.MEDIUM);
          await page.keyboard.press('Enter'); // ✅ [2026-01-19] 엔터 1회로 축소 (2회 → 1회)
          await self.delay(self.DELAYS.MEDIUM);
          self.log(`   ✅ 구분선 추가 완료`);
        }

        self.log(`   ✅ 섹션[${i + 1}/${headings.length}]완료\n`);

        // ✅ 다음 섹션 준비: Frame 재설정 (마지막 섹션이 아닐 때만)
        if (i < headings.length - 1) {
          await self.delay(self.DELAYS.LONG); // 500ms 대기
          try {
            await self.switchToMainFrame();
            self.log(`   ✅ 다음 섹션을 위한 Frame 재설정 완료`);
          } catch (frameError) {
            self.log(`   ⚠️ Frame 재설정 실패(무시하고 계속): ${(frameError as Error).message} `);
          }
        }
      } catch (error) {
        self.log(`   ❌ 섹션[${i + 1}/${headings.length}]실패: ${(error as Error).message} `);
        throw error;
      }
    }

    // ✅ [2026-02-23 FIX] 모든 모드에서 마무리(Conclusion) 작성
    if (structured.conclusion && structured.conclusion.trim().length > 10) {
      self.log('📝 마무리 작성 중...');

      // ✅ [2026-01-19 수정] 마무리 전 엔터 제거 (중복 방지)
      // 마지막 소제목 본문 후 바로 마무리글로 이어짐
      await self.delay(self.DELAYS.MEDIUM);

      // 마무리 이미지 검색 ('📝 마무리' 키로 저장됨) - 제거됨 (사용자 요청)
      // ✅ 쇼핑커넥트 마무리는 이미지 없이 본문만 (사용자 요청)

      // 마무리 본문 타이핑
      const currentFrame = (await self.getAttachedFrame());
      await self.typeBodyWithRetry(currentFrame, page, structured.conclusion.trim(), 19);
      await self.delay(self.DELAYS.MEDIUM);

      // ✅ [2026-01-18 삭제] 마무리 후 2번 배너 삽입 제거 (사용자 요청)
      // 배너가 CTA 전에만 삽입되도록 하고, 마무리글 아래 배너는 삭제
      // (모든 사용자가 같은 배너를 사용하면 문제 발생 가능)
      // if (resolved.affiliateLink) {
      //   try {
      //     self.log(`   📢[쇼핑커넥트] 마무리 후 2번 배너 삽입 중...`);
      //     const { generateCtaBannerImage } = await import('../image/tableImageGenerator.js');
      //     const ctaHooks = [
      //       '✓ 마음에 드셨다면 여기서 구매!',
      //       '▶ 지금 최저가 확인하기 →',
      //       '놓치면 후회! 지금 바로 →',
      //     ];
      //     const randomHook = ctaHooks[Math.floor(Math.random() * ctaHooks.length)];
      //     const productName = resolved.title?.split(' ').slice(0, 5).join(' ') || '제품';
      //     const banner2Path = await generateCtaBannerImage(randomHook, productName);
      //     await page.keyboard.press('Enter');
      //     await self.delay(300);
      //     await self.insertBase64ImageAtCursor(banner2Path);
      //     await self.delay(500);
      //     // 배너에 제휴 링크 삽입
      //     await self.attachLinkToLastImage(resolved.affiliateLink);
      //     self.log(`   ✅ 마무리 후 2번 배너 + 제휴 링크 삽입 완료`);
      //   } catch (bannerError) {
      //     self.log(`   ⚠️ 마무리 2번 배너 생성 실패: ${(bannerError as Error).message} `);
      //   }
      // }

      self.log('   ✅ 마무리 작성 완료');
    }

    // ✅ 빠른 검증 (성능 최적화)
    self.log('\n✅ 콘텐츠 작성 완료! 발행 준비 중...');

    // 간단한 이미지 배치 현황만 로깅
    if (resolved.images && resolved.images.length > 0) {
      self.log(`   📊 이미지 ${Math.min(resolved.images.length, headings.length)}개 배치 완료`);
    }

    // 3. 마지막 본문 끝에서 Enter 2회 (CTA와 본문 사이 간격)
    self.log('📝 [마지막 단계] CTA 및 해시태그 영역 준비 중...');
    self.log('   → Enter 2회 입력 (CTA 삽입 준비)');
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Enter');
      await self.delay(self.DELAYS.SHORT); // 150ms
      self.log(`   ✅ Enter ${i + 1}/2 완료`);
    }

    // 4. CTA 버튼 삽입 (해시태그 전에 배치, skipCta가 false인 경우만)
    // ✅ 쇼핑커넥트 모드: CTA가 없어도 자동으로 후킹 CTA 생성
    let effectiveCtas = resolved.ctas || [];
    if (!resolved.skipCta && resolved.affiliateLink && effectiveCtas.length === 0) {
      // 🛒 쇼핑커넥트 자동 CTA 생성 (구매 결심 유도 후킹 문구)
      const hookTexts = [
        '🔥 지금 바로 확인하기 →',
        '✨ 특가 혜택 보러가기 →',
        '🎁 한정 수량 확인하기 →',
        '💰 최저가로 구매하기 →',
        '🛒 품절 전에 확인하기 →'
      ];
      const randomHook = hookTexts[Math.floor(Math.random() * hookTexts.length)];
      effectiveCtas = [{ text: randomHook, link: resolved.affiliateLink }];
      self.log(`   🛒 [쇼핑커넥트] 자동 CTA 생성: "${randomHook}"`);
    }

    const isHeadingPosition = /^heading-\d+$/.test(resolved.ctaPosition || '');
    if (!resolved.skipCta && effectiveCtas.length > 0 && !isHeadingPosition) {
      // ✅ heading-N인 경우 이미 해당 소제목 아래에 삽입 완료 → 하단 CTA 건너뜀
      const ctaPosition = resolved.ctaPosition || 'bottom'; // 풀오토는 항상 하단

      // ✅ [2026-01-19 버그 수정] 쇼핑커넥트 모드에서는 CTA를 1개로 제한 (링크카드 중복 방지)
      if (resolved.affiliateLink && effectiveCtas.length > 1) {
        self.log(`   ⚠️ [쇼핑커넥트] CTA ${effectiveCtas.length}개 → 1개로 제한 (링크카드 중복 방지)`);
        effectiveCtas = [effectiveCtas[0]]; // 첫 번째 CTA만 사용
      }

      // ✅ [수정] 제휴 마케팅 고지 문구는 최상단(첫 번째 섹션)에서 삽입됨
      // 이전: CTA 앞에 삽입 → 변경: 글 최상단(1번 소제목 위)에 삽입

      for (let i = 0; i < effectiveCtas.length; i++) {
        const c = effectiveCtas[i];

        // ✅ 쇼핑커넥트 모드(affiliateLink 존재 시)면 강화된 CTA 사용 (하단에만 적용)
        if (resolved.affiliateLink && ctaPosition === 'bottom') {
          self.log(`   → 쇼핑커넥트 모드: 강화된 CTA 하단 삽입 중... (${i + 1}/${effectiveCtas.length})`);
          // ✅ [디버깅] 이전글 정보 확인
          self.log(`   📋 [디버깅] 이전글 제목: ${resolved.previousPostTitle || '없음'}`);
          self.log(`   📋 [디버깅] 이전글 URL: ${resolved.previousPostUrl || '없음'}`);
          self.log(`   📋 [디버깅] 제휴링크: ${resolved.affiliateLink}`);

          // ✅ [2026-01-19] 쇼핑커넥트 CTA 로직 재구성
          // - 첫 번째 CTA(i===0): 배너 + affiliateLink (제품 CTA)
          // - 추가 CTA들(i>0): 각자의 link 사용 (사용자 추가 CTA)
          // - 마지막 CTA 후: 이전글 삽입
          const isFirstCta = i === 0;
          const isLastCta = i === effectiveCtas.length - 1;

          if (isFirstCta) {
            // ✅ 첫 번째 CTA: 배너 이미지 + 제휴링크 (Enhanced CTA)
            self.log(`   🛒 [쇼핑커넥트] 첫 번째 CTA (제품): \"${c.text}\"`);
            await self.insertEnhancedCta(
              resolved.affiliateLink, // 제휴링크
              c.text,
              resolved.title || '',
              undefined, // 이전글은 마지막에 별도 삽입
              undefined,
              resolved.hashtags,
              resolved.useAiBanner,
              resolved.customBannerPath,
              resolved.autoBannerGenerate // ✅ [2026-01-21] 배너 자동 랜덤 생성
            );
          } else {
            // ✅ 추가 CTA들: 배너 없이 구분선 + 후킹 + 링크만 (사용자 추가 CTA)
            self.log(`   📎 [추가 CTA ${i}] \"${c.text}\" → ${c.link || '#'}`);
            const page = self.ensurePage();

            // 구분선 삽입
            const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
            await page.keyboard.press('Enter');
            await safeKeyboardType(page, divider, { delay: 5 });
            await page.keyboard.press('Enter');

            // 후킹 문구 + 링크 삽입
            await safeKeyboardType(page, `📎 ${c.text}`, { delay: 10 });
            await page.keyboard.press('Enter');
            await safeKeyboardType(page, `👉 ${c.link || '#'}`, { delay: 10 });
            await page.keyboard.press('Enter');

            // 링크 카드 로딩 대기 (polling 방식)
            await self.waitForLinkCard(15000, 500);
          }

          // ✅ 마지막 CTA 후: 이전글 삽입
          if (isLastCta && resolved.previousPostUrl) {
            // ✅ [2026-03-20 FIX] 중복 삽입 방지 — 쇼핑커넥트(affiliateLink)와 이전글 URL이 동일한 경우만 스킵
            // 일반 모드에서 ctaLink=previousPostUrl은 의도적 동기화이므로 이전글 삽입을 스킵하면 안 됨
            if (resolved.affiliateLink && resolved.affiliateLink === resolved.previousPostUrl) {
              self.log(`   ⚠️ [이전글] 제휴 링크와 동일 URL → 중복 삽입 건너뜀`);
            } else {
              self.log(`   📖 [이전글] 같은 카테고리 이전글 삽입`);
              const page = self.ensurePage();

              // 구분선
              const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
              await page.keyboard.press('Enter');
              await safeKeyboardType(page, divider, { delay: 5 });
              await page.keyboard.press('Enter');

              // ✅ [2026-03-20] 후킹 문구: 공유 상수 사용 (DRY 원칙)
              const randomPrevHook = PREV_POST_HOOKS[Math.floor(Math.random() * PREV_POST_HOOKS.length)];
              await safeKeyboardType(page, randomPrevHook, { delay: 10 });
              await page.keyboard.press('Enter');
              await safeKeyboardType(page, `📖 ${resolved.previousPostTitle || '이전 글 보기'}`, { delay: 10 });
              await page.keyboard.press('Enter');
              await safeKeyboardType(page, `👉 ${resolved.previousPostUrl}`, { delay: 10 });
              await page.keyboard.press('Enter');

              // 링크 카드 로딩 대기 (polling 방식)
              await self.waitForLinkCard(15000, 500);
              self.log(`   ✅ 이전글 삽입 완료 (후킹: ${randomPrevHook})`);
            }
          }
        } else {
          // ✅ [2026-01-26 FIX] 일반 모드 (SEO): 이전글 엮기만 삽입 (CTA는 수동 추가 시에만)
          const isLastCta = i === effectiveCtas.length - 1;
          const page = self.ensurePage();

          // ✅ CTA가 링크를 포함한 경우 CTA 삽입 (텍스트 없으면 기본 문구 사용)
          if (c.link) {
            const ctaDisplayText = c.text || '자세히 보러가기';
            self.log(`   📎 [일반 CTA ${i + 1}] \"${ctaDisplayText}\" → ${c.link}`);

            // 구분선 삽입
            const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
            await page.keyboard.press('Enter');
            await safeKeyboardType(page, divider, { delay: 5 });
            await page.keyboard.press('Enter');

            // 후킹 문구 + 링크 삽입
            await safeKeyboardType(page, `📎 ${ctaDisplayText}`, { delay: 10 });
            await page.keyboard.press('Enter');
            await safeKeyboardType(page, `👉 ${c.link}`, { delay: 10 });
            await page.keyboard.press('Enter');

            // 링크 카드 로딩 대기 (polling 방식)
            await self.waitForLinkCard(15000, 500);
          }


          // ✅ [2026-01-26 FIX] 마지막 CTA 후에만 이전글 삽입 (중복 방지)
          // isLastCta 체크로 한 번만 삽입되도록 보장
          if (isLastCta) {
            // ✅ [2026-02-08] 공식 사이트 링크 자동 삽입 (이전글 앞에 배치)
            // 행동 유발 카테고리에서만 동작 (비즈니스, 티켓, 여행, 건강, 교육 등)
            try {
              const actionCategories = [
                '비즈니스', '경제', '금융', '부동산', '지원금', '보조금', '대출',
                '티켓', '예매', '공연', '콘서트', '전시',
                '여행', '항공', 'KTX', '숙소', '호텔',
                '건강', '병원', '검진', '보험', '의료',
                '교육', '자격증', '시험', '수강', '학원',
                '취업', '채용', '이직', '공채',
                '정부', '민원', '신청', '발급', '등록',
                '맛집', '카페', '레스토랑',
              ];

              const titleLower = (resolved.title || '').toLowerCase();
              const hashtagStr = (resolved.hashtags || []).join(' ').toLowerCase();
              const combinedText = `${titleLower} ${hashtagStr}`;

              const isActionCategory = actionCategories.some(cat => combinedText.includes(cat));

              if (isActionCategory) {
                self.log(`   🔗 [공식사이트] 행동 유발 키워드 감지 → 관련 공식 사이트 검색 중...`);

                const { findRelevantOfficialSite } = await import('../contentGenerator.js');
                const siteResult = await findRelevantOfficialSite(
                  resolved.title || resolved.hashtags?.[0] || '',
                  undefined,
                  bodyText?.substring(0, 500),
                );

                if (siteResult.success && siteResult.url) {
                  self.log(`   ✅ [공식사이트] 검증 완료: ${siteResult.siteName} (${siteResult.url})`);

                  // 구분선
                  const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
                  await page.keyboard.press('Enter');
                  await safeKeyboardType(page, divider, { delay: 5 });
                  await page.keyboard.press('Enter');

                  // 관련 사이트 바로가기 문구
                  const siteHooks = [
                    '🔗 관련 사이트 바로가기!!',
                    '🌐 공식 사이트 바로가기!!',
                    '📌 관련 공식 사이트 바로가기!!',
                  ];
                  const randomSiteHook = siteHooks[Math.floor(Math.random() * siteHooks.length)];
                  await safeKeyboardType(page, randomSiteHook, { delay: 10 });
                  await page.keyboard.press('Enter');

                  // 공식 사이트 URL 삽입 → 링크 카드 자동 생성
                  await safeKeyboardType(page, `👉 ${siteResult.url}`, { delay: 10 });
                  await page.keyboard.press('Enter');

                  // 링크 카드 로딩 대기
                  await self.waitForLinkCard(15000, 500);
                  self.log(`   ✅ [공식사이트] 관련 사이트 바로가기 삽입 완료: ${siteResult.siteName}`);
                } else {
                  self.log(`   ⚠️ [공식사이트] 적합한 사이트 없음 → 건너뜀`);
                }
              }
            } catch (siteError) {
              self.log(`   ⚠️ [공식사이트] 검색 실패 (무시): ${(siteError as Error).message}`);
            }

            // ✅ 이전글 삽입
            if (resolved.previousPostUrl) {
              // ✅ [2026-03-20 FIX] 중복 삽입 방지 — 쇼핑커넥트 제휴 링크와 동일한 경우만 스킵
              if (resolved.affiliateLink && resolved.affiliateLink === resolved.previousPostUrl) {
                self.log(`   ⚠️ [이전글] 제휴 링크와 동일 URL → 중복 삽입 건너뜀`);
              } else {
                self.log(`   📖 [이전글] 같은 카테고리 이전글 연결`);

                // 구분선
                const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
                await page.keyboard.press('Enter');
                await safeKeyboardType(page, divider, { delay: 5 });
                await page.keyboard.press('Enter');

                // ✅ [2026-03-20] 후킹 문구: 공유 상수 사용 (DRY 원칙)
                const randomPrevHook = PREV_POST_HOOKS[Math.floor(Math.random() * PREV_POST_HOOKS.length)];
                await safeKeyboardType(page, randomPrevHook, { delay: 10 });
                await page.keyboard.press('Enter');
                await safeKeyboardType(page, `📖 ${resolved.previousPostTitle || '이전 글 보기'}`, { delay: 10 });
                await page.keyboard.press('Enter');
                await safeKeyboardType(page, `👉 ${resolved.previousPostUrl}`, { delay: 10 });
                await page.keyboard.press('Enter');

                // 링크 카드 로딩 대기 (polling 방식)
                await self.waitForLinkCard(15000, 500);
                self.log(`   ✅ 이전글 연결 완료 (후킹: ${randomPrevHook})`);
              }
            }
          }
        }
        await self.delay(500); // CTA 삽입 후 충분한 대기 시간
      }
      self.log(`   ✅ CTA 버튼 삽입 완료`);

      // ✅ [2026-01-24 FIX] CTA 재시도 로직 제거 - 중복 CTA 삽입 방지
      //    기존 로직: CTA 확인 실패 시 재삽입 → 이전글 후 CTA 중복 발생
      //    수정: 재시도 로직 제거, CTA는 한 번만 삽입
      await self.delay(500); // 삽입 후 대기
      self.log(`   ✅ CTA 버튼 삽입 및 확인 완료 (재시도 건너뜀)`);
    } else {
      // ✅ [2026-02-08] CTA가 없는 경우 (홈판 모드, skipCta 등)에서도
      // 공식 사이트 바로가기 + 이전글 독립 삽입
      const page = self.ensurePage();

      // 공식 사이트 바로가기 삽입
      try {
        const actionCategories = [
          '비즈니스', '경제', '금융', '부동산', '지원금', '보조금', '대출',
          '티켓', '예매', '공연', '콘서트', '전시',
          '여행', '항공', 'KTX', '숙소', '호텔',
          '건강', '병원', '검진', '보험', '의료',
          '교육', '자격증', '시험', '수강', '학원',
          '취업', '채용', '이직', '공채',
          '정부', '민원', '신청', '발급', '등록',
          '맛집', '카페', '레스토랑',
        ];

        const titleLower = (resolved.title || '').toLowerCase();
        const hashtagStr = (resolved.hashtags || []).join(' ').toLowerCase();
        const combinedText = `${titleLower} ${hashtagStr}`;

        const isActionCategory = actionCategories.some(cat => combinedText.includes(cat));

        if (isActionCategory) {
          self.log(`   🔗 [공식사이트] 행동 유발 키워드 감지 (CTA 없는 모드) → 관련 공식 사이트 검색 중...`);

          const { findRelevantOfficialSite } = await import('../contentGenerator.js');
          const siteResult = await findRelevantOfficialSite(
            resolved.title || resolved.hashtags?.[0] || '',
            undefined,
            bodyText?.substring(0, 500),
          );

          if (siteResult.success && siteResult.url) {
            self.log(`   ✅ [공식사이트] 검증 완료: ${siteResult.siteName} (${siteResult.url})`);

            const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
            await page.keyboard.press('Enter');
            await safeKeyboardType(page, divider, { delay: 5 });
            await page.keyboard.press('Enter');

            const siteHooks = [
              '🔗 관련 사이트 바로가기!!',
              '🌐 공식 사이트 바로가기!!',
              '📌 관련 공식 사이트 바로가기!!',
            ];
            const randomSiteHook = siteHooks[Math.floor(Math.random() * siteHooks.length)];
            await safeKeyboardType(page, randomSiteHook, { delay: 10 });
            await page.keyboard.press('Enter');

            await safeKeyboardType(page, `👉 ${siteResult.url}`, { delay: 10 });
            await page.keyboard.press('Enter');

            await self.waitForLinkCard(15000, 500);
            self.log(`   ✅ [공식사이트] 관련 사이트 바로가기 삽입 완료: ${siteResult.siteName}`);
          } else {
            self.log(`   ⚠️ [공식사이트] 적합한 사이트 없음 → 건너뜀`);
          }
        }
      } catch (siteError) {
        self.log(`   ⚠️ [공식사이트] 검색 실패 (무시): ${(siteError as Error).message}`);
      }

      // 이전글 삽입
      if (resolved.previousPostUrl) {
        self.log(`   📖 [이전글] 같은 카테고리 이전글 연결 (CTA 없는 모드)`);

        const divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
        await page.keyboard.press('Enter');
        await safeKeyboardType(page, divider, { delay: 5 });
        await page.keyboard.press('Enter');

        // ✅ [2026-03-20] 후킹 문구: 공유 상수 사용 (DRY 원칙)
        const randomPrevHook = PREV_POST_HOOKS[Math.floor(Math.random() * PREV_POST_HOOKS.length)];
        await safeKeyboardType(page, randomPrevHook, { delay: 10 });
        await page.keyboard.press('Enter');
        await safeKeyboardType(page, `📖 ${resolved.previousPostTitle || '이전 글 보기'}`, { delay: 10 });
        await page.keyboard.press('Enter');
        await safeKeyboardType(page, `👉 ${resolved.previousPostUrl}`, { delay: 10 });
        await page.keyboard.press('Enter');

        await self.waitForLinkCard(15000, 500);
        self.log(`   ✅ 이전글 연결 완료 (후킹: ${randomPrevHook})`);
      }
    }

    // ✅ 중복 문구 제거됨: '쇼핑커넥트 수익이 발생할 수 있습니다' 문구는 
    // 이미 위에서 '제휴 마케팅 고지 문구'로 처리되므로 별도 추가하지 않음

    // 5. 커서를 에디터 맨 끝으로 확실히 이동 (해시태그 짤림 방지)
    self.log('   → 커서를 에디터 맨 끝으로 이동 (해시태그 영역 준비)');
    await page.keyboard.press('End');
    await self.delay(100);
    await page.keyboard.down('Control');
    await page.keyboard.press('End');
    await page.keyboard.up('Control');
    await self.delay(200);

    // 6. Enter 3회 (CTA와 해시태그 사이 간격)
    self.log('   → Enter 3회 입력 (해시태그 영역 준비)');
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Enter');
      await self.delay(self.DELAYS.SHORT); // 150ms
    }
    self.log(`   ✅ Enter 3회 완료`);

    // ✅ CTA 카드 로딩 대기 (5초) - 카드가 3초 뒤에 뜨므로 여유있게 대기
    self.log('   → CTA 카드 로딩 대기 (5초)...');
    await self.delay(5000);
    self.log('   ✅ CTA 카드 로딩 대기 완료');

    // 7. 해시태그 입력 (최대 5개) - 본문에 직접 입력
    const hashtagsToApply = resolved.hashtags.slice(0, 5);
    if (hashtagsToApply.length > 0) {
      self.log(`   → 해시태그 ${hashtagsToApply.length}개 입력 중...`);

      // ✅ 해시태그 입력 전 다시 한번 커서 위치 확인
      await page.keyboard.press('End');
      await self.delay(100);

      await self.applyHashtagsInBody(hashtagsToApply);
      await self.delay(self.DELAYS.MEDIUM); // 200ms
      self.log(`   ✅ 해시태그 입력 완료`);
    }

    // 7. CTA 버튼 최종 확인 (발행 전)
    if (resolved.ctas.length > 0 || resolved.ctaText) {
      self.log('\n🔍 CTA 버튼 최종 확인 중...');
      const frame = (await self.getAttachedFrame());
      const finalCheck = await self.verifyCtaInsertion(frame, resolved.ctas[0]?.text || resolved.ctaText || '');

      if (finalCheck) {
        self.log('✅ CTA 버튼이 정상적으로 삽입되었습니다.');
      } else {
        self.log('⚠️ CTA 버튼이 확인되지 않습니다. 발행 후 브라우저에서 직접 확인해주세요.');
        self.log('💡 만약 버튼이 보이지 않으면, 네이버 블로그 에디터에서 직접 링크를 추가해주세요.');
      }
    }

    // 8. 이미지 배치 검증 (skipImages가 false인 경우)
    if (!resolved.skipImages && resolved.images && resolved.images.length > 0) {
      await self.verifyImagePlacement(resolved.images);
    }

    self.log('\n✅ 구조화된 콘텐츠 작성이 완료되었습니다.');
  }, 3, '콘텐츠 적용');
}

// ── setFontSize ──


export async function setFontSize(self: any, size: number, force: boolean = false): Promise<void> {
  const frame = (await self.getAttachedFrame());
  const page = self.ensurePage();

  self.log(`   → 폰트 크기 ${size}px 설정 중...`);

  try {
    // 방법 1: 툴바 버튼으로 설정
    const fontSizeToggleButton = await frame.waitForSelector(
      'button.se-font-size-code-toolbar-button[data-name="font-size"]',
      { visible: true, timeout: 2000 }
    ).catch(() => null);

    if (fontSizeToggleButton) {
      // 드롭다운 열기
      await fontSizeToggleButton.click();
      await self.delay(self.DELAYS.MEDIUM); // 300ms → 200ms

      // 특정 크기 버튼 클릭 (네이버 표준 크기: 11, 13, 15, 16, 19, 24, 28, 30, 38)
      const sizeButton = await frame.waitForSelector(
        `button[data-value="fs${size}"], .se-toolbar-option-font-size-code-fs${size}-button`,
        { visible: true, timeout: 1000 }
      ).catch(() => null);

      if (sizeButton) {
        await sizeButton.click();
        await self.delay(self.DELAYS.MEDIUM); // 300ms → 200ms
        self.log(`   ✅ 폰트 크기 ${size}px 설정 완료 (툴바)`);
        return;
      }
    }

    // 방법 2: JavaScript로 강제 설정 (더 확실한 방법)
    if (force) {
      await frame.evaluate((fontSize: any) => {
        // 네이버 에디터의 실제 편집 영역 찾기
        const editorAreas = [
          '.se-section-text',
          '.se-main-container .se-editing-area',
          '.se-editing-area',
          '.se-component-content',
          '[contenteditable="true"]'
        ];

        let editorElement: HTMLElement | null = null;
        for (const selector of editorAreas) {
          const element = document.querySelector(selector) as HTMLElement;
          if (element && element.contentEditable === 'true') {
            editorElement = element;
            break;
          }
        }

        if (!editorElement) {
          // contentEditable이 명시되지 않은 경우도 시도
          const activeElement = document.activeElement as HTMLElement;
          if (activeElement) {
            editorElement = activeElement;
          }
        }

        if (editorElement) {
          // 1. 편집 영역 전체에 기본 폰트 크기 설정
          editorElement.style.fontSize = `${fontSize}px`;
          editorElement.setAttribute('data-font-size', fontSize.toString());

          // 2. 네이버 에디터 폰트 크기 클래스 적용
          const classes = Array.from(editorElement.classList);
          classes.forEach(cls => {
            if (cls.startsWith('se-fs') || cls.startsWith('fs')) {
              editorElement!.classList.remove(cls);
            }
          });

          // 네이버 에디터 표준 클래스 추가
          editorElement.classList.add(`se-fs${fontSize}`);

          // 3. 현재 커서 위치의 모든 부모 요소에 폰트 크기 적용
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            let container: Node = range.commonAncestorContainer;

            // 텍스트 노드인 경우 부모 요소로 이동
            if (container.nodeType === Node.TEXT_NODE) {
              container = (container as Text).parentElement || container;
            }

            // 모든 부모 요소에 폰트 크기 적용 (최대 5단계까지)
            let current: Element | null = container as Element;
            let depth = 0;
            while (current && depth < 5 && editorElement.contains(current)) {
              if (current instanceof HTMLElement) {
                current.style.fontSize = `${fontSize}px`;
                current.setAttribute('data-font-size', fontSize.toString());

                // 네이버 에디터 클래스도 적용
                const currentClasses = Array.from(current.classList);
                currentClasses.forEach(cls => {
                  if (cls.startsWith('se-fs') || cls.startsWith('fs')) {
                    current!.classList.remove(cls);
                  }
                });
                current.classList.add(`se-fs${fontSize}`);
              }
              current = current.parentElement;
              depth++;
            }
          }

          // 4. 네이버 에디터의 기본 스타일도 오버라이드
          const style = document.createElement('style');
          style.textContent = `
            .se-section-text,
            .se-section-text *,
            .se-component-content,
            .se-component-content * {
              font-size: ${fontSize}px !important;
            }
            .se-fs${fontSize} {
              font-size: ${fontSize}px !important;
            }
          `;

          // 기존 스타일 태그 제거 후 새로 추가
          const existingStyle = document.getElementById('naver-font-size-override');
          if (existingStyle) {
            existingStyle.remove();
          }
          style.id = 'naver-font-size-override';
          document.head.appendChild(style);
        }
      }, size);

      await self.delay(self.DELAYS.MEDIUM);
      self.log(`   ✅ 폰트 크기 ${size}px 강제 설정 완료 (JavaScript + CSS)`);
    }
  } catch (error) {
    self.log(`   ⚠️ 폰트 크기 설정 실패: ${(error as Error).message}`);
  }
}

// ── extractBodyForHeading ──


export function extractBodyForHeading(self: any, fullBody: string, headingTitle: string, headingIndex: number, totalHeadings: number, allHeadings?: any[]): string {
  if (!fullBody || !fullBody.trim()) {
    return '';
  }

  // ✅ [2026-02-27 FIX] heading.content 사용을 후순위로 변경
  // 사용자가 미리보기에서 수정한 경우 heading.content가 stale할 수 있으므로
  // fullBody 기반 분할을 먼저 시도하고, 실패 시에만 heading.content 사용

  // ✅ 1. 간단한 방식: 전체 본문을 소제목 기준으로 분할
  // 모든 소제목 제목을 찾아서 본문을 구분
  if (allHeadings && allHeadings.length > 0) {
    const headingTitles = allHeadings.map(h => h.title);

    // 현재 소제목과 다음 소제목 사이의 내용 추출
    const currentTitle = headingTitle;
    const nextTitle = headingIndex < allHeadings.length - 1 ? allHeadings[headingIndex + 1].title : null;

    // "소제목: 내용" 형식으로 찾기
    const currentTitleEscaped = currentTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const currentPattern = new RegExp(`${currentTitleEscaped}\\s*:?\\s*`, 'i');
    const currentMatch = fullBody.match(currentPattern);

    if (currentMatch && currentMatch.index !== undefined) {
      const startIdx = currentMatch.index + currentMatch[0].length;
      let endIdx = fullBody.length;

      // 다음 소제목까지 찾기
      if (nextTitle) {
        const nextTitleEscaped = nextTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nextPattern = new RegExp(`${nextTitleEscaped}\\s*:?\\s*`, 'i');
        const nextMatch = fullBody.substring(startIdx).match(nextPattern);
        if (nextMatch && nextMatch.index !== undefined) {
          endIdx = startIdx + nextMatch.index;
        }
      }

      // 마지막 소제목이면 끝까지 추출
      const extractedContent = fullBody.substring(startIdx, endIdx).trim();

      if (extractedContent.length > 30) {
        // 소제목 제목이 본문에 포함되어 있으면 제거
        let cleanContent = extractedContent
          .replace(new RegExp(`^\\s*${currentTitleEscaped}\\s*:?\\s*`, 'gi'), '')
          .trim();

        self.log(`   🎯 [본문추출] 소제목 기준 분할 성공: "${headingTitle}" (${cleanContent.length}자)`);
        return cleanContent;
      }
    }
  }

  // ✅ 개선된 로직: 정확한 소제목 매칭 및 본문 추출
  // 2. 정확한 소제목 패턴 찾기: "소제목: 내용..." 형식
  const escapedHeadingTitle = headingTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 정확한 매칭: 소제목이 줄의 시작 부분에 있고 콜론(:)이 바로 뒤에 오는 경우
  // 또는 소제목이 포함된 줄에서 콜론(:)이 바로 뒤에 오는 경우
  const exactPattern = new RegExp(`(^|\\n)\\s*${escapedHeadingTitle}\\s*:\\s*`, 'i');
  const match = fullBody.match(exactPattern);

  if (match && match.index !== undefined) {
    // 소제목을 찾았을 경우
    const startIndex = match.index + match[0].length;
    let content = fullBody.substring(startIndex);

    // 다음 소제목을 찾아서 중지
    const remainingHeadings: any[] = allHeadings?.filter((_, idx) => idx > headingIndex) || [];
    let endIndex = content.length;

    // ✅ 마무리 소제목이 마지막 소제목인 경우: 전체 본문의 마지막 부분을 가져옴
    const isLastHeading = headingIndex === totalHeadings - 1;
    const isClosingHeading = headingTitle.includes('마무리') || headingTitle.includes('결론');

    if (isLastHeading || isClosingHeading) {
      // 마지막 소제목이면 전체 본문의 마지막 부분을 가져옴
      // 다음 소제목을 찾지 않고 전체 내용 사용
      self.log(`   🔍 [마지막/마무리 소제목] 전체 본문의 마지막 부분 추출`);
    } else {
      // 다음 소제목들을 찾아서 가장 가까운 것을 찾음
      for (const nextHeading of remainingHeadings) {
        const nextEscaped = nextHeading.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nextPattern = new RegExp(`(^|\\n)\\s*${nextEscaped}\\s*:\\s*`, 'i');
        const nextMatch = content.match(nextPattern);
        if (nextMatch && nextMatch.index !== undefined) {
          const nextIndex = nextMatch.index;
          if (nextIndex < endIndex) {
            endIndex = nextIndex;
          }
        }
      }
      content = content.substring(0, endIndex).trim();
    }

    // 소제목이 본문에 포함되어 있으면 제거 (중복 방지)
    let cleanContent = content
      .replace(new RegExp(`^\\s*${escapedHeadingTitle}\\s*:\\s*`, 'i'), '')
      .replace(new RegExp(`\\n\\s*${escapedHeadingTitle}\\s*:\\s*`, 'gi'), '\n')
      .trim();

    // ✅ 글 마지막에 중복된 CTA 텍스트 제거 (🔗 자세히 보기, 🔗 더 알아보기 등)
    cleanContent = cleanContent
      .replace(/\n+🔗\s*자세히\s*보기[^\n]*$/i, '') // 마지막 줄의 "🔗 자세히 보기" 제거
      .replace(/\n+🔗\s*더\s*알아보기[^\n]*$/i, '') // 마지막 줄의 "🔗 더 알아보기" 제거
      .replace(/\n+자세히\s*보기[^\n]*$/i, '') // 마지막 줄의 "자세히 보기" 제거
      .replace(/\n+더\s*알아보기[^\n]*$/i, '') // 마지막 줄의 "더 알아보기" 제거
      .trim();

    // ✅ 마무리 문구 패턴 제거 (부자연스러운 마무리 문구 정리)
    const closingPatterns = [
      /도움이\s*되었으면\s*좋겠습니다/gi,
      /참고하시길\s*바랍니다/gi,
      /함께\s*응원해요/gi,
      /화이팅/gi,
      /응원합니다/gi,
      /다음에\s*또\s*만나요/gi,
      /다음에\s*또\s*봬요/gi,
      /글을\s*마무리하겠습니다/gi,
      /글을\s*마칩니다/gi,
      /마무리하겠습니다/gi,
      /마무리합니다/gi,
      /기대하며\s*글을/gi,
      /기대하며\s*마무리/gi,
      /기대하며\s*마칩니다/gi,
      /승리를\s*기대하며/gi,
      /활약을\s*기대하며/gi,
      /정리하면/gi,
      /마지막으로/gi,
      /끝으로/gi,
      /요약하면/gi,
    ];

    // 마지막 500자 내에서 마무리 문구가 중복되면 제거
    const last500Chars = cleanContent.slice(-500);
    let closingCount = 0;
    for (const pattern of closingPatterns) {
      const matches = last500Chars.match(pattern);
      if (matches) {
        closingCount += matches.length;
      }
    }

    // 마무리 문구가 2개 이상이면 마지막 것만 남기고 제거
    if (closingCount > 1) {
      const lines = cleanContent.split('\n');
      const cleanedLines: string[] = [];
      let foundClosing = false;

      // 뒤에서부터 검사하여 마지막 마무리 문구만 유지
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        const hasClosing = closingPatterns.some(pattern => pattern.test(line));

        if (hasClosing) {
          if (!foundClosing) {
            // 첫 번째로 발견한 마무리 문구만 유지
            cleanedLines.unshift(line);
            foundClosing = true;
          }
          // 나머지 마무리 문구는 제거
        } else {
          cleanedLines.unshift(line);
        }
      }

      cleanContent = cleanedLines.join('\n').trim();
    }

    // ✅ 불필요한 문구 전체 제거 (본문 중간에도 있는 경우 제거)
    const unwantedPhrases = [
      /비즈니스\s*성장에\s*도움이\s*되길\s*바랍니다[^\n]*/gi,
      /비즈니스\s*성장에\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
      /마케팅\s*활동에\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
      /마케팅\s*활동에\s*도움이\s*되길\s*바랍니다[^\n]*/gi,
      /이\s*정보가\s*도움이\s*되셨기를\s*바랍니다[^\n]*/gi,
      /도움이\s*되셨기를\s*바랍니다[^\n]*/gi,
      // ✅ "도움이 되었으면" 모든 변형 제거 (오타 포함)
      /도움이\s*되(었|셧|셨)으면\s*좋겠(습니다|어요|다)[^\n]*/gi,
      /도움이\s*되(었|셧|셨)으면\s*(합니다|해요|한다)[^\n]*/gi,
      /도움이\s*되(었|셧|셨)으면[^\n]*/gi,
      /도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
      /도움이\s*되었으면\s*합니다[^\n]*/gi,
      /도움이\s*되셧으면\s*좋겠습니다[^\n]*/gi,
      /도움이\s*되셨으면\s*좋겠습니다[^\n]*/gi,
      /정보가\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
      /정보가\s*도움이\s*되셧으면\s*좋겠습니다[^\n]*/gi,
      /정보가\s*도움이\s*되셨으면\s*좋겠습니다[^\n]*/gi,
      /참고하시길\s*바랍니다[^\n]*/gi,
      /재태크에\s*도움되셧으면\s*좋겠습니다[^\n]*/gi,
      /재태크에\s*도움되셨으면\s*좋겠습니다[^\n]*/gi,
      /재태크에\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
      /재태크에\s*도움이\s*되었으면\s*합니다[^\n]*/gi,
      /재테크에\s*도움되셧으면\s*좋겠습니다[^\n]*/gi,
      /재테크에\s*도움되셨으면\s*좋겠습니다[^\n]*/gi,
      /재테크에\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
      /재테크에\s*도움이\s*되었으면\s*합니다[^\n]*/gi,
    ];

    // 본문 전체에서 불필요한 문구 제거 (줄 단위로)
    const lines = cleanContent.split('\n');
    const filteredLines: string[] = [];
    for (const line of lines) {
      let shouldRemove = false;
      for (const pattern of unwantedPhrases) {
        if (pattern.test(line)) {
          shouldRemove = true;
          break;
        }
      }
      if (!shouldRemove) {
        filteredLines.push(line);
      }
    }
    cleanContent = filteredLines.join('\n').trim();

    // ✅ 마지막 문단이 너무 짧거나 의미 없는 경우 제거 (5자 이하)
    const contentLines = cleanContent.split('\n');
    if (contentLines.length > 0) {
      const lastLine = contentLines[contentLines.length - 1].trim();
      if (lastLine.length <= 5 && closingPatterns.some(pattern => pattern.test(lastLine))) {
        contentLines.pop();
        cleanContent = contentLines.join('\n').trim();
      }
    }

    // ✅ 다른 소제목의 제목과 내용 제거 (중복 방지)
    // 예: "3개월 사용 후 솔직 후기: ..." 같은 다른 소제목 내용이 포함된 경우 제거
    if (allHeadings && allHeadings.length > 0) {
      for (const otherHeading of allHeadings) {
        if (otherHeading.title !== headingTitle) {
          const escapedOtherTitle = otherHeading.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

          // 다른 소제목 제목으로 시작하는 줄 전체 제거 (소제목: 내용 형식)
          cleanContent = cleanContent
            .replace(new RegExp(`^\\s*${escapedOtherTitle}\\s*:.*$`, 'gmi'), '') // 줄 시작에서
            .replace(new RegExp(`\\n\\s*${escapedOtherTitle}\\s*:.*$`, 'gmi'), '\n') // 줄 중간에서
            .replace(new RegExp(`${escapedOtherTitle}\\s*:.*?(\\n|$)`, 'gi'), '') // 일반 패턴
            .trim();

          // ✅ 마무리 소제목의 본문 내용이 앞 소제목에 포함된 경우 제거
          // "마무리: 내용..." 패턴이 본문 중간에 포함되어 있으면 제거
          if (otherHeading.title.includes('마무리') || otherHeading.title.includes('결론')) {
            // 마무리 소제목의 제목 패턴으로 시작하는 모든 줄 제거
            const closingPattern = /마무리\s*:|결론\s*:|끝으로\s*:|마지막으로\s*:/gi;
            const lines = cleanContent.split('\n');
            const filteredLines: string[] = [];
            let skipNextLines = false;
            let foundClosingTitle = false;

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];

              // 마무리 소제목 제목이 발견되면 그 줄부터 끝까지 모두 제거
              if (closingPattern.test(line)) {
                // 마무리 소제목 제목이 포함된 줄인지 확인
                const titlePart = otherHeading.title.split(':')[0].trim();
                if (line.includes(titlePart) || line.match(/마무리\s*:.*코스트코|결론\s*:/i)) {
                  foundClosingTitle = true;
                  skipNextLines = true;
                  continue; // 마무리 소제목 라인 자체는 제거
                }
              }

              // 마무리 소제목 제목이 발견된 이후 모든 줄 제거
              if (foundClosingTitle || skipNextLines) {
                // 마무리 소제목의 본문 내용인지 확인 (특정 키워드 포함 여부)
                const hasClosingContent = /마무리|결론|끝으로|마지막으로|오늘\s*소개해\s*드린|어떠셨나요|꼭\s*한번|눈여겨보시고|현명한\s*쇼핑/i.test(line);
                if (hasClosingContent) {
                  continue; // 마무리 내용 줄 제거
                }
                // 마무리 소제목 이후 모든 줄 제거
                if (foundClosingTitle) {
                  continue;
                }
              }

              filteredLines.push(line);
            }

            cleanContent = filteredLines.join('\n').trim();

            // ✅ 추가 필터링: 마무리 소제목 본문의 일반적인 패턴 제거
            cleanContent = cleanContent
              .replace(new RegExp(`오늘\\s*소개해\\s*드린[^\\n]*`, 'gi'), '')
              .replace(new RegExp(`어떠셨나요[^\\n]*`, 'gi'), '')
              .replace(new RegExp(`꼭\\s*한번[^\\n]*`, 'gi'), '')
              .replace(new RegExp(`눈여겨보시고[^\\n]*`, 'gi'), '')
              .replace(new RegExp(`현명한\\s*쇼핑[^\\n]*`, 'gi'), '')
              .trim();
          }
        }
      }
    }

    if (cleanContent.length > 0) {
      self.log(`   🔍 [본문추출] 정확한 패턴 매칭 성공: "${headingTitle}" (${cleanContent.length}자)`);
      return cleanContent;
    }
  }

  // 2. 패턴을 찾지 못한 경우: 줄 단위로 검색 (더 유연한 매칭)
  const lines = fullBody.split('\n');
  let extractedContent: string[] = [];
  let isCollecting = false;
  let foundHeading = false;

  // 남은 headings 정의
  const remainingHeadings: any[] = allHeadings?.filter((_, idx) => idx > headingIndex) || [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 정확한 heading 시작 감지 (이미 찾지 않은 경우에만)
    if (!foundHeading && line.includes(headingTitle)) {
      // 콜론(:)이 있는지 확인
      const colonIndex = line.indexOf(':');
      if (colonIndex !== -1) {
        // heading 제목이 콜론 앞에 있는지 확인
        const beforeColon = line.substring(0, colonIndex).trim();
        if (beforeColon.includes(headingTitle)) {
          isCollecting = true;
          foundHeading = true;
          // heading 라인은 제외하고 내용부터 수집
          const contentPart = line.substring(colonIndex + 1).trim();
          if (contentPart) {
            extractedContent.push(contentPart);
          }
          continue;
        }
      }
    }

    // 다른 heading을 만나면 중지 (마지막/마무리 소제목이면 중지하지 않음)
    const isLastHeading = headingIndex === totalHeadings - 1;
    const isClosingHeading = headingTitle.includes('마무리') || headingTitle.includes('결론');

    if (isCollecting && !isLastHeading && !isClosingHeading) {
      let isNextHeading = false;
      for (const nextHeading of remainingHeadings) {
        if (line.includes(nextHeading.title)) {
          const colonIndex = line.indexOf(':');
          if (colonIndex !== -1) {
            const beforeColon = line.substring(0, colonIndex).trim();
            if (beforeColon.includes(nextHeading.title)) {
              isNextHeading = true;
              break;
            }
          }
        }
      }

      if (isNextHeading) {
        break;
      }
    }

    // 본문 수집
    if (isCollecting && line.trim()) {
      // 소제목이 포함된 줄은 제외
      if (!line.includes(headingTitle) || line.indexOf(':') === -1) {
        extractedContent.push(line);
      }
    }
  }

  if (extractedContent.length > 0) {
    let result = extractedContent.join('\n').trim();
    // 소제목 제거 (중복 방지)
    result = result
      .replace(new RegExp(`^\\s*${escapedHeadingTitle}\\s*:\\s*`, 'i'), '')
      .replace(new RegExp(`\\n\\s*${escapedHeadingTitle}\\s*:\\s*`, 'gi'), '\n')
      .trim();

    // ✅ 다른 소제목의 제목과 내용 제거 (중복 방지)
    // 예: "3개월 사용 후 솔직 후기: ..." 같은 다른 소제목 내용이 포함된 경우 제거
    if (allHeadings && allHeadings.length > 0) {
      for (const otherHeading of allHeadings) {
        if (otherHeading.title !== headingTitle) {
          const escapedOtherTitle = otherHeading.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

          // 다른 소제목 제목으로 시작하는 줄 전체 제거 (소제목: 내용 형식)
          result = result
            .replace(new RegExp(`^\\s*${escapedOtherTitle}\\s*:.*$`, 'gmi'), '') // 줄 시작에서
            .replace(new RegExp(`\\n\\s*${escapedOtherTitle}\\s*:.*$`, 'gmi'), '\n') // 줄 중간에서
            .replace(new RegExp(`${escapedOtherTitle}\\s*:.*?(\\n|$)`, 'gi'), '') // 일반 패턴
            .trim();

          // ✅ 마무리 소제목의 본문 내용이 앞 소제목에 포함된 경우 제거
          if (otherHeading.title.includes('마무리') || otherHeading.title.includes('결론')) {
            const closingPattern = /마무리\s*:|결론\s*:|끝으로\s*:|마지막으로\s*:/gi;
            const resultLines = result.split('\n');
            const filteredLines: string[] = [];
            let skipNextLines = false;
            let foundClosingTitle = false;

            for (let i = 0; i < resultLines.length; i++) {
              const line = resultLines[i];

              // 마무리 소제목 제목이 발견되면 그 줄부터 끝까지 모두 제거
              if (closingPattern.test(line)) {
                const titlePart = otherHeading.title.split(':')[0].trim();
                if (line.includes(titlePart) || line.match(/마무리\s*:.*코스트코|결론\s*:/i)) {
                  foundClosingTitle = true;
                  skipNextLines = true;
                  continue;
                }
              }

              // 마무리 소제목 제목이 발견된 이후 모든 줄 제거
              if (foundClosingTitle || skipNextLines) {
                const hasClosingContent = /마무리|결론|끝으로|마지막으로|오늘\s*소개해\s*드린|어떠셨나요|꼭\s*한번|눈여겨보시고|현명한\s*쇼핑/i.test(line);
                if (hasClosingContent || foundClosingTitle) {
                  continue;
                }
              }

              filteredLines.push(line);
            }

            result = filteredLines.join('\n').trim();

            // ✅ 추가 필터링: 마무리 소제목 본문의 일반적인 패턴 제거
            result = result
              .replace(new RegExp(`오늘\\s*소개해\\s*드린[^\\n]*`, 'gi'), '')
              .replace(new RegExp(`어떠셨나요[^\\n]*`, 'gi'), '')
              .replace(new RegExp(`꼭\\s*한번[^\\n]*`, 'gi'), '')
              .replace(new RegExp(`눈여겨보시고[^\\n]*`, 'gi'), '')
              .replace(new RegExp(`현명한\\s*쇼핑[^\\n]*`, 'gi'), '')
              .trim();
          }
        }
      }
    }

    // ✅ 글 마지막에 중복된 CTA 텍스트 제거 (🔗 자세히 보기, 🔗 더 알아보기 등)
    result = result
      .replace(/\n+🔗\s*자세히\s*보기[^\n]*$/i, '') // 마지막 줄의 "🔗 자세히 보기" 제거
      .replace(/\n+🔗\s*더\s*알아보기[^\n]*$/i, '') // 마지막 줄의 "🔗 더 알아보기" 제거
      .replace(/\n+자세히\s*보기[^\n]*$/i, '') // 마지막 줄의 "자세히 보기" 제거
      .replace(/\n+더\s*알아보기[^\n]*$/i, '') // 마지막 줄의 "더 알아보기" 제거
      .trim();

    // ✅ 마무리 문구 패턴 제거 (부자연스러운 마무리 문구 정리)
    const closingPatterns = [
      /도움이\s*되었으면\s*좋겠습니다/gi,
      /참고하시길\s*바랍니다/gi,
      /함께\s*응원해요/gi,
      /화이팅/gi,
      /응원합니다/gi,
      /다음에\s*또\s*만나요/gi,
      /다음에\s*또\s*봬요/gi,
      /글을\s*마무리하겠습니다/gi,
      /글을\s*마칩니다/gi,
      /마무리하겠습니다/gi,
      /마무리합니다/gi,
      /기대하며\s*글을/gi,
      /기대하며\s*마무리/gi,
      /기대하며\s*마칩니다/gi,
      /승리를\s*기대하며/gi,
      /활약을\s*기대하며/gi,
      /정리하면/gi,
      /마지막으로/gi,
      /끝으로/gi,
      /요약하면/gi,
    ];

    // 마지막 500자 내에서 마무리 문구가 중복되면 제거
    const last500Chars = result.slice(-500);
    let closingCount = 0;
    for (const pattern of closingPatterns) {
      const matches = last500Chars.match(pattern);
      if (matches) {
        closingCount += matches.length;
      }
    }

    // 마무리 문구가 2개 이상이면 마지막 것만 남기고 제거
    if (closingCount > 1) {
      const resultLines = result.split('\n');
      const cleanedLines: string[] = [];
      let foundClosing = false;

      // 뒤에서부터 검사하여 마지막 마무리 문구만 유지
      for (let i = resultLines.length - 1; i >= 0; i--) {
        const line = resultLines[i];
        const hasClosing = closingPatterns.some(pattern => pattern.test(line));

        if (hasClosing) {
          if (!foundClosing) {
            // 첫 번째로 발견한 마무리 문구만 유지
            cleanedLines.unshift(line);
            foundClosing = true;
          }
          // 나머지 마무리 문구는 제거
        } else {
          cleanedLines.unshift(line);
        }
      }

      result = cleanedLines.join('\n').trim();
    }

    // ✅ 불필요한 문구 전체 제거 (본문 중간에도 있는 경우 제거)
    const unwantedPhrases = [
      /비즈니스\s*성장에\s*도움이\s*되길\s*바랍니다[^\n]*/gi,
      /비즈니스\s*성장에\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
      /마케팅\s*활동에\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
      /마케팅\s*활동에\s*도움이\s*되길\s*바랍니다[^\n]*/gi,
      /이\s*정보가\s*도움이\s*되셨기를\s*바랍니다[^\n]*/gi,
      /도움이\s*되셨기를\s*바랍니다[^\n]*/gi,
      // ✅ "도움이 되었으면" 모든 변형 제거 (오타 포함)
      /도움이\s*되(었|셧|셨)으면\s*좋겠(습니다|어요|다)[^\n]*/gi,
      /도움이\s*되(었|셧|셨)으면\s*(합니다|해요|한다)[^\n]*/gi,
      /도움이\s*되(었|셧|셨)으면[^\n]*/gi,
      /도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
      /도움이\s*되었으면\s*합니다[^\n]*/gi,
      /도움이\s*되셧으면\s*좋겠습니다[^\n]*/gi,
      /도움이\s*되셨으면\s*좋겠습니다[^\n]*/gi,
      /정보가\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
      /정보가\s*도움이\s*되셧으면\s*좋겠습니다[^\n]*/gi,
      /정보가\s*도움이\s*되셨으면\s*좋겠습니다[^\n]*/gi,
      /참고하시길\s*바랍니다[^\n]*/gi,
      /재태크에\s*도움되셧으면\s*좋겠습니다[^\n]*/gi,
      /재태크에\s*도움되셨으면\s*좋겠습니다[^\n]*/gi,
      /재태크에\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
      /재태크에\s*도움이\s*되었으면\s*합니다[^\n]*/gi,
      /재테크에\s*도움되셧으면\s*좋겠습니다[^\n]*/gi,
      /재테크에\s*도움되셨으면\s*좋겠습니다[^\n]*/gi,
      /재테크에\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
      /재테크에\s*도움이\s*되었으면\s*합니다[^\n]*/gi,
    ];

    // 본문 전체에서 불필요한 문구 제거 (줄 단위로)
    const resultLines2 = result.split('\n');
    const filteredLines2: string[] = [];
    for (const line of resultLines2) {
      let shouldRemove = false;
      for (const pattern of unwantedPhrases) {
        if (pattern.test(line)) {
          shouldRemove = true;
          break;
        }
      }
      if (!shouldRemove) {
        filteredLines2.push(line);
      }
    }
    result = filteredLines2.join('\n').trim();

    // ✅ 마지막 문단이 너무 짧거나 의미 없는 경우 제거 (5자 이하)
    const resultLines = result.split('\n');
    if (resultLines.length > 0) {
      const lastLine = resultLines[resultLines.length - 1].trim();
      if (lastLine.length <= 5 && closingPatterns.some(pattern => pattern.test(lastLine))) {
        resultLines.pop();
        result = resultLines.join('\n').trim();
      }
    }

    if (result.length > 0) {
      self.log(`   🔍 [본문추출] 줄 단위 검색 성공: "${headingTitle}" (${result.length}자)`);
      return result;
    }
  }

  // ✅ [2026-02-27 FIX] 최후 폴백 전: fullBody 기반 추출 실패 시 heading.content 사용
  // heading.content는 stale할 수 있지만, 아무것도 없는 것보다는 나음
  if (allHeadings && allHeadings[headingIndex] && allHeadings[headingIndex].content) {
    const directContent = allHeadings[headingIndex].content.trim();
    if (directContent.length > 30) {
      self.log(`   🎯 [본문추출] heading.content 폴백 사용: "${headingTitle}" (${directContent.length}자)`);
      return directContent;
    }
  }

  // 3. 최후의 폴백: 기존 방식으로 균등 분배 (단순화)
  self.log(`   ⚠️ [본문추출] heading을 찾을 수 없어 균등 분배로 대체: "${headingTitle}"`);

  // 문단 분리: 빈 줄 또는 마침표+공백+대문자/한글로 시작
  const paragraphs = fullBody.split(/\n{2,}/).filter(p => p.trim());
  if (paragraphs.length === 0) {
    // 문단이 없으면 문장 단위로 분배
    const sentences = fullBody.split(/(?<=[.!?])\s+/).filter((s: any) => s.trim());
    const sentencesPerHeading = Math.max(3, Math.ceil(sentences.length / totalHeadings));
    const startIdx = headingIndex * sentencesPerHeading;
    const endIdx = Math.min(startIdx + sentencesPerHeading, sentences.length);
    const result = sentences.slice(startIdx, endIdx).join(' ').trim();

    if (result.length > 0) {
      self.log(`   🔧 [본문추출] 문장 단위 균등 분배: "${headingTitle}" (${result.length}자)`);
      return result;
    }
    return '';
  }

  const paragraphsPerHeading = Math.max(1, Math.ceil(paragraphs.length / totalHeadings));
  const startIndex = headingIndex * paragraphsPerHeading;
  const endIndex = Math.min(startIndex + paragraphsPerHeading, paragraphs.length);
  const assignedParagraphs = paragraphs.slice(startIndex, endIndex);

  let result = assignedParagraphs.join('\n\n').trim();

  // ✅ 소제목 제거 (중복 방지) - 최소한의 정리만
  result = result
    .replace(new RegExp(`^\\s*${escapedHeadingTitle}\\s*:\\s*`, 'i'), '')
    .trim();

  // ✅ 결과가 비어있으면 원본 분배 결과 반환 (과도한 필터링 방지)
  if (result.length < 30 && assignedParagraphs.length > 0) {
    result = assignedParagraphs.join('\n\n').trim();
    self.log(`   🔧 [본문추출] 필터링 후 너무 짧아서 원본 사용: "${headingTitle}" (${result.length}자)`);
  } else {
    self.log(`   🔧 [본문추출] 균등 분배 완료: "${headingTitle}" (${result.length}자)`);
  }

  // ✅ 결과가 여전히 비어있으면 로깅만 하고 반환 (과도한 필터링 방지)
  if (result.length === 0) {
    self.log(`   ⚠️ [본문추출] 결과가 비어있습니다. 원본 텍스트의 일부를 사용합니다.`);
    // 균등 분배된 문단이 있으면 그대로 반환
    if (assignedParagraphs.length > 0) {
      return assignedParagraphs.join('\n\n').trim();
    }
  }

  // ✅ 최소한의 정리만 수행 (CTA 텍스트만 제거)
  result = result
    .replace(/\n*🔗[^\n]*$/i, '') // 마지막 CTA 제거
    .replace(/도움이\s*되(었|셧|셨)으면[^\n]*/gi, '') // "도움이 되었으면" 패턴만 제거
    .trim();

  // ✅ 필터링 후에도 본문이 비어있으면 원본 사용
  if (result.length < 20 && assignedParagraphs.length > 0) {
    self.log(`   ⚠️ [본문추출] 필터링 후 너무 짧음, 원본 사용`);
    return assignedParagraphs.join('\n\n').trim();
  }

  // ✅ 최종 결과 반환
  return result;
}
