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
import { recordSilentFailure } from './silentFailureCounter.js';
import { pickBannerHook } from './bannerPhrasePool.js';
import { NAVER_TIMEOUTS } from './timeouts.js';
// ✅ [Phase 4A] 공유 유틸리티 import (중복 제거)
import { extractCoreKeywords, safeKeyboardType, humanKeyboardType } from './typingUtils.js';
import { buildMobileRichHtml, pasteRichHtmlAtCursor, pickRichArticleThemes, ensureTailTypingReady, focusLastEditableLine } from './richTextPaste.js';
import { stripCtaArtifactsFromBody } from './bodyArtifactCleanup.js';
import {
  stripBodyHashtagBlocks,
  stripBodyHashtagsFromStructuredContent,
} from './bodyHashtagCleanup.js';
import {
  enforceOrdinalLineBreaks,
  stripRepeatedHookBlocks,
} from './bodyTextCleanupPolicy.js';
import {
  getExpectedLinkCardMin,
  planEditorTail,
} from './editorTailPlan.js';
import {
  buildExpectedOrderAnchors,
  countExpectedArticleTables,
  countExpectedPublishImages,
} from './prePublishAssertion.js';
import {
  applyTailHashtagsAfterCards,
  insertPreviousPostTailBlock,
  insertTailLinkCardBlock,
} from './editorTailActions.js';
import { insertOfficialSiteTailBlock } from './editorOfficialSiteTail.js';
import { getFtcDisclosureTemplateId } from './ftcDisclosurePresets.js';
import {
  isMainProcessEditorCommitStrict,
  recordMainProcessEditorCommitSemantic,
} from './publishCommitHook.js';
import {
  materializeEditorBodyFallbackText,
  normalizeEditorCtaText,
} from './editorWriterTextSemantics.js';

function recordAppliedFtcDisclosure(resolved: object, text: string): void {
  const templateId = getFtcDisclosureTemplateId(text);
  if (templateId) {
    recordMainProcessEditorCommitSemantic(resolved, {
      kind: 'deterministic-adornment',
      adornmentKind: 'ftc-preset',
      templateId,
    });
    return;
  }
  recordMainProcessEditorCommitSemantic(resolved, {
    kind: 'user-supplement',
    supplementKind: 'custom-ftc',
    text,
  });
}

function normalizeAppliedCtaText(text: unknown): string {
  return normalizeEditorCtaText(text);
}

const NO_TAIL_LINK_RESULT = Object.freeze({
  attempted: false,
  inserted: false,
  cardReady: false,
});

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
      // ✅ [2026-05-23 A3] 본문 타이핑 인간화 — 고정 간격 대신 가우시안 분산
      await humanKeyboardType(page, text);
      return;
    }

    const keywords = extractCoreKeywords(text);
    console.log("🤖 [SmartType] 감지된 핵심 키워드:", keywords);

    if (!keywords || keywords.length === 0) {
      console.log("⚠️ [SmartType] 키워드 없음, 일반 타이핑으로 진행");
      // ✅ [2026-05-23 A3] 키워드 없음 폴백도 인간화 타이핑 적용
      await humanKeyboardType(page, text);
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
    recordSilentFailure('editor:quotation-style');
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
): Promise<string> {
  // 🔍 디버그: 원본 텍스트 확인
  self.log(`   🔍 [디버그] typeBodyWithRetry 호출됨`);
  self.log(`   🔍 [디버그] 원본 텍스트 길이: ${text.length}자`);
  self.log(`   🔍 [디버그] 원본 텍스트 시작 50자: ${text.substring(0, 50)}...`);

  return await self.retry(async () => {
    self.log(`   → 본문 입력 시작 (${text.length}자)`);

    // ✅ 안전 검사: 열린 패널/모달 닫기 (ABOUT, 지도, 함수 등 방지)
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Escape');
      await self.delay(50);
    }

    // 열린 패널 강제 닫기
    await frame.evaluate(() => {
      const panels = document.querySelectorAll('.se-popup, .se-layer, .se-modal, [class*="popup"], [class*="layer"]');
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

    // [2026-06-22] Refund-crisis fix: capture the editor text length BEFORE this
    // section is typed. typeBodyWithRetry is called once per section, and the
    // subheading is inserted first, so the editor already holds 30+ chars on entry.
    // The old verification declared success on "any 30+ chars present", so a body
    // that typed NOTHING ("소제목만 작성하고 본문작성을 안 함") passed as success and
    // was only caught later by the pre-publish guard → user saw a blocked publish.
    // Now success requires the editor to actually GROW by this section's content.
    const readEditorTextLen = async (): Promise<number> => frame.evaluate(() => {
      const sels = ['.se-section-text', '.se-main-container', '.se-component-content', '[contenteditable="true"]', '.se-text-paragraph', '.se-component'];
      let combined = '';
      for (const sel of sels) {
        document.querySelectorAll(sel).forEach((el) => {
          combined += ' ' + ((el as HTMLElement).innerText || el.textContent || '');
        });
      }
      return combined.trim().length;
    }).catch(() => 0);
    const editorCharsBeforeBody = await readEditorTextLen();
    // A full insertion grows the editor by at least ~40% of the section length
    // (innerText ≈ source; nested selectors inflate the count further, so this floor
    // is conservative). Heading-only state grows ~0 → fails → outer retry re-types.
    const minBodyGrowth = Math.max(20, Math.floor(text.trim().length * 0.4));

    const normalizedText = text.replace(/\r\n/g, '\n');
    const richThemes = self.__richPasteThemes || (self.__richPasteThemes = pickRichArticleThemes());
    const rich = buildMobileRichHtml(normalizedText, {
      fontSizePx: fontSize,
      highlight: true,
      maxChunkChars: 38,
      maxHighlights: 6,
      tableTheme: richThemes.tableTheme,
      highlightTheme: richThemes.highlightTheme,
      headingTheme: richThemes.headingTheme,
    });

    if (rich.html) {
      self.log(`   ✨ [리치입력] 모바일 단락 ${rich.paragraphCount}개, 하이라이트 ${rich.highlightCount}개, 표 ${rich.tableCount}개`);
      const pasteResult = await pasteRichHtmlAtCursor(page, frame, rich.html, rich.plainText, rich.tableCount);
      if (pasteResult.ok) {
        self.log(`   ✅ [리치입력] HTML 붙여넣기 완료 (표 ${pasteResult.beforeTables}→${pasteResult.afterTables})`);

        const textToVerify = rich.plainText.substring(0, Math.min(30, rich.plainText.length)).trim();
        if (textToVerify) {
          const verified = await self.verifyContentInDOM(frame, textToVerify, 'body').catch(() => false);
          if (!verified) {
            self.log('   ⚠️ [리치입력] 정확 매칭 검증은 실패했지만 붙여넣기 증가가 확인되어 계속 진행');
          }
        }

        await page.keyboard.press('Enter');
        await self.delay(self.DELAYS.MEDIUM);
        await page.keyboard.press('Enter');
        await self.delay(self.DELAYS.MEDIUM);
        return rich.plainText;
      }

      if (pasteResult.safeToFallback === false) {
        throw new Error(`EDITOR_PARTIAL_INSERT_UNRECOVERED: ${pasteResult.reason || '리치 본문 삽입 위치 또는 롤백을 확인할 수 없습니다.'}`);
      }

      self.log(`   ⚠️ [리치입력] 모든 붙여넣기 재시도 실패 → 최후 안전 키보드 입력 fallback: ${pasteResult.reason || 'unknown'}`);
    }

    // [2026-06-23] 키보드 타이핑 직전 캐럿 재고정 — SmartEditor는 클릭으로만 캐럿이 잡히므로
    // (특히 이미지 직후) 마지막 본문 단락을 클릭해 캐럿을 본문에 고정한다. 이게 없으면 키스트로크가
    // 숨은 입력 프록시로 들어가 한 글자도 안 들어간다(+0자 = 본문 누락).
    await focusLastEditableLine(page, frame).catch(() => undefined);

    // ✅ [2026-03-16 OVERHAUL] AI가 결정한 문단 구분을 그대로 존중
    // 기존: 3문장마다 기계적으로 끊기 → 부자연스러운 줄바꿈 발생
    // 개선: AI가 보낸 \n\n(문단 구분)과 \n(줄바꿈)을 그대로 따름
    //       타이핑 속도 20ms 유지 (대량발행 성능), Enter 딜레이만 랜덤화

    // 2단계: \n\n 기준으로 문단(paragraph) 분리
    const fallbackText = materializeEditorBodyFallbackText(normalizedText);
    const paragraphs = fallbackText ? fallbackText.split(/\n{2,}/) : [];

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
            // [2026-06-22] Smart-typing (HTML chunking) can break exact text
            // matching even when the content IS present — but the old fallback
            // ("any 30+ chars → success") also passed when ONLY the subheading was
            // present and the body typed nothing. Require the editor to have GROWN
            // by this section's content since entry, so heading-only state fails.
            const grew = editorContent.length - editorCharsBeforeBody;
            if (grew >= minBodyGrowth) {
              self.log(`   ⚠️ 정확한 매칭 실패했으나 본문 증가분 확인 (+${grew}자 ≥ ${minBodyGrowth}) - 성공으로 간주`);
              verified = true;
              break;
            }
            self.log(`   ⚠️ 검증 시도 ${verifyAttempt + 1}/5: 본문 증가분 부족 (+${grew}자 < ${minBodyGrowth}, 총 ${editorContent.length}자) - 재시도`);
          }
        } else {
          self.log(`   ⚠️ 검증 시도 ${verifyAttempt + 1}/5: 에디터 내용이 비어있음`);
        }
      }

      if (!verified) {
        // [2026-06-22] 검증 실패 시: 이 섹션 본문이 실제로 반영됐는지 '증가분'으로 최종 판정.
        // 옛 코드는 에디터 전체가 비었을 때(=0자)만 throw 했는데, 소제목이 먼저 들어가 있어
        // 본문이 0자여도 전체는 0이 아니라 항상 "계속 진행" → 본문 누락 글이 발행 직전까지 감.
        // 이제 증가분이 거의 없으면(소제목만 있는 상태) throw → self.retry가 본문을 재입력.
        const finalLen = await readEditorTextLen();
        const finalGrew = finalLen - editorCharsBeforeBody;
        if (finalGrew < Math.max(15, Math.floor(minBodyGrowth * 0.5))) {
          throw new Error(`본문 입력 실패: 이 섹션 본문이 에디터에 반영되지 않았습니다 (증가분 +${finalGrew}자 / 총 ${finalLen}자). 소제목만 작성되고 본문이 누락되는 상태를 차단합니다.`);
        }
        self.log(`   ⚠️ 본문 DOM 정확매칭은 실패했으나 증가분 확인(+${finalGrew}자) - 계속 진행`);
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
    return fallbackText;
  }, 1, '본문 입력');
}

// ── applyStructuredContent ──

export async function applyStructuredContent(self: any, resolved: ResolvedRunOptions): Promise<void> {
  // ✅ [2026-04-06 FIX v3] 공정문구 중복 방지 플래그
  // retry 재실행 시 이미 삽입된 공정문구를 다시 타이핑하지 않도록 함
  let ftcAlreadyInserted = false;
  self.__richPasteThemes = pickRichArticleThemes();
  // [SPEC-STABILITY-2026 R2] Reset stale expectations from a previous post so
  // the pre-publish assertion never judges this run against old plans.
  self.__prePublishExpectations = null;
  const strictEditorCommit = isMainProcessEditorCommitStrict(resolved);

  await self.retry(async () => {
    // ✅ [2026-06-23] 본문 작성 전 포커스 에뮬레이션 활성화 — 앱(Electron) 창이 OS 포커스를
    //   가져도 Chrome 페이지가 항상 focused로 보고하게 만들어, 창이 뒤에 있거나 숨겨진 상태에서도
    //   SmartEditor가 클릭 기반 모델 캐럿을 받는다(라이브 진단: 캐럿 미반응 → 본문 +0 → detached frame).
    await self.enableFocusEmulation?.();
    let structured = resolved.structuredContent;
    if (!structured) {
      await self.applyPlainContent(resolved);
      return;
    }

    const structuredWithoutBodyHashtags = stripBodyHashtagsFromStructuredContent(structured);
    if (structuredWithoutBodyHashtags !== structured) {
      structured = structuredWithoutBodyHashtags;
      resolved.structuredContent = structured;
      if (structured.bodyPlain) resolved.content = structured.bodyPlain;
      self.log('🧹 본문 내부 해시태그 문단 제거 완료 — 해시태그는 마지막 tail 영역에서만 입력합니다.');
    }

    // ✅ 본문에서 중복된 CTA 텍스트 제거 (🔗 더 알아보기 등)
    if (structured.bodyPlain) {
      // Strip AI-echoed CTA artifacts only — standalone section dividers must
      // survive so the published post keeps its layout lines.
      const cleanedBody = stripCtaArtifactsFromBody(structured.bodyPlain);

      if (cleanedBody !== structured.bodyPlain) {
        self.log('🧹 본문에서 중복된 CTA 텍스트 제거 완료');
        structured.bodyPlain = cleanedBody;
        resolved.content = cleanedBody;
      }
    }

    if (structured.bodyPlain) {
      structured.bodyPlain = stripRepeatedHookBlocks(structured.bodyPlain);
      structured.bodyPlain = enforceOrdinalLineBreaks(structured.bodyPlain);
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
        let cleanedContent = stripCtaArtifactsFromBody(currentContent.content);
        cleanedContent = stripBodyHashtagBlocks(cleanedContent);

        cleanedContent = stripRepeatedHookBlocks(cleanedContent);
        cleanedContent = enforceOrdinalLineBreaks(cleanedContent);

        // 수정된 내용으로 structuredContent 업데이트
        // [v2.10.239 BUG FIX] keywordAsTitle lock — verbatim 키워드 모드에서 잔존 UI 값으로 덮어쓰기 차단
        //   배경: 사용자가 "키워드 그대로 제목 사용" 토글 ON 상태인데 반자동 모드 에디터에 잔존 제목이 있으면 verbatim 키워드가 덮어씌워졌음.
        //   조치: structured.keywordAsTitleLocked === true이면 currentContent.title이 verbatim 키워드와 같은 경우만 적용 (실제 사용자 수정은 다른 값일 것).
        const _kwLocked = (structured as any).keywordAsTitleLocked === true;
        const _kwValue = (structured as any).keywordAsTitleValue as string | undefined;
        const _candidateTitle = (currentContent.title || '').trim();

        if (_kwLocked && _kwValue && _candidateTitle && _candidateTitle !== _kwValue.trim()) {
          self.log(`🔒 [keywordAsTitle lock] 에디터 제목 "${_candidateTitle.substring(0, 40)}..." → 키워드 verbatim "${_kwValue.substring(0, 40)}..." 보존`);
        } else {
          structured.selectedTitle = currentContent.title || structured.selectedTitle;
        }
        structured.bodyPlain = cleanedContent || structured.bodyPlain;
        if (currentContent.hashtags.length > 0) {
          structured.hashtags = currentContent.hashtags;
        }

        // ✅ 수정된 제목을 그대로 타이핑
        if (currentContent.title && currentContent.title.length > 0) {
          // [v2.10.239] 동일 가드 — lock 활성 + 다른 제목이면 verbatim 보존
          if (_kwLocked && _kwValue && _candidateTitle !== _kwValue.trim()) {
            structured.selectedTitle = _kwValue;
            resolved.title = _kwValue;
            self.log(`🔒 [keywordAsTitle lock] 타이핑 단계 verbatim 키워드 유지: "${_kwValue.substring(0, 40)}..."`);
          } else {
            structured.selectedTitle = currentContent.title;
            resolved.title = currentContent.title;
            self.log('✅ 수정된 제목을 타이핑합니다.');
          }
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
    self.log('📋 입력 순서: 제목 → Enter 2회 → 소제목(28px) → 이미지 → 본문 리치 입력 → 구분선 → 반복');
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
    const appliedTitle = await self.inputTitle(resolved.title);
    recordMainProcessEditorCommitSemantic(resolved, {
      kind: 'title',
      text: appliedTitle,
    });
    await self.delay(200); // 500ms → 200ms

    // 1-0. [2026-05-27] 테블릿 화면 모드 + 가운데 정렬 자동 적용 (사용자 명시 요청)
    self.log('📱 [1-0단계] 모바일/테블릿 뷰 + 가운데 정렬 설정...');
    await setupMobileViewAndCenterAlign(self);

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
    const bodyTextHasHeadingMarkers = headings.some((h: any) => {
      const title = String(h?.title || '').trim();
      return title.length > 0 && bodyText.includes(title);
    });

    // ✅ [2026-03-26 DEBUG] 반자동 편집 반영 확인 — bodyText와 resolved.content 일치 검증
    self.log(`🔍 [편집 검증] _bodyManuallyEdited=${structured._bodyManuallyEdited}, bodyText길이=${bodyText.length}, resolved.content길이=${resolved.content?.length}`);
    if (bodyText.length > 0) {
      self.log(`🔍 [편집 검증] bodyText 시작 50자: ${bodyText.substring(0, 50)}...`);
    }
    if (resolved.content && bodyText !== resolved.content) {
      self.log(`⚠️ [편집 검증] bodyText≠resolved.content! bodyText(${bodyText.length}자) vs content(${resolved.content.length}자)`);
    }
    // extractBodyForHeading 복잡한 파싱을 완전 우회하여 100% 편집 반영 보장
    if (structured._bodyManuallyEdited && structured._manualSectionOrderLocked && headings.length > 0) {
      // The renderer parsed these sections from the exact textarea snapshot at
      // publish time. Re-searching normalized titles in the body can match an
      // earlier mention and attach the following paragraphs to the wrong
      // heading, so the canonical heading.content order is immutable here.
      structured.conclusion = '';
      self.log(`🧭 [편집 순서 잠금] 원문에서 확정한 ${headings.length}개 섹션을 재분할 없이 사용합니다.`);
    } else if (structured._bodyManuallyEdited && headings.length > 0) {
      self.log('📝 [편집 감지] 사용자가 수정한 내용을 heading 위치 기반으로 직접 분할합니다.');
      const headingsHaveManualContent = headings.every((h: any) =>
        String(h?.content || '').trim().length > 0
      );

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
      } else if (headingsHaveManualContent) {
        // 붙여넣기/LLM 분류 과정에서 표시용 소제목은 번호가 제거될 수 있다.
        // 예: 원문 "⑨ 응급약품" → 표시용 "응급약품". 이때 title indexOf가 실패해도
        // 이미 추출된 heading.content가 가장 정확하므로 균등분할로 덮어쓰지 않는다.
        structured.conclusion = '';
        self.log('   ✅ [편집 분할] heading title 매칭 실패 - 기존 heading.content 보존');
      } else {
        // ✅ [2026-02-28 FIX] heading title 매칭 실패 시 bodyText 균등 분할로 폴백
        // extractBodyForHeading이 실패해서 cleanBody가 빈 문자열이 되는 것 방지
        self.log('   ⚠️ heading title을 bodyText에서 찾지 못함 → 균등 분할 폴백');
        const lines = bodyText.split('\n').filter((l: string) => l.trim().length > 0);
        for (let hi = 0; hi < headings.length; hi++) {
          const chunk = sliceBalancedUnits(lines, hi, headings.length).join('\n').trim();
          if (chunk.length > 0) {
            headings[hi].content = chunk;
            self.log(`   📝 균등분할 소제목[${hi + 1}] 본문: ${chunk.length}자`);
          }
        }
        structured.conclusion = '';
      }
    }

    // ✅ [2026-06-17 FIX] 생성 콘텐츠에서도 bodyPlain 앞 도입부를 복구
    // 반자동이 아닌 흐름에서는 introduction이 비어있고 bodyPlain에
    // "도입부 + 첫 소제목 + 본문"이 들어오는 경우가 있어, 대표 이미지 뒤에
    // 바로 첫 소제목 이미지가 나와 글 흐름이 끊겼다.
    if ((!structured.introduction || structured.introduction.trim().length === 0) && headings.length > 0 && bodyText.trim().length > 0) {
      const firstTitle = String(headings[0]?.title || '').trim();
      const firstHeadingPos = firstTitle ? bodyText.indexOf(firstTitle) : -1;
      if (firstHeadingPos > 0) {
        const normalizedTitle = String(resolved.title || structured.selectedTitle || '').replace(/\s+/g, ' ').trim();
        let inferredIntro = bodyText.substring(0, firstHeadingPos).trim();
        if (normalizedTitle) {
          const introLines = inferredIntro.split(/\r?\n/).map((line: string) => line.trim());
          if (introLines.length > 0 && introLines[0].replace(/\s+/g, ' ') === normalizedTitle) {
            inferredIntro = introLines.slice(1).join('\n').trim();
          }
        }
        if (inferredIntro.length > 20) {
          structured.introduction = inferredIntro;
          self.log(`   📖 [도입부 복구] bodyPlain에서 서론 ${inferredIntro.length}자 복구`);
        }
      }
    }

    // ✅ 쇼핑커넥트 모드 감지 (for 루프 밖에서 미리 체크)
    const isShoppingConnectModeGlobal = resolved.contentMode === 'affiliate' || !!resolved.affiliateLink;
    self.__affiliateProductImageLinkAttached = false;
    const attachAffiliateProductLinkOnce = async (): Promise<void> => {
      if (!resolved.affiliateLink || self.__affiliateProductImageLinkAttached === true) return;
      await self.attachLinkToLastImage(resolved.affiliateLink);
      self.__affiliateProductImageLinkAttached = true;
    };

    // ✅ [2026-02-24 FIX] 서론에 썸네일이 실제로 삽입되었는지 추적
    let thumbnailInsertedInIntro = false;
    // ✅ [2026-02-24 FIX] 이미 삽입된 이미지 파일 경로를 추적하여 중복 삽입 방지
    const usedImagePaths = new Set<string>();

    // ✅ [2026-03-26 FIX] 서론이 존재하면 무조건 작성 (10자 제한 제거 — 서론 스킵 완전 방지)
    if (structured.introduction && structured.introduction.trim().length > 0) {
      self.log('📖 서론 작성 중...');

      // ✅ [v2.7.31] 사용자 의도 신호는 structured.ftcDisclosure 텍스트 존재 여부로 판정
      //   renderer.ts/fullAutoFlow.ts에서 사용자가 UI 토글 ON일 때만 ftcDisclosure를 채움.
      //   따라서 ftcDisclosure가 비어 있으면 = 사용자 OFF → 절대 삽입 금지 (affiliateLink 폴백 제거).
      const userOptedInFtc = typeof structured.ftcDisclosure === 'string'
        && structured.ftcDisclosure.trim().length > 0;
      if (!ftcAlreadyInserted && userOptedInFtc) {
        const ftcText = structured.ftcDisclosure!;
        self.log(`   ⚖️ 공정위 문구 최상단 삽입 중 (사용자 ON)...`);
        await page.keyboard.press('Home').catch(() => {});
        await self.delay(100);
        await safeKeyboardType(page, ftcText, { delay: 15 });
        recordAppliedFtcDisclosure(resolved, ftcText);
        await self.delay(300);
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await self.delay(200);
        ftcAlreadyInserted = true;
        self.log(`   ✅ 공정위 문구 삽입 완료`);
      } else if (ftcAlreadyInserted) {
        self.log(`   ⏭️ 공정위 문구 이미 삽입됨 (retry 중복 방지)`);
      } else {
        self.log(`   ⏭️ 공정위 문구 스킵: 사용자가 UI 토글 OFF (structured.ftcDisclosure 비어있음)`);
      }

      // 썸네일 이미지 검색 ('🖼️ 썸네일' 키로 저장됨)
      const introImages = (resolved.images || []).filter((img: any) =>
        img.heading === '🖼️ 썸네일' || img.heading === '썸네일' || img.isThumbnail === true || img.isIntro === true
      );

      // ✅ [2026-02-24 FIX] 쇼핑커넥트: 수집 이미지 + 텍스트 오버레이 썸네일 / 비쇼핑커넥트: renderer.ts에서 생성
      if (introImages.length === 0 && !resolved.skipImages) {
        const isShoppingConnectMode = (resolved as any).isShoppingConnect || (resolved as any).contentMode === 'affiliate';

        if (isShoppingConnectMode) {
          // ✅ 쇼핑커넥트: 수집된 제품 이미지 + 텍스트 오버레이로 썸네일 생성
          self.log(`   🛒 쇼핑커넥트: 수집 이미지 기반 썸네일 생성 중...`);
          try {

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
              const thumbnailPath = productImagePath;
              if (thumbnailPath) {
                self.log(`   ✅ 대표 상품 이미지를 원본 그대로 썸네일로 사용`);
                await self.insertBase64ImageAtCursor(thumbnailPath);
                // ✅ [2026-02-26 FIX] 썸네일 삽입 후 에디터 렌더링 확인 (대기 시간 500ms→2000ms + 폴링 검증)
                await self.delay(2000);
                await self.verifyImageInserted(frame, '썸네일(쇼핑커넥트)');
                thumbnailInsertedInIntro = true;
                usedImagePaths.add(thumbnailPath);
                if (resolved.affiliateLink) {
                  await attachAffiliateProductLinkOnce();
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

        const preserveOriginalThumbnail = isShoppingConnectModeGlobal
          || firstIntroImage?.preserveOriginal === true
          || firstIntroImage?.disableTextOverlay === true;
        if (resolved.includeThumbnailText && !isNanoBanana && !preserveOriginalThumbnail) {
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
                  await attachAffiliateProductLinkOnce();
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
      const appliedIntroduction = await self.typeBodyWithRetry(
        frame,
        page,
        structured.introduction.trim(),
        19,
      );
      recordMainProcessEditorCommitSemantic(resolved, {
        kind: 'introduction',
        text: appliedIntroduction,
      });
      await self.delay(self.DELAYS.MEDIUM);

      // 서론 후 구분선
      await self.insertHorizontalLine();
      await page.keyboard.press('Enter'); // ✅ [2026-01-19] 엔터 1회로 축소 (2회 → 1회)
      await self.delay(self.DELAYS.MEDIUM);

      self.log('   ✅ 서론 작성 완료');
    } else {
      self.log('   ⏭️ 서론 텍스트 없음 (서론이 비어있습니다)');
      recordMainProcessEditorCommitSemantic(resolved, {
        kind: 'introduction',
        text: '',
      });

      // ✅ [v2.7.31] 서론 없을 때도 동일: structured.ftcDisclosure 존재 여부 = 사용자 ON 신호
      const userOptedInFtcNoIntro = typeof structured.ftcDisclosure === 'string'
        && structured.ftcDisclosure.trim().length > 0;
      if (!ftcAlreadyInserted && userOptedInFtcNoIntro) {
        const ftcTextNoIntro = structured.ftcDisclosure!;
        self.log(`   ⚖️ 공정위 문구 최상단 삽입 중 (서론 없음, 사용자 ON)...`);
        await page.keyboard.press('Home').catch(() => {});
        await self.delay(100);
        await safeKeyboardType(page, ftcTextNoIntro, { delay: 15 });
        recordAppliedFtcDisclosure(resolved, ftcTextNoIntro);
        await self.delay(300);
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await self.delay(200);
        ftcAlreadyInserted = true;
        self.log(`   ✅ 공정위 문구 삽입 완료`);
      } else if (ftcAlreadyInserted) {
        self.log(`   ⏭️ 공정위 문구 이미 삽입됨 (retry 중복 방지)`);
      } else {
        self.log(`   ⏭️ 공정위 문구 스킵 (서론 없음): 사용자 UI 토글 OFF`);
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
            recordSilentFailure('editor:safety-net-thumbnail');
            self.log(`   ⚠️ [Safety Net] 썸네일 삽입 실패: ${(safetyNetError as Error).message}`);
          }
        } else {
          self.log('   ℹ️ [Safety Net] 삽입할 썸네일 이미지 없음');
        }
      }
    }

    // 3. 소제목과 본문을 순차적으로 작성 (완전 순차 실행)
    self.log(`📋 총 ${headings.length}개의 섹션을 순차적으로 작성합니다.`);

    // Keep the body slot contract stable even when thumbnail upload fails.
    // A dedicated thumbnail still owns slot 0; body sections remain 1..N.
    const hasDedicatedThumbnailSlot = (resolved.images || []).some((img: any) => {
      const heading = String(img?.heading || '').trim().toLowerCase();
      return img?.isThumbnail === true
        || img?.isIntro === true
        || heading === 'thumbnail'
        || heading.includes('썸네일');
    });

    // ✅ [2026-03-26] expectedIdx 계산 헬퍼 (3곳 통합)
    const getExpectedOriginalIndex = (sectionIdx: number) =>
      hasDedicatedThumbnailSlot || thumbnailInsertedInIntro ? sectionIdx + 1 : sectionIdx;

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
        const appliedHeadingTitle = await self.typeSubtitleWithRetry(
          frame,
          page,
          fullHeadingTitle,
          28,
          quotationStyle,
        );
        recordMainProcessEditorCommitSemantic(resolved, {
          kind: 'heading-title',
          index: i,
          text: appliedHeadingTitle,
        });
        const styleLabel = isShoppingConnectMode ? '4번-밑줄' : '2번-버티컬라인';
        self.log(`   ✅ 소제목 "${fullHeadingTitle}" 완료(인용구: ${styleLabel})`);

        // 소제목 입력 후 충분한 대기 (DOM 업데이트)
        await self.delay(2000); // 1500ms → 2000ms

        // b) 이미지 업로드 (skipImages가 false인 경우)
        if (!resolved.skipImages) {
          // ⚠️ 중요: 이미지 삽입 전 본문 영역으로 커서 이동 (제목 영역에 있으면 안 됨)
          self.log(`   🔄 본문 영역으로 커서 이동 확인 중...`);

          const titleSelectors = getSelectorStrings(SELECTORS.editor.documentTitle);
          const cursorInfo = await frame.evaluate((documentTitleSelectors: readonly string[]) => {
            const titleElement = documentTitleSelectors
              .map((selector) => document.querySelector(selector))
              .find((element): element is Element => Boolean(element));
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
          }, titleSelectors);

          if (cursorInfo.needsMove) {
            if (cursorInfo.inTitle) {
              self.log(`   ⚠️ 제목 영역에 커서가 있어 본문 영역으로 이동합니다.`);
            }

            await frame.evaluate((documentTitleSelectors: readonly string[]) => {
              const titleElement = documentTitleSelectors
                .map((selector) => document.querySelector(selector))
                .find((element): element is Element => Boolean(element));
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
            }, titleSelectors);

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

                // ✅ [2026-04-10 FIX] previewDataUrl(base64) 폴백 추가 — ImageFX 등 대응
                const validMatched = matchedImages.filter((img: any) => img.filePath || img.url || img.savedToLocal || img.previewDataUrl);
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
                    // ✅ [2026-04-10 FIX] previewDataUrl 폴백 추가
                    const validMatched = matchedImages.filter((img: any) => img.filePath || img.url || img.savedToLocal || img.previewDataUrl);
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
                        headingImages = matchedImages.filter((img: any) => img.filePath || img.url || img.savedToLocal || img.previewDataUrl);
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
            cleanBody = sliceBalancedUnits(allLines, i, headings.length).join('\n').trim();
            self.log(`   ✅ 균등 분배 추출: ${cleanBody.length}자`);
          } else {
            const directHeadingContent = String(heading.content || '').trim();
            // [v2.11.140] _bodyReconstructedFromHeadings: renderer rebuilt bodyPlain from
            // intro + heading titles + contents for save/load parity, so the titles in
            // bodyPlain are synthetic markers — heading.content is still the accurate
            // section source (extractBodyForHeading would also swallow the conclusion).
            if ((!bodyTextHasHeadingMarkers || structured._bodyReconstructedFromHeadings === true)
              && directHeadingContent.length > 30) {
              // ✅ [2026-06-17 FIX] bodyPlain에 소제목 마커가 없는 생성 결과는
              // heading.content가 가장 정확한 섹션 본문이다. 기존 균등 분배는
              // 첫 섹션 도입부를 먹거나 빈 본문을 만들 수 있었다.
              cleanBody = directHeadingContent;
              self.log(`   ✅ [본문복구] heading.content 우선 사용(bodyPlain 소제목 마커 없음): ${cleanBody.length}자`);
            } else {
              // ✅ [기존 로직] extractBodyForHeading 기반 추출 + 필터링
            const headingBody = self.extractBodyForHeading(bodyText, heading.title, i, headings.length, headings);
            cleanBody = headingBody.trim();

            if (cleanBody.length < 30 && heading.content && heading.content.trim().length > 30) {
              cleanBody = heading.content.trim();
            }

            if (cleanBody.length < 30) {
              const sentences = bodyText.split(/(?<=[.!?])\s+/).filter((s: any) => s.trim());
              cleanBody = sliceBalancedUnits(sentences, i, headings.length).join(' ').trim();
            }

            // 제목 중복 등 기초 정리 + URL 링크 텍스트 제거
            const escapedTitleForRegex = heading.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            cleanBody = cleanBody
              // [v2.11.134] Regex had stray spaces ("\s * ") and matched
              // literal space+asterisk sequences instead of the heading title.
              .replace(new RegExp(`^\\s*${escapedTitleForRegex}\\s*:?\\s*`, 'i'), '')
              .replace(/🔗[^\n]*\n?/g, '')
              .replace(/도움이\s*되(었|셧|셨)으면[^\n]*/gi, '')
              .replace(/https?:\/\/[^\s\n]+/g, '')
              .replace(/\n{3,}/g, '\n\n')
              .trim();
            }
          }

          // 1-2. 이미지 분류
          const topImages = headingImages.filter((img: any) => (img.position || 'top') === 'top');
          const middleImages = headingImages.filter((img: any) => img.position === 'middle');
          const bottomImages = headingImages.filter((img: any) => img.position === 'bottom');

          // ✅ [2단계] 순차적 삽입
          // 소제목(위에서 이미 삽입됨) → 이미지 → 본문.
          // 이미지 직후에는 SmartEditor 커서가 이미지/캡션/툴바에 남을 수 있으므로
          // 본문 리치 붙여넣기 전에 프레임과 입력 커서를 다시 복구한다.

          // A. 모든 이미지 삽입 (Top, Middle, Bottom 통합 또는 Top 우선)
          const allSectionImages = [
            ...topImages,
            ...middleImages,
            ...bottomImages
          ];
          let bodyFrame = currentFrame;

          // A. 이미지 업로드
          if (allSectionImages.length > 0) {
            self.log(`   📸[이미지] 총 ${allSectionImages.length}개 이미지 삽입 중...`);
            allSectionImages.forEach((img: any, idx: number) => {
              const p = (img?.filePath || img?.url || '').replace(/^C:\\Users\\[^\\]+/, '~').replace(/^\/Users\/[^/]+/, '~');
              self.log(`      [${idx}] heading="${img?.heading}", provider="${img?.provider}", path=${p.substring(0, 80)}`);
            });
            const imageFrame = (await self.getAttachedFrame());
            await ensureTailTypingReady(page, imageFrame, (m: string) => self.log(m)).catch(() => false);
            await self.insertImagesAtCurrentCursor(allSectionImages, page, imageFrame, resolved.affiliateLink);
            bodyFrame = (await self.getAttachedFrame());
            // [2026-06-23] 이미지 직후 캐럿 복구 강화. SmartEditor는 읽기전용 컴포넌트 트리 +
            // 숨은 입력 프록시 구조라, 이미지가 아직 렌더 중이면 텍스트 캐럿을 못 잡는다(특히 느린 PC
            // + 다수 이미지). 단발 실패 후 곧장 본문으로 가면 본문이 dead proxy로 들어가 +0자
            // (="소제목만 작성되고 본문 누락")가 된다. 렌더 안정 대기 + 클릭 기반 캐럿 고정으로 재시도.
            let bodyReady = await ensureTailTypingReady(page, bodyFrame, (m: string) => self.log(m)).catch(() => false);
            for (let r = 0; r < 3 && !bodyReady; r++) {
              await self.delay(800);
              bodyFrame = (await self.getAttachedFrame());
              await focusLastEditableLine(page, bodyFrame).catch(() => undefined);
              bodyReady = await ensureTailTypingReady(page, bodyFrame, (m: string) => self.log(m)).catch(() => false);
            }
            if (bodyReady) {
              self.log('   ✅ 이미지 삽입 후 본문 입력 캐럿 복구 완료');
            } else {
              self.log('   ⚠️ 이미지 삽입 후 캐럿 복구가 4회 시도 후에도 불완전 — 본문 입력 단계에서 추가 복구합니다.');
            }
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
              cleanBody = sliceBalancedUnits(allLines, i, headings.length).join('\n').trim();
              self.log(`   ✅ bodyText 균등 분할 복구: ${cleanBody.length}자`);
            }
          }
          let appliedHeadingBody = '';
          if (cleanBody.trim()) {
            self.log(`   🧩[본문] 이미지 뒤에 리치 입력 처리 (${cleanBody.length}자)...`);
            appliedHeadingBody = await self.typeBodyWithRetry(bodyFrame, page, cleanBody, 19);
          } else {
            self.log(`   ⚠️ 본문 내용이 비어있어 타이핑 건너뜀 (소제목: "${heading.title}")`);
          }
          recordMainProcessEditorCommitSemantic(resolved, {
            kind: 'heading-body',
            index: i,
            text: appliedHeadingBody,
          });

          // ✅ 쇼핑커넥트 모드: 표 이미지 삽입
          // ✅ [2026-02-19] 장단점 표 중복 방지 플래그 (첫 번째 섹션에서 이미 삽입 시 마지막 섹션 건너뜀)
          if (i === 0) self._prosConsAlreadyInserted = false;

          // [2026-06-12] 업체홍보 모드: 마지막 섹션 뒤 문의 안내 표 이미지.
          // 연락 채널(전화/카톡/운영시간/주소/홈페이지)을 스펙 표와 동일
          // 룩앤필의 표 이미지로 정리해 문의 전환을 유도한다.
          const isBusinessPromoMode = (resolved as any).contentMode === 'business' && (resolved as any).businessInfo;
          if (isBusinessPromoMode && i === headings.length - 1) {
            try {
              const biz = (resolved as any).businessInfo as Record<string, any>;
              const contactRows = [
                biz.phone ? { label: '전화', value: String(biz.phone) } : null,
                biz.kakao ? { label: '카카오톡', value: String(biz.kakao) } : null,
                biz.hours ? { label: '운영시간', value: String(biz.hours) } : null,
                biz.address ? { label: '주소', value: String(biz.address) } : null,
                biz.researchUrl ? { label: '홈페이지', value: String(biz.researchUrl) } : null,
              ].filter(Boolean) as Array<{ label: string; value: string }>;
              if (contactRows.length > 0) {
                self.log('   📋[업체홍보] 문의 안내 표 이미지 생성 중...');
                const { generateContactTableImage } = await import('../image/tableImageGenerator.js');
                const contactTablePath = await generateContactTableImage(String(biz.name || ''), contactRows);
                await page.keyboard.press('Enter');
                await self.delay(300);
                await self.insertBase64ImageAtCursor(contactTablePath);
                await self.delay(1000);
                self.log(`   ✅ 문의 안내 표 삽입 완료 (채널 ${contactRows.length}개)`);
              }
            } catch (contactErr) {
              self.log(`   ⚠️ 문의 표 생성 실패(발행 계속): ${(contactErr as Error).message}`);
            }
          }

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
                  // [v2.10.152] try/finally 패턴으로 좀비 chromium 방지 — 모든 경로에서 close 보장.
                  //   기존: catch에서만 close → throw 시 좀비 발생.
                  let pwBrowser: import('playwright').Browser | null = null;
                  try {
                    const { chromium } = await import('playwright');
                    // ✅ [2026-05-26 v2.10.364 SPEC-NAVER-PROTECTION-2026 P3 Fix 3.4 — 1/5]
                    //   headed 모드로 전환 — naver.me 도메인은 네이버 봇 감지 직접 적용 영역.
                    //   headless 자체가 가장 강한 봇 시그니처 (짧은 백그라운드 작업이라 UX 영향 최소).
                    //   다음 사이클: smartCrawler, productSpecCrawler(3곳), imageLibrary 4곳 별도.
                    pwBrowser = await chromium.launch({ headless: false });
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
                    // ✅ [v2.10.70] 15초 → 30초 중앙 상수 (쇼핑커넥트 affiliate URL 외부 응답 흡수)
                    await pwPage.goto(resolvedAffiliateUrl, { waitUntil: 'domcontentloaded', timeout: NAVER_TIMEOUTS.AFFILIATE_URL });
                    // 최종 URL 대기 (최대 5초)
                    let trackedUrl = pwPage.url();
                    for (let i = 0; i < 10; i++) {
                      if (trackedUrl.includes('smartstore.naver.com') || trackedUrl.includes('brand.naver.com')) break;
                      await pwPage.waitForTimeout(500);
                      trackedUrl = pwPage.url();
                    }
                    if (trackedUrl !== resolvedAffiliateUrl && !trackedUrl.includes('naver.me')) {
                      resolvedAffiliateUrl = trackedUrl;
                      self.log(`   ✅ Playwright 최종 스토어 URL: ${trackedUrl.substring(0, 60)}...`);
                    } else {
                      self.log(`   ⚠️ Playwright에서도 최종 URL 추출 실패`);
                    }
                  } catch (pwError) {
                    self.log(`   ⚠️ Playwright 리다이렉트 추적 실패: ${(pwError as Error).message}`);
                  } finally {
                    // [v2.10.152] 정상/예외 모든 경로 close 보장 — chromium 좀비 차단
                    if (pwBrowser) {
                      try { await pwBrowser.close(); } catch { /* ignore */ }
                      pwBrowser = null;
                    }
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
                    await attachAffiliateProductLinkOnce();
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
                    await attachAffiliateProductLinkOnce();
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
                  // ✅ [2026-05-18] 공통 풀(20개) + 최근 3개 회피
                  const randomHook = pickBannerHook();
                  ctaBannerPath = await generateCtaBannerImage(randomHook, productName);
                  self.log(`   🎲 [랜덤 배너] 2번 섹션 배너 자동 생성: ${randomHook}`);
                } else if (resolved.customBannerPath) {
                  // 커스텀 배너 사용
                  ctaBannerPath = resolved.customBannerPath;
                  self.log(`   🎨 커스텀 배너 사용: ${ctaBannerPath.split(/[/\\]/).pop()}`);
                } else {
                  // ✅ [2026-05-18] 기본 자동 생성도 동일 풀 사용
                  const randomHook = pickBannerHook();
                  ctaBannerPath = await generateCtaBannerImage(randomHook, productName);
                }

                await page.keyboard.press('Enter');
                await self.delay(300);
                await self.insertBase64ImageAtCursor(ctaBannerPath);
                await self.delay(1000);

                // ✅ 배너에 제휴 링크 삽입
                await attachAffiliateProductLinkOnce();
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
          if (structured._bodyManuallyEdited && heading.content && heading.content.trim().length > 0) {
            // 반자동 붙여넣기/편집은 renderer에서 소제목별 content를 이미 추출한다.
            // 표시용 소제목이 정규화되어 원문과 달라져도 원문 순서를 보존한다.
            cBody = heading.content.trim();
            self.log(`   ✅ [편집 반영] 이미지 없음 경로 heading.content 직접 사용: ${cBody.length}자`);
          } else {
            // ✅ [2026-02-27 FIX] bodyText 추출 우선 — heading.content는 stale할 수 있음
            cBody = self.extractBodyForHeading(bodyText, heading.title, i, headings.length, headings).trim();
            if (cBody.length < 30 && heading.content && heading.content.trim().length > 30) {
              cBody = heading.content.trim();
            }
          }

          let appliedHeadingBody = '';
          if (cBody.trim()) {
            self.log(`   🧩 본문 리치 입력 우선 처리(이미지 없음)...`);
            appliedHeadingBody = await self.typeBodyWithRetry(cFrame, page, cBody, 19);
          }
          recordMainProcessEditorCommitSemantic(resolved, {
            kind: 'heading-body',
            index: i,
            text: appliedHeadingBody,
          });
        }

        // d) CTA 중간 삽입 (위치가 middle이고 중간 지점인 경우, skipCta가 false인 경우만)
        // d) CTA 특정 소제목 아래 삽입 (위치가 heading-N인 경우)
        const headingMatch = resolved.ctaPosition?.match(/^heading-(\d+)$/);
        if (!resolved.skipCta && headingMatch && resolved.ctas.length > 0) {
          const targetHeadingIndex = parseInt(headingMatch[1], 10) - 1; // 1-based → 0-based
          if (i === targetHeadingIndex) {
            self.log(`   → CTA ${i + 1}번 소제목 본문 아래 삽입 중...`);
            // Heading CTAs type right after this section's rich paste — verify
            // keyboard input registers before typing (same recovery ladder as
            // the tail phase).
            try {
              const headingCtaFrame = (await self.getAttachedFrame());
              if (headingCtaFrame) await ensureTailTypingReady(page, headingCtaFrame, (m: string) => self.log(m));
            } catch {
              // best-effort
            }
            for (let k = 0; k < 2; k++) {
              await page.keyboard.press('Enter');
              await self.delay(self.DELAYS.MEDIUM);
            }
            for (let ci = 0; ci < resolved.ctas.length; ci++) {
              const c = resolved.ctas[ci];
              self.log(`   → CTA 삽입 (${ci + 1}/${resolved.ctas.length}, 텍스트: "${c.text}", 링크: "${resolved.affiliateLink || c.link || '#'}")`);
              await self.insertCtaLink(resolved.affiliateLink || c.link || '#', c.text, 'heading');
              const appliedCtaText = normalizeAppliedCtaText(c.text);
              if (appliedCtaText) {
                recordMainProcessEditorCommitSemantic(resolved, {
                  kind: 'user-supplement',
                  supplementKind: 'cta',
                  text: appliedCtaText,
                });
              }
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
    let appliedConclusion = '';
    if (structured.conclusion && structured.conclusion.trim().length > 10) {
      self.log('📝 마무리 작성 중...');

      // ✅ [2026-01-19 수정] 마무리 전 엔터 제거 (중복 방지)
      // 마지막 소제목 본문 후 바로 마무리글로 이어짐
      await self.delay(self.DELAYS.MEDIUM);

      // 마무리 이미지 검색 ('📝 마무리' 키로 저장됨) - 제거됨 (사용자 요청)
      // ✅ 쇼핑커넥트 마무리는 이미지 없이 본문만 (사용자 요청)

      // 마무리 본문 타이핑
      const currentFrame = (await self.getAttachedFrame());
      appliedConclusion = await self.typeBodyWithRetry(
        currentFrame,
        page,
        structured.conclusion.trim(),
        19,
      );
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
    recordMainProcessEditorCommitSemantic(resolved, {
      kind: 'conclusion',
      text: appliedConclusion,
    });
    recordMainProcessEditorCommitSemantic(resolved, {
      kind: 'body-source',
      text: bodyText,
    });

    // ✅ 본문 본체 적용 완료. 이전글/CTA/해시태그 tail이 끝나기 전까지는
    // __editorContentApplied를 켜지 않는다. 그래야 tail 단계 실패가
    // "발행 직전 실패"로 오분류되어 복구/진단을 막지 않는다.
    (self as any).__editorMainBodyApplied = true;
    self.log('\n✅ 본문 작성 완료! 이전글/해시태그 마무리 중...');

    // 간단한 이미지 배치 현황만 로깅
    if (resolved.images && resolved.images.length > 0) {
      self.log(`   📊 이미지 ${Math.min(resolved.images.length, headings.length)}개 배치 완료`);
    }

    // 3. 마지막 본문 tail 준비
    self.log('📝 [마지막 단계] CTA 및 해시태그 영역 준비 중...');
    // [SPEC-STABILITY-2026 diagnostics] Surface what the tail phase actually
    // received — distinguishes "options arrived empty" from "typing failed".
    self.log(`🔎 [TailOptions] 이전글=${resolved.previousPostUrl ? 'O' : 'X'} / CTA ${(resolved.ctas || []).length}개(skip=${resolved.skipCta === true}) / 해시태그 ${(resolved.hashtags || []).length}개`);
    // Right after rich paste the editor may still be digesting the pasted DOM.
    // Release modifiers here, but do not create blind blank blocks. Tail blocks
    // and hashtags own their own focused spacing so the redesigned editor does
    // not open MyBox/template/library/table panels from an empty slot.
    for (const modifier of ['Control', 'Shift', 'Alt']) {
      await page.keyboard.up(modifier).catch(() => undefined);
    }

    // 4. CTA 버튼 삽입 (해시태그 전에 배치, skipCta가 false인 경우만)
    // ✅ 쇼핑커넥트 모드: CTA가 없어도 자동으로 후킹 CTA 생성
    let effectiveCtas = resolved.ctas || [];
    let previousPostTailInserted = false;
    let previousPostCardReady = false;
    let tailLinkCardInserted = false;
    let tailLinkCardReady = false;
    if (!resolved.skipCta && resolved.affiliateLink && effectiveCtas.length === 0) {
      // 쇼핑커넥트 자동 CTA: 구매 압박 없이 현재 상품 조건 확인만 안내한다.
      const hookTexts = [
        '현재 가격과 옵션 확인하기 →',
        '상품 정보 자세히 보기 →',
        '실구매 후기 더 보기 →',
        '상세 규격 확인하기 →',
        '배송·교환 조건 확인하기 →'
      ];
      const randomHook = hookTexts[Math.floor(Math.random() * hookTexts.length)];
      effectiveCtas = [{ text: randomHook, link: resolved.affiliateLink }];
      self.log(`   🛒 [쇼핑커넥트] 자동 CTA 생성: "${randomHook}"`);
    }

    // [2026-06-11 S16] The continuous flow ships the SAME previous-post URL in
    // BOTH the CTA fields and previousPostUrl ("3개 필드 통일" 설계). Until
    // today one copy silently died outside the editor model; with typing fixed
    // (S13), BOTH landed and the published post showed the link twice. Keep
    // the previous-post block (hook + link card) and skip general CTAs that
    // point at the same URL. Flows that pass only a CTA (no previousPostUrl)
    // are untouched — no link is ever lost, only the duplicate.
    const tailPlan = planEditorTail({
      previousPostUrl: resolved.previousPostUrl,
      affiliateLink: resolved.affiliateLink,
      ctas: effectiveCtas,
      ctaPosition: resolved.ctaPosition,
      skipCta: resolved.skipCta,
      hashtags: resolved.hashtags,
    });
    effectiveCtas = tailPlan.effectiveCtas;
    if (tailPlan.skippedDuplicateCtaCount > 0) {
      self.log(`   ⏭️ 이전글과 동일 URL CTA ${tailPlan.skippedDuplicateCtaCount}개 스킵 — 이전글 블록 하나만 삽입 (중복 방지)`);
    }

    const isHeadingPosition = tailPlan.isHeadingPosition;
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
            recordMainProcessEditorCommitSemantic(resolved, {
              kind: 'deterministic-adornment',
              adornmentKind: 'enhanced-cta',
              templateId: 'banner-cta-closed-pools-v1',
            });
            tailLinkCardInserted = true;
            tailLinkCardReady = true;
          } else {
            // ✅ 추가 CTA들: 배너 없이 구분선 + 후킹 + 링크만 (사용자 추가 CTA)
            self.log(`   📎 [추가 CTA ${i}] \"${c.text}\" → ${c.link || '#'}`);
            const page = self.ensurePage();

            const ctaResult = await insertTailLinkCardBlock({
              self,
              page,
              label: `📎 ${c.text}`,
              url: c.link || '#',
            });
            const appliedCtaText = normalizeAppliedCtaText(c.text);
            if (appliedCtaText) {
              recordMainProcessEditorCommitSemantic(resolved, {
                kind: 'user-supplement',
                supplementKind: 'cta',
                text: appliedCtaText,
              });
            }
            tailLinkCardInserted = true;
            tailLinkCardReady = tailLinkCardReady || ctaResult.cardReady;
          }

          // ✅ 마지막 CTA 후: 이전글 삽입
          if (isLastCta && resolved.previousPostUrl) {
            const previousResult = await insertPreviousPostTailBlock(
              self,
              page,
              resolved,
              effectiveCtas,
              '쇼핑커넥트 마지막 CTA 후'
            );
            previousPostTailInserted = previousPostTailInserted || previousResult.inserted;
            previousPostCardReady = previousPostCardReady || previousResult.cardReady;
            tailLinkCardInserted = tailLinkCardInserted || previousResult.inserted;
            tailLinkCardReady = tailLinkCardReady || previousResult.cardReady;
          }
        } else {
          // ✅ [2026-01-26 FIX] 일반 모드 (SEO): 이전글 엮기만 삽입 (CTA는 수동 추가 시에만)
          const isLastCta = i === effectiveCtas.length - 1;
          const page = self.ensurePage();

          // ✅ CTA가 링크를 포함한 경우 CTA 삽입 (텍스트 없으면 기본 문구 사용)
          if (c.link) {
            const ctaDisplayText = c.text || '자세히 보러가기';
            self.log(`   📎 [일반 CTA ${i + 1}] \"${ctaDisplayText}\" → ${c.link}`);

            const ctaResult = await insertTailLinkCardBlock({
              self,
              page,
              label: `📎 ${ctaDisplayText}`,
              url: c.link,
            });
            recordMainProcessEditorCommitSemantic(resolved, {
              kind: 'user-supplement',
              supplementKind: 'cta',
              text: ctaDisplayText,
            });
            tailLinkCardInserted = true;
            tailLinkCardReady = tailLinkCardReady || ctaResult.cardReady;
          }


          // ✅ [2026-01-26 FIX] 마지막 CTA 후에만 이전글 삽입 (중복 방지)
          // isLastCta 체크로 한 번만 삽입되도록 보장
          if (isLastCta) {
            // ✅ [2026-02-08] 공식 사이트 링크 자동 삽입 (이전글 앞에 배치)
            // 행동 유발 카테고리에서만 동작 (비즈니스, 티켓, 여행, 건강, 교육 등)
            const officialResult = strictEditorCommit
              ? NO_TAIL_LINK_RESULT
              : await insertOfficialSiteTailBlock({
                self,
                page,
                title: resolved.title,
                hashtags: resolved.hashtags,
                bodyText,
              });
            tailLinkCardInserted = tailLinkCardInserted || officialResult.inserted;
            tailLinkCardReady = tailLinkCardReady || officialResult.cardReady;

            // ✅ 이전글 삽입
            if (resolved.previousPostUrl) {
              const previousResult = await insertPreviousPostTailBlock(
                self,
                page,
                resolved,
                effectiveCtas,
                '일반 CTA 후'
              );
              previousPostTailInserted = previousPostTailInserted || previousResult.inserted;
              previousPostCardReady = previousPostCardReady || previousResult.cardReady;
              tailLinkCardInserted = tailLinkCardInserted || previousResult.inserted;
              tailLinkCardReady = tailLinkCardReady || previousResult.cardReady;
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
      const officialResult = strictEditorCommit
        ? NO_TAIL_LINK_RESULT
        : await insertOfficialSiteTailBlock({
          self,
          page,
          title: resolved.title,
          hashtags: resolved.hashtags,
          bodyText,
          noCtaMode: true,
        });
      tailLinkCardInserted = tailLinkCardInserted || officialResult.inserted;
      tailLinkCardReady = tailLinkCardReady || officialResult.cardReady;

      // 이전글 삽입
      if (resolved.previousPostUrl) {
        const previousResult = await insertPreviousPostTailBlock(
          self,
          page,
          resolved,
          [],
          'CTA 없는 모드'
        );
        previousPostTailInserted = previousPostTailInserted || previousResult.inserted;
        previousPostCardReady = previousPostCardReady || previousResult.cardReady;
        tailLinkCardInserted = tailLinkCardInserted || previousResult.inserted;
        tailLinkCardReady = tailLinkCardReady || previousResult.cardReady;
      }
    }

    // ✅ 중복 문구 제거됨: '쇼핑커넥트 수익이 발생할 수 있습니다' 문구는 
    // 이미 위에서 '제휴 마케팅 고지 문구'로 처리되므로 별도 추가하지 않음

    const hashtagsToApply = tailPlan.hashtagsToApply;
    await applyTailHashtagsAfterCards({
      self,
      page,
      previousPostTailInserted,
      previousPostCardReady,
      tailLinkCardInserted,
      tailLinkCardReady,
      hashtagsToApply,
    });
    recordMainProcessEditorCommitSemantic(resolved, {
      kind: 'hashtags',
      values: hashtagsToApply,
    });

    // [SPEC-STABILITY-2026 R2] Stash tail expectations for the pre-publish
    // assertion in publishBlogPost (observation mode — log only).
    try {
      const plannedBodyLen = String(resolved.structuredContent?.bodyPlain || resolved.content || '')
        .replace(/\s+/g, ' ')
        .trim().length;
      self.__prePublishExpectations = {
        minBodyChars: Math.max(200, Math.floor(plannedBodyLen * 0.5)),
        expectedImageMin: resolved.skipImages ? 0 : countExpectedPublishImages(resolved.images),
        // 2026-06-11: general CTAs each type a URL that must become a link
        // card — counting only the previous-post tail let a lost CTA card
        // pass 5/5. (Observation mode: conversion is Naver-server dependent,
        // so misses log a ❌ for calibration, they do not block.)
        // effectiveCtas (post-dedup) — resolved.ctas would re-count the CTA
        // that S16 skipped as a previous-post duplicate.
        expectedLinkCardMin: getExpectedLinkCardMin(previousPostTailInserted, effectiveCtas),
        expectedDividerMin: previousPostTailInserted ? 1 : 0,
        expectedTableMin: countExpectedArticleTables(
          resolved.structuredContent?.bodyPlain || resolved.content || ''
        ),
        expectedHashtags: hashtagsToApply,
        expectedOrderedAnchors: buildExpectedOrderAnchors(
          bodyText,
          headings.map((heading: any) => String(heading?.title || '')),
        ),
      };
    } catch {
      // expectations are best-effort observation data
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

    (self as any).__editorContentApplied = true;
    self.log('\n✅ 구조화된 콘텐츠 작성이 완료되었습니다.');
  // Every mutating sub-step has its own bounded retry. Re-running this entire
  // writer after a mid-document failure duplicates already inserted sections
  // and can reorder the final post, so the outer transaction is single-shot.
  }, 1, '콘텐츠 적용');
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

// ── setupMobileViewAndCenterAlign ──
// [2026-05-27] 에디터 진입 직후 테블릿 화면 모드 + 가운데 정렬 자동 적용 (사용자 명시 요청)
// 셀렉터 실패 시 무시 (본문 작성 흐름 차단 금지)
export async function setupMobileViewAndCenterAlign(self: any): Promise<void> {
  const frame = await self.getAttachedFrame();
  if (!frame) {
    self.log('⚠️ [모바일뷰+가운데정렬] frame 없음 → skip');
    return;
  }

  // 1. 테블릿 화면 모드 클릭 (한 번 클릭으로 토글)
  try {
    const tabletBtn = await findElement(frame, SELECTORS.editor.viewModeTablet, 'viewModeTablet');
    if (tabletBtn) {
      await tabletBtn.click();
      self.log('📱 테블릿 화면 모드로 전환');
      await self.delay(300);
    } else {
      self.log('ℹ️ 테블릿 모드 버튼 미발견 (이미 적용됐거나 UI 변경) → skip');
    }
  } catch (e) {
    self.log(`⚠️ 테블릿 모드 전환 실패 (무시): ${(e as Error).message}`);
  }

  // 2. 정렬 드롭다운 → 가운데 정렬
  try {
    const alignBtn = await findElement(frame, SELECTORS.editor.alignDropdownButton, 'alignDropdownButton');
    if (!alignBtn) {
      self.log('ℹ️ 정렬 드롭다운 미발견 → skip');
      return;
    }
    await alignBtn.click();
    await self.delay(200);
    const centerBtn = await findElement(frame, SELECTORS.editor.alignCenterButton, 'alignCenterButton');
    if (centerBtn) {
      await centerBtn.click();
      self.log('📍 가운데 정렬 활성화');
      await self.delay(200);
    } else {
      self.log('ℹ️ 가운데 정렬 버튼 미발견 → 드롭다운 닫기 시도');
      try { await alignBtn.click(); } catch { /* ignore */ }
    }
  } catch (e) {
    self.log(`⚠️ 가운데 정렬 설정 실패 (무시): ${(e as Error).message}`);
  }
}

// ── extractBodyForHeading ──


// [v2.11.134] Balanced contiguous partition for body-distribution fallbacks.
// The old ceil-based math (start = i * ceil(N/H)) ran past the array whenever
// N < H * ceil(N/H): later headings received an EMPTY slice and were published
// as heading+image with no body ("누락"). This keeps chunks contiguous, covers
// every unit exactly once, and spreads the remainder across the front.
export function sliceBalancedUnits<T>(units: T[], headingIndex: number, totalHeadings: number): T[] {
  const n = units.length;
  const h = Math.max(1, totalHeadings);
  const i = Math.max(0, Math.min(headingIndex, h - 1));
  const base = Math.floor(n / h);
  const extra = n % h;
  const start = i * base + Math.min(i, extra);
  const end = start + base + (i < extra ? 1 : 0);
  return units.slice(start, end);
}

// [v2.11.134] Section-body closing cleanup, shared by every extraction path.
// Previous inline copies deleted real mid-body content: generic discourse
// markers ("마지막으로 ...") were treated as closers and their whole line
// removed, "도움이 되었으면"-style matches dropped the entire line (= a whole
// paragraph in the 1-line-per-paragraph mobile format), and a loose "결론:"
// trigger deleted everything after it. Cleanup is now tail-scoped and
// phrase-level so information survives while closer platitudes still go.
const SECTION_CLOSING_DEDUP_PATTERNS: RegExp[] = [
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
];

const SECTION_UNWANTED_PHRASES: RegExp[] = [
  /비즈니스\s*성장에\s*도움이\s*되길\s*바랍니다[^\n]*/gi,
  /비즈니스\s*성장에\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
  /마케팅\s*활동에\s*도움이\s*되었으면\s*좋겠습니다[^\n]*/gi,
  /마케팅\s*활동에\s*도움이\s*되길\s*바랍니다[^\n]*/gi,
  /이\s*정보가\s*도움이\s*되셨기를\s*바랍니다[^\n]*/gi,
  /도움이\s*되셨기를\s*바랍니다[^\n]*/gi,
  /도움이\s*되(었|셧|셨)으면\s*좋겠(습니다|어요|다)[^\n]*/gi,
  /도움이\s*되(었|셧|셨)으면\s*(합니다|해요|한다)[^\n]*/gi,
  /도움이\s*되(었|셧|셨)으면[^\n]*/gi,
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

// Shopping-style closers removed from the LAST 3 lines only — mid-body
// sentences like "꼭 한번 확인해보세요" carry real guidance and must survive.
const SECTION_TAIL_CLOSER_PATTERNS: RegExp[] = [
  /오늘\s*소개해\s*드린[^\n]*/gi,
  /어떠셨나요[^\n]*/gi,
  /꼭\s*한번[^\n]*/gi,
  /눈여겨보시고[^\n]*/gi,
  /현명한\s*쇼핑[^\n]*/gi,
];

export function cleanExtractedSectionBody(content: string, headingTitle: string, allHeadings?: any[]): string {
  let cleaned = (content || '').trim();
  if (!cleaned) return '';

  // (a) Strip other headings' "title: content" lines + (b) closing-section leak.
  if (allHeadings && allHeadings.length > 0) {
    for (const otherHeading of allHeadings) {
      if (!otherHeading || otherHeading.title === headingTitle) continue;
      const otherTitle = String(otherHeading.title || '');
      const escapedOtherTitle = otherTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!escapedOtherTitle) continue;
      cleaned = cleaned
        .replace(new RegExp(`^\\s*${escapedOtherTitle}\\s*:.*$`, 'gmi'), '')
        .replace(new RegExp(`\\n\\s*${escapedOtherTitle}\\s*:.*$`, 'gmi'), '\n')
        .replace(new RegExp(`${escapedOtherTitle}\\s*:.*?(\\n|$)`, 'gi'), '')
        .trim();

      if (/마무리|결론/.test(otherTitle)) {
        // A leaked closing SECTION trails at the end when boundary matching
        // failed. Trigger only on a tail-half line that contains the actual
        // closing heading title — a plain mid-body "결론: ..." sentence no
        // longer wipes the rest of the section.
        const titlePart = otherTitle.split(':')[0].trim();
        const closingTitleLine = /(마무리|결론|끝으로|마지막으로)\s*:/i;
        const lines = cleaned.split('\n');
        let leakStart = -1;
        for (let li = Math.floor(lines.length / 2); li < lines.length; li++) {
          if (titlePart && closingTitleLine.test(lines[li]) && lines[li].includes(titlePart)) {
            leakStart = li;
            break;
          }
        }
        if (leakStart >= 0) {
          cleaned = lines.slice(0, leakStart).join('\n').trim();
        }
      }
    }
  }

  // (c) Trailing CTA text.
  cleaned = cleaned
    .replace(/\n+🔗\s*자세히\s*보기[^\n]*$/i, '')
    .replace(/\n+🔗\s*더\s*알아보기[^\n]*$/i, '')
    .replace(/\n+자세히\s*보기[^\n]*$/i, '')
    .replace(/\n+더\s*알아보기[^\n]*$/i, '')
    .trim();

  // (c-2) Shopping closers — last 3 lines only.
  {
    const lines = cleaned.split('\n');
    const tailStart = Math.max(0, lines.length - 3);
    for (let li = tailStart; li < lines.length; li++) {
      for (const pattern of SECTION_TAIL_CLOSER_PATTERNS) {
        pattern.lastIndex = 0;
        lines[li] = lines[li].replace(pattern, '');
      }
    }
    cleaned = lines.filter((line, idx) => idx < tailStart || line.trim().length > 0).join('\n').trim();
  }

  // (d) Closer dedup — candidates restricted to the last-500-char window so a
  // mid-body line containing a closer-like word is never deleted.
  const last500Chars = cleaned.slice(-500);
  let closingCount = 0;
  for (const pattern of SECTION_CLOSING_DEDUP_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = last500Chars.match(pattern);
    if (matches) closingCount += matches.length;
  }
  if (closingCount > 1) {
    const lines = cleaned.split('\n');
    const keptLines: string[] = [];
    let foundClosing = false;
    let tailChars = 0;
    for (let li = lines.length - 1; li >= 0; li--) {
      const line = lines[li];
      const inTail = tailChars < 500;
      tailChars += line.length + 1;
      const hasClosing = inTail && SECTION_CLOSING_DEDUP_PATTERNS.some(pattern => {
        pattern.lastIndex = 0;
        return pattern.test(line);
      });
      if (hasClosing && foundClosing) continue;
      if (hasClosing) foundClosing = true;
      keptLines.unshift(line);
    }
    cleaned = keptLines.join('\n').trim();
  }

  // (e) Banned platitudes — strip the PHRASE, keep the line when real
  // information remains; drop the line only when nothing meaningful is left.
  {
    const lines = cleaned.split('\n');
    const filtered: string[] = [];
    for (const line of lines) {
      let stripped = line;
      for (const pattern of SECTION_UNWANTED_PHRASES) {
        pattern.lastIndex = 0;
        stripped = stripped.replace(pattern, '');
      }
      if (stripped === line) {
        filtered.push(line);
        continue;
      }
      const rest = stripped.replace(/[\s,.·…~!?-]+$/g, '').trim();
      if (rest.length >= 8) filtered.push(rest);
    }
    cleaned = filtered.join('\n').trim();
  }

  // (f) Residual short closer on the last line.
  {
    const lines = cleaned.split('\n');
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1].trim();
      const isResidualCloser = lastLine.length <= 5 && SECTION_CLOSING_DEDUP_PATTERNS.some(pattern => {
        pattern.lastIndex = 0;
        return pattern.test(lastLine);
      });
      if (isResidualCloser) {
        lines.pop();
        cleaned = lines.join('\n').trim();
      }
    }
  }

  return cleaned;
}

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
        const cleanContent = extractedContent
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

    // [v2.11.134] Shared tail-scoped closing cleanup — see cleanExtractedSectionBody.
    cleanContent = cleanExtractedSectionBody(cleanContent, headingTitle, allHeadings);

    if (cleanContent.length > 0) {
      self.log(`   🔍 [본문추출] 정확한 패턴 매칭 성공: "${headingTitle}" (${cleanContent.length}자)`);
      return cleanContent;
    }
  }

  // 2. 패턴을 찾지 못한 경우: 줄 단위로 검색 (더 유연한 매칭)
  const lines = fullBody.split('\n');
  const extractedContent: string[] = [];
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

    // [v2.11.134] Shared tail-scoped closing cleanup — see cleanExtractedSectionBody.
    result = cleanExtractedSectionBody(result, headingTitle, allHeadings);

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
    const result = sliceBalancedUnits(sentences, headingIndex, totalHeadings).join(' ').trim();

    if (result.length > 0) {
      self.log(`   🔧 [본문추출] 문장 단위 균등 분배: "${headingTitle}" (${result.length}자)`);
      return result;
    }
    return '';
  }

  const assignedParagraphs = sliceBalancedUnits(paragraphs, headingIndex, totalHeadings);

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
