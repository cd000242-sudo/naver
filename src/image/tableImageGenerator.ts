/**
 * 테이블 이미지 생성기 (Refactored & Improved Design)
 * - 비평: 기존의 텍스트 자름 현상(...) 해결 및 디자인 고도화
 * - 개선: 가로폭 확장 (480px -> 640px), 줄바꿈 허용, 여백 확보
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as path from 'path';
import * as fs from 'fs/promises';
import { app } from 'electron';

puppeteer.use(StealthPlugin());

export interface TableRow {
  label: string;
  value: string;
}

export class TableImageGenerator {
  private browser: any = null;

  private async getBrowser() {
    if (this.browser && !this.browser.isConnected()) {
      console.log('[TableGenerator] 브라우저 연결 끊김 감지, 재시작합니다.');
      this.browser = null;
    }

    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--font-render-hinting=none'
        ]
      });
    }
    return this.browser;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private async renderHtml(html: string, prefix: string, outputDir?: string): Promise<string> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // ✅ 뷰포트 높이를 넉넉하게 주어 잘림 방지
      await page.setViewport({ width: 1000, height: 1200, deviceScaleFactor: 2 });
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.evaluate(async () => { await document.fonts.ready; });

      const element = await page.$('.card');
      if (!element) throw new Error('Card element not found');

      const saveDir = outputDir || path.join(app.getPath('userData'), 'images', 'tables');
      await fs.mkdir(saveDir, { recursive: true });

      const filename = `${prefix}_${Date.now()}.png`;
      const filepath = path.join(saveDir, filename);

      await element.screenshot({
        path: filepath,
        type: 'png',
        omitBackground: true
      });

      return filepath;
    } finally {
      await page.close();
    }
  }

  /**
   * 제품 스펙 표 생성 (디자인 개선됨)
   * ✅ [2026-01-18] 랜덤 색상 팔레트 적용
   */
  async generateSpecTable(productName: string, specs: TableRow[], outputDir?: string): Promise<string> {
    // ✅ [신규] 랜덤 색상 팔레트 - 매번 다른 색상으로 표 생성
    const colorPalettes = [
      { header: '#111827', accent: '#3b82f6', badge: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' } }, // 다크 그레이 + 블루
      { header: '#059669', accent: '#10b981', badge: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' } }, // 그린
      { header: '#7c3aed', accent: '#8b5cf6', badge: { bg: '#f3e8ff', text: '#6d28d9', border: '#c4b5fd' } }, // 퍼플
      { header: '#dc2626', accent: '#ef4444', badge: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' } }, // 레드
      { header: '#ea580c', accent: '#f97316', badge: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' } }, // 오렌지
      { header: '#0284c7', accent: '#0ea5e9', badge: { bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' } }, // 스카이블루
      { header: '#be185d', accent: '#ec4899', badge: { bg: '#fdf2f8', text: '#9d174d', border: '#fbcfe8' } }, // 핑크
      { header: '#4338ca', accent: '#6366f1', badge: { bg: '#eef2ff', text: '#3730a3', border: '#c7d2fe' } }, // 인디고
    ];
    const palette = colorPalettes[Math.floor(Math.random() * colorPalettes.length)];

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Noto Sans KR', sans-serif; 
            background: transparent; 
            padding: 20px; 
          }
          .card {
            background: #fff; 
            border-radius: 16px; 
            box-shadow: 0 8px 24px rgba(0,0,0,0.12); 
            overflow: hidden; 
            width: 640px; /* ✅ 가로폭 확장: 480px -> 640px */
          }
          .header {
            background: ${palette.header}; /* ✅ 랜덤 색상 적용 */
            padding: 28px; 
            color: white; 
            position: relative;
            text-align: center;
          }
          .header::after {
            content: ''; position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); 
            width: 60px; height: 4px; background: ${palette.accent}; border-radius: 2px;
          }
          .title { 
            font-size: 22px; font-weight: 700; margin-bottom: 6px; line-height: 1.3; 
            word-break: keep-all; /* 단어 단위 줄바꿈 */
            overflow-wrap: break-word;
            max-width: 100%;
          }
          .subtitle { font-size: 14px; opacity: 0.8; font-weight: 400; letter-spacing: 0.5px; }
          
          .content { padding: 10px 0; }
          .row {
            display: flex; 
            border-bottom: 1px solid #e5e7eb;
            min-height: 52px; /* 최소 높이 보장 */
          }
          .row:last-child { border-bottom: none; }
          
          .label {
            width: 140px; /* 라벨 영역 확보 */
            background: #f9fafb; 
            padding: 16px 20px;
            font-size: 15px; font-weight: 700; color: #4b5563;
            display: flex; align-items: center; /* 세로 중앙 정렬 */
            flex-shrink: 0; /* 라벨 줄어듦 방지 */
          }
          .value {
            flex: 1; 
            padding: 16px 20px; 
            font-size: 16px; color: #1f2937; font-weight: 500;
            display: flex; align-items: center;
            line-height: 1.5; /* ✅ 줄 간격 확보 */
            word-break: keep-all; /* ✅ 텍스트 잘림 방지 (자연스러운 줄바꿈) */
          }
          .badge {
            display: inline-block;
            background: ${palette.badge.bg}; color: ${palette.badge.text}; border: 1px solid ${palette.badge.border};
            padding: 4px 12px; border-radius: 6px; font-size: 14px; font-weight: 700;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <div class="title">${this.escapeHtml(productName)}</div>
            <div class="subtitle">PRODUCT SPECIFICATION</div>
          </div>
          <div class="content">
            ${specs.map((s, i) => `
              <div class="row">
                <div class="label">${this.escapeHtml(s.label)}</div>
                <div class="value">
                  ${i === 0
        ? `<span class="badge">${this.escapeHtml(s.value)}</span>`
        : this.escapeHtml(s.value)
      }
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </body>
      </html>
    `;
    return this.renderHtml(html, 'spec', outputDir);
  }

  /**
   * 장단점 비교 표 생성 (디자인 개선됨)
   * ✅ [2026-01-18] 랜덤 색상 + 랜덤 아이콘 + 랜덤 헤더로 중복 방지
   */
  async generateProsConsTable(productName: string, pros: string[], cons: string[], outputDir?: string): Promise<string> {
    // ✅ [신규] 랜덤 색상 팔레트 (헤더용)
    const headerPalettes = [
      '#111827', '#1e3a5f', '#1e40af', '#4338ca', '#6b21a8', '#7c2d12', '#14532d', '#0f172a'
    ];
    const headerColor = headerPalettes[Math.floor(Math.random() * headerPalettes.length)];

    // ✅ [신규] 랜덤 장점/단점 색상 조합
    const prosConsPalettes = [
      { pros: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0', icon: '#059669' }, cons: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca', icon: '#dc2626' } },
      { pros: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', icon: '#2563eb' }, cons: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', icon: '#ea580c' } },
      { pros: { bg: '#f0fdf4', text: '#15803d', border: '#86efac', icon: '#16a34a' }, cons: { bg: '#fdf2f8', text: '#be185d', border: '#fbcfe8', icon: '#db2777' } },
      { pros: { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc', icon: '#06b6d4' }, cons: { bg: '#faf5ff', text: '#7c3aed', border: '#c4b5fd', icon: '#8b5cf6' } },
    ];
    const prosConsPalette = prosConsPalettes[Math.floor(Math.random() * prosConsPalettes.length)];

    // ✅ [신규] 랜덤 아이콘 (중복 방지)
    const prosIcons = ['✔', '✓', '◉', '★', '●', '✅', '👍', '◆'];
    const consIcons = ['✖', '✕', '○', '☆', '○', '❌', '👎', '◇'];
    const prosIcon = prosIcons[Math.floor(Math.random() * prosIcons.length)];
    const consIcon = consIcons[Math.floor(Math.random() * consIcons.length)];

    // ✅ [신규] 랜덤 헤더 텍스트 (중복 방지)
    const prosHeaders = ['BEST (장점)', '👍 장점', '✨ 좋은 점', '💚 장점', 'PROS'];
    const consHeaders = ['WORST (단점)', '👎 단점', '💔 아쉬운 점', '❤️‍🩹 단점', 'CONS'];
    const prosHeader = prosHeaders[Math.floor(Math.random() * prosHeaders.length)];
    const consHeader = consHeaders[Math.floor(Math.random() * consHeaders.length)];

    // ✅ [신규] 랜덤 border-radius (중복 방지)
    const borderRadii = ['12px', '16px', '20px', '24px'];
    const borderRadius = borderRadii[Math.floor(Math.random() * borderRadii.length)];

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Noto Sans KR', sans-serif; background: transparent; padding: 20px; }
          .card {
            background: #fff; border-radius: ${borderRadius}; 
            box-shadow: 0 8px 24px rgba(0,0,0,0.12); overflow: hidden; 
            width: 700px;
          }
          .header {
            background: ${headerColor}; padding: 24px 30px; text-align: center; color: white;
          }
          .title { 
            font-size: 18px; 
            font-weight: 700; 
            word-wrap: break-word;
            overflow-wrap: break-word;
            line-height: 1.4;
            max-width: 100%;
          }
          
          .container { display: flex; }
          .col { flex: 1; display: flex; flex-direction: column; }
          
          /* 헤더 디자인 */
          .col-header {
            padding: 16px; font-size: 16px; font-weight: 800; text-align: center;
            letter-spacing: 0.5px;
          }
          .pros-header { background: ${prosConsPalette.pros.bg}; color: ${prosConsPalette.pros.text}; border-bottom: 2px solid ${prosConsPalette.pros.border}; }
          .cons-header { background: ${prosConsPalette.cons.bg}; color: ${prosConsPalette.cons.text}; border-bottom: 2px solid ${prosConsPalette.cons.border}; }
          
          /* 아이템 디자인 */
          .item {
            padding: 16px 20px; 
            font-size: 15px; 
            border-bottom: 1px solid #f3f4f6;
            display: flex; 
            gap: 12px; 
            line-height: 1.5;
            align-items: flex-start;
            height: 100%;
          }
          .col:first-child { border-right: 1px solid #e5e7eb; }
          
          .pros .item { background: #fff; color: #374151; }
          .cons .item { background: #fff; color: #374151; }
          
          .icon { 
            font-weight: bold; font-size: 16px; 
            margin-top: 2px;
          }
          .pros .icon { color: ${prosConsPalette.pros.icon}; }
          .cons .icon { color: ${prosConsPalette.cons.icon}; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <div class="title">${this.escapeHtml(productName)} 요약</div>
          </div>
          <div class="container">
            <div class="col pros">
              <div class="col-header pros-header">${prosHeader}</div>
              ${pros.map(p => `
                <div class="item">
                  <span class="icon">${prosIcon}</span> 
                  <span>${this.escapeHtml(p)}</span>
                </div>`).join('')}
            </div>
            <div class="col cons">
              <div class="col-header cons-header">${consHeader}</div>
              ${cons.map(c => `
                <div class="item">
                  <span class="icon">${consIcon}</span> 
                  <span>${this.escapeHtml(c)}</span>
                </div>`).join('')}
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
    return this.renderHtml(html, 'proscons', outputDir);
  }

  private escapeHtml(text: string): string {
    return (text || '')
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * 배너 이미지용 HTML 렌더링 (public 메서드)
   */
  async renderHtmlForBanner(html: string, prefix: string, outputDir?: string): Promise<string> {
    return this.renderHtml(html, prefix, outputDir);
  }
}

// ==========================================
// 2. 데이터 추출기 (Helper Functions)
// ==========================================

export function extractSpecsFromContent(content: string, productName: string): TableRow[] {
  const specs: TableRow[] = [];

  // ✅ 제품명은 그대로 사용 (너무 길면 CSS가 처리)
  specs.push({ label: '제품명', value: productName });

  // ✅ [개선] 더 엄격한 정규식 - 콜론(:) 또는 바로 뒤에 숫자/단위가 오는 경우만 캡처
  const patterns = [
    { label: '가격', regex: /(?:가격|판매가|정가)\s*[:：]\s*([\d,]+\s*원?)/, maxLen: 30 },
    { label: '용량/크기', regex: /(?:용량|중량|사이즈|크기|규격)\s*[:：]\s*(\d+[^\n]{0,30})/, maxLen: 40 },
    { label: '제조국', regex: /(?:원산지|제조국|생산국)\s*[:：]\s*([가-힣A-Za-z\s]{2,15})/, maxLen: 20 },
    { label: '주요소재', regex: /(?:소재|재질|주재질)\s*[:：]\s*([가-힣A-Za-z\s,]{2,30})/, maxLen: 35 },
    { label: '색상', regex: /(?:색상|컬러|색깔)\s*[:：]\s*([가-힣A-Za-z\s,]{2,20})/, maxLen: 25 },
  ];

  for (const p of patterns) {
    const match = content.match(p.regex);
    if (match) {
      let val = match[1].trim();

      // ✅ [핵심] 값이 너무 길거나, 문장처럼 보이면 제외
      const isSentence = val.includes('요') || val.includes('다') || val.includes('~') || val.includes('!');
      const tooLong = val.length > p.maxLen;

      if (!isSentence && !tooLong && val.length >= 2) {
        specs.push({ label: p.label, value: val });
      }
    }
  }

  return specs;
}

export function extractProsConsFromContent(content: string): { pros: string[], cons: string[] } {
  const pros: string[] = [];
  const cons: string[] = [];

  const prosMatch = content.matchAll(/(?:장점|좋은점|특징)[:\s]*([^\n]+)/g);
  for (const m of prosMatch) {
    const val = m[1].trim();
    // ✅ 길이 제한 완화 (50자 -> 80자)
    if (val.length > 3 && val.length < 80) pros.push(val);
  }

  const consMatch = content.matchAll(/(?:단점|아쉬운점)[:\s]*([^\n]+)/g);
  for (const m of consMatch) {
    const val = m[1].trim();
    if (val.length > 3 && val.length < 80) cons.push(val);
  }

  return {
    pros: pros.slice(0, 4),
    cons: cons.slice(0, 3)
  };
}

// ==========================================
// 3. 통합 실행 함수
// ==========================================

const generator = new TableImageGenerator();

export async function generateTableFromUrl(shoppingUrl: string, outputDir?: string) {
  try {
    const { crawlProductSpecs, productSpecToTableRows } = await import('../crawler/productSpecCrawler.js');

    console.log('[Table] 쇼핑몰 스펙 크롤링 시작:', shoppingUrl);
    const spec = await crawlProductSpecs(shoppingUrl);

    if (!spec) return { specTablePath: null, prosConsPath: null };

    const tableRows = productSpecToTableRows(spec);
    const specTablePath = await generator.generateSpecTable(spec.productName, tableRows, outputDir);

    console.log('[Table] 이미지 생성 완료:', specTablePath);

    return { specTablePath, prosConsPath: null, spec };
  } catch (e) {
    console.error('[Table] 생성 실패:', e);
    return { specTablePath: null, prosConsPath: null };
  }
}

export async function closeTableGenerator() {
  await generator.close();
  console.log('[TableGenerator] 리소스 정리 완료');
}

export async function generateProductSpecTableImage(
  productName: string,
  specs: TableRow[],
  outputDir?: string
): Promise<string> {
  return generator.generateSpecTable(productName, specs, outputDir);
}

export async function generateProsConsTableImage(
  productName: string,
  pros: string[],
  cons: string[],
  outputDir?: string
): Promise<string> {
  return generator.generateProsConsTable(productName, pros, cons, outputDir);
}

// ==========================================
// 4. CTA 배너 이미지 생성기 (쇼핑커넥트용)
// ==========================================

/**
 * CTA 배너 이미지 생성 (후킹 문구 + 제품명 포함)
 * @param hookMessage 후킹 문구 (예: "품절 임박! 지금 아니면 구매하기 어려워요.")
 * @param productName 제품명
 * @param outputDir 저장 경로 (옵션)
 */
// ✅ [100점 개선] 구매 전환 효과가 높은 후킹 문구 풀 (더 직관적으로 개선)
const CTA_HOOK_MESSAGES: string[] = [
  '[공식] 최저가 보러가기 →',
  '✓ 할인가 확인하기 →',
  '지금 바로 구매하기 →',
  '▶ 상품 자세히 보기',
  '할인 혜택 확인 →',
  '✓ 가격 비교하기 →',
  '🔥 특가 확인하기 →',
  '✨ 상품 보러가기 →',
];

// ✅ [2026-01-22] 랜덤 색상 팔레트 확장 (글마다 다른 색상)
const CTA_COLOR_PALETTES = [
  // 네이버 그린 계열
  { bg: '#03C75A', shadow: 'rgba(3, 199, 90, 0.4)' },
  { bg: 'linear-gradient(135deg, #03C75A, #00a344)', shadow: 'rgba(3, 199, 90, 0.4)' },
  // 오션 블루 계열
  { bg: '#3B82F6', shadow: 'rgba(59, 130, 246, 0.4)' },
  { bg: 'linear-gradient(135deg, #3B82F6, #2563EB)', shadow: 'rgba(59, 130, 246, 0.4)' },
  // 로얄 퍼플 계열
  { bg: '#8B5CF6', shadow: 'rgba(139, 92, 246, 0.4)' },
  { bg: 'linear-gradient(135deg, #8B5CF6, #7C3AED)', shadow: 'rgba(139, 92, 246, 0.4)' },
  // 골든 앰버 계열
  { bg: '#F59E0B', shadow: 'rgba(245, 158, 11, 0.4)' },
  { bg: 'linear-gradient(135deg, #F59E0B, #D97706)', shadow: 'rgba(245, 158, 11, 0.4)' },
  // 선셋 레드 계열
  { bg: '#EF4444', shadow: 'rgba(239, 68, 68, 0.4)' },
  { bg: 'linear-gradient(135deg, #EF4444, #DC2626)', shadow: 'rgba(239, 68, 68, 0.4)' },
  // 코랄 핑크 계열
  { bg: '#F472B6', shadow: 'rgba(244, 114, 182, 0.4)' },
  { bg: 'linear-gradient(135deg, #F472B6, #EC4899)', shadow: 'rgba(244, 114, 182, 0.4)' },
  // 미드나잇 다크 계열
  { bg: '#1F2937', shadow: 'rgba(31, 41, 55, 0.5)' },
  { bg: 'linear-gradient(135deg, #1F2937, #374151)', shadow: 'rgba(31, 41, 55, 0.5)' },
  // 레인보우 그라데이션
  { bg: 'linear-gradient(135deg, #F59E0B, #EC4899, #8B5CF6)', shadow: 'rgba(139, 92, 246, 0.4)' },
  { bg: 'linear-gradient(135deg, #3B82F6, #8B5CF6, #EC4899)', shadow: 'rgba(139, 92, 246, 0.4)' },
];

const CTA_CLICK_HINTS = [
  '👉 지금 클릭!',
  '👆 여기를 클릭!',
  '🔥 지금 확인!',
  '✨ 클릭하세요!',
  '💰 할인 확인!',
  '⭐ 바로 가기!',
  '🎯 클릭!',
  '🛒 구매하기!',
];

const CTA_BORDER_RADII = ['10px', '12px', '14px', '16px', '18px', '20px'];
const CTA_PADDINGS = ['22px 38px', '24px 40px', '26px 42px', '28px 44px'];
const CTA_FONT_SIZES = ['34px', '36px', '38px', '40px'];

export async function generateCtaBannerImage(
  hookMessage: string,
  _productName: string, // 더 이상 사용 안 함 (심플화)
  outputDir?: string
): Promise<string> {
  // ✅ [100점 개선] 전달된 문구 사용, 없으면 랜덤 후킹 문구
  let displayHook = hookMessage?.trim();
  if (!displayHook) {
    const randomIndex = Math.floor(Math.random() * CTA_HOOK_MESSAGES.length);
    displayHook = CTA_HOOK_MESSAGES[randomIndex];
  }

  // ✅ [2026-01-19] 랜덤 요소 선택 (중복 방지)
  const colorPalette = CTA_COLOR_PALETTES[Math.floor(Math.random() * CTA_COLOR_PALETTES.length)];
  const clickHint = CTA_CLICK_HINTS[Math.floor(Math.random() * CTA_CLICK_HINTS.length)];
  const borderRadius = CTA_BORDER_RADII[Math.floor(Math.random() * CTA_BORDER_RADII.length)];
  const padding = CTA_PADDINGS[Math.floor(Math.random() * CTA_PADDINGS.length)];
  const fontSize = CTA_FONT_SIZES[Math.floor(Math.random() * CTA_FONT_SIZES.length)];

  // ✅ 미세 변형: 너비, 그림자 강도
  const widthVariation = 630 + Math.floor(Math.random() * 30); // 630~660px
  const shadowOpacity = 0.25 + Math.random() * 0.2; // 0.25~0.45

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@700;900&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Noto Sans KR', sans-serif; 
          background: transparent; 
          padding: 8px; 
        }
        
        /* ✅ 반짝 광나는 shimmer 애니메이션 */
        @keyframes shimmer {
          0% { background-position: -600px 0; }
          100% { background-position: 600px 0; }
        }
        
        .card {
          background: ${colorPalette.bg};
          border-radius: ${borderRadius};
          box-shadow: 0 4px 16px ${colorPalette.shadow}, 0 2px 6px rgba(0,0,0,${shadowOpacity});
          overflow: hidden;
          width: ${widthVariation}px;
          padding: ${padding};
          text-align: center;
          cursor: pointer;
          border: none;
          position: relative;
        }
        
        /* ✅ shimmer 광 효과 오버레이 */
        .card::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255,255,255,0.3) 50%,
            transparent 100%
          );
          background-size: 600px 100%;
          animation: shimmer 2s infinite linear;
          pointer-events: none;
        }
        
        .cta-text {
          font-size: ${fontSize};
          font-weight: 900;
          color: white;
          line-height: 1.3;
          word-break: keep-all;
          letter-spacing: -0.5px;
          position: relative;
          z-index: 1;
          text-shadow: 0 2px 4px rgba(0,0,0,0.15);
        }
        
        .click-hint {
          margin-top: 12px;
          font-size: 22px;
          font-weight: 800;
          color: rgba(255,255,255,0.95);
          position: relative;
          z-index: 1;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="cta-text">
          ${escapeHtmlForBanner(displayHook)}
        </div>
        <div class="click-hint">
          ${clickHint}
        </div>
      </div>
    </body>
    </html>
  `;

  return generator.renderHtmlForBanner(html, 'cta_banner', outputDir);
}

function escapeHtmlForBanner(text: string): string {
  return (text || '')
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================
// 5. 썸네일 이미지 생성기 (제목 텍스트 포함)
// ==========================================

/**
 * 블로그 제목 텍스트가 포함된 썸네일 이미지 생성
 * @param title 블로그 전체 제목
 * @param outputDir 저장 경로 (옵션)
 */
export async function generateThumbnailWithTitle(
  title: string,
  outputDir?: string
): Promise<string> {
  const safeTitle = escapeHtmlForBanner(title || '상품 리뷰');

  // ✅ [2026-01-24 개선] 줄당 글자수 늘리고 최대 3줄 허용
  const maxCharsPerLine = 18;
  const words = safeTitle.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).length > maxCharsPerLine && currentLine) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }
  if (currentLine) lines.push(currentLine.trim());

  const lineCount = Math.min(lines.length, 3); // 최대 3줄
  const formattedTitle = lines.slice(0, 3).join('<br>'); // ✅ 최대 3줄

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@700;900&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Noto Sans KR', sans-serif; 
          background: transparent; 
          padding: 0; 
        }
        
        .card {
          width: 800px;
          height: 450px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        
        /* 배경 패턴 */
        .card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: 
            radial-gradient(circle at 20% 80%, rgba(255,255,255,0.1) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15) 0%, transparent 50%);
          pointer-events: none;
        }
        
        .content {
          text-align: center;
          padding: 40px;
          position: relative;
          z-index: 1;
        }
        
        .title {
          font-size: ${lineCount >= 3 ? '36px' : lineCount === 2 ? '40px' : '44px'}; /* ✅ 줄 수에 따라 자동 조절 */
          font-weight: 900;
          color: white;
          line-height: 1.35;
          text-shadow: 2px 4px 8px rgba(0,0,0,0.3);
          word-break: keep-all;
          overflow-wrap: break-word;
        }
        
        .subtitle {
          margin-top: 20px;
          font-size: 20px;
          font-weight: 700;
          color: rgba(255,255,255,0.9);
          letter-spacing: 2px;
        }
        
        .badge {
          position: absolute;
          top: 24px;
          right: 24px;
          background: rgba(255,255,255,0.25);
          backdrop-filter: blur(10px);
          padding: 10px 20px;
          border-radius: 30px;
          font-size: 16px;
          font-weight: 700;
          color: white;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">✨ 리뷰</div>
        <div class="content">
          <div class="title">${formattedTitle}</div>
          <div class="subtitle">SHOPPING CONNECT REVIEW</div>
        </div>
      </div>
    </body>
    </html>
  `;

  return generator.renderHtmlForBanner(html, 'thumbnail', outputDir);
}

// ==========================================
// 6. 제품 이미지 위에 텍스트 오버레이 (쇼핑커넥트 썸네일용)
// ==========================================

/**
 * 수집된 제품 이미지 위에 블로그 제목 텍스트를 오버레이한 썸네일 생성
 * @param productImagePath 수집된 제품 이미지 경로 (로컬 파일 또는 URL)
 * @param title 블로그 전체 제목
 * @param outputDir 저장 경로 (옵션)
 */
export async function generateThumbnailWithTextOverlay(
  productImagePath: string,
  title: string,
  outputDir?: string
): Promise<string> {
  const safeTitle = escapeHtmlForBanner(title || '상품 리뷰');

  // ✅ [2026-01-24 개선] 줄당 글자수 늘리고 최대 3줄 허용
  const maxCharsPerLine = 18; // 18자로 조정
  const words = safeTitle.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).length > maxCharsPerLine && currentLine) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }
  if (currentLine) lines.push(currentLine.trim());

  const lineCount = Math.min(lines.length, 3); // 최대 3줄
  const formattedTitle = lines.slice(0, 3).join('<br>'); // ✅ 최대 3줄로 확대

  // ✅ [2026-01-24 개선] 이미지 경로를 base64로 변환 (URL과 로컬 파일 모두 지원)
  let imageUrl = productImagePath;

  // 이미 data URI인 경우 그대로 사용
  if (productImagePath && productImagePath.startsWith('data:')) {
    imageUrl = productImagePath;
    console.log('[Thumbnail Overlay] ✅ data URI 사용');
  }
  // ✅ [신규] HTTP/HTTPS URL인 경우 fetch로 다운로드하여 base64 변환
  else if (productImagePath && (productImagePath.startsWith('http://') || productImagePath.startsWith('https://'))) {
    try {
      console.log('[Thumbnail Overlay] 🔄 URL 이미지 다운로드 중:', productImagePath.substring(0, 80));
      const response = await fetch(productImagePath, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        imageUrl = `data:${contentType};base64,${buffer.toString('base64')}`;
        console.log('[Thumbnail Overlay] ✅ URL 이미지 base64 변환 완료');
      } else {
        console.error('[Thumbnail Overlay] ⚠️ URL 이미지 다운로드 실패:', response.status);
        imageUrl = '';
      }
    } catch (e) {
      console.error('[Thumbnail Overlay] ⚠️ URL 이미지 다운로드 에러:', e);
      imageUrl = '';
    }
  }
  // 로컬 파일인 경우 base64로 변환
  else if (productImagePath) {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const imageBuffer = await fs.readFile(productImagePath);
      const ext = path.extname(productImagePath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      imageUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
      console.log('[Thumbnail Overlay] ✅ 로컬 파일 base64 변환 완료');
    } catch (e) {
      console.error('[Thumbnail Overlay] ⚠️ 로컬 파일 읽기 실패, 그라데이션 폴백:', e);
      imageUrl = '';
    }
  }

  // 배경 스타일: 이미지가 있으면 이미지, 없으면 그라데이션
  const bgStyle = imageUrl
    ? `background-image: url('${imageUrl}'); background-size: cover; background-position: center;`
    : `background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);`;

  // ✅ [2026-01-20 개선] 예시 이미지처럼 하단 배치, 깔끔한 스타일
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@700;900&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Noto Sans KR', sans-serif; 
          background: transparent; 
          padding: 0; 
        }
        
        .card {
          width: 800px;
          height: 800px; /* ✅ 1:1 비율 유지 */
          ${bgStyle}
          overflow: hidden;
          display: flex;
          align-items: flex-end; /* ✅ 하단 정렬 */
          justify-content: flex-start; /* ✅ 좌측 정렬 */
          position: relative;
        }
        
        /* ✅ 하단 그라데이션 오버레이 (배경과 자연스럽게 동화) */
        .card::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 50%;
          background: linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 50%, transparent 100%);
          pointer-events: none;
        }
        
        .content {
          text-align: left; /* ✅ 좌측 정렬 */
          padding: 30px 40px;
          position: relative;
          z-index: 1;
          max-width: 100%;
        }
        
        .title {
          font-size: ${lineCount >= 3 ? '36px' : lineCount === 2 ? '40px' : '44px'}; /* ✅ 줄 수에 따라 자동 조절 */
          font-weight: 900;
          color: white;
          line-height: 1.35;
          text-shadow: 1px 2px 8px rgba(0,0,0,0.5);
          word-break: keep-all;
          overflow-wrap: break-word;
          letter-spacing: -0.5px;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="content">
          <div class="title">${formattedTitle}</div>
        </div>
      </div>
    </body>
    </html>
  `;

  return generator.renderHtmlForBanner(html, 'thumbnail_overlay', outputDir);
}

// ==========================================
// 7. 커스텀 CTA 배너 생성기 (사용자 커스터마이징용)
// ==========================================

// 배너 색상 프리셋
export const BANNER_COLORS: Record<string, { name: string; bg: string; accent: string }> = {
  'naver-green': { name: '네이버 그린', bg: '#03C75A', accent: '#02b653' },
  'ocean-blue': { name: '오션 블루', bg: '#3B82F6', accent: '#2563EB' },
  'sunset-red': { name: '선셋 레드', bg: '#EF4444', accent: '#DC2626' },
  'royal-purple': { name: '로얄 퍼플', bg: '#8B5CF6', accent: '#7C3AED' },
  'coral-pink': { name: '코랄 핑크', bg: '#F472B6', accent: '#EC4899' },
  'golden-amber': { name: '골든 앰버', bg: '#F59E0B', accent: '#D97706' },
  'midnight-black': { name: '미드나잇 블랙', bg: '#1F2937', accent: '#374151' },
  'gradient-rainbow': { name: '레인보우', bg: 'linear-gradient(135deg, #F59E0B, #EC4899, #8B5CF6, #3B82F6)', accent: '#7C3AED' },
};

// 배너 크기 프리셋
export const BANNER_SIZES: Record<string, { name: string; width: number; height: number; fontSize: number }> = {
  'compact': { name: '컴팩트', width: 480, height: 80, fontSize: 24 },
  'standard': { name: '표준', width: 640, height: 100, fontSize: 32 },
  'large': { name: '대형', width: 800, height: 120, fontSize: 40 },
  'full': { name: '풀 사이즈', width: 960, height: 140, fontSize: 48 },
};

// 배너 애니메이션 프리셋
export const BANNER_ANIMATIONS: Record<string, { name: string; cssKeyframes: string; animation: string }> = {
  'shimmer': {
    name: '✨ 반짝 샤인',
    cssKeyframes: `@keyframes shimmer { 0% { background-position: -600px 0; } 100% { background-position: 600px 0; } }`,
    animation: 'shimmer 2s infinite linear'
  },
  'pulse': {
    name: '💓 펄스',
    cssKeyframes: `@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.02); } }`,
    animation: 'pulse 2s infinite'
  },
  'glow': {
    name: '🌟 글로우',
    cssKeyframes: `@keyframes glow { 0% { box-shadow: 0 0 10px rgba(255,255,255,0.3); } 100% { box-shadow: 0 0 25px rgba(255,255,255,0.6); } }`,
    animation: 'glow 1.5s infinite alternate'
  },
  'none': {
    name: '❌ 없음',
    cssKeyframes: '',
    animation: 'none'
  },
};

export interface CustomBannerOptions {
  text: string;
  colorKey: string;
  sizeKey: string;
  animationKey: string;
  customImagePath?: string;
}

/**
 * 커스텀 CTA 배너 이미지 생성
 * @param options 배너 설정
 * @param outputDir 저장 경로 (옵션)
 */
export async function generateCustomBanner(
  options: CustomBannerOptions,
  outputDir?: string
): Promise<string> {
  const text = escapeHtmlForBanner(options.text || '지금 바로 구매하기 →');
  const color = BANNER_COLORS[options.colorKey] || BANNER_COLORS['naver-green'];
  const size = BANNER_SIZES[options.sizeKey] || BANNER_SIZES['standard'];
  const anim = BANNER_ANIMATIONS[options.animationKey] || BANNER_ANIMATIONS['shimmer'];

  // 배경 스타일: 커스텀 이미지가 있으면 이미지, 없으면 색상
  let bgStyle = color.bg.includes('gradient')
    ? `background: ${color.bg};`
    : `background: ${color.bg};`;

  if (options.customImagePath) {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const imageBuffer = await fs.readFile(options.customImagePath);
      const ext = path.extname(options.customImagePath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      const imageDataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
      bgStyle = `background-image: linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.5)), url('${imageDataUrl}'); background-size: cover; background-position: center;`;
    } catch (e) {
      console.error('[CustomBanner] 커스텀 이미지 로드 실패:', e);
    }
  }

  // shimmer 오버레이 (shimmer 애니메이션인 경우만)
  const shimmerOverlay = options.animationKey === 'shimmer' ? `
    <div style="
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%);
      background-size: 600px 100%;
      animation: ${anim.animation};
      pointer-events: none;
    "></div>
  ` : '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@700;900&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Noto Sans KR', sans-serif; 
          background: transparent; 
          padding: 8px; 
        }
        
        ${anim.cssKeyframes}
        
        .card {
          ${bgStyle}
          border-radius: ${CTA_BORDER_RADII[Math.floor(Math.random() * CTA_BORDER_RADII.length)]};
          box-shadow: 0 4px 20px rgba(0,0,0,${0.25 + Math.random() * 0.15});
          overflow: hidden;
          width: ${size.width}px;
          padding: ${size.height * 0.3}px ${size.width * 0.05}px;
          text-align: center;
          cursor: pointer;
          border: none;
          position: relative;
          ${options.animationKey !== 'shimmer' && options.animationKey !== 'none' ? `animation: ${anim.animation};` : ''}
        }
        
        /* 네이버 로고 + 텍스트 */
        .logo-container {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 8px;
          position: relative;
          z-index: 1;
        }
        
        .naver-logo {
          width: 32px;
          height: 32px;
          background: white;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
        }
        
        .naver-logo svg {
          width: 100%;
          height: 100%;
        }
        
        .naver-text {
          font-size: 15px;
          font-weight: 700;
          color: white;
          text-shadow: 1px 1px 4px rgba(0,0,0,0.3);
          letter-spacing: 1px;
        }
        
        .hook-text {
          font-size: ${size.fontSize}px;
          font-weight: 900;
          color: white;
          text-shadow: 2px 3px 10px rgba(0,0,0,0.5);
          position: relative;
          z-index: 1;
        }
        
        .click-hint {
          font-size: ${size.fontSize * 0.5}px;
          color: rgba(255,255,255,0.85);
          margin-top: 8px;
          position: relative;
          z-index: 1;
        }
      </style>
    </head>
    <body>
      <div class="card">
        ${shimmerOverlay}
        <div class="hook-text">${text}</div>
        <div class="click-hint">${CTA_CLICK_HINTS[Math.floor(Math.random() * CTA_CLICK_HINTS.length)]}</div>
      </div>
    </body>
    </html>
  `;

  return generator.renderHtmlForBanner(html, 'custom_banner', outputDir);
}
