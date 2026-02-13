/**
 * 비교표 이미지 생성기 (Puppeteer 기반)
 * 상품 비교 데이터를 받아 깔끔한 비교표 이미지를 생성합니다.
 */

import puppeteer, { Browser } from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

// 비교표 상품 데이터 인터페이스
export interface ComparisonProduct {
  name: string;           // 상품명
  price?: string;         // 가격
  rating?: string;        // 평점
  pros?: string[];        // 장점 목록
  cons?: string[];        // 단점 목록
  specs?: Record<string, string>;  // 스펙 (예: { "용량": "500ml", "무게": "300g" })
  imageUrl?: string;      // 상품 이미지 URL (선택)
  isRecommended?: boolean; // 추천 상품 표시
}

export interface ComparisonTableOptions {
  title?: string;          // 표 제목 (예: "가성비 무선 이어폰 TOP 3")
  products: ComparisonProduct[];
  theme?: 'light' | 'dark' | 'gradient';  // 테마
  accentColor?: string;    // 강조색
  width?: number;          // 이미지 너비
  showRanking?: boolean;   // 순위 표시
}

// HTML 템플릿 생성
function generateComparisonTableHtml(options: ComparisonTableOptions): string {
  const {
    title = '상품 비교',
    products,
    theme = 'gradient',
    accentColor = '#f59e0b',
    showRanking = true
  } = options;

  const themeStyles = {
    light: {
      bg: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
      cardBg: '#ffffff',
      text: '#1e293b',
      subtext: '#64748b',
      border: '#e2e8f0'
    },
    dark: {
      bg: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      cardBg: '#1e293b',
      text: '#f1f5f9',
      subtext: '#94a3b8',
      border: '#334155'
    },
    gradient: {
      bg: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
      cardBg: 'rgba(255, 255, 255, 0.08)',
      text: '#f1f5f9',
      subtext: '#a5b4fc',
      border: 'rgba(255, 255, 255, 0.15)'
    }
  };

  const style = themeStyles[theme];

  const productsHtml = products.map((product, index) => {
    const ranking = showRanking ? `
      <div class="ranking ${index === 0 ? 'first' : ''}">${index + 1}위</div>
    ` : '';

    const recommendBadge = product.isRecommended ? `
      <div class="recommend-badge">🏆 추천</div>
    ` : '';

    const priceHtml = product.price ? `
      <div class="price">${product.price}</div>
    ` : '';

    const ratingHtml = product.rating ? `
      <div class="rating">⭐ ${product.rating}</div>
    ` : '';

    const prosHtml = product.pros && product.pros.length > 0 ? `
      <div class="pros">
        <div class="label">👍 장점</div>
        <ul>
          ${product.pros.map(pro => `<li>${pro}</li>`).join('')}
        </ul>
      </div>
    ` : '';

    const consHtml = product.cons && product.cons.length > 0 ? `
      <div class="cons">
        <div class="label">👎 단점</div>
        <ul>
          ${product.cons.map(con => `<li>${con}</li>`).join('')}
        </ul>
      </div>
    ` : '';

    const specsHtml = product.specs ? `
      <div class="specs">
        ${Object.entries(product.specs).map(([key, value]) => `
          <div class="spec-item">
            <span class="spec-key">${key}</span>
            <span class="spec-value">${value}</span>
          </div>
        `).join('')}
      </div>
    ` : '';

    return `
      <div class="product-card ${product.isRecommended ? 'recommended' : ''}">
        ${ranking}
        ${recommendBadge}
        <div class="product-name">${product.name}</div>
        ${priceHtml}
        ${ratingHtml}
        ${prosHtml}
        ${consHtml}
        ${specsHtml}
      </div>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
      background: ${style.bg};
      padding: 40px;
      min-height: 100vh;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    .title {
      text-align: center;
      font-size: 32px;
      font-weight: 800;
      color: ${style.text};
      margin-bottom: 40px;
      text-shadow: 0 2px 10px rgba(0,0,0,0.2);
    }
    
    .title::before {
      content: '📊 ';
    }
    
    .products-grid {
      display: grid;
      grid-template-columns: repeat(${Math.min(products.length, 3)}, 1fr);
      gap: 24px;
    }
    
    .product-card {
      background: ${style.cardBg};
      border-radius: 20px;
      padding: 28px;
      border: 1px solid ${style.border};
      position: relative;
      backdrop-filter: blur(10px);
      transition: transform 0.3s, box-shadow 0.3s;
    }
    
    .product-card.recommended {
      border: 2px solid ${accentColor};
      box-shadow: 0 0 30px rgba(245, 158, 11, 0.3);
    }
    
    .ranking {
      position: absolute;
      top: -12px;
      left: 20px;
      background: ${style.subtext};
      color: ${theme === 'light' ? '#fff' : '#0f172a'};
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 700;
    }
    
    .ranking.first {
      background: linear-gradient(135deg, ${accentColor}, #fbbf24);
      color: #0f172a;
    }
    
    .recommend-badge {
      position: absolute;
      top: -12px;
      right: 20px;
      background: linear-gradient(135deg, #10b981, #34d399);
      color: white;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 700;
    }
    
    .product-name {
      font-size: 22px;
      font-weight: 700;
      color: ${style.text};
      margin-top: 16px;
      margin-bottom: 12px;
      line-height: 1.3;
    }
    
    .price {
      font-size: 26px;
      font-weight: 800;
      color: ${accentColor};
      margin-bottom: 8px;
    }
    
    .rating {
      font-size: 16px;
      color: ${style.subtext};
      margin-bottom: 16px;
    }
    
    .pros, .cons {
      margin-bottom: 14px;
    }
    
    .label {
      font-size: 14px;
      font-weight: 600;
      color: ${style.subtext};
      margin-bottom: 8px;
    }
    
    .pros ul, .cons ul {
      list-style: none;
      padding-left: 0;
    }
    
    .pros li, .cons li {
      font-size: 14px;
      color: ${style.text};
      padding: 4px 0;
      padding-left: 20px;
      position: relative;
    }
    
    .pros li::before {
      content: '✓';
      position: absolute;
      left: 0;
      color: #10b981;
      font-weight: bold;
    }
    
    .cons li::before {
      content: '✗';
      position: absolute;
      left: 0;
      color: #ef4444;
      font-weight: bold;
    }
    
    .specs {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid ${style.border};
    }
    
    .spec-item {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 13px;
    }
    
    .spec-key {
      color: ${style.subtext};
    }
    
    .spec-value {
      color: ${style.text};
      font-weight: 600;
    }
    
    .footer {
      text-align: center;
      margin-top: 30px;
      font-size: 12px;
      color: ${style.subtext};
      opacity: 0.7;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1 class="title">${title}</h1>
    <div class="products-grid">
      ${productsHtml}
    </div>
    <div class="footer">※ 가격 및 정보는 변동될 수 있습니다.</div>
  </div>
</body>
</html>
  `;
}

// 비교표 이미지 생성
export async function generateComparisonTableImage(
  options: ComparisonTableOptions,
  outputPath?: string
): Promise<{ success: boolean; imagePath?: string; error?: string }> {
  let browser: Browser | null = null;

  try {
    const { width = 1200 } = options;

    // HTML 생성
    const html = generateComparisonTableHtml(options);

    // ✅ [2026-02-04 FIX] 배포 환경 지원 - Chromium 경로 명시
    const { getChromiumExecutablePath } = await import('../browserUtils');
    const chromePath = await getChromiumExecutablePath();
    console.log(`[ComparisonTable] 🌐 Chromium 경로: ${chromePath || '자동 감지'}`);

    // Puppeteer 브라우저 실행
    browser = await puppeteer.launch({
      headless: true,
      executablePath: chromePath || undefined, // ✅ [2026-02-04 FIX] 배포 환경 지원
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();

    // 뷰포트 설정
    await page.setViewport({ width, height: 800 });

    // HTML 콘텐츠 로드
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // 콘텐츠 높이 측정
    const bodyHandle = await page.$('body');
    const boundingBox = await bodyHandle?.boundingBox();
    const height = Math.ceil(boundingBox?.height || 800);

    // 뷰포트 높이 조정
    await page.setViewport({ width, height: height + 40 });

    // 저장 경로 설정
    let savePath = outputPath;
    if (!savePath) {
      const tempDir = app?.getPath?.('temp') || process.env.TEMP || '/tmp';
      const fileName = `comparison_table_${Date.now()}.png`;
      savePath = path.join(tempDir, fileName);
    }

    // 디렉토리 확인/생성
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 스크린샷 저장
    await page.screenshot({
      path: savePath,
      type: 'png',
      fullPage: true,
      omitBackground: false
    });

    console.log(`[ComparisonTable] ✅ 비교표 이미지 생성 완료: ${savePath}`);

    return {
      success: true,
      imagePath: savePath
    };

  } catch (error) {
    console.error('[ComparisonTable] ❌ 비교표 이미지 생성 실패:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// 간단한 비교표 생성 헬퍼 함수
export async function createSimpleComparisonImage(
  title: string,
  items: Array<{
    name: string;
    price?: string;
    pros?: string[];
    cons?: string[];
  }>,
  outputPath?: string
): Promise<{ success: boolean; imagePath?: string; error?: string }> {
  const products: ComparisonProduct[] = items.map((item, index) => ({
    name: item.name,
    price: item.price,
    pros: item.pros,
    cons: item.cons,
    isRecommended: index === 0  // 첫 번째 상품을 추천으로 표시
  }));

  return generateComparisonTableImage({
    title,
    products,
    theme: 'gradient',
    showRanking: true
  }, outputPath);
}

// AI 생성 콘텐츠에서 비교 데이터 추출
export function extractComparisonDataFromContent(content: string): ComparisonProduct[] | null {
  try {
    // 상품명 패턴 (예: "1. 상품명", "첫 번째:", "① 상품명" 등)
    const productPatterns = [
      /(?:^|\n)\s*(?:\d+[\.\)]\s*|[①②③④⑤]\s*|(?:첫\s*번째|두\s*번째|세\s*번째)[:\s]*)([\w가-힣\s]+?)(?:\n|$|-|:)/gm,
      /(?:추천\s*(?:\d+|상품)[:\s]*)([\w가-힣\s]+?)(?:\n|$)/gm
    ];

    const products: ComparisonProduct[] = [];

    for (const pattern of productPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1]?.trim();
        if (name && name.length > 2 && name.length < 50) {
          // 중복 체크
          if (!products.find(p => p.name === name)) {
            products.push({
              name,
              isRecommended: products.length === 0
            });
          }
        }
      }
    }

    // 가격 추출 시도
    const pricePattern = /(?:가격|가)\s*[:\s]*(?:약\s*)?([\d,]+)\s*원/g;
    let priceMatch;
    let priceIndex = 0;
    while ((priceMatch = pricePattern.exec(content)) !== null && priceIndex < products.length) {
      products[priceIndex].price = `${priceMatch[1]}원`;
      priceIndex++;
    }

    return products.length >= 2 ? products : null;
  } catch (error) {
    console.error('[ComparisonTable] 데이터 추출 실패:', error);
    return null;
  }
}
