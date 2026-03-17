/**
 * Fix editorHelpers.ts: Replace lines 42-58 with complete smartTypeWithAutoHighlight
 * Using character-level approach to handle mixed line endings
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src', 'automation', 'editorHelpers.ts');
let content = fs.readFileSync(file, 'utf-8');

// Normalize all line endings to \n first
content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

// Find the marker and replace the broken section
const startMarker = '// ── Local utility: smartTypeWithAutoHighlight ──';
const endMarker = "import { extractProsConsWithGemini } from '../image/geminiTableExtractor.js';";

const startPos = content.indexOf(startMarker);
const endPos = content.indexOf(endMarker);

if (startPos < 0 || endPos < 0) {
    console.error('Markers not found!', startPos, endPos);
    process.exit(1);
}

const endOfEndMarker = endPos + endMarker.length;
console.log(`Replacing chars ${startPos} to ${endOfEndMarker}`);

const replacement = `// ── Local utility: smartTypeWithAutoHighlight ──
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

    const escapedKeywords = keywords.map(k => k.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'));
    const regex = new RegExp(\`(\${escapedKeywords.join('|')})\`, 'g');
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
        console.log(\`✨ [SmartType] 키워드 강조 완료: "\${part}"\`);
      }
    }

    console.log(\`✅ [SmartType] 완료: \${highlightCount}개 키워드 강조됨\`);
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
import { extractProsConsWithGemini } from '../image/geminiTableExtractor.js';`;

content = content.substring(0, startPos) + replacement + content.substring(endOfEndMarker);

fs.writeFileSync(file, content, 'utf-8');
console.log('Done. New line count:', content.split('\n').length);
