/**
 * Clean re-extraction of image methods from naverBlogAutomation.ts
 * Creates imageHelpers.ts from scratch with correct signatures
 */
const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, 'src', 'naverBlogAutomation.ts');
const destFile = path.join(__dirname, 'src', 'automation', 'imageHelpers.ts');
const srcLines = fs.readFileSync(srcFile, 'utf-8').split('\n');

// Methods to extract: name, startLine (1-indexed), endLine (1-indexed), newSignature
const methods = [
    {
        name: 'insertImageViaUploadButton',
        start: 9072, end: 9341,
        sig: 'export async function insertImageViaUploadButton(self: any, filePath: string): Promise<void>'
    },
    {
        name: 'insertBase64ImageAtCursor',
        start: 9343, end: 9643,
        sig: 'export async function insertBase64ImageAtCursor(self: any, imageDataUrl: string): Promise<boolean>'
    },
    {
        name: 'insertImageViaBase64',
        start: 9645, end: 9767,
        sig: 'export async function insertImageViaBase64(self: any, imagePath: string, frame?: any, page?: any): Promise<void>'
    },
    {
        name: 'insertSingleImage',
        start: 9860, end: 9986,
        sig: 'export async function insertSingleImage(self: any, image: any): Promise<void>'
    },
    {
        name: 'insertImagesAtHeadings',
        start: 9988, end: 10097,
        sig: 'export async function insertImagesAtHeadings(self: any, images: any[], placements: any[]): Promise<void>'
    },
    {
        name: 'insertImagesAtCurrentCursor',
        start: 10414, end: 10538,
        sig: 'export async function insertImagesAtCurrentCursor(self: any, images: any[], linkUrl?: string): Promise<void>'
    },
    {
        name: 'setImageSizeAndAttachLink',
        start: 10540, end: 10754,
        sig: 'export async function setImageSizeAndAttachLink(self: any, linkUrl?: string): Promise<void>'
    },
    {
        name: 'attachLinkToLastImage',
        start: 10756, end: 11151,
        sig: 'export async function attachLinkToLastImage(self: any, linkUrl: string): Promise<void>'
    },
    {
        name: 'insertImages',
        start: 11153, end: 12416,
        sig: 'export async function insertImages(self: any, images: any[], plans: any[]): Promise<void>'
    },
];

// Build the header (small functions we wrote manually before)
let output = `/**
 * imageHelpers.ts
 * naverBlogAutomation.ts에서 추출한 이미지 삽입 관련 헬퍼 함수들
 * 모든 함수는 self: any 파라미터를 통해 NaverBlogAutomation 인스턴스에 접근
 */

import { safeKeyboardType } from './typingUtils.js';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

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
    try { sourceInfo.push(new URL(sourceUrl).hostname); } catch {}
  }
  if (sourceInfo.length > 0) parts.push(\`출처: \${sourceInfo.join(' - ')}\`);
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
  try {
    self.log('   🔄 이미지 크기를 문서 너비로 설정 중...');
    await frame.evaluate(() => {
      const imgs = document.querySelectorAll('img.se-image-resource, img[data-se-image-resource="true"], .se-module-image img, .se-section-image img');
      imgs.forEach((img) => {
        const t = img as HTMLImageElement;
        t.style.width = '100%'; t.style.maxWidth = '100%'; t.style.height = 'auto'; t.style.display = 'block';
        const c = t.closest('.se-image-resource-container, .se-module-image, .se-section-image') as HTMLElement;
        if (c) { c.style.width = '100%'; c.style.maxWidth = '100%'; }
        const f = t.closest('figure') as HTMLElement;
        if (f) { f.style.width = '100%'; f.style.maxWidth = '100%'; }
      });
    });
    self.log('   ✅ 이미지 크기 설정 완료');
    try { const b = await frame.$('.se-component-content, .se-section-text'); if (b) await b.click(); } catch {}
  } catch (error) { self.log(\`   ⚠️ 이미지 크기 설정 실패: \${(error as Error).message}\`); }
}

// ── verifyImagePlacement ──
export async function verifyImagePlacement(self: any, expectedCount: number): Promise<boolean> {
  try {
    const frame = await self.getAttachedFrame();
    const actualCount = await frame.evaluate(() => {
      let c = 0;
      document.querySelectorAll('img').forEach((img) => {
        const src = img.getAttribute('src') || '';
        if (src.includes('static.blog.naver.net') || src.includes('icon') || src.includes('btn') || src.includes('editor') || img.closest('.se-toolbar') || img.closest('.se-header')) return;
        if (src.includes('postfiles') || src.includes('blogfiles') || src.includes('blob:') || src.startsWith('data:image') || img.classList.contains('se-image-resource') || img.hasAttribute('data-se-image-resource')) c++;
      });
      return c;
    });
    self.log(\`   🔍 이미지 배치 검증: 예상 \${expectedCount}개, 실제 \${actualCount}개\`);
    if (actualCount >= expectedCount) { self.log('   ✅ 이미지 배치 검증 성공!'); return true; }
    self.log(\`   ⚠️ 이미지 배치 검증 실패: \${expectedCount - actualCount}개 부족\`); return false;
  } catch (error) { self.log(\`   ❌ 이미지 배치 검증 오류: \${(error as Error).message}\`); return false; }
}

`;

// Now extract each large method
for (const m of methods) {
    console.log('Extracting', m.name, 'lines', m.start, '-', m.end);

    // Get all lines for this method (0-indexed)
    const methodBodyLines = srcLines.slice(m.start - 1, m.end);

    // Skip the original signature line(s) - find first line with "{"
    let bodyStartIdx = 0;
    for (let i = 0; i < methodBodyLines.length; i++) {
        if (methodBodyLines[i].includes('{')) {
            bodyStartIdx = i + 1; // body starts after the { line
            break;
        }
    }

    // Get the body (skip any JSDoc comments above the signature and the signature itself)
    // Find where the actual method signature starts (skip JSDoc)
    let sigStartIdx = 0;
    for (let i = 0; i < methodBodyLines.length; i++) {
        const trimmed = methodBodyLines[i].trim();
        if (trimmed.startsWith('private') || trimmed.startsWith('async') || trimmed.startsWith('public')) {
            sigStartIdx = i;
            break;
        }
        // Also check for the method name directly
        if (trimmed.includes(m.name + '(')) {
            sigStartIdx = i;
            break;
        }
    }

    // Find the opening brace line
    let openBraceIdx = sigStartIdx;
    for (let i = sigStartIdx; i < methodBodyLines.length; i++) {
        if (methodBodyLines[i].includes('{')) {
            openBraceIdx = i;
            break;
        }
    }

    // Get JSDoc (lines before sigStartIdx)
    const jsdocLines = methodBodyLines.slice(0, sigStartIdx);

    // Get body (lines after opening brace, excluding last closing brace)
    const bodyLines = methodBodyLines.slice(openBraceIdx + 1, methodBodyLines.length - 1);

    // Process body: this. -> self., remove 2-space class indent
    let body = bodyLines.map(line => {
        // Replace this. with self.
        let processed = line.replace(/this\./g, 'self.');
        // Remove 2-space class-level indentation
        if (processed.startsWith('    ')) {
            processed = processed.substring(2);
        } else if (processed.startsWith('  ')) {
            processed = processed.substring(2);
        }
        return processed;
    }).join('\n');

    // Fix internal cross-references to local functions
    body = body.replace(/await self\.setImageSizeToDocumentWidth\(\)/g, 'await setImageSizeToDocumentWidth(self)');
    body = body.replace(/await self\.applyCaption\(/g, 'await applyCaption(self, ');
    body = body.replace(/self\.generateAltWithSource\(/g, 'generateAltWithSource(self, ');

    // Build JSDoc comment
    const jsdoc = jsdocLines.map(l => {
        if (l.startsWith('  ')) return l.substring(2);
        return l;
    }).join('\n');

    output += `// ── ${m.name} ──\n`;
    if (jsdoc.trim()) output += jsdoc + '\n';
    output += m.sig + ' {\n';
    output += body + '\n';
    output += '}\n\n';
}

fs.writeFileSync(destFile, output, 'utf-8');
const finalLines = output.split('\n').length;
console.log('Done! imageHelpers.ts written with', finalLines, 'lines');

// Verify exported functions
const exportMatches = output.match(/export (async )?function \w+/g);
if (exportMatches) {
    console.log('\nExported functions:');
    exportMatches.forEach(m => console.log(' ', m));
}
