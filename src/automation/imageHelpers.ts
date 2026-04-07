/**
 * imageHelpers.ts
 * naverBlogAutomation.ts에서 추출한 이미지 삽입 관련 헬퍼 함수들
 * 모든 함수는 self: any 파라미터를 통해 NaverBlogAutomation 인스턴스에 접근
 */

import { safeKeyboardType } from './typingUtils.js';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import {
  SELECTORS,
  findElement,
  findAllElements,
  waitForElement,
  getAllSelectors,
  getSelectorStrings,
} from './selectors';

// ── 네이버 블로그 이미지 용량 제한 가드 (10MB) ──
const NAVER_MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB (네이버 블로그 실제 업로드 제한)

/**
 * 이미지 파일이 네이버 블로그 용량 제한(10MB)을 초과하면
 * sharp로 자동 압축/리사이즈하여 제한 이내로 줄인다.
 * @returns 원본 또는 압축된 파일 경로
 */
async function ensureImageUnderSizeLimit(filePath: string, log?: (msg: string) => void): Promise<string> {
  try {
    const stat = await fsPromises.stat(filePath);
    if (stat.size <= NAVER_MAX_IMAGE_BYTES) return filePath; // 제한 이내면 그대로

    const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
    log?.(`   ⚠️ 이미지 용량 초과 감지: ${sizeMB}MB (제한: 10MB) → 자동 압축 시작...`);

    const sharp = (await import('sharp')).default;
    let buffer: any = await fsPromises.readFile(filePath);
    const metadata = await sharp(buffer).metadata();

    // 단계적 압축: 품질↓ → 리사이즈 → 추가 품질↓
    const steps: Array<{ quality: number; maxWidth: number | null }> = [
      { quality: 80, maxWidth: null },
      { quality: 70, maxWidth: 2048 },
      { quality: 60, maxWidth: 1600 },
      { quality: 50, maxWidth: 1200 },
    ];

    for (const step of steps) {
      let pipeline = sharp(buffer as Buffer);
      if (step.maxWidth && metadata.width && metadata.width > step.maxWidth) {
        pipeline = pipeline.resize(step.maxWidth, null, { withoutEnlargement: true });
      }
      buffer = await pipeline.jpeg({ quality: step.quality, mozjpeg: true }).toBuffer();

      if (buffer.length <= NAVER_MAX_IMAGE_BYTES) {
        const newSizeMB = (buffer.length / (1024 * 1024)).toFixed(1);
        log?.(`   ✅ 이미지 압축 성공: ${sizeMB}MB → ${newSizeMB}MB (quality: ${step.quality})`);

        // 압축된 파일을 같은 경로에 덮어쓰기 (.jpg로 변환)
        const compressedPath = filePath.replace(/\.(png|webp|bmp|tiff?)$/i, '.jpg');
        await fsPromises.writeFile(compressedPath, buffer);
        // 원본이 다른 확장자였으면 삭제
        if (compressedPath !== filePath) {
          await fsPromises.unlink(filePath).catch(() => { });
        }
        return compressedPath;
      }
    }

    // 최종 단계에서도 초과하면 마지막 버퍼라도 저장 (최선의 시도)
    const finalSizeMB = (buffer.length / (1024 * 1024)).toFixed(1);
    log?.(`   ⚠️ 최대 압축 후에도 ${finalSizeMB}MB. 그래도 업로드 시도합니다.`);
    const compressedPath = filePath.replace(/\.(png|webp|bmp|tiff?)$/i, '.jpg');
    await fsPromises.writeFile(compressedPath, buffer);
    if (compressedPath !== filePath) {
      await fsPromises.unlink(filePath).catch(() => { });
    }
    return compressedPath;
  } catch (error) {
    log?.(`   ⚠️ 이미지 압축 실패 (원본으로 진행): ${(error as Error).message}`);
    return filePath; // 압축 실패 시 원본 그대로
  }
}

// ── generateAltWithSource ──
export function generateAltWithSource(self: any, image: any): string {
  const parts: string[] = [];
  const baseAlt = image.alt || image.heading || image.title || '';
  if (baseAlt) parts.push(baseAlt);
  const sourceInfo: string[] = [];
  if (image.provider) {
    const providerNames: { [key: string]: string } = {
      'naver': '네이버',
      'pollinations': '나노 바나나 프로 (Gemini API 키, 과금 가능)',
      'nano-banana-pro': '나노 바나나 프로 (Gemini API 키, 과금 가능)',
      'gemini': 'Gemini', 'local': '로컬 파일', 'shopping': '쇼핑몰', 'blog': '블로그'
    };
    sourceInfo.push(providerNames[image.provider] || image.provider);
  }
  const sourceUrl = image.sourceUrl || image.originalUrl || image.url || '';
  if (sourceUrl && sourceUrl.startsWith('http')) {
    try { sourceInfo.push(new URL(sourceUrl).hostname); } catch { }
  }
  if (sourceInfo.length > 0) parts.push(`출처: ${sourceInfo.join(' - ')}`);
  return parts.join(' | ');
}

// ── applyCaption ──
export async function applyCaption(self: any, caption: string): Promise<void> {
  if (!caption) return;
  const frame = await self.getAttachedFrame();
  const selectors = ['.se-caption-input input', '.se-caption-textarea textarea', '.se-image-caption input'];
  for (const selector of selectors) {
    const input = await frame.$(selector);
    if (input) {
      try { await input.click({ clickCount: 3 }); await input.type(caption, { delay: 25 }); self.log('📝 이미지 캡션을 입력했습니다.'); return; } catch { continue; }
    }
  }
}

// ── setImageSizeToDocumentWidth ──
export async function setImageSizeToDocumentWidth(self: any): Promise<void> {
  const frame = await self.getAttachedFrame();
  const page = self.ensurePage();

  try {
    await self.delay(150);

    const appliedCount = await frame.evaluate(() => {
      const imgs = document.querySelectorAll('img.se-image-resource, img[data-se-image-resource="true"], .se-module-image img, .se-section-image img');
      let count = 0;

      imgs.forEach((img) => {
        const targetImage = img as HTMLImageElement;

        // 상위 컨테이너들 설정
        let el: HTMLElement | null = targetImage;
        while (el && el !== document.body) {
          if (el.classList.contains('se-section') || el.classList.contains('se-module') || el.classList.contains('se-component') || el.classList.contains('se-image')) {
            el.classList.remove('se-l-left', 'se-l-right', 'se-l-original');
            el.classList.add('se-l-default');
            el.style.width = '100%';
            el.style.maxWidth = '100%';
            el.setAttribute('data-size', 'document-width');
          }
          el = el.parentElement;
        }

        // 이미지 스타일
        targetImage.style.width = '100%';
        targetImage.style.maxWidth = '100%';
        targetImage.style.height = 'auto';
        targetImage.style.display = 'block';

        // figure/wrap 보정
        const figure = targetImage.closest('figure, .se-image-wrap, .se-module-image-link, .se-component-image') as HTMLElement;
        if (figure) {
          figure.style.width = '100%';
          figure.style.maxWidth = '100%';
        }

        count++;
      });

      return count;
    });

    if (appliedCount > 0) {
      self.log(`   ✅ 직접 스타일 설정 완료 (${appliedCount}개 이미지)`);
    } else {
      self.log(`   ⚠️ 이미지를 찾을 수 없어 크기 조정을 건너뜁니다`);
    }

    await self.delay(200);

    // 7. ✅ 중요: 툴바 포커스 해제 및 에디터 본문으로 포커스 이동
    // 문서 너비 버튼 클릭 후 툴바에 포커스가 남아있으면 Enter가 잘못된 동작 유발
    try {
      // Escape로 툴바/패널 닫기
      await page.keyboard.press('Escape');
      await self.delay(100);

      // ✅ [2026-03-09 FIX] 에디터 본문 포커스 이동 (마지막 이미지 바로 뒤)
      // 기존: .se-section-text 끝으로 커서 이동 → 다음 이미지가 엉뚱한 위치에 삽입되는 버그
      // 수정: 마지막 이미지의 se-section/se-component 바로 뒤로 커서 이동
      await frame.evaluate(() => {
        const imgs = document.querySelectorAll('img.se-image-resource');
        const lastImg = imgs.length > 0 ? imgs[imgs.length - 1] : null;
        const imageSection = lastImg?.closest('.se-section, .se-component, .se-module');

        if (imageSection && imageSection.nextElementSibling) {
          // 이미지 섹션 바로 뒤 요소로 커서 이동
          const nextEl = imageSection.nextElementSibling as HTMLElement;
          if (nextEl) {
            nextEl.focus?.();
            const selection = window.getSelection();
            if (selection) {
              const range = document.createRange();
              range.selectNodeContents(nextEl);
              range.collapse(true); // 시작 위치
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        } else if (imageSection) {
          // 다음 형제가 없으면 이미지 섹션 뒤에 커서
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStartAfter(imageSection);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        } else {
          // 폴백: 기존 로직 (텍스트 영역 끝) — 이미지가 없는 경우
          const textContainer = document.querySelector('.se-section-text, [contenteditable="true"]') as HTMLElement;
          if (textContainer) {
            textContainer.focus();
            const selection = window.getSelection();
            if (selection) {
              const range = document.createRange();
              range.selectNodeContents(textContainer);
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        }
      });
      await self.delay(100);
    } catch (focusError) {
      // 포커스 이동 실패해도 계속 진행
    }

  } catch (error) {
    self.log(`   ⚠️ 이미지 크기 조정 중 오류 발생 (계속 진행): ${(error as Error).message}`);
  }
}

// ── verifyImagePlacement ──
export async function verifyImagePlacement(self: any, expectedCount: number): Promise<boolean> {
  const frame = await self.getAttachedFrame();

  self.log('\n🔍 [이미지 배치 검증 시작]');

  try {
    // 에디터 콘텐츠 영역에서 실제 콘텐츠 이미지 찾기
    const imageInfo = await frame.evaluate(() => {
      // 네이버 에디터의 실제 콘텐츠 편집 영역 찾기
      const contentSelectors = [
        '.se-main-container .se-editing-area',
        '.se-main-container',
        '.se-editing-area',
        '.se-component-content',
        '.se-canvas-area',
        '[contenteditable="true"]',
        '.se-section-text'
      ];

      let contentArea: Element | null = null;
      for (const selector of contentSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          contentArea = element;
          break;
        }
      }

      // 콘텐츠 영역 내 실제 이미지 찾기
      let contentImages = 0;
      let uiImages = 0;
      const imageDetails: Array<{ src: string, isContent: boolean }> = [];

      if (contentArea) {
        const allImages = contentArea.querySelectorAll('img');
        allImages.forEach((img: any) => {
          const src = img.getAttribute('src') || '';

          // 실제 업로드된 콘텐츠 이미지 판별 (엄격한 기준)
          const isContentImage = src.length > 0 &&
            (src.includes('blogfiles.naver.net') ||
              src.includes('postfiles.pstatic.net') ||
              src.includes('blob:') ||
              (src.includes('http') && !src.includes('static.blog.naver.net'))) &&
            !src.includes('icon') &&
            !src.includes('btn_') &&
            !src.includes('ico_');

          if (isContentImage) {
            contentImages++;
          } else {
            uiImages++;
          }

          imageDetails.push({
            src: src.substring(0, 80) + (src.length > 80 ? '...' : ''),
            isContent: isContentImage
          });
        });
      }

      return {
        contentImages,
        uiImages,
        totalImages: contentImages + uiImages,
        imageDetails,
        contentAreaFound: !!contentArea
      };
    });

    self.log(`   → 업로드 요청 이미지: ${expectedCount}개`);
    self.log(`   → 콘텐츠 영역 찾음: ${imageInfo.contentAreaFound ? '예' : '아니오'}`);
    self.log(`   → 콘텐츠 이미지: ${imageInfo.contentImages}개`);
    self.log(`   → UI 아이콘: ${imageInfo.uiImages}개`);

    // 상세 이미지 정보 로깅 (디버그용)
    if (imageInfo.imageDetails.length > 0) {
      self.log('   📋 발견된 이미지 목록:');
      imageInfo.imageDetails.forEach((img: any, idx: number) => {
        self.log(`     ${idx + 1}. [${img.isContent ? '콘텐츠' : 'UI'}] ${img.src}`);
      });
    }

    if (!imageInfo.contentAreaFound) {
      self.log('   ⚠️ 콘텐츠 편집 영역을 찾을 수 없습니다.');
      self.log('   ℹ️ 네이버 블로그 에디터 UI가 변경되었을 수 있습니다.');
    }

    if (imageInfo.contentImages === 0) {
      self.log('   ❌ 실제 콘텐츠 이미지가 하나도 없습니다!');
      self.log('   ℹ️ 이미지 업로드가 완전히 실패했거나, 네이버 에디터가 이미지를 표시하지 않습니다.');
    } else if (imageInfo.contentImages < expectedCount) {
      const missing = expectedCount - imageInfo.contentImages;
      self.log(`   ⚠️ ${missing}개 이미지가 누락되었습니다.`);
      self.log('   ℹ️ 일부 이미지만 업로드되었을 수 있습니다.');
    } else if (imageInfo.contentImages === expectedCount) {
      self.log('   ✅ 모든 이미지가 정상적으로 업로드되었습니다!');
    }

    self.log('\n✅ 이미지 배치 검증 완료');
    return imageInfo.contentImages >= expectedCount;
  } catch (error) {
    self.log(`   ⚠️ 이미지 검증 중 오류: ${(error as Error).message}`);
    self.log(`   ℹ️ 수동으로 이미지 배치를 확인해주세요.`);
    return false;
  }
}

// ── insertImageViaUploadButton ──
/**
 * 현재 커서 위치에 Base64 이미지를 직접 삽입
 * (텍스트 검색 없이 - 소제목 타이핑 직후 호출)
 */
/**
 * 네이버 이미지 업로드 버튼을 통해 이미지 업로드 (가장 확실한 방법)
 */
export async function insertImageViaUploadButton(self: any, filePath: string): Promise<void> {
  const page = self.ensurePage();
  const frame = (await self.getAttachedFrame());

  try {
    // 1. 이미지 업로드 버튼 찾기 (Frame과 Page 모두 검색)
    const imageButtonSelectors = [
      'button[aria-label*="이미지"]',
      'button[data-tooltip*="이미지"]',
      'button[class*="image"]',
      'button[class*="photo"]',
      'button[class*="picture"]',
      'div[role="button"][aria-label*="이미지"]',
      '.se-toolbar-item[aria-label*="이미지"]',
      '.se-toolbar-item[data-tooltip*="이미지"]',
      'button.se-toolbar-item',
      // 네이버 에디터 특정 선택자들
      '[data-name="image"]',
      '[data-command="openImagePopup"]',
      '.se-popup-image button',
      'button[data-command="image"]',
      '.se-image-toolbar-button'
    ];

    let imageButton: any = null;

    // 먼저 Frame에서 찾기 (네이버 블로그는 iframe 구조)
    for (const selector of imageButtonSelectors) {
      try {
        const buttons = await frame.$(selector).catch(() => []);
        for (const button of buttons) {
          const isVisible = await button.isIntersectingViewport().catch(() => false);
          const ariaLabel = await frame.evaluate((el: any) => el.getAttribute('aria-label'), button).catch(() => '');
          const dataTooltip = await frame.evaluate((el: any) => el.getAttribute('data-tooltip'), button).catch(() => '');
          const className = await frame.evaluate((el: any) => el.getAttribute('class'), button).catch(() => '');

          if (isVisible && (ariaLabel?.includes('이미지') || dataTooltip?.includes('이미지') ||
            className?.includes('image') || className?.includes('photo'))) {
            imageButton = button;
            self.log(`   ✅ 이미지 업로드 버튼 발견 (Frame): ${selector}`);
            break;
          }
        }
        if (imageButton) break;
      } catch (error) {
        continue;
      }
    }

    // Frame에서 못 찾으면 Page에서 찾기
    if (!imageButton) {
      for (const selector of imageButtonSelectors) {
        try {
          const buttons = await page.$(selector).catch(() => []);
          for (const button of buttons) {
            const isVisible = await button.isIntersectingViewport().catch(() => false);
            const ariaLabel = await page.evaluate((el: any) => el.getAttribute('aria-label'), button).catch(() => '');
            const dataTooltip = await page.evaluate((el: any) => el.getAttribute('data-tooltip'), button).catch(() => '');
            const className = await page.evaluate((el: any) => el.getAttribute('class'), button).catch(() => '');

            if (isVisible && (ariaLabel?.includes('이미지') || dataTooltip?.includes('이미지') ||
              className?.includes('image') || className?.includes('photo'))) {
              imageButton = button;
              self.log(`   ✅ 이미지 업로드 버튼 발견 (Page): ${selector}`);
              break;
            }
          }
          if (imageButton) break;
        } catch (error) {
          continue;
        }
      }
    }

    if (!imageButton) {
      throw new Error('네이버 블로그에서 이미지 업로드 버튼을 찾을 수 없습니다');
    }

    // 2. 파일 경로 준비
    let absolutePath: string;
    const fs = await import('fs/promises');
    const pathModule = await import('path');

    // ✅ file:// 프로토콜 제거 및 URL 디코딩
    let cleanFilePath = filePath;
    if (cleanFilePath.startsWith('file://')) {
      // file:// 프로토콜 제거
      cleanFilePath = cleanFilePath.replace(/^file:\/\//, '');
      // Windows 경로의 경우 file:///C:/ 형태이므로 / 제거
      if (cleanFilePath.startsWith('/') && /^\/[A-Za-z]:/.test(cleanFilePath)) {
        cleanFilePath = cleanFilePath.substring(1);
      }
      // URL 디코딩
      try {
        cleanFilePath = decodeURIComponent(cleanFilePath);
      } catch {
        // 디코딩 실패 시 원본 사용
      }
      self.log(`   🔧 file:// 프로토콜 제거 및 디코딩: ${filePath.substring(0, 50)}... → ${cleanFilePath.substring(0, 50)}...`);
    }

    if (cleanFilePath.startsWith('http://') || cleanFilePath.startsWith('https://')) {
      // URL인 경우 다운로드 후 임시 파일로 저장
      self.log(`   🌐 URL 이미지 다운로드 중...`);
      const os = await import('os');
      const https = await import('https');
      const http = await import('http');
      const url = await import('url');

      // SSL 검증 무시 (공공 사이트의 SSL 설정 문제 대응)
      const agent = new https.Agent({
        rejectUnauthorized: false,
        secureOptions: 0x4,
      });

      // URL 파싱
      const parsedUrl = new url.URL(cleanFilePath);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      // Promise로 래핑하여 다운로드
      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const request = client.get(cleanFilePath, {
          agent: isHttps ? agent : undefined,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          timeout: 10000,
        }, (response) => {
          if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
            reject(new Error(`이미지 다운로드 실패: ${response.statusCode} ${response.statusMessage || ''}`));
            return;
          }

          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => resolve(Buffer.concat(chunks)));
          response.on('error', reject);
        });

        request.on('error', reject);
        request.on('timeout', () => {
          request.destroy();
          reject(new Error('이미지 다운로드 타임아웃'));
        });
      });
      const tempDir = os.tmpdir();
      // URL에서 쿼리 파라미터 제거 후 확장자 추출 (안전한 방법)
      let urlWithoutQuery = cleanFilePath;
      try {
        // URL 모듈을 사용하여 pathname만 추출 (쿼리 파라미터와 해시 자동 제거)
        const url = await import('url');
        const parsedUrl = new url.URL(cleanFilePath);
        urlWithoutQuery = parsedUrl.pathname;
      } catch {
        // URL 파싱 실패 시 수동으로 제거 (?와 & 모두 처리)
        urlWithoutQuery = cleanFilePath.split('?')[0].split('&')[0].split('#')[0];
      }
      const ext = urlWithoutQuery.split('.').pop()?.toLowerCase() || 'jpg';
      // 유효한 확장자만 허용 (보안) - 확장자에 쿼리 파라미터가 포함되지 않도록 추가 검증
      const cleanExt = ext.split('&')[0].split('?')[0].split('#')[0];
      const validExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(cleanExt) ? cleanExt : 'jpg';
      const tempFileName = `naver-blog-img-${Date.now()}.${validExt}`;
      absolutePath = pathModule.join(tempDir, tempFileName);

      await fs.writeFile(absolutePath, buffer);
      self.log(`   💾 임시 파일 저장: ${tempFileName}`);
    } else {
      // 로컬 파일인 경우
      // 절대 경로로 변환
      absolutePath = pathModule.isAbsolute(cleanFilePath)
        ? cleanFilePath
        : pathModule.resolve(cleanFilePath);

      // ✅ [수정] 쿼리 파라미터 제거는 HTTP URL에서만 적용
      // 로컬 파일 경로에서는 & 등의 문자가 파일명에 포함될 수 있으므로 건너뜀
      // (HTTP URL은 이미 위에서 처리됨)
      // 로컬 파일은 그대로 사용
    }

    // 파일 존재 확인
    try {
      await fs.access(absolutePath);
    } catch (error) {
      throw new Error(`이미지 파일을 찾을 수 없습니다: ${absolutePath}`);
    }

    // 2.5 ✅ 네이버 블로그 이미지 용량 제한 가드 (10MB 초과 시 자동 압축)
    absolutePath = await ensureImageUnderSizeLimit(absolutePath, (msg: string) => self.log(msg));

    // 3. 파일 업로드 실행 (이미지 버튼 클릭 + FileChooser만 사용)
    self.log(`   📤 파일 업로드 시작 (이미지 버튼 클릭 + FileChooser)...`);

    // ✅ 업로드 전 이미지 개수 확인 (Frame에서 확인)
    const imagesBeforeCount = await frame.$$eval(
      'img.se-image-resource, img[src*="blob:"], img[src*="blogfiles"], img[src*="postfiles"], img[data-attachment-id]',
      (imgs: any) => imgs.length
    ).catch(() => 0);
    self.log(`   📊 업로드 전 이미지 개수: ${imagesBeforeCount}`);

    try {
      self.log(`   🔄 FileChooser 대기 중...`);

      const [fileChooser] = await Promise.all([
        page.waitForFileChooser({ timeout: 5000 }),
        imageButton.click()
      ]);

      // ✅ 파일 선택 먼저 수행
      await fileChooser.accept([absolutePath]);
      self.log(`   ✅ FileChooser로 파일 선택 완료`);

      // ✅ 파일 선택 후 업로드 완료 대기 (충분히 기다림)
      self.log(`   ⏳ 이미지 업로드 처리 중... (5초 대기)`);
      await self.delay(5000);

      // ✅ 파일 전송 오류 다이얼로그 감지 및 처리 (용량 초과 등)
      try {
        const errorDialog = await frame.waitForSelector(
          ':is(:text("파일 전송 오류"), :text("용량 초과"), :text("파일 형식 오류"))',
          { timeout: 2000 }
        ).catch(() => null);

        if (errorDialog) {
          self.log(`   ⚠️ 파일 전송 오류 다이얼로그 감지됨 — 확인 버튼 클릭 후 폴백 시도`);
          const allButtons = await frame.$$('button').catch(() => []);
          for (const btn of allButtons) {
            const btnText = await btn.evaluate((el: Element) => el.textContent?.trim() || '').catch(() => '');
            if (btnText === '확인' || btnText === 'OK') {
              await btn.click();
              self.log(`   ✅ 오류 다이얼로그 확인 버튼 클릭 완료`);
              await self.delay(500);
              break;
            }
          }
          throw new Error(`파일 전송 오류: 네이버 에디터에서 이미지 업로드 거부 (용량 초과 또는 형식 오류)`);
        }
      } catch (dialogError) {
        if ((dialogError as Error).message.includes('파일 전송 오류')) throw dialogError;
        // 오류 다이얼로그가 없으면 정상 진행
      }

      // ✅ MYBOX 팝업이 있으면 닫기 (파일 선택 후)
      await page.keyboard.press('Escape').catch(() => { });
      await self.delay(300);
      await page.keyboard.press('Escape').catch(() => { });
      await self.delay(300);

    } catch (fcError) {
      throw new Error(`이미지 버튼 클릭 + FileChooser 실패: ${(fcError as Error).message}`);
    }

    // 4. 업로드 완료 확인 (Frame에서 이미지 요소 확인 - 가장 정확함)
    self.log(`   🔍 이미지 삽입 확인 중...`);

    // ✅ Frame에서 이미지 확인 (네이버 에디터는 iframe 구조)
    const imagesAfterCount = await frame.$$eval(
      'img.se-image-resource, img[src*="blob:"], img[src*="blogfiles"], img[src*="postfiles"], img[data-attachment-id]',
      (imgs: any) => imgs.length
    ).catch(() => 0);

    const newImagesAdded = imagesAfterCount - imagesBeforeCount;

    if (newImagesAdded > 0) {
      self.log(`   ✅ 이미지 업로드 성공! (새로 추가된 이미지: ${newImagesAdded}개, 총 ${imagesAfterCount}개)`);

      // ✅ 이미지 크기를 '문서 너비'로 설정
      try {
        await setImageSizeToDocumentWidth(self);
        self.log(`   ✅ 이미지 크기 '문서 너비'로 설정 완료`);
      } catch (sizeError) {
        self.log(`   ⚠️ 이미지 크기 설정 실패 (계속 진행): ${(sizeError as Error).message}`);
      }
    } else {
      self.log(`   ⚠️ 이미지가 삽입되지 않음 - Base64 방식으로 재시도...`);
      // Base64 방식으로 폴백
      await self.insertImageViaBase64(absolutePath, frame, page);
    }

    // 5. 커서 위치 조정 (이미지 아래로 이동)
    await page.keyboard.press('ArrowDown');
    await self.delay(200);
    await page.keyboard.press('End');
    await self.delay(200);

    self.log(`   🎉 이미지 삽입 프로세스 완료`);

  } catch (error) {
    self.log(`   ❌ 이미지 업로드 실패: ${(error as Error).message}`);
    throw error;
  }
}

// ── insertBase64ImageAtCursor ──
/**
 * 네이버 이미지 버튼을 통해 이미지 업로드 (메인 방식)
 */
export async function insertBase64ImageAtCursor(self: any, filePath: string): Promise<void> {
  const frame = (await self.getAttachedFrame());
  const page = self.ensurePage();

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

  const fs = await import('fs/promises');
  const pathModule = await import('path');
  const os = await import('os');

  let absolutePath: string;
  let isTemporaryFile = false;

  // ✅ Base64 Data URL 또는 프리픽스 없는 Base64인 경우 임시 파일로 저장
  const isBase64 = filePath.startsWith('data:') || (/^[A-Za-z0-9+/=]{100,}$/.test(filePath) && !filePath.includes(':') && !filePath.includes('\\'));

  if (isBase64) {
    self.log(`   🔄 Base64 데이터 감지 → 임시 파일로 변환 중...`);

    try {
      // data:image/jpeg;base64,/9j/... 형식에서 데이터 추출
      const matches = filePath.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) {
        throw new Error('잘못된 Base64 Data URL 형식입니다');
      }

      const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');

      const tempDir = os.tmpdir();
      const tempFileName = `naver-blog-img-${Date.now()}.${ext}`;
      absolutePath = pathModule.join(tempDir, tempFileName);

      await fs.writeFile(absolutePath, buffer);
      isTemporaryFile = true;

      self.log(`   ✅ Base64 → 임시 파일 변환 완료: ${(buffer.length / 1024).toFixed(1)}KB`);
    } catch (error) {
      throw new Error(`Base64 이미지 변환 실패: ${(error as Error).message}`);
    }
  }
  // URL인 경우 다운로드
  else if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    self.log(`   🌐 URL 이미지 다운로드 중: ${filePath.substring(0, 80)}...`);

    try {
      const https = await import('https');
      const http = await import('http');
      const url = await import('url');

      // SSL 검증 무시 (공공 사이트의 SSL 설정 문제 대응)
      const agent = new https.Agent({
        rejectUnauthorized: false,
        // Legacy SSL renegotiation 허용 (OpenSSL 3.0+ 필수)
        secureOptions: 0x4, // SSL_OP_LEGACY_SERVER_CONNECT
      });

      // URL 파싱
      const parsedUrl = new url.URL(filePath);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      // Promise로 래핑하여 다운로드
      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const request = client.get(filePath, {
          agent: isHttps ? agent : undefined,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          timeout: 10000, // 10초 타임아웃
        }, (response) => {
          if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
            reject(new Error(`이미지 다운로드 실패: ${response.statusCode} ${response.statusMessage || ''}`));
            return;
          }

          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => resolve(Buffer.concat(chunks)));
          response.on('error', reject);
        });

        request.on('error', reject);
        request.on('timeout', () => {
          request.destroy();
          reject(new Error('이미지 다운로드 타임아웃'));
        });
      });

      // 임시 파일로 저장
      const tempDir = os.tmpdir();
      // URL에서 쿼리 파라미터 제거 후 확장자 추출 (안전한 방법)
      let urlWithoutQuery = filePath;
      try {
        // URL 모듈을 사용하여 pathname만 추출 (쿼리 파라미터와 해시 자동 제거)
        const parsedUrl = new url.URL(filePath);
        urlWithoutQuery = parsedUrl.pathname;
      } catch {
        // URL 파싱 실패 시 수동으로 제거 (?와 & 모두 처리)
        urlWithoutQuery = filePath.split('?')[0].split('&')[0].split('#')[0];
      }
      const ext = urlWithoutQuery.split('.').pop()?.toLowerCase() || 'jpg';
      // 유효한 확장자만 허용 (보안) - 확장자에 쿼리 파라미터가 포함되지 않도록 추가 검증
      const cleanExt = ext.split('&')[0].split('?')[0].split('#')[0];
      const validExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(cleanExt) ? cleanExt : 'jpg';
      const tempFileName = `naver-blog-img-${Date.now()}.${validExt}`;
      absolutePath = pathModule.join(tempDir, tempFileName);

      await fs.writeFile(absolutePath, buffer);
      isTemporaryFile = true;

      self.log(`   ✅ 이미지 다운로드 완료: ${(buffer.length / 1024).toFixed(1)}KB`);
    } catch (error) {
      throw new Error(`URL 이미지 다운로드 실패: ${(error as Error).message}`);
    }
  } else {
    // 로컬 파일 경로
    // ✅ file:// 프로토콜 제거 및 URL 디코딩
    let cleanFilePath = filePath;
    if (cleanFilePath.startsWith('file://')) {
      // file:// 프로토콜 제거
      cleanFilePath = cleanFilePath.replace(/^file:\/\//, '');
      // Windows 경로의 경우 file:///C:/ 형태이므로 / 제거
      if (cleanFilePath.startsWith('/') && /^\/[A-Za-z]:/.test(cleanFilePath)) {
        cleanFilePath = cleanFilePath.substring(1);
      }
      // URL 디코딩
      try {
        cleanFilePath = decodeURIComponent(cleanFilePath);
      } catch {
        // 디코딩 실패 시 원본 사용
      }
      self.log(`   🔧 file:// 프로토콜 제거 및 디코딩: ${filePath.substring(0, 50)}... → ${cleanFilePath.substring(0, 50)}...`);
    }

    absolutePath = pathModule.isAbsolute(cleanFilePath)
      ? cleanFilePath
      : pathModule.resolve(cleanFilePath);

    // ✅ [수정] 쿼리 파라미터 제거는 HTTP URL에서만 적용
    // 로컬 파일 경로에서는 & 등의 문자가 파일명에 포함될 수 있으므로 건너뜀
    // (HTTP URL은 이미 위에서 처리됨)
    // 로컬 파일은 그대로 사용

    try {
      await fs.access(absolutePath);
    } catch {
      throw new Error(`이미지 파일을 찾을 수 없습니다: ${absolutePath}`);
    }
  }

  // ✅ 네이버 블로그 이미지 용량 제한 가드 (10MB 초과 시 자동 압축)
  absolutePath = await ensureImageUnderSizeLimit(absolutePath, (msg: string) => self.log(msg));

  // 보안: 파일 경로 마스킹
  const maskedPath = absolutePath.replace(/^C:\\Users\\[^\\]+/, '~').replace(/^\/Users\/[^/]+/, '~');
  self.log(`   📁 파일 경로: ${maskedPath}`);

  // ✅ 이미지 버튼 클릭 + FileChooser만 사용 (file input 직접 사용 안 함)
  self.log(`   📤 이미지 버튼 클릭 + FileChooser로 업로드 시작...`);

  // 이미지 버튼 찾기
  const imageButtonSelectors = [
    'button[data-name="image"]',
    'button.se-image-toolbar-button',
    'button[data-command="image"]',
    'button[aria-label*="이미지"]',
    'button[title*="이미지"]',
  ];

  let imageButton = null;
  for (const selector of imageButtonSelectors) {
    imageButton = await frame.$(selector).catch(() => null);
    if (imageButton) {
      self.log(`   ✅ 이미지 버튼 발견: ${selector}`);
      break;
    }
  }

  if (!imageButton) {
    throw new Error('네이버 블로그에서 이미지 업로드 버튼을 찾을 수 없습니다');
  }

  // 이미지 버튼 클릭 + FileChooser
  try {
    self.log(`   🔄 FileChooser 대기 중...`);

    const [fileChooser] = await Promise.all([
      page.waitForFileChooser({ timeout: 5000 }),
      imageButton.click()
    ]);

    // ✅ 파일 선택 먼저 수행 (ESC 키는 나중에!)
    await fileChooser.accept([absolutePath]);
    self.log(`   ✅ FileChooser로 파일 선택 완료`);

    // 업로드 완료 대기 (충분히 기다림)
    self.log(`   ⏳ 이미지 업로드 처리 중... (5초 대기)`);
    await self.delay(5000);

    // ✅ 파일 전송 오류 다이얼로그 감지 및 처리 (용량 초과 등)
    try {
      const errorDialog = await frame.waitForSelector(
        ':is(:text("파일 전송 오류"), :text("용량 초과"), :text("파일 형식 오류"))',
        { timeout: 2000 }
      ).catch(() => null);

      if (errorDialog) {
        self.log(`   ⚠️ 파일 전송 오류 다이얼로그 감지됨 — 확인 버튼 클릭 후 폴백 시도`);
        const allButtons = await frame.$$('button').catch(() => []);
        for (const btn of allButtons) {
          const btnText = await btn.evaluate((el: Element) => el.textContent?.trim() || '').catch(() => '');
          if (btnText === '확인' || btnText === 'OK') {
            await btn.click();
            self.log(`   ✅ 오류 다이얼로그 확인 버튼 클릭 완료`);
            await self.delay(500);
            break;
          }
        }
        throw new Error(`파일 전송 오류: 네이버 에디터에서 이미지 업로드 거부 (용량 초과 또는 형식 오류)`);
      }
    } catch (dialogError) {
      if ((dialogError as Error).message.includes('파일 전송 오류')) throw dialogError;
      // 오류 다이얼로그가 없으면 정상 진행
    }

    // ✅ 파일 업로드 후 MYBOX 팝업 닫기
    await page.keyboard.press('Escape').catch(() => { });
    await self.delay(300);
    await page.keyboard.press('Escape').catch(() => { });
    await self.delay(300);

    // 확인 버튼이 있으면 클릭 (정상 업로드 완료 확인)
    const confirmButton = await frame.$('button:has-text("확인"), button:has-text("삽입")').catch(() => null);
    if (confirmButton) {
      await confirmButton.click();
      await self.delay(1000);
    }

    // 이미지가 삽입되었는지 확인
    const imgCount = await frame.$$eval(
      'img.se-image-resource, img[src*="blob:"], img[src*="blogfiles"], img[src*="postfiles"], img[data-attachment-id]',
      (imgs: any) => imgs.length
    );

    if (imgCount > 0) {
      self.log(`   ✅ 이미지 버튼 클릭 + FileChooser 성공 (이미지 ${imgCount}개 확인됨)`);

      // ✅ MyBox 팝업 자동 닫기
      await self.delay(500); // 팝업이 뜰 시간 대기
      await page.keyboard.press('Escape').catch(() => { });
      await self.delay(300);
      await page.keyboard.press('Escape').catch(() => { }); // 한 번 더 (확실히)
      await self.delay(300);
      self.log('   ✅ MyBox 팝업 자동 닫기 완료');

      // ✅ [2026-03-14 FIX] 이미지 크기를 '문서 너비'로 설정 (이전에 dead code로 누락)
      try {
        await setImageSizeToDocumentWidth(self);
        self.log(`   ✅ 이미지 크기 '문서 너비'로 설정 완료`);
      } catch (sizeError) {
        self.log(`   ⚠️ 이미지 크기 설정 실패 (계속 진행): ${(sizeError as Error).message}`);
      }

      if (isTemporaryFile) {
        await fs.unlink(absolutePath).catch(() => { });
      }
      return;
    } else {
      throw new Error('파일 선택했으나 이미지가 삽입되지 않음');
    }
  } catch (error) {
    // ESC로 열린 패널 닫기
    await page.keyboard.press('Escape').catch(() => { });
    await self.delay(300);

    self.log(`   ⚠️ FileChooser 방식 실패, Base64 변환 방식으로 폴백 시도...`);

    // ✅ Base64 변환 방식으로 폴백
    try {
      await self.insertImageViaBase64(absolutePath, frame, page);
      self.log(`   ✅ Base64 변환 방식으로 이미지 삽입 성공`);

      if (isTemporaryFile) {
        await fs.unlink(absolutePath).catch(() => { });
      }
      return;
    } catch (base64Error) {
      self.log(`   ❌ Base64 변환 방식도 실패: ${(base64Error as Error).message}`);
      throw new Error(`이미지 삽입 실패 (FileChooser + Base64 모두 실패): ${(error as Error).message}`);
    }
  }

  // ✅ 이미지 크기를 '문서 너비'로 설정
  try {
    await setImageSizeToDocumentWidth(self);
    self.log(`   ✅ 이미지 크기 '문서 너비'로 설정 완료`);
  } catch (sizeError) {
    self.log(`   ⚠️ 이미지 크기 설정 실패 (계속 진행): ${(sizeError as Error).message}`);
  }

  // 임시 파일 정리
  if (isTemporaryFile) {
    try {
      await fs.unlink(absolutePath);
      self.log(`   🗑️ 임시 파일 삭제 완료`);
    } catch (error) {
      self.log(`   ⚠️ 임시 파일 삭제 실패: ${(error as Error).message}`);
    }
  }

  // 이미지 삽입 후 커서를 다음 줄로 이동
  await page.keyboard.press('ArrowDown');
  await self.delay(100);
  await page.keyboard.press('End');
  await self.delay(100);
}

// ── insertImageViaBase64 ──
/**
 * Base64 변환 방식으로 이미지 삽입 (클립보드 붙여넣기)
 */
export async function insertImageViaBase64(self: any, filePath: string, frame?: any, page?: any): Promise<void> {
  const fs = await import('fs/promises');
  const pathModule = await import('path');

  self.log(`   🔄 Base64 변환 방식으로 이미지 삽입 시작...`);

  // 이미지를 Base64로 읽기
  let absolutePath = filePath;
  let imageBuffer: Buffer;

  try {
    imageBuffer = await fs.readFile(absolutePath);
    self.log(`   ✅ 이미지 파일 읽기 완료: ${(imageBuffer.length / 1024).toFixed(1)}KB`);
  } catch (error) {
    throw new Error(`이미지 파일 읽기 실패: ${(error as Error).message}`);
  }

  // Base64로 변환
  const base64 = imageBuffer.toString('base64');
  const ext = pathModule.extname(absolutePath).toLowerCase().slice(1) || 'png';
  const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
    ext === 'png' ? 'image/png' :
      ext === 'gif' ? 'image/gif' :
        ext === 'webp' ? 'image/webp' : 'image/png';

  self.log(`   🔄 Base64 변환 완료 (크기: ${(base64.length / 1024).toFixed(2)} KB, MIME: ${mimeType})`);

  // 클립보드에 이미지 데이터 설정
  const clipboardSet = await frame.evaluate(async (b64: string, mime: string) => {
    try {
      // Base64를 Blob으로 변환
      const byteCharacters = atob(b64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mime });

      // ClipboardItem 생성
      const clipboardItem = new ClipboardItem({ [mime]: blob });

      // 클립보드에 쓰기
      await navigator.clipboard.write([clipboardItem]);
      return true;
    } catch (e) {
      console.error('[Base64] 클립보드 설정 오류:', e);
      return false;
    }
  }, base64, mimeType);

  if (!clipboardSet) {
    throw new Error('Base64 클립보드 설정 실패');
  }

  self.log(`   ✅ Base64 클립보드 설정 완료`);

  // 에디터 요소 포커스
  await frame.evaluate(() => {
    const editorElement = document.querySelector('.se-section-text, .se-component-content, [contenteditable="true"]') as HTMLElement;
    if (editorElement) {
      editorElement.focus();
      // 커서를 끝으로 이동
      const range = document.createRange();
      const selection = window.getSelection();
      if (selection) {
        range.selectNodeContents(editorElement);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  });

  await self.delay(300);

  // ✅ Puppeteer로 실제 Ctrl+V 키 입력 (더 확실한 방법)
  self.log(`   📋 Ctrl+V 키 입력으로 이미지 붙여넣기...`);
  await page.keyboard.down('Control');
  await page.keyboard.press('v');
  await page.keyboard.up('Control');

  self.log(`   ✅ Ctrl+V 키 입력 완료`);

  // 이미지 삽입 완료 대기
  await self.delay(2500);

  // 이미지가 삽입되었는지 확인
  const imgCount = await frame.$$eval(
    'img.se-image-resource, img[src*="blob:"], img[src*="blogfiles"], img[src*="postfiles"], img[data-attachment-id]',
    (imgs: any) => imgs.length
  ).catch(() => 0);

  if (imgCount > 0) {
    self.log(`   ✅ Base64 방식으로 이미지 삽입 성공 (이미지 ${imgCount}개 확인됨)`);
  } else {
    self.log(`   ⚠️ Base64 방식으로 삽입했으나 DOM에서 이미지를 찾을 수 없음`);
  }

  // ✅ 이미지 크기를 '문서 너비'로 설정
  try {
    await setImageSizeToDocumentWidth(self);
    self.log(`   ✅ 이미지 크기 '문서 너비'로 설정 완료`);
  } catch (sizeError) {
    self.log(`   ⚠️ 이미지 크기 설정 실패 (계속 진행): ${(sizeError as Error).message}`);
  }

  // ✅ MyBox 팝업 자동 닫기 (3층 방어)
  try {
    await self.delay(500); // 팝업이 뜰 시간 대기
    await page.keyboard.press('Escape');
    await self.delay(300);
    await page.keyboard.press('Escape'); // 한 번 더 (확실히)
    await self.delay(300);
    self.log('✅ MyBox 팝업 자동 닫기 완료');
  } catch (escError) {
    // ESC 키 입력 실패는 무시 (팝업이 없을 수도 있음)
    self.log(`   ℹ️ ESC 키 입력 중 오류 (무시): ${(escError as Error).message}`);
  }
}

// ── insertSingleImage ──
export async function insertSingleImage(self: any, image: any): Promise<void> {
  const frame = (await self.getAttachedFrame());
  self.log(`🖼️ '${image.heading}' 이미지를 현재 커서 위치에 삽입합니다...`);

  let imageDataUrl = image.filePath || (image as any).url || (image as any).previewDataUrl;
  if (!imageDataUrl) {
    self.log(`⚠️ '${image.heading}' 이미지 경로가 비어있습니다. 삽입을 건너뜁니다.`);
    return;
  }

  const isUrl = imageDataUrl.startsWith('http://') || imageDataUrl.startsWith('https://');
  const isBase64 = imageDataUrl.startsWith('data:');

  if (!isUrl && !isBase64) {
    try {
      const fs = await import('fs/promises');
      const imageBuffer = await fs.readFile(imageDataUrl);
      const base64 = imageBuffer.toString('base64');

      // 확장자 및 MimeType 추출
      const urlWithoutQuery = imageDataUrl.split('?')[0].split('#')[0];
      const ext = urlWithoutQuery.split('.').pop()?.toLowerCase() || 'png';
      const validExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'png';
      const mimeType = validExt === 'jpg' || validExt === 'jpeg' ? 'image/jpeg' :
        validExt === 'png' ? 'image/png' :
          validExt === 'gif' ? 'image/gif' :
            validExt === 'webp' ? 'image/webp' : 'image/png';

      imageDataUrl = `data:${mimeType};base64,${base64}`;
    } catch (err) {
      self.log(`❌ 이미지 파일 로드 실패: ${imageDataUrl}. 상세: ${(err as Error).message}`);
      return;
    }
  }

  const inserted = await self.retry(async () => {
    return await frame.evaluate((imgUrl: any) => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return false;
      }

      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;

      const titleElement = document.querySelector('.se-section-documentTitle');
      let currentNode = container.nodeType === Node.TEXT_NODE
        ? container.parentElement
        : container as HTMLElement;

      if (titleElement && titleElement.contains(currentNode)) {
        return false;
      }

      const bodyElement = document.querySelector('.se-section-text, .se-main-container, .se-component');
      if (!bodyElement || !bodyElement.contains(currentNode)) {
        return false;
      }

      const seComponent = document.createElement('div');
      seComponent.className = 'se-component se-image se-l-default';
      seComponent.style.margin = '15px 0';

      const seComponentContent = document.createElement('div');
      seComponentContent.className = 'se-component-content';

      const seSection = document.createElement('div');
      seSection.className = 'se-section se-section-image se-l-default se-align-center';

      const seModule = document.createElement('div');
      seModule.className = 'se-module se-module-image';

      const seLink = document.createElement('a');
      seLink.className = 'se-module-image-link';
      seLink.setAttribute('data-linktype', 'img');

      const img = document.createElement('img');
      img.className = 'se-image-resource';
      img.src = imgUrl;
      img.setAttribute('data-width', 'original');
      img.setAttribute('data-height', 'original');
      img.style.maxWidth = '100%';
      img.style.height = 'auto';

      seLink.appendChild(img);
      seModule.appendChild(seLink);
      seSection.appendChild(seModule);
      seComponentContent.appendChild(seSection);
      seComponent.appendChild(seComponentContent);

      try {
        let insertPoint = currentNode;
        while (insertPoint && !insertPoint.classList.contains('se-component') && insertPoint.parentElement) {
          insertPoint = insertPoint.parentElement;
        }

        if (!insertPoint || !insertPoint.parentElement) {
          range.collapse(false);
          range.insertNode(seComponent);
        } else {
          if (insertPoint.nextSibling) {
            insertPoint.parentElement.insertBefore(seComponent, insertPoint.nextSibling);
          } else {
            insertPoint.parentElement.appendChild(seComponent);
          }
        }

        const newRange = document.createRange();
        newRange.setStartAfter(seComponent);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);

        return true;
      } catch (e) {
        return false;
      }
    }, imageDataUrl);
  }, 3, `"${image.heading}" 이미지 삽입`).catch(() => false);

  if (inserted) {
    self.log(`   ✅ "${image.heading}" 이미지 삽입 완료`);
    await self.delay(self.DELAYS.MEDIUM);
  } else {
    self.log(`   ❌ "${image.heading}" 이미지 삽입 실패 (3회 시도)`);
  }
}

// ── insertImagesAtHeadings ──
/**
 * 반자동 모드: 사용자가 선택한 이미지를 특정 소제목에 삽입
 */
export async function insertImagesAtHeadings(self: any, placements: any[]): Promise<{ success: number; failed: number }> {
  const frame = (await self.getAttachedFrame());
  let success = 0;
  let failed = 0;

  // 역순으로 삽입 (마지막 소제목부터) - 인덱스가 밀리지 않도록
  const sorted = [...placements].sort((a, b) => b.headingIndex - a.headingIndex);

  for (const placement of sorted) {
    try {
      const result = await frame.evaluate((headingIndex: number, imgData: string, position: 'above' | 'below') => {
        // 소제목 요소 찾기
        const textComponents = document.querySelectorAll('.se-component.se-text');
        let targetComponent: Element | null = null;
        let foundIndex = 0;

        for (const comp of textComponents) {
          const text = comp.textContent?.trim() || '';
          // 24px 폰트 크기 확인 (소제목 특징)
          const fontSize = window.getComputedStyle(comp as HTMLElement).fontSize;
          if ((fontSize === '24px' || fontSize === '24.8px' || fontSize === '2.4rem') && text.length > 0) {
            if (foundIndex === headingIndex) {
              targetComponent = comp;
              break;
            }
            foundIndex++;
          }
        }

        if (!targetComponent) {
          console.error(`[이미지 삽입] 소제목을 찾을 수 없습니다: index ${headingIndex}`);
          return false;
        }

        // 이미지 컴포넌트 생성
        const seComponent = document.createElement('div');
        seComponent.className = 'se-component se-image se-l-default';
        seComponent.style.margin = '15px 0';

        const seComponentContent = document.createElement('div');
        seComponentContent.className = 'se-component-content';

        const seSection = document.createElement('div');
        seSection.className = 'se-section se-section-image se-l-default se-align-center';

        const seModule = document.createElement('div');
        seModule.className = 'se-module se-module-image';

        const seLink = document.createElement('a');
        seLink.className = 'se-module-image-link';
        seLink.setAttribute('data-linktype', 'img');

        const img = document.createElement('img');
        img.className = 'se-image-resource';
        img.src = imgData;
        img.setAttribute('data-width', 'original');
        img.setAttribute('data-height', 'original');
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.objectFit = 'contain';

        seLink.appendChild(img);
        seModule.appendChild(seLink);
        seSection.appendChild(seModule);
        seComponentContent.appendChild(seSection);
        seComponent.appendChild(seComponentContent);

        // 소제목 위 또는 아래에 삽입
        if (position === 'above') {
          if (targetComponent.previousSibling) {
            targetComponent.parentElement?.insertBefore(seComponent, targetComponent);
          } else {
            targetComponent.parentElement?.insertBefore(seComponent, targetComponent);
          }
        } else {
          // below (기본값)
          if (targetComponent.nextSibling) {
            targetComponent.parentElement?.insertBefore(seComponent, targetComponent.nextSibling);
          } else {
            targetComponent.parentElement?.appendChild(seComponent);
          }
        }

        console.log(`[이미지 삽입] ✅ 소제목 ${headingIndex} ${position === 'above' ? '위' : '아래'}에 이미지 삽입 완료`);
        return true;
      }, placement.headingIndex, placement.imageBase64, placement.position);

      if (result) {
        success++;
        self.log(`✅ 소제목 ${placement.headingIndex + 1}에 이미지 삽입 완료`);
        await self.delay(self.DELAYS.MEDIUM);
      } else {
        failed++;
        self.log(`⚠️ 소제목 ${placement.headingIndex + 1}에 이미지 삽입 실패`);
      }
    } catch (error) {
      failed++;
      self.log(`❌ 소제목 ${placement.headingIndex + 1} 이미지 삽입 오류: ${(error as Error).message}`);
    }
  }

  return { success, failed };
}

// ── insertImagesAtCurrentCursor ──
/**
 * 현재 커서 위치에 이미지 여러 개를 순차적으로 삽입
 * ✅ [2026-01-20 개선] 재시도 로직 + 안정성 강화
 */
export async function insertImagesAtCurrentCursor(self: any, images: any[], linkUrl?: string): Promise<void> {
  const page = self.ensurePage();
  let frame = await self.getAttachedFrame();
  const fs = await import('fs/promises');
  const MAX_RETRIES = 3;

  for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
    const image = images[imgIdx];
    const maskedPath = (image.filePath || '').replace(/^C:\\Users\\[^\\]+/, '~').replace(/^\/Users\/[^/]+/, '~');

    self.log(`      📷 이미지 ${imgIdx + 1}/${images.length} 업로드 시도: ${maskedPath}`);

    const imagePath = image.filePath || image.savedToLocal || image.url;
    if (!imagePath) {
      self.log(`      ⚠️ 이미지 경로가 없음, 건너뜀`);
      continue;
    }

    // ✅ [신규] 파일 경로인 경우 존재 여부 확인
    if (!imagePath.startsWith('http') && !imagePath.startsWith('data:')) {
      try {
        await fs.access(imagePath);
      } catch {
        self.log(`      ⚠️ 이미지 파일 없음: ${maskedPath}, 건너뜀`);
        continue;
      }
    }

    // ✅ [신규] 프레임 안정성 확인
    try {
      await frame.evaluate(() => true);
    } catch {
      self.log(`      ⚠️ 프레임 연결 불안정, 재연결 시도...`);
      try {
        await self.switchToMainFrame();
        frame = await self.getAttachedFrame();
      } catch (reconnectError) {
        self.log(`      ❌ 프레임 재연결 실패, 이미지 건너뜀`);
        continue;
      }
    }

    // ✅ [신규] 삽입 전 이미지 개수 확인
    const beforeCount = await frame.$$eval(
      'img.se-image-resource, img[src*="blob:"], img[src*="blogfiles"]',
      (imgs: any) => imgs.length
    ).catch(() => 0);

    // ✅ [핵심] 재시도 로직 (최대 3회)
    let insertSuccess = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await self.insertBase64ImageAtCursor(imagePath);
        await self.delay(1500); // 안정화 대기: 1초 → 1.5초

        // ✅ [신규] 삽입 성공 확인
        const afterCount = await frame.$$eval(
          'img.se-image-resource, img[src*="blob:"], img[src*="blogfiles"]',
          (imgs: any) => imgs.length
        ).catch(() => 0);

        if (afterCount > beforeCount) {
          self.log(`      ✅ 이미지 삽입 확인됨 (${beforeCount} → ${afterCount})`);
          insertSuccess = true;
          break;
        } else {
          throw new Error('이미지 삽입이 확인되지 않음');
        }
      } catch (error) {
        self.log(`      ⚠️ 이미지 삽입 시도 ${attempt}/${MAX_RETRIES} 실패: ${(error as Error).message}`);
        if (attempt < MAX_RETRIES) {
          // 점진적 대기 (1초, 2초)
          const waitTime = 1000 * attempt;
          self.log(`      🔄 ${waitTime / 1000}초 후 재시도...`);
          await self.delay(waitTime);

          // ESC 눌러서 열린 팝업/패널 닫기
          await page.keyboard.press('Escape').catch(() => { });
          await self.delay(300);
        }
      }
    }

    if (!insertSuccess) {
      self.log(`      ❌ 이미지 ${imgIdx + 1} 최종 삽입 실패, 건너뜀`);
      continue;
    }

    // ✅ 문서너비 맞추기 + 링크 삽입
    try {
      if (linkUrl) {
        await self.setImageSizeAndAttachLink(linkUrl);
      } else {
        await setImageSizeToDocumentWidth(self);
      }
    } catch (sizeError) {
      self.log(`      ⚠️ 문서너비 설정 실패 (계속 진행): ${(sizeError as Error).message}`);
    }

    // 마지막 이미지가 아니면 줄바꿈 시도
    if (imgIdx < images.length - 1) {
      await page.keyboard.press('Enter');
      await self.delay(500); // 300ms → 500ms
    }
  }

  // 이미지 툴바 및 모달 닫기
  try {
    for (let k = 0; k < 2; k++) {
      await page.keyboard.press('Escape');
      await self.delay(100);
    }

    // 이미지 아래로 커서 이동 확보
    await page.keyboard.press('Enter');
    await self.delay(400); // 300ms → 400ms

    // 공백 정리
    await self.normalizeSpacingAfterLastImage(frame, 1);
  } catch (sizeError) {
    self.log(`      ⚠️ 이미지 후처리 실패: ${(sizeError as Error).message}`);
  }
}

// ── setImageSizeAndAttachLink ──
/**
 * ✅ [신규] 문서너비 맞추기 + 바로 링크 삽입 (물리 마우스 클릭 적용!)
 */
export async function setImageSizeAndAttachLink(self: any, linkUrl?: string): Promise<void> {
  const frame = (await self.getAttachedFrame());
  const page = self.ensurePage();
  const link = linkUrl || '';

  try {
    self.log(`   🔗 [통합] 문서너비 맞추기 + 링크 삽입: ${link.substring(0, 50)}...`);

    // iframe 오프셋 계산
    const frameElement = await page.$('iframe#mainFrame, iframe.se-iframe, iframe[name="mainFrame"]');
    let offsetX = 0, offsetY = 0;
    if (frameElement) {
      const frameRect = await frameElement.boundingBox();
      if (frameRect) {
        offsetX = frameRect.x;
        offsetY = frameRect.y;
      }
    }

    // ✅ [핵심 1] 이미지 스크롤 + 좌표 가져오기
    await frame.evaluate(() => {
      const imgs = document.querySelectorAll('img.se-image-resource');
      if (imgs.length > 0) {
        const lastImg = imgs[imgs.length - 1] as HTMLElement;
        lastImg.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
    });
    await self.delay(800);

    const imgRect = await frame.evaluate(() => {
      const imgs = document.querySelectorAll('img.se-image-resource');
      if (imgs.length > 0) {
        const lastImg = imgs[imgs.length - 1] as HTMLElement;
        const rect = lastImg.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, found: true };
      }
      return { x: 0, y: 0, found: false };
    });

    if (!imgRect.found) {
      self.log('   ⚠️ 이미지를 찾을 수 없습니다.');
      return;
    }

    // ✅ [핵심 2] 물리 마우스 더블 클릭 (이미지 선택)
    const clickX = offsetX + imgRect.x;
    const clickY = offsetY + imgRect.y;
    self.log(`   🎯 물리적 마우스 클릭: 이미지 정중앙 (${Math.round(clickX)}, ${Math.round(clickY)})`);

    await page.mouse.move(clickX, clickY);
    await self.delay(100);

    // 첫 번째 클릭
    self.log(`   🖱️ 첫 번째 클릭 (down → 200ms → up)`);
    await page.mouse.down();
    await self.delay(200);
    await page.mouse.up();
    await self.delay(300);

    // 두 번째 클릭 (더블 클릭)
    self.log(`   🖱️ 두 번째 클릭 (더블 클릭)`);
    await page.mouse.down();
    await self.delay(100);
    await page.mouse.up();

    await self.delay(2000); // 툴바 렌더링 충분히 대기
    self.log(`   ✅ 물리적 더블 클릭 완료`);

    // ✅ [핵심 3] image-link 버튼 확인
    const imageLinkBtnSelector = 'button[data-name="image-link"]';
    const toolbarVisible = await frame.evaluate((selector: any) => {
      const btn = document.querySelector(selector);
      return btn && (btn as HTMLElement).offsetParent !== null;
    }, imageLinkBtnSelector);

    if (!toolbarVisible) {
      self.log('   ⚠️ 이미지가 선택되지 않았습니다 (image-link 버튼 안 보임)');
      return;
    }

    self.log('   ✅ 이미지 선택됨 (초록색 테두리 + image-link 버튼 확인)');

    // 2. 문서너비 버튼 클릭
    const documentWidthClicked = await frame.evaluate(() => {
      const selectors = [
        'button[data-name="documentWidth"]',
        'button[data-value="documentWidth"]',
        '.se-component-toolbar button[data-name="documentWidth"]'
      ];
      for (const sel of selectors) {
        const btn = document.querySelector(sel);
        if (btn && (btn as HTMLElement).offsetParent !== null) {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (documentWidthClicked) {
      self.log('   ✅ 문서너비 버튼 클릭 성공');
    }
    await self.delay(500);

    // 3. 이미지 다시 물리 클릭 (문서너비 후 선택이 해제될 수 있음)
    await page.mouse.move(clickX, clickY);
    await self.delay(100);
    await page.mouse.down();
    await self.delay(200);
    await page.mouse.up();
    await self.delay(1500); // 툴바 렌더링 충분히 대기

    // ✅ [핵심 4] image-link 버튼만 클릭! (text-link 제외)
    self.log('   🔗 이미지 링크 버튼(image-link) 클릭 시도...');
    const linkButtonClicked = await frame.evaluate(() => {
      // ✅ 반드시 data-name="image-link"인 버튼만!
      const imageLinkBtn = document.querySelector('button[data-name="image-link"]') as HTMLElement;

      if (imageLinkBtn && imageLinkBtn.offsetParent !== null) {
        console.log('[링크 삽입] ✅ image-link 버튼 발견 및 클릭!');
        imageLinkBtn.click();
        return { success: true, selector: 'button[data-name="image-link"]' };
      }

      // ⚠️ 폴백에서도 text-link는 절대 클릭 안 함!
      const allLinkBtns = document.querySelectorAll('.se-link-toolbar-button');
      for (const btn of Array.from(allLinkBtns)) {
        const htmlBtn = btn as HTMLElement;
        const dataName = htmlBtn.getAttribute('data-name');

        if (dataName === 'text-link') {
          console.log('[링크 삽입] ⚠️ text-link 버튼 발견 - 건너뜀');
          continue;
        }

        if (htmlBtn.offsetParent !== null) {
          console.log('[링크 삽입] ✅ 폴백 링크 버튼 클릭:', dataName);
          htmlBtn.click();
          return { success: true, selector: `data-name="${dataName}"` };
        }
      }

      return { success: false, selector: '' };
    });

    if (linkButtonClicked.success) {
      self.log(`   ✅ 이미지 링크 버튼 클릭 성공: ${linkButtonClicked.selector}`);
    } else {
      self.log('   ⚠️ image-link 버튼을 찾을 수 없습니다.');
      return;
    }

    await self.delay(800); // 링크 입력창 나타남 대기

    // 5. 이미지 위에 나타난 링크 입력창 찾기 및 링크 입력
    self.log('   📝 링크 입력창 찾는 중...');
    const inputFound = await frame.evaluate(() => {
      // 이미지 위에 나타나는 인라인 입력창 셀렉터
      const inputSelectors = [
        // 이미지 위 인라인 입력창
        '.se-image-link-input input',
        '.se-link-input input',
        'input.se-image-link-url',
        // 일반 링크 팝업 입력창
        '.se-popup-link-url input',
        'input.se-popup-input-text',
        'input[placeholder*="URL"]',
        'input[placeholder*="url"]',
        'input[placeholder*="링크"]',
        'input[placeholder*="http"]',
        // 범용
        '.se-layer input[type="text"]',
        '.se-popup input[type="text"]'
      ];

      for (const sel of inputSelectors) {
        const input = document.querySelector(sel) as HTMLInputElement;
        if (input && input.offsetParent !== null) {
          input.focus();
          input.value = ''; // 기존 값 지우기
          console.log('[링크 삽입] ✅ 입력창 발견:', sel);
          return { found: true, selector: sel };
        }
      }
      return { found: false, selector: '' };
    });

    if (inputFound.found) {
      self.log(`   ✅ 링크 입력창 발견: ${inputFound.selector}`);
    } else {
      self.log('   ⚠️ 링크 입력창을 찾을 수 없습니다.');
      await page.keyboard.press('Escape');
      return;
    }

    // 6. 링크 입력
    await safeKeyboardType(page, link, { delay: 15 });
    await self.delay(400);

    // 7. Enter 2번으로 확정
    self.log('   ⏎ Enter 2회 입력 (링크 확정)...');
    await page.keyboard.press('Enter');
    await self.delay(300);
    await page.keyboard.press('Enter');
    await self.delay(500);

    self.log('   ✅ 문서너비 + 링크 삽입 완료!');

  } catch (error) {
    self.log(`   ⚠️ 문서너비+링크 삽입 실패: ${(error as Error).message}`);
    await setImageSizeToDocumentWidth(self);
  }
}

// ── attachLinkToLastImage ──
// ✅ 이미지에 링크 삽입 (쇼핑커넥트용) - 강화된 버전
export async function attachLinkToLastImage(self: any, linkUrl: string): Promise<void> {
  const frame = (await self.getAttachedFrame());
  const page = self.ensurePage();
  const link = linkUrl || '';

  try {
    self.log(`   🔗 이미지에 제휴 링크 삽입 중: ${link}`);

    // 0. 기존 선택 해제
    await page.keyboard.press('Escape');
    await self.delay(300);

    // 1. 마지막 이미지 위치 찾기
    const imageInfo = await frame.evaluate(() => {
      const selectors = [
        'img.se-image-resource',
        '.se-module-image img',
        '.se-image-resource',
        '.se-component-content img'
      ];

      for (const selector of selectors) {
        const imgs = document.querySelectorAll(selector);
        if (imgs.length > 0) {
          const lastImg = imgs[imgs.length - 1] as HTMLElement;
          const rect = lastImg.getBoundingClientRect();

          // 스크롤하여 이미지를 화면에 표시
          lastImg.scrollIntoView({ behavior: 'auto', block: 'center' });

          console.log('[이미지 링크] ✅ 이미지 위치 확인:', rect);
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            found: true
          };
        }
      }
      return { x: 0, y: 0, found: false };
    });

    if (!imageInfo.found) {
      self.log('   ⚠️ 이미지를 찾을 수 없습니다.');
      return;
    }

    self.log(`   📍 이미지 위치: x=${imageInfo.x}, y=${imageInfo.y}`);
    await self.delay(500);

    // ✅ [핵심 수정] 실제 마우스 클릭으로 이미지 선택 (DOM click은 네이버 에디터에서 안 먹음)
    let imageSelected = false;

    // iframe 오프셋 계산
    const frameElement = await page.$('iframe#mainFrame, iframe.se-iframe, iframe[name="mainFrame"]');
    let offsetX = 0, offsetY = 0;
    if (frameElement) {
      const frameRect = await frameElement.boundingBox();
      if (frameRect) {
        offsetX = frameRect.x;
        offsetY = frameRect.y;
      }
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      self.log(`   🖱️ 이미지 클릭 시도 ${attempt}/3...`);

      // ✅ [핵심 1] 스크롤 - 이미지를 화면 정중앙으로 가져옴 (behavior: 'instant' 필수!)
      await frame.evaluate(() => {
        const imgs = document.querySelectorAll('img.se-image-resource');
        if (imgs.length > 0) {
          const lastImg = imgs[imgs.length - 1] as HTMLElement;
          lastImg.scrollIntoView({ behavior: 'instant', block: 'center' });
        }
      });
      await self.delay(800); // 스크롤 안정화 대기 (증가)

      // ✅ [핵심 2] 좌표 재계산 (스크롤 후 좌표가 바뀜!)
      const imgRect = await frame.evaluate(() => {
        const imgs = document.querySelectorAll('img.se-image-resource');
        if (imgs.length > 0) {
          const lastImg = imgs[imgs.length - 1] as HTMLElement;
          const rect = lastImg.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            width: rect.width,
            height: rect.height,
            found: true
          };
        }
        return { x: 0, y: 0, width: 0, height: 0, found: false };
      });

      if (!imgRect.found) {
        self.log(`   ⚠️ 이미지 좌표 가져오기 실패 (시도 ${attempt}/3)`);
        await self.delay(500);
        continue;
      }

      // ✅ [핵심 3] 물리적 마우스 클릭 (iframe 오프셋 + 이미지 정중앙)
      const clickX = offsetX + imgRect.x;
      const clickY = offsetY + imgRect.y;
      self.log(`   🎯 물리적 마우스 클릭: 이미지 정중앙 (${Math.round(clickX)}, ${Math.round(clickY)})`);

      // ✅ [강화] 마우스 이동
      await page.mouse.move(clickX, clickY);
      await self.delay(100);

      // ✅ [강화] 첫 번째 클릭 (꾹 누름)
      self.log(`   🖱️ 첫 번째 클릭 (down → 200ms → up)`);
      await page.mouse.down();
      await self.delay(200); // 0.2초 꾹 누름
      await page.mouse.up();
      await self.delay(300);

      // ✅ [강화] 두 번째 클릭 (더블 클릭 효과)
      self.log(`   🖱️ 두 번째 클릭 (더블 클릭)`);
      await page.mouse.down();
      await self.delay(100);
      await page.mouse.up();

      self.log(`   ✅ 물리적 더블 클릭 완료`);

      // ✅ [핵심 4] 툴바 확인 - 2초 대기 후 버튼 확인
      await self.delay(2000);

      const imageLinkBtnSelector = 'button[data-name="image-link"]';
      const toolbarVisible = await frame.evaluate((selector: any) => {
        const btn = document.querySelector(selector);
        if (btn && (btn as HTMLElement).offsetParent !== null) {
          console.log('[이미지 링크] ✅ 이미지 링크 버튼 발견!');
          return true;
        }
        return false;
      }, imageLinkBtnSelector);

      if (toolbarVisible) {
        self.log(`   ✅ 이미지 선택 성공! (초록색 테두리 + image-link 버튼 확인됨)`);
        imageSelected = true;
        break;
      } else {
        self.log(`   ⚠️ 클릭했는데 image-link 버튼 안 뜸, 재시도... (${attempt}/3)`);
        // 재시도 전 Escape 눌러서 리셋 후 다시 시도
        await page.keyboard.press('Escape');
        await self.delay(500);
      }
    }

    if (!imageSelected) {
      self.log('   ⚠️ 이미지 선택 실패, 링크 삽입을 건너뜁니다.');
      return;
    }

    // ✅ [2026-01-21] 문서너비 버튼 먼저 클릭 (이미지가 문서 너비에 맞게 표시되도록)
    // 이미지 선택 후 (초록색 테두리) 툴바에 있는 "문서 너비" 버튼 클릭
    self.log('   📐 문서너비 버튼 클릭 시도...');

    const docWidthClicked = await frame.evaluate(() => {
      // ✅ 정확한 셀렉터: data-name="content-mode-without-pagefull" 또는 data-value="fit"
      const docWidthSelectors = [
        'button[data-name="content-mode-without-pagefull"]',
        'button[data-value="fit"]',
        'button.se-object-arrangement-fit-toolbar-button',
        'button[data-name*="fit"]'
      ];

      for (const selector of docWidthSelectors) {
        const btn = document.querySelector(selector) as HTMLElement;
        if (btn && btn.offsetParent !== null) {
          // 이미 선택되어 있는지 확인 (se-is-selected 클래스)
          const isAlreadySelected = btn.classList.contains('se-is-selected');

          if (!isAlreadySelected) {
            console.log('[문서너비] ✅ 문서너비 버튼 클릭:', selector);
            btn.click();
            return { found: true, clicked: true, selector, alreadySelected: false };
          } else {
            console.log('[문서너비] ℹ️ 문서너비 버튼 이미 선택됨:', selector);
            return { found: true, clicked: false, selector, alreadySelected: true };
          }
        }
      }

      // 폴백: 텍스트로 찾기
      const allButtons = document.querySelectorAll('button.se-icon-toolbar-button');
      for (const btn of Array.from(allButtons)) {
        const htmlBtn = btn as HTMLElement;
        const tooltip = htmlBtn.querySelector('.se-toolbar-tooltip')?.textContent?.trim() || '';
        const blind = htmlBtn.querySelector('.se-blind')?.textContent?.trim() || '';

        if (tooltip.includes('문서 너비') || blind.includes('문서 너비')) {
          const isAlreadySelected = htmlBtn.classList.contains('se-is-selected');

          if (!isAlreadySelected) {
            console.log('[문서너비] ✅ 문서너비 버튼 클릭 (텍스트 매칭):', tooltip || blind);
            htmlBtn.click();
            return { found: true, clicked: true, selector: '텍스트 매칭', alreadySelected: false };
          } else {
            console.log('[문서너비] ℹ️ 문서너비 버튼 이미 선택됨 (텍스트 매칭):', tooltip || blind);
            return { found: true, clicked: false, selector: '텍스트 매칭', alreadySelected: true };
          }
        }
      }

      console.log('[문서너비] ⚠️ 문서너비 버튼을 찾을 수 없음');
      return { found: false, clicked: false, selector: '', alreadySelected: false };
    });

    if (docWidthClicked.found) {
      if (docWidthClicked.clicked) {
        self.log(`   ✅ 문서너비 버튼 클릭 완료: ${docWidthClicked.selector}`);
      } else if (docWidthClicked.alreadySelected) {
        self.log(`   ℹ️ 문서너비 이미 선택됨: ${docWidthClicked.selector}`);
      }
      await self.delay(300); // 버튼 클릭 후 잠깐 대기
    } else {
      self.log('   ⚠️ 문서너비 버튼을 찾지 못함 (이미지 툴바에 없을 수 있음)');
    }

    // ✅ [수정] 이미지 선택 완료 후 링크 버튼 클릭으로 진행


    // 툴바 한번 더 확인
    const toolbarExists = await frame.evaluate(() => {
      const toolbarSelectors = [
        'button[data-name="image-link"]',
        '.se-link-toolbar-button',
        '.se-component-toolbar'
      ];
      for (const sel of toolbarSelectors) {
        const el = document.querySelector(sel);
        if (el && (el as HTMLElement).offsetParent !== null) {
          return true;
        }
      }
      return false;
    });

    if (!toolbarExists) {
      self.log('      ⚠️ 이미지 툴바가 보이지 않음, 추가 대기...');
      await self.delay(500);
    }

    // ✅ [수정] 2. 이미지 링크 버튼 클릭 (반드시 data-name="image-link"만 사용!)
    self.log('      🔍 이미지 툴바에서 "image-link" 버튼 찾는 중...');

    // ✅ [핵심] image-link 버튼만 클릭 (text-link 버튼 절대 클릭 금지!)
    const linkButtonClicked = await frame.evaluate(() => {
      // ✅ 반드시 data-name="image-link"인 버튼만 찾음 (text-link 제외)
      const imageLinkBtn = document.querySelector('button[data-name="image-link"]') as HTMLElement;

      if (imageLinkBtn && imageLinkBtn.offsetParent !== null) {
        console.log('[이미지 링크] ✅ image-link 버튼 발견 및 클릭!');
        imageLinkBtn.click();
        return { success: true, selector: 'button[data-name="image-link"]' };
      }

      // ✅ 폴백: 이미지 컴포넌트 툴바 내의 링크 버튼 (text-link 제외)
      const allLinkBtns = document.querySelectorAll('.se-link-toolbar-button, button[data-name="link"]');
      for (const btn of Array.from(allLinkBtns)) {
        const htmlBtn = btn as HTMLElement;
        const dataName = htmlBtn.getAttribute('data-name');

        // ⚠️ text-link는 절대 클릭하지 않음!
        if (dataName === 'text-link') {
          console.log('[이미지 링크] ⚠️ text-link 버튼 발견 - 건너뜀');
          continue;
        }

        if (htmlBtn.offsetParent !== null) {
          console.log('[이미지 링크] ✅ 폴백 링크 버튼 클릭:', dataName);
          htmlBtn.click();
          return { success: true, selector: `data-name="${dataName}"` };
        }
      }

      return { success: false, selector: '' };
    });

    if (linkButtonClicked.success) {
      self.log(`      ✅ 이미지 링크 버튼 클릭 성공: ${linkButtonClicked.selector}`);
    } else {
      self.log('      ⚠️ image-link 버튼을 찾을 수 없습니다. 이미지가 선택되지 않았을 수 있습니다.');
      await page.keyboard.press('Escape');
      return;
    }

    await self.delay(1000); // ✅ 팝업 열림 대기

    // 3. 링크 입력창 찾기 및 URL 입력
    self.log('      📝 링크 입력창 찾는 중...');

    const inputSelectors = [
      // ✅ 네이버 최신 에디터 셀렉터 추가
      '.se-popup-link-url input',
      '.se-popup-link input[type="text"]',
      'input.se-popup-input-text',
      'input[type="url"]',
      'input[type="text"][placeholder*="링크"]',
      'input[placeholder*="URL"]',
      'input[placeholder*="url"]',
      'input[placeholder*="주소"]',
      'input[placeholder*="http"]',
      '.se-popup input[type="text"]',
      '.se-layer input[type="text"]',
      '.se-link-input input',
      '.se-link-input'
    ];

    let inputFound = false;
    for (const selector of inputSelectors) {
      const linkInput = await frame.$(selector).catch(() => null);
      if (linkInput) {
        self.log(`      ✅ 입력창 발견: ${selector}`);

        // 입력창 클릭
        await linkInput.click();
        await self.delay(100);

        // 기존 텍스트 전체 선택 후 삭제
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await self.delay(50);
        await page.keyboard.press('Backspace');
        await self.delay(100);

        // 링크 입력
        await safeKeyboardType(page, link, { delay: 15 });
        await self.delay(400);

        inputFound = true;
        break;
      }
    }

    if (!inputFound) {
      self.log('   ⚠️ 링크 입력창을 찾을 수 없습니다.');
      // 팝업 닫기
      await page.keyboard.press('Escape');
      return;
    }

    // ✅ [개선] 링크 입력 후 확인 버튼 클릭으로 확정
    self.log('      ⏎ 링크 확정 중...');

    // 방법 1: 확인 버튼 찾아서 클릭
    const confirmClicked = await frame.evaluate(() => {
      const confirmSelectors = [
        'button.se-popup-button-confirm',
        'button[data-type="confirm"]',
        'button.se-popup-confirm',
        '.se-popup-button-wrap button:last-child',
        'button[class*="confirm"]',
        '.se-popup button:not([data-type="cancel"])'
      ];

      for (const sel of confirmSelectors) {
        const btn = document.querySelector(sel) as HTMLElement;
        if (btn && btn.offsetParent !== null && !btn.textContent?.includes('취소')) {
          console.log('[링크 확정] ✅ 확인 버튼 클릭:', sel);
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (confirmClicked) {
      self.log('      ✅ 확인 버튼 클릭 성공');
      await self.delay(500);
    } else {
      // ✅ [수정] 확인 버튼을 못 찾으면 Enter 2회 시도 (사용자 피드백 반영)
      self.log('      ⏎ 확인 버튼 없음, Enter 2회 시도...');
      await page.keyboard.press('Enter');
      await self.delay(200);
      await page.keyboard.press('Enter');
      await self.delay(500);
    }

    self.log('   ✅ 이미지에 제휴 링크 삽입 완료');

    // ✅ [개선] 링크 삽입 후 Enter 두번으로 바로 커서 이탈
    await self.delay(300);
    self.log('      ⏎ Enter 2회 입력 (커서 이탈)...');
    await page.keyboard.press('Enter');
    await self.delay(150);
    await page.keyboard.press('Enter');
    await self.delay(300);

  } catch (error) {
    self.log(`   ⚠️ 이미지 링크 삽입 중 오류: ${(error as Error).message}`);
    // 팝업이 열려있을 수 있으니 닫기
    await page.keyboard.press('Escape').catch(() => { });
  }
}

// ── insertImages ──
export async function insertImages(self: any, images: any[], plans: any[]): Promise<void> {
  if (!images.length) {
    return;
  }

  const planMap = new Map<string, any>();
  plans.forEach((plan) => {
    planMap.set(plan.heading, plan);
  });

  const frame = (await self.getAttachedFrame());
  const page = self.ensurePage();

  for (const image of images) {
    self.ensureNotCancelled();
    const plan = planMap.get(image.heading);
    let uploadSucceeded = false;

    try {
      self.log(`🖼️ '${image.heading}' 이미지를 업로드합니다...`);

      // ✅ filePath가 없는 경우 건너뛰기
      if (!image.filePath) {
        self.log(`   ⚠️ 이미지 경로가 없습니다. 이 이미지를 건너뜁니다.`);
        continue;
      }

      // 보안: 파일 경로 마스킹
      const maskedPath = image.filePath.replace(/^C:\\Users\\[^\\]+/, '~').replace(/^\/Users\/[^/]+/, '~');
      self.log(`   📁 파일 경로: ${maskedPath}`);

      // URL인지 확인 (파일 검증 전에 먼저 체크)
      const isUrl = image.filePath.startsWith('http://') || image.filePath.startsWith('https://');

      // 로컬 파일인 경우에만 검증
      if (!isUrl) {
        // 이미지 파일 검증: 앱에서 생성했거나 로컬에 저장된 파일만 사용
        const fs = await import('fs/promises');
        let isValidImage = false;

        try {
          await fs.access(image.filePath);
          const stats = await fs.stat(image.filePath);
          isValidImage = stats.isFile();

          // 파일 확장자 확인
          const path = await import('path');
          const ext = path.extname(image.filePath).toLowerCase();
          isValidImage = isValidImage && ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);

          // 파일 크기 확인 (최소 0.5KB, 최대 50MB)
          const fileSizeKB = stats.size / 1024;
          if (fileSizeKB < 0.5 || fileSizeKB > 51200) {
            isValidImage = false;
            self.log(`   ⚠️ 파일 크기가 적절하지 않습니다: ${fileSizeKB.toFixed(2)} KB`);
          }
        } catch (fileError) {
          self.log(`   ❌ 이미지 파일 접근 실패: ${(fileError as Error).message}`);
          isValidImage = false;
        }

        if (!isValidImage) {
          self.log(`   ⚠️ 유효하지 않은 이미지 파일입니다. 이 이미지를 건너뜁니다.`);
          continue; // 다음 이미지로 진행
        }

        self.log(`   ✅ 로컬에 저장된 이미지를 업로드합니다.`);
      } else {
        self.log(`   ✅ 이미지 URL을 사용합니다.`);
      }

      // 🎯 방법 1: 모든 이미지를 Base64 Data URL로 변환하여 DOM에 직접 삽입 (가장 확실한 방법)
      let imageDataUrl = image.filePath;

      // 로컬 파일인 경우 Base64 Data URL로 변환 (네이버 보안 우회)
      if (!isUrl) {
        self.log(`   🔄 로컬 파일을 Base64 Data URL로 변환 중... (네이버 보안 우회)`);
        try {
          const fs = await import('fs/promises');
          const imageBuffer = await fs.readFile(image.filePath);
          const base64 = imageBuffer.toString('base64');

          // 확장자에 따라 MIME 타입 결정
          // URL에서 쿼리 파라미터 제거 후 확장자 추출
          const urlWithoutQuery = image.filePath.split('?')[0].split('#')[0];
          const ext = urlWithoutQuery.split('.').pop()?.toLowerCase() || 'png';
          // 유효한 확장자만 허용
          const validExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'png';
          const mimeType = validExt === 'jpg' || validExt === 'jpeg' ? 'image/jpeg' :
            validExt === 'png' ? 'image/png' :
              validExt === 'gif' ? 'image/gif' :
                validExt === 'webp' ? 'image/webp' : 'image/png';

          imageDataUrl = `data:${mimeType};base64,${base64}`;
          self.log(`   ✅ Base64 변환 완료 (크기: ${(base64.length / 1024).toFixed(2)} KB)`);
        } catch (base64Error) {
          self.log(`   ❌ Base64 변환 실패: ${(base64Error as Error).message}`);
          throw base64Error; // Base64 변환 실패 시 중단
        }
      } else {
        // 외부 URL인 경우도 Base64로 변환 시도 (더 확실함)
        self.log(`   🔄 외부 URL 이미지를 Base64로 변환 중...`);
        try {
          const https = await import('https');
          const http = await import('http');
          const url = await import('url');

          // URL 파싱
          const parsedUrl = new url.URL(image.filePath);
          const isHttps = parsedUrl.protocol === 'https:';
          const client = isHttps ? https : http;

          // Promise로 래핑하여 다운로드
          const buffer = await new Promise<Buffer>((resolve, reject) => {
            const request = client.get(image.filePath, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
              timeout: 10000,
            }, (response) => {
              if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
                reject(new Error(`이미지 다운로드 실패: ${response.statusCode} ${response.statusMessage || ''}`));
                return;
              }

              const chunks: Buffer[] = [];
              response.on('data', (chunk) => chunks.push(chunk));
              response.on('end', () => resolve(Buffer.concat(chunks)));
              response.on('error', reject);
            });

            request.on('error', reject);
            request.on('timeout', () => {
              request.destroy();
              reject(new Error('이미지 다운로드 타임아웃'));
            });
          });
          const base64 = buffer.toString('base64');

          // URL에서 확장자 추출 (쿼리 파라미터 제거)
          const urlPath = new URL(image.filePath).pathname;
          const ext = urlPath.split('.').pop()?.toLowerCase() || 'png';
          // 유효한 확장자만 허용
          const validExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'png';
          const mimeType = validExt === 'jpg' || validExt === 'jpeg' ? 'image/jpeg' :
            validExt === 'png' ? 'image/png' :
              validExt === 'gif' ? 'image/gif' :
                validExt === 'webp' ? 'image/webp' : 'image/png';

          imageDataUrl = `data:${mimeType};base64,${base64}`;
          self.log(`   ✅ 외부 URL을 Base64로 변환 완료 (크기: ${(base64.length / 1024).toFixed(2)} KB)`);
        } catch (urlError) {
          self.log(`   ⚠️ 외부 URL을 Base64로 변환 실패, 원본 URL 사용: ${(urlError as Error).message}`);
          // 실패 시 원본 URL 사용
        }
      }

      // 외부 URL인 경우 네이버 에디터의 이미지 URL 삽입 기능 사용
      if (isUrl && imageDataUrl) {
        self.log(`   🔄 외부 이미지 URL을 에디터에 삽입 중...`);
        self.log(`   📎 URL: ${imageDataUrl.substring(0, 100)}...`);

        try {
          // 네이버 에디터의 이미지 URL 삽입 기능 사용
          // 방법 1: 이미지 버튼 클릭 → URL 입력 옵션 찾기
          const imageButton = await frame.$('button[data-name="image"], button.se-image-toolbar-button').catch(() => null);

          if (imageButton) {
            await imageButton.click();
            await self.delay(self.DELAYS.LONG);

            // URL 입력 옵션 찾기 (여러 패턴 시도)
            const urlInputOption = await frame.$('input[type="url"], input[placeholder*="URL"], input[placeholder*="url"], input[placeholder*="주소"], button:has-text("URL"), button:has-text("주소"), a[href*="url"], a:has-text("URL")').catch(() => null);

            if (urlInputOption) {
              self.log(`   ✅ URL 입력 옵션 발견`);
              await urlInputOption.click().catch(() => {
                // 클릭 실패 시 직접 입력 시도
                return urlInputOption.type(imageDataUrl, { delay: 50 });
              });
              await self.delay(self.DELAYS.LONG);
            }

            // URL 입력 필드 찾기 및 입력
            const urlInput = await frame.$('input[type="url"], input[placeholder*="URL"], input[placeholder*="url"], input[placeholder*="주소"], input[type="text"]').catch(() => null);

            if (urlInput) {
              await urlInput.click({ clickCount: 3 }); // 기존 내용 선택
              await urlInput.type(imageDataUrl, { delay: 50 });
              await self.delay(self.DELAYS.LONG);

              // 확인/삽입 버튼 찾기 및 클릭
              const insertButton = await frame.$('button:has-text("확인"), button:has-text("삽입"), button:has-text("OK"), button:has-text("Insert"), button[type="submit"]').catch(() => null);
              if (insertButton) {
                await insertButton.click();
                await self.delay(2000);

                // 이미지가 삽입되었는지 확인
                const imgCheck = await frame.$$('img').catch(() => []);
                if (imgCheck.length > 0) {
                  uploadSucceeded = true;
                  self.log(`   ✅ 외부 이미지 URL 삽입 성공! (DOM에서 ${imgCheck.length}개 이미지 발견)`);
                }
              }
            }

            // 패널이 열려있으면 닫기
            await page.keyboard.press('Escape').catch(() => { });
            await self.delay(self.DELAYS.MEDIUM);
          }

          // 방법 2: DOM에 직접 삽입 (방법 1 실패 시)
          if (!uploadSucceeded) {
            self.log(`   🔄 DOM에 직접 삽입 시도...`);

            // 여러 방법으로 DOM 삽입 시도
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                const inserted = await frame.evaluate((imgUrl: any) => {
                  // 방법 1: Selection API 사용
                  const selection = window.getSelection();
                  if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);

                    const img = document.createElement('img');
                    img.src = imgUrl;
                    // ✅ 본문 크기에 딱 맞게 중앙 정렬
                    img.style.width = '100%'; // 본문 전체 너비 사용
                    img.style.maxWidth = '100%'; // 본문을 넘지 않도록 제한
                    img.style.height = 'auto'; // 비율 유지
                    img.style.display = 'block'; // 블록 요소로 표시
                    img.style.margin = '20px auto'; // 중앙 정렬 + 상하 여백
                    img.style.borderRadius = '8px'; // 약간 둥근 모서리
                    img.style.objectFit = 'contain'; // 이미지 전체가 보이도록

                    range.deleteContents();
                    range.insertNode(img);

                    // ✅ 다음 이미지가 바로 이어서 들어가도 공백이 생기지 않도록 <br>를 만들지 않고,
                    // 커서를 이미지 바로 뒤로 이동
                    range.setStartAfter(img);
                    range.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(range);
                    return true;
                  }

                  // 방법 2: 에디터 본문 영역에 직접 추가
                  const editor = document.querySelector('.se-section-text, .se-main-container, .se-component');
                  if (editor) {
                    const img = document.createElement('img');
                    img.src = imgUrl;
                    // ✅ 본문 크기에 딱 맞게 중앙 정렬
                    img.style.width = '100%'; // 본문 전체 너비 사용
                    img.style.maxWidth = '100%'; // 본문을 넘지 않도록 제한
                    img.style.height = 'auto'; // 비율 유지
                    img.style.display = 'block'; // 블록 요소로 표시
                    img.style.margin = '20px auto'; // 중앙 정렬 + 상하 여백
                    img.style.borderRadius = '8px'; // 약간 둥근 모서리
                    img.style.objectFit = 'contain'; // 이미지 전체가 보이도록

                    editor.appendChild(img);

                    // 커서를 이미지 뒤로 이동 (다음 삽입을 위해)
                    const selection = window.getSelection();
                    if (selection) {
                      const r = document.createRange();
                      r.setStartAfter(img);
                      r.collapse(true);
                      selection.removeAllRanges();
                      selection.addRange(r);
                    }
                    return true;
                  }

                  return false;
                }, imageDataUrl);

                if (inserted) {
                  await self.delay(1000);

                  // 이미지가 삽입되었는지 확인
                  const imgCheck = await frame.$$('img').catch(() => []);
                  const contentImages = await frame.evaluate(() => {
                    const imgs = Array.from(document.querySelectorAll('img'));
                    return imgs.filter(img => {
                      const src = img.getAttribute('src') || '';
                      return src.startsWith('http') && !src.includes('static.blog.naver.net');
                    });
                  }).catch(() => []);

                  if (contentImages.length > 0 || imgCheck.length > 0) {
                    uploadSucceeded = true;
                    self.log(`   ✅ 외부 이미지 DOM 삽입 성공! (시도 ${attempt + 1}, 이미지 ${contentImages.length || imgCheck.length}개 발견)`);
                    break;
                  }
                }
              } catch (domError) {
                self.log(`   ⚠️ DOM 삽입 시도 ${attempt + 1} 실패: ${(domError as Error).message}`);
              }

              if (attempt < 2) {
                await self.delay(self.DELAYS.LONG);
              }
            }

            if (!uploadSucceeded) {
              self.log(`   ⚠️ DOM 직접 삽입이 실패했습니다. 외부 URL 이미지는 네이버 에디터에서 직접 삽입해야 할 수 있습니다.`);
            }
          }
        } catch (insertError) {
          self.log(`   ❌ 외부 이미지 삽입 실패: ${(insertError as Error).message}`);
        }
      }

      // Base64 Data URL을 DOM에 직접 삽입 (가장 확실한 방법)
      if (imageDataUrl && imageDataUrl.startsWith('data:')) {
        self.log(`   🔄 Base64 Data URL을 네이버 에디터에 직접 삽입 중...`);
        self.log(`   📎 Data URL 크기: ${(imageDataUrl.length / 1024).toFixed(2)} KB`);

        // 여러 방법으로 시도
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const inserted = await frame.evaluate((imgUrl: any) => {
              // ⚠️ 중요: 제목 필드가 아닌 본문 영역에만 삽입
              const titleElement = document.querySelector('.se-section-documentTitle');
              const bodyElement = document.querySelector('.se-section-text, .se-main-container, .se-component, .se-module-text');

              if (!bodyElement) {
                return false; // 본문 영역을 찾을 수 없음
              }

              // 방법 1: Selection API 사용 (가장 정확) - 현재 커서 위치에 삽입
              const selection = window.getSelection();
              if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0).cloneRange(); // 원본 range 복사
                const container = range.commonAncestorContainer;
                const node = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;

                // ⚠️ 중요: 제목 필드에 있으면 본문 영역으로 이동하되, 최상단이 아닌 현재 위치 유지
                if (titleElement && titleElement.contains(node)) {
                  // 제목 필드에 있으면 본문 영역의 현재 커서 위치를 찾기
                  // 소제목이 입력된 위치를 찾기 위해 최근 입력된 텍스트를 찾음
                  const textNodes = [];
                  const walker = document.createTreeWalker(bodyElement, NodeFilter.SHOW_TEXT);
                  let textNode;
                  while (textNode = walker.nextNode()) {
                    if (textNode.textContent && textNode.textContent.trim().length > 0) {
                      textNodes.push(textNode);
                    }
                  }

                  // 마지막 텍스트 노드(방금 입력한 소제목) 다음으로 이동
                  if (textNodes.length > 0) {
                    const lastTextNode = textNodes[textNodes.length - 1];
                    const parent = lastTextNode.parentElement;
                    if (parent && parent.nextSibling) {
                      range.setStartBefore(parent.nextSibling);
                    } else if (parent) {
                      range.setStartAfter(parent);
                    } else {
                      range.setStartAfter(lastTextNode);
                    }
                    range.collapse(true);
                  } else {
                    // 텍스트 노드를 찾을 수 없으면 본문 영역 끝으로
                    range.selectNodeContents(bodyElement);
                    range.collapse(false);
                  }
                }

                // ⚠️ 중요: 본문 영역에 있는지 확인하되, 최상단으로 이동하지 않음
                const currentContainer = range.commonAncestorContainer;
                const currentNode = currentContainer.nodeType === Node.TEXT_NODE ? currentContainer.parentElement : currentContainer;

                // 본문 영역이 아니면 현재 위치를 유지하지 않고 본문 영역으로 이동
                if (!bodyElement.contains(currentNode)) {
                  // 본문 영역 끝으로 이동 (하지만 이미 위에서 처리했으므로 여기서는 최후의 수단)
                  range.selectNodeContents(bodyElement);
                  range.collapse(false);
                }

                // ⚠️ 중요: 현재 커서 위치에 이미지를 삽입 (소제목 바로 아래)
                // ✅ 이미지 요소 생성 (본문 크기에 딱 맞게 중앙 정렬)
                const img = document.createElement('img');
                img.src = imgUrl;

                // ✅ 네이버 블로그 본문 너비에 맞춤 (중앙 정렬)
                img.style.width = '100%'; // 본문 전체 너비 사용
                img.style.maxWidth = '100%'; // 본문을 넘지 않도록 제한
                img.style.height = 'auto'; // 비율 유지
                img.style.display = 'block'; // 블록 요소로 표시
                img.style.margin = '20px auto'; // 중앙 정렬 + 상하 여백
                img.style.borderRadius = '8px'; // 약간 둥근 모서리
                img.style.objectFit = 'contain'; // 이미지 전체가 보이도록 (잘리지 않음)
                img.setAttribute('data-se-image-resource', 'true');

                // 현재 위치에 이미지 삽입 (제목 필드 제외, 본문 영역만)
                try {
                  // 컨테이너 생성 (이미지를 감싸는 div)
                  const imgContainer = document.createElement('div');
                  imgContainer.style.margin = '15px 0';
                  imgContainer.style.textAlign = 'center';
                  imgContainer.appendChild(img);


                  // range가 collapse된 상태인지 확인
                  if (range.collapsed) {
                    // ⚠️ 중요: 제목 필드가 아닌 본문 영역 찾기
                    const titleElement = document.querySelector('.se-section-documentTitle');
                    const bodyElement = document.querySelector('.se-section-text, .se-main-container, .se-component');

                    // 현재 커서가 있는 위치 확인
                    const container = range.commonAncestorContainer;
                    let parentElement = container.nodeType === Node.TEXT_NODE
                      ? container.parentElement
                      : container as HTMLElement;

                    // 제목 필드에 있는지 확인
                    if (titleElement && titleElement.contains(parentElement)) {
                      // 제목 필드에 있으면 본문 영역으로 이동
                      if (bodyElement) {
                        // 본문 영역의 가장 마지막 텍스트 노드 찾기 (소제목)
                        const textNodes = [];
                        const walker = document.createTreeWalker(bodyElement, NodeFilter.SHOW_TEXT);
                        let textNode;
                        while (textNode = walker.nextNode()) {
                          if (textNode.textContent && textNode.textContent.trim().length > 0) {
                            textNodes.push(textNode);
                          }
                        }

                        if (textNodes.length > 0) {
                          // 마지막 텍스트 노드(소제목)의 부모 요소로 변경
                          const lastTextNode = textNodes[textNodes.length - 1];
                          parentElement = lastTextNode.parentElement as HTMLElement;
                        } else {
                          // 텍스트 노드가 없으면 본문 영역 자체 사용
                          parentElement = bodyElement as HTMLElement;
                        }
                      }
                    }

                    if (parentElement) {
                      // 부모 요소의 다음 위치에 삽입
                      if (parentElement.nextSibling) {
                        parentElement.parentNode?.insertBefore(imgContainer, parentElement.nextSibling);
                      } else if (parentElement.parentNode) {
                        parentElement.parentNode.appendChild(imgContainer);
                      } else {
                        // 폴백: 본문 영역에 추가
                        if (bodyElement) {
                          bodyElement.appendChild(imgContainer);
                        }
                      }
                    } else {
                      // 폴백: range에 직접 삽입
                      range.insertNode(imgContainer);
                    }

                    // 커서를 이미지 뒤로 이동
                    range.setStartAfter(imgContainer);
                    range.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(range);
                  } else {
                    // range가 collapse되지 않았으면 현재 위치에 삽입
                    const container = range.commonAncestorContainer;
                    const parentElement = container.nodeType === Node.TEXT_NODE
                      ? container.parentElement
                      : container as HTMLElement;

                    if (parentElement && parentElement.parentNode) {
                      if (parentElement.nextSibling) {
                        parentElement.parentNode.insertBefore(imgContainer, parentElement.nextSibling);
                      } else {
                        parentElement.parentNode.appendChild(imgContainer);
                      }
                    } else {
                      range.insertNode(imgContainer);
                    }

                    range.setStartAfter(imgContainer);
                    range.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(range);
                  }

                  return true;
                } catch (e) {
                  // 삽입 실패 시 방법 2로 폴백
                  // 이미지 삽입 실패 (에러는 상위에서 처리)
                }
              }

              // 방법 2: 에디터 본문 영역에 직접 추가 (제목 필드 제외)
              if (bodyElement) {
                const img = document.createElement('img');
                img.src = imgUrl;
                // ✅ 본문 크기에 딱 맞게 중앙 정렬
                img.style.width = '100%'; // 본문 전체 너비 사용
                img.style.maxWidth = '100%'; // 본문을 넘지 않도록 제한
                img.style.height = 'auto'; // 비율 유지
                img.style.display = 'block'; // 블록 요소로 표시
                img.style.margin = '20px auto'; // 중앙 정렬 + 상하 여백
                img.style.borderRadius = '8px'; // 약간 둥근 모서리
                img.style.objectFit = 'contain'; // 이미지 전체가 보이도록
                img.setAttribute('data-se-image-resource', 'true');


                // 현재 커서 위치 찾기
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                  const range = selection.getRangeAt(0);
                  const container = range.commonAncestorContainer;
                  const node = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;

                  // 제목 필드가 아닌 본문 영역에만 삽입
                  if (node && bodyElement.contains(node) && (!titleElement || !titleElement.contains(node))) {
                    // 커서 위치에 삽입
                    range.insertNode(img);
                    range.setStartAfter(img);
                    range.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(range);
                  } else {
                    // 마지막으로 입력된 텍스트 노드(소제목) 찾기
                    const textNodes = [];
                    const walker = document.createTreeWalker(bodyElement, NodeFilter.SHOW_TEXT);
                    let textNode;
                    while (textNode = walker.nextNode()) {
                      if (textNode.textContent && textNode.textContent.trim().length > 0) {
                        textNodes.push(textNode);
                      }
                    }

                    if (textNodes.length > 0) {
                      // 마지막 텍스트 노드의 부모 요소 찾기
                      const lastTextNode = textNodes[textNodes.length - 1];
                      const parent = lastTextNode.parentElement;

                      if (parent && parent.parentElement) {
                        // 소제목 부모 요소 바로 다음에 이미지 삽입
                        if (parent.nextSibling) {
                          parent.parentElement.insertBefore(img, parent.nextSibling);
                        } else {
                          parent.parentElement.appendChild(img);
                        }
                      } else {
                        // 폴백: 본문 영역 끝에 추가
                        bodyElement.appendChild(img);
                      }
                    } else {
                      // 텍스트 노드가 없으면 본문 영역 끝에 추가
                      bodyElement.appendChild(img);
                    }

                    // 커서를 이미지 뒤로 이동
                    const newRange = document.createRange();
                    newRange.setStartAfter(img);
                    newRange.collapse(true);
                    if (selection) {
                      selection.removeAllRanges();
                      selection.addRange(newRange);
                    }
                  }
                } else {
                  // 마지막으로 입력된 텍스트 노드(소제목) 찾기
                  const textNodes = [];
                  const walker = document.createTreeWalker(bodyElement, NodeFilter.SHOW_TEXT);
                  let textNode;
                  while (textNode = walker.nextNode()) {
                    if (textNode.textContent && textNode.textContent.trim().length > 0) {
                      textNodes.push(textNode);
                    }
                  }

                  if (textNodes.length > 0) {
                    // 마지막 텍스트 노드의 부모 요소 찾기
                    const lastTextNode = textNodes[textNodes.length - 1];
                    const parent = lastTextNode.parentElement;

                    if (parent && parent.parentElement) {
                      // 소제목 부모 요소 바로 다음에 이미지 삽입
                      if (parent.nextSibling) {
                        parent.parentElement.insertBefore(img, parent.nextSibling);
                      } else {
                        parent.parentElement.appendChild(img);
                      }
                    } else {
                      // 폴백: 본문 영역 끝에 추가
                      bodyElement.appendChild(img);
                    }
                  } else {
                    // 텍스트 노드가 없으면 본문 영역 끝에 추가
                    bodyElement.appendChild(img);
                  }

                  // 커서를 이미지 뒤로 이동
                  const newRange = document.createRange();
                  newRange.setStartAfter(img);
                  newRange.collapse(true);
                  if (selection) {
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                  }
                }

                return true;
              }

              return false;
            }, imageDataUrl);

            if (inserted) {
              await self.delay(1500);

              // 이미지가 실제로 삽입되었는지 확인
              const imgCheck = await frame.$$('img').catch(() => []);
              const dataUrlImages = await frame.evaluate((imgUrl: any) => {
                const imgs = Array.from(document.querySelectorAll('img'));
                return imgs.filter(img => img.src === imgUrl || img.src.startsWith('data:image'));
              }, imageDataUrl).catch(() => []);

              if (dataUrlImages.length > 0 || imgCheck.length > 0) {
                uploadSucceeded = true;
                self.log(`   ✅ Base64 Data URL 삽입 성공! (시도 ${attempt + 1}, 이미지 ${dataUrlImages.length || imgCheck.length}개 발견)`);
                break;
              } else {
                self.log(`   ⚠️ 시도 ${attempt + 1}: 이미지가 DOM에 나타나지 않았습니다. 재시도...`);
              }
            }
          } catch (insertError) {
            self.log(`   ⚠️ 시도 ${attempt + 1} 실패: ${(insertError as Error).message}`);
          }

          if (attempt < 4) {
            await self.delay(self.DELAYS.LONG);
          }
        }

        if (!uploadSucceeded) {
          self.log(`   ❌ Base64 Data URL 삽입 실패 (5회 시도)`);
        }
      }

      // Base64 삽입이 실패한 경우에만 파일 업로드 시도 (네이버 보안 때문에 비추천)
      if (!uploadSucceeded && !isUrl && !imageDataUrl.startsWith('data:')) {
        // 🎯 방법 2: 이미지 버튼 클릭 + 파일 선택 대화상자 사용
        self.log(`   🔄 이미지 삽입 버튼 클릭 → 파일 선택 대화상자 사용...`);

        // 파일 존재 확인
        const fs = await import('fs/promises');
        try {
          await fs.access(image.filePath);
          const stats = await fs.stat(image.filePath);
          self.log(`   📁 파일 확인 완료: ${image.filePath}`);
          self.log(`   📏 파일 크기: ${(stats.size / 1024).toFixed(2)} KB`);
        } catch (fileCheckError) {
          self.log(`   ❌ 파일 접근 실패: ${(fileCheckError as Error).message}`);
          self.log(`   💡 파일 경로를 확인해주세요: ${image.filePath}`);
        }

        try {
          // 이미지 버튼 찾기
          const imageButton = await frame.$('button[data-name="image"], button.se-image-toolbar-button').catch(() => null);

          if (imageButton) {
            self.log(`   ✅ 이미지 삽입 버튼 발견`);

            // 파일 선택 대화상자 대기 + 버튼 클릭
            const [fileChooser] = await Promise.all([
              page.waitForFileChooser({ timeout: 10000 }), // 10초 대기
              imageButton.click()
            ]);

            // ✅ 이미지 버튼 클릭 후 즉시 ESC 키로 MYBOX 팝업 차단
            await page.keyboard.press('Escape');
            await self.delay(100);

            self.log(`   ✅ 파일 선택 대화상자 열림 (MYBOX 팝업 차단 완료)`);

            // 파일 선택 (절대 경로 사용, 쿼리 파라미터 제거)
            const pathModule = await import('path');
            let absolutePath = pathModule.isAbsolute(image.filePath)
              ? image.filePath
              : pathModule.resolve(image.filePath);

            // ✅ 파일 경로에서 쿼리 파라미터 제거 (파일명에 &type=a340 같은 파라미터가 포함되지 않도록)
            if (absolutePath.includes('&') || absolutePath.includes('?')) {
              const pathParts = absolutePath.split(pathModule.sep);
              const fileName = pathParts[pathParts.length - 1];
              const cleanFileName = fileName.split('?')[0].split('&')[0].split('#')[0];
              if (fileName !== cleanFileName) {
                pathParts[pathParts.length - 1] = cleanFileName;
                absolutePath = pathParts.join(pathModule.sep);
                self.log(`   🔧 파일명 정리: "${fileName}" → "${cleanFileName}"`);
              }
            }

            await fileChooser.accept([absolutePath]);
            self.log(`   ✅ 파일 선택 완료: ${absolutePath}`);

            // 파일 전송 대화상자의 "확인" 버튼 대기 및 클릭
            await self.delay(self.DELAYS.LONG); // 대화상자가 나타날 시간

            // ✅ 파일 전송 오류 다이얼로그 감지 및 처리
            try {
              // 오류 다이얼로그가 나타나는지 확인 (3초 대기)
              const errorDialog = await frame.waitForSelector(
                'text="파일 전송 오류", text="파일 형식 오류", [class*="error"], [class*="오류"]',
                { timeout: 3000 }
              ).catch(() => null);

              if (errorDialog) {
                self.log(`   ⚠️ 파일 전송 오류 다이얼로그 감지됨`);

                // 오류 다이얼로그의 "확인" 버튼 찾기 및 클릭
                const confirmButtons = await frame.$$('button').catch(() => []);
                for (const btn of confirmButtons) {
                  const text = await btn.evaluate((el: Element) => el.textContent?.trim() || '').catch(() => '');
                  if (text === '확인' || text === 'OK') {
                    await btn.click();
                    self.log(`   ✅ 오류 다이얼로그 확인 버튼 클릭 완료`);
                    await self.delay(500);
                    break;
                  }
                }

                // 오류 발생 시 이 이미지는 건너뛰고 다음 이미지로 진행
                self.log(`   ⚠️ 파일 형식 오류로 인해 이 이미지를 건너뜁니다: ${image.heading}`);
                continue;
              }
            } catch (error) {
              // 오류 다이얼로그가 없으면 정상 진행
            }

            // "확인" 버튼 찾기 및 클릭 (여러 방식 시도) - 정상적인 파일 전송 확인 버튼
            const confirmButton = await frame.$('button:has-text("확인"), button:has-text("OK"), button[class*="confirm"], button[type="submit"]').catch(() => null);
            if (confirmButton) {
              await confirmButton.click();
              self.log(`   ✅ 파일 전송 확인 버튼 클릭 완료`);
            } else {
              // 텍스트로 버튼 찾기
              const buttons = await frame.$$('button').catch(() => []);
              for (const btn of buttons) {
                const text = await btn.evaluate((el: Element) => el.textContent?.trim() || '').catch(() => '');
                if (text === '확인' || text === 'OK') {
                  await btn.click();
                  self.log(`   ✅ 파일 전송 확인 버튼 클릭 완료`);
                  break;
                }
              }
            }

            self.log(`   ⏳ 네이버가 이미지를 처리하는 중...`);

            // 네이버가 파일을 업로드하고 처리할 시간 대기 (시간 증가)
            await self.delay(5000); // 3초 → 5초

            // DOM에서 이미지 확인
            const uploadCheck = await frame.$$('img').catch(() => []);
            self.log(`   🔍 [즉시 확인] DOM에서 이미지 수: ${uploadCheck.length}개`);

            if (uploadCheck.length > 0) {
              uploadSucceeded = true;
              self.log(`   ✅ 이미지 버튼 클릭 방식 성공! (이미지 ${uploadCheck.length}개 발견)`);
            } else {
              self.log(`   ⚠️ 아직 이미지가 DOM에 나타나지 않았습니다. 추가 대기...`);
              await self.delay(5000); // 추가 5초 대기

              const recheckImages = await frame.$$('img').catch(() => []);
              self.log(`   🔍 [재확인] DOM에서 이미지 수: ${recheckImages.length}개`);

              if (recheckImages.length > 0) {
                uploadSucceeded = true;
                self.log(`   ✅ 이미지 버튼 클릭 방식 성공! (이미지 ${recheckImages.length}개 발견)`);
              } else {
                self.log(`   ❌ 10초 대기 후에도 이미지가 DOM에 나타나지 않았습니다`);
              }
            }
          } else {
            throw new Error('이미지 삽입 버튼을 찾을 수 없습니다');
          }
        } catch (buttonError) {
          self.log(`   ❌ 이미지 버튼 클릭 방식 실패: ${(buttonError as Error).message}`);
          self.log(`   💡 기존 방식(파일 input)으로 시도합니다...`);
        }
      } // if (!uploadSucceeded && !isUrl) 닫기 - 로컬 파일 처리

      // 버튼 클릭 방식이 실패한 경우에만 기존 로직 실행 (로컬 파일인 경우에만)
      if (!uploadSucceeded && !isUrl) {
        // 네이버 이미지 라이브러리 패널이 열려있으면 즉시 닫기 (여러 번 시도)
        for (let attempt = 0; attempt < 3; attempt++) {
          const libraryPanel = await frame.$('.se-image-library, .se-image-selector, [class*="image-library"], [class*="image-selector"], [class*="인기"], [id*="image"], [id*="library"], [class*="se-image-panel"], [class*="se-image-popup"]').catch(() => null);
          if (libraryPanel) {
            const closeButton = await libraryPanel.$('button[aria-label*="닫기"], button[aria-label*="close"], .close-button, [class*="close"], button:has-text("X"), button:has-text("×"), [aria-label*="닫기"]').catch(() => null);
            if (closeButton) {
              await closeButton.click();
              await self.delay(self.DELAYS.MEDIUM);
              self.log(`   ✅ 네이버 이미지 라이브러리 패널 닫기 완료 (시도 ${attempt + 1})`);
            } else {
              // X 버튼을 찾지 못하면 ESC 키로 닫기 시도
              await page.keyboard.press('Escape');
              await self.delay(self.DELAYS.MEDIUM);
              self.log(`   ✅ ESC 키로 네이버 이미지 라이브러리 패널 닫기 시도 (시도 ${attempt + 1})`);
            }
          } else {
            break; // 패널이 없으면 종료
          }
        }

        // 네이버 이미지 업로드 버튼 클릭 방지 (절대 클릭하지 않음)
        // 버튼 클릭 없이 바로 파일 input 찾기 (네이버 이미지 라이브러리 패널이 열리지 않도록)
        self.log('   🔄 앱에서 생성한 이미지를 직접 업로드합니다 (네이버 이미지 라이브러리 사용 안 함)...');

        // 방법 1: 페이지와 프레임에서 파일 input 찾기 (가장 안정적)
        // 네이버 이미지 라이브러리와 관련 없는 파일 input만 찾기
        self.log('   🔍 파일 input을 찾는 중... (네이버 라이브러리 버튼은 절대 클릭하지 않음)');

        const pageFileInputs = await page.$$('input[type="file"]').catch(() => []);
        const frameFileInputs = await frame.$$('input[type="file"]').catch(() => []);
        const allFileInputs = [...pageFileInputs, ...frameFileInputs];

        if (allFileInputs.length > 0) {
          self.log(`   ✅ 파일 input ${allFileInputs.length}개 발견`);
          for (const input of allFileInputs) {
            try {
              // 네이버 이미지 라이브러리 패널 내부의 input이 아닌지 확인
              const isInLibraryPanel = await input.evaluate((el: Element) => {
                let current = el.parentElement;
                while (current) {
                  const className = current.className || '';
                  const id = current.id || '';
                  if (className.includes('image-library') ||
                    className.includes('image-selector') ||
                    className.includes('인기') ||
                    id.includes('image') ||
                    id.includes('library')) {
                    return true;
                  }
                  current = current.parentElement;
                }
                return false;
              }).catch(() => false);

              if (isInLibraryPanel) {
                self.log(`   ⚠️ 네이버 이미지 라이브러리 패널 내부의 input은 건너뜁니다.`);
                continue;
              }

              // input이 보이는지 확인 (보이지 않아도 업로드는 가능)
              const isVisible = await input.isIntersectingViewport().catch(() => true);

              // input을 보이게 만들기 (필요한 경우)
              if (!isVisible) {
                await input.evaluate((el: Element) => {
                  const inputEl = el as HTMLInputElement;
                  inputEl.style.display = 'block';
                  inputEl.style.visibility = 'visible';
                  inputEl.style.opacity = '1';
                  inputEl.style.position = 'absolute';
                  inputEl.style.left = '0';
                  inputEl.style.top = '0';
                  inputEl.style.width = '1px';
                  inputEl.style.height = '1px';
                });
                await self.delay(100);
              }

              // 파일 업로드 전 최종 확인
              const fs = await import('fs/promises');
              const pathModule = await import('path');
              try {
                // ✅ 파일 경로에서 쿼리 파라미터 제거 (파일명에 &type=a340 같은 파라미터가 포함되지 않도록)
                let cleanFilePath = image.filePath;
                if (cleanFilePath.includes('&') || cleanFilePath.includes('?')) {
                  // URL이 아닌 로컬 파일 경로인 경우에도 쿼리 파라미터가 포함될 수 있음
                  const pathParts = cleanFilePath.split(pathModule.sep);
                  const fileName = pathParts[pathParts.length - 1];
                  const cleanFileName = fileName.split('?')[0].split('&')[0].split('#')[0];
                  if (fileName !== cleanFileName) {
                    pathParts[pathParts.length - 1] = cleanFileName;
                    cleanFilePath = pathParts.join(pathModule.sep);
                    self.log(`   🔧 파일명 정리: "${fileName}" → "${cleanFileName}"`);
                  }
                }

                await fs.access(cleanFilePath);
                const stats = await fs.stat(cleanFilePath);
                self.log(`   📤 앱에서 생성한 이미지 파일 업로드 중...`);
                self.log(`   📁 파일 경로: ${cleanFilePath}`);
                self.log(`   📏 파일 크기: ${(stats.size / 1024).toFixed(2)} KB`);

                // Puppeteer의 uploadFile() 사용 (로컬 파일 경로 필요)
                await input.uploadFile(cleanFilePath);
                self.log(`   ✅ 파일 input에 파일 설정 완료`);
                await self.delay(2000); // 업로드 진행 대기 (시간 증가)

                // ✅ 파일 전송 오류 다이얼로그 감지 및 처리
                try {
                  // 오류 다이얼로그가 나타나는지 확인 (3초 대기)
                  const errorDialog = await frame.waitForSelector(
                    'text="파일 전송 오류", text="파일 형식 오류", [class*="error"], [class*="오류"]',
                    { timeout: 3000 }
                  ).catch(() => null);

                  if (errorDialog) {
                    self.log(`   ⚠️ 파일 전송 오류 다이얼로그 감지됨`);

                    // 오류 다이얼로그의 "확인" 버튼 찾기 및 클릭
                    const confirmButtons = await frame.$$('button').catch(() => []);
                    for (const btn of confirmButtons) {
                      const text = await btn.evaluate((el: Element) => el.textContent?.trim() || '').catch(() => '');
                      if (text === '확인' || text === 'OK') {
                        await btn.click();
                        self.log(`   ✅ 오류 다이얼로그 확인 버튼 클릭 완료`);
                        await self.delay(500);
                        break;
                      }
                    }

                    // 오류 발생 시 이 이미지는 건너뛰고 다음 이미지로 진행
                    self.log(`   ⚠️ 파일 형식 오류로 인해 이 이미지를 건너뜁니다: ${image.heading}`);
                    continue;
                  }
                } catch (error) {
                  // 오류 다이얼로그가 없으면 정상 진행
                }

                // 이미지가 DOM에 나타날 때까지 대기
                try {
                  await frame.waitForSelector('img[src*="postfiles"], img[src*="blogfiles"], img.se-image-resource', {
                    visible: true,
                    timeout: 10000
                  });
                  uploadSucceeded = true;
                  self.log(`   ✅ 이미지가 DOM에 나타남 - 업로드 성공`);
                } catch {
                  self.log(`   ⚠️ 이미지 DOM 대기 타임아웃 (계속 진행)`);
                  // 타임아웃이어도 업로드는 진행 중일 수 있음
                }
              } catch (fileError) {
                self.log(`   ❌ 파일 접근 실패: ${(fileError as Error).message}`);
                throw fileError;
              }

              // change 이벤트 트리거 (일부 에디터에서 필요)
              await input.evaluate((el: Element) => {
                const inputEl = el as HTMLInputElement;
                const event = new Event('change', { bubbles: true });
                inputEl.dispatchEvent(event);
              });
              await self.delay(self.DELAYS.MEDIUM);

              // 네이버 라이브러리 패널이 다시 열렸는지 확인하고 닫기
              const libraryPanelAfter = await frame.$('.se-image-library, .se-image-selector, [class*="image-library"], [class*="image-selector"], [class*="인기"]').catch(() => null);
              if (libraryPanelAfter) {
                await page.keyboard.press('Escape');
                await self.delay(self.DELAYS.MEDIUM);
                self.log(`   ✅ 업로드 후 열린 네이버 라이브러리 패널 닫기 완료`);
              }

              break;
            } catch (error) {
              self.log(`   ⚠️ 파일 input 업로드 실패: ${(error as Error).message}`);
              // continue to next input
            }
          }
        }

        // 방법 2: 파일 input을 찾지 못한 경우 JavaScript로 생성하여 업로드
        if (!uploadSucceeded) {
          self.log('   🔄 파일 input을 찾지 못해 JavaScript로 생성하여 업로드 시도...');
          self.log('   ⚠️ 네이버 이미지 라이브러리는 절대 사용하지 않습니다.');
          try {
            // 본문 영역 또는 에디터 컨테이너 찾기
            const contentElement = await frame.$('.se-section-text, .se-component, .se-module-text, .se-main-container').catch(() => null);
            if (contentElement) {
              // JavaScript로 파일 input 생성 및 업로드
              const inputHandle = await contentElement.evaluateHandle((el: any) => {
                // 기존 파일 input이 있는지 확인 (부모 요소까지 검색)
                // 단, 네이버 이미지 라이브러리 패널 내부의 input은 제외
                let existingInput: HTMLInputElement | null = el.querySelector('input[type="file"]') as HTMLInputElement | null;
                if (existingInput) {
                  // 네이버 라이브러리 패널 내부인지 확인
                  let current = existingInput.parentElement;
                  let isInLibrary = false;
                  while (current) {
                    const className = current.className || '';
                    const id = current.id || '';
                    if (className.includes('image-library') ||
                      className.includes('image-selector') ||
                      className.includes('인기') ||
                      id.includes('image') ||
                      id.includes('library')) {
                      isInLibrary = true;
                      break;
                    }
                    current = current.parentElement;
                  }
                  if (isInLibrary) {
                    existingInput = null; // 라이브러리 내부 input은 사용하지 않음
                  }
                }

                if (!existingInput) {
                  // document.body에서도 찾기 (라이브러리 패널 외부만)
                  const allInputs = document.body.querySelectorAll('input[type="file"]');
                  for (const inp of Array.from(allInputs)) {
                    let current = inp.parentElement;
                    let isInLibrary = false;
                    while (current) {
                      const className = current.className || '';
                      const id = current.id || '';
                      if (className.includes('image-library') ||
                        className.includes('image-selector') ||
                        className.includes('인기') ||
                        id.includes('image') ||
                        id.includes('library')) {
                        isInLibrary = true;
                        break;
                      }
                      current = current.parentElement;
                    }
                    if (!isInLibrary) {
                      existingInput = inp as HTMLInputElement;
                      break;
                    }
                  }
                }

                if (!existingInput) {
                  // 새로 생성 (네이버 라이브러리와 완전히 분리)
                  existingInput = document.createElement('input');
                  existingInput.type = 'file';
                  existingInput.accept = 'image/*';
                  existingInput.multiple = false;
                  existingInput.style.cssText = 'position: absolute; left: -9999px; opacity: 0; width: 1px; height: 1px; pointer-events: none;';

                  // 에디터 컨테이너에 추가 (네이버 라이브러리 패널 외부)
                  const container = document.querySelector('.se-main-container') || document.body;
                  container.appendChild(existingInput);
                }

                return existingInput;
              });

              if (inputHandle) {
                const input = inputHandle.asElement();
                if (input) {
                  // 타입 가드를 사용하여 안전하게 변환
                  const inputElement = inputHandle as any;

                  // 파일 업로드 전 확인
                  const fs = await import('fs/promises');
                  try {
                    await fs.access(image.filePath);
                    const stats = await fs.stat(image.filePath);
                    self.log(`   📤 앱에서 생성한 이미지 파일 업로드 중...`);
                    self.log(`   📁 파일 경로: ${image.filePath}`);
                    self.log(`   📏 파일 크기: ${(stats.size / 1024).toFixed(2)} KB`);

                    // Puppeteer의 uploadFile() 사용 (로컬 파일 경로 필요)
                    await inputElement.uploadFile(image.filePath);
                    self.log(`   ✅ 파일 input에 파일 설정 완료`);
                    await self.delay(2000);

                    // change 이벤트 트리거
                    await inputElement.evaluate((el: Element) => {
                      const inputEl = el as HTMLInputElement;
                      const changeEvent = new Event('change', { bubbles: true, cancelable: true });
                      inputEl.dispatchEvent(changeEvent);

                      // input 이벤트도 트리거 (일부 에디터에서 필요)
                      const inputEvent = new Event('input', { bubbles: true, cancelable: true });
                      inputEl.dispatchEvent(inputEvent);
                    });

                    await self.delay(1000);

                    // 이미지가 DOM에 나타날 때까지 대기
                    try {
                      await frame.waitForSelector('img[src*="postfiles"], img[src*="blogfiles"], img.se-image-resource', {
                        visible: true,
                        timeout: 10000
                      });
                      uploadSucceeded = true;
                      self.log(`   ✅ 이미지가 DOM에 나타남 - 업로드 성공`);
                    } catch {
                      self.log(`   ⚠️ 이미지 DOM 대기 타임아웃 (계속 진행)`);
                    }
                  } catch (fileError) {
                    self.log(`   ❌ 파일 접근 실패: ${(fileError as Error).message}`);
                    throw fileError;
                  }

                  // 네이버 라이브러리 패널이 열렸는지 확인하고 닫기
                  const libraryPanelAfter = await frame.$('.se-image-library, .se-image-selector, [class*="image-library"], [class*="image-selector"], [class*="인기"]').catch(() => null);
                  if (libraryPanelAfter) {
                    await page.keyboard.press('Escape');
                    await self.delay(self.DELAYS.MEDIUM);
                    self.log(`   ✅ 업로드 후 열린 네이버 라이브러리 패널 닫기 완료`);
                  }
                }
              }
            }
          } catch (jsError) {
            self.log(`   ⚠️ JavaScript 파일 input 생성 실패: ${(jsError as Error).message}`);
          }
        }

        // 여전히 실패한 경우 드래그 앤 드롭 시도 (로컬 파일인 경우에만)
        if (!uploadSucceeded && !isUrl) {
          self.log('   🔄 드래그 앤 드롭으로 이미지 삽입 시도...');
          try {
            const contentElement = await frame.$('.se-section-text, .se-component, .se-text-paragraph').catch(() => null);
            if (contentElement) {
              // 파일을 읽어서 DataTransfer로 드래그 앤 드롭 시뮬레이션
              const fs = await import('fs/promises');
              const fileBuffer = await fs.readFile(image.filePath);
              // URL에서 파일명 추출 (쿼리 파라미터 제거)
              const urlWithoutQuery = image.filePath.split('?')[0].split('#')[0];
              const fileName = urlWithoutQuery.split(/[/\\]/).pop() || 'image.png';

              // 파일 타입 결정
              const ext = fileName.split('.').pop()?.toLowerCase() || 'png';
              // 유효한 확장자만 허용
              const validExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'png';
              const mimeType = validExt === 'jpg' || validExt === 'jpeg' ? 'image/jpeg' :
                validExt === 'gif' ? 'image/gif' :
                  validExt === 'webp' ? 'image/webp' : 'image/png';

              self.log(`   📁 파일: ${fileName} (${mimeType}, ${(fileBuffer.length / 1024).toFixed(2)} KB)`);

              await contentElement.evaluate((el: any, buffer: any, name: any, mime: any) => {
                const file = new File([new Uint8Array(buffer)], name, { type: mime });
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);

                // dragenter 이벤트
                const dragEnterEvent = new DragEvent('dragenter', {
                  bubbles: true,
                  cancelable: true,
                  dataTransfer: dataTransfer,
                });
                el.dispatchEvent(dragEnterEvent);

                // dragover 이벤트
                const dragOverEvent = new DragEvent('dragover', {
                  bubbles: true,
                  cancelable: true,
                  dataTransfer: dataTransfer,
                });
                el.dispatchEvent(dragOverEvent);

                // drop 이벤트
                const dropEvent = new DragEvent('drop', {
                  bubbles: true,
                  cancelable: true,
                  dataTransfer: dataTransfer,
                });
                el.dispatchEvent(dropEvent);
              }, Array.from(fileBuffer), fileName, mimeType);

              await self.delay(1000); // 드래그 앤 드롭 처리 대기 시간 증가
              self.log(`   ✅ 드래그 앤 드롭 이벤트 발생 완료 (DOM 확인 필요)`);
              // uploadSucceeded = true;  // DOM에서 확인 후에만 true로 설정
            } else {
              self.log(`   ⚠️ 드래그 앤 드롭 대상 요소를 찾을 수 없습니다`);
            }
          } catch (dropError) {
            self.log(`   ⚠️ 드래그 앤 드롭 실패: ${(dropError as Error).message}`);
          }
        }

        // 업로드 성공 여부와 관계없이 DOM에서 이미지 확인
        if (!uploadSucceeded) {
          self.log(`   ⏳ 네이버 서버 이미지 처리 대기 중... (최대 15초)`);

          // 최대 15초 동안 이미지가 나타날 때까지 대기
          let imageFound = false;
          for (let waitAttempt = 0; waitAttempt < 15; waitAttempt++) {
            await self.delay(1000);

            const uploadedImages = await frame.$$('img.se-image-resource, .se-module-image img, img[src*="naver"], img[src*="postfiles"], img[src*="blogfiles"], img[src*="blob:"]').catch(() => []);

            // UI 이미지 제외 (실제 콘텐츠 이미지만)
            const contentImages = await frame.evaluate(() => {
              const imgs = Array.from(document.querySelectorAll('img'));
              return imgs.filter(img => {
                const src = img.getAttribute('src') || '';
                return (src.includes('postfiles') || src.includes('blogfiles') || src.includes('blob:')) &&
                  !src.includes('static.blog.naver.net') &&
                  !src.includes('icon') &&
                  !src.includes('btn');
              });
            }).catch(() => []);

            if (contentImages.length > 0) {
              uploadSucceeded = true;
              imageFound = true;
              self.log(`   ✅ 이미지가 DOM에 나타남 (${waitAttempt + 1}초 후, ${contentImages.length}개 발견)`);
              break;
            }
          }

          if (!imageFound) {
            self.log(`   ⚠️ 15초 대기 후에도 이미지가 DOM에 나타나지 않았습니다.`);
          }
        }

        // 최종 확인
        const allImages = await frame.$$('img').catch(() => []);
        const contentImages = await frame.evaluate(() => {
          const imgs = Array.from(document.querySelectorAll('img'));
          return imgs.filter(img => {
            const src = img.getAttribute('src') || '';
            return (src.includes('postfiles') || src.includes('blogfiles') || src.includes('blob:')) &&
              !src.includes('static.blog.naver.net') &&
              !src.includes('icon') &&
              !src.includes('btn');
          });
        }).catch(() => []);

        self.log(`   🔍 DOM 확인: 전체 이미지 ${allImages.length}개, 콘텐츠 이미지 ${contentImages.length}개`);

        if (uploadSucceeded || contentImages.length > 0) {
          self.log(`   ✅ 이미지 업로드 성공 확인`);
        } else {
          // 보안: 파일 경로 마스킹
          const maskedPath = image.filePath.replace(/^C:\\Users\\[^\\]+/, '~').replace(/^\/Users\/[^/]+/, '~');
          self.log(`   ⚠️ 이미지 업로드 실패 가능성: ${maskedPath}`);
          self.log(`   💡 네이버 블로그 에디터의 UI가 변경되었을 수 있습니다.`);
          self.log(`   💡 브라우저에서 수동으로 확인해주세요.`);
        }
      } // if (!uploadSucceeded) 닫기

      // ✅ alt 태그에 출처 정보 자동 추가
      const altWithSource = generateAltWithSource(self, image);
      if (altWithSource) {
        await frame
          .evaluate((altText: any) => {
            const editor = document.querySelector('.se-main-container');
            if (!editor) return;
            const imgs = editor.querySelectorAll('img');
            const target = imgs[imgs.length - 1] as HTMLImageElement | undefined;
            if (target) {
              target.alt = altText;
            }
          }, altWithSource)
          .catch(() => undefined);
      }

      if (plan?.caption) {
        await applyCaption(self, plan.caption).catch(() => undefined);
      }

      self.log(`✅ 이미지 업로드 성공 (${image.filePath})`);
    } catch (error) {
      self.log(`⚠️ 이미지 삽입 중 오류: ${(error as Error).message}`);
    }
  }
}

