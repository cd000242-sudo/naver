/**
 * 쿠팡 crawlCoupangProduct 전면 개편
 * 
 * 변경: 자체 브라우저 → crawlerBrowser 공유 브라우저 (AdsPower 포함)
 * 추가: 갤러리 + 리뷰 이미지 수집
 * 순서: 갤러리 먼저 → 리뷰 나중 (네이버와 동일)
 */
const fs = require('fs');

const filePath = 'src/crawler/productSpecCrawler.ts';
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// ===== 1. crawlCoupangProduct 함수 찾기 (L97~258) =====
let funcStart = -1, funcEnd = -1;
for (let i = 90; i < 110; i++) {
  if (lines[i] && lines[i].includes('async function crawlCoupangProduct')) {
    funcStart = i;
    break;
  }
}
// 함수 끝 찾기: 같은 들여쓰기 레벨의 오프라인 }
if (funcStart > -1) {
  let braceCount = 0;
  for (let i = funcStart; i < lines.length; i++) {
    for (const ch of (lines[i] || '')) {
      if (ch === '{') braceCount++;
      if (ch === '}') braceCount--;
    }
    if (braceCount === 0 && i > funcStart) {
      funcEnd = i;
      break;
    }
  }
}

// 주석 포함
let commentStart = funcStart;
for (let i = funcStart - 1; i >= funcStart - 10; i--) {
  if (lines[i] && (lines[i].includes('/**') || lines[i].includes(' *'))) {
    commentStart = i;
    if (lines[i].includes('/**')) break;
  } else break;
}

console.log('crawlCoupangProduct:', commentStart+1, '~', funcEnd+1, '(', funcEnd - commentStart + 1, 'lines)');

if (funcStart > -1 && funcEnd > -1) {
  // link.coupang.com 어필리에이트 링크도 라우팅 추가 (crawlProductSpecs에서)
  // L71 근처 확인
  let routeLine = -1;
  for (let i = 60; i < 90; i++) {
    if (lines[i] && lines[i].includes("url.includes('coupang.com')") && lines[i].includes("url.includes('coupa.ng')")) {
      routeLine = i;
      break;
    }
  }
  if (routeLine > -1 && !lines[routeLine].includes('link.coupang.com')) {
    lines[routeLine] = lines[routeLine].replace(
      "url.includes('coupang.com') || url.includes('coupa.ng')",
      "url.includes('coupang.com') || url.includes('coupa.ng') || url.includes('link.coupang.com')"
    );
    console.log('  ✅ crawlProductSpecs 라우팅에 link.coupang.com 추가');
  }

  // 새 함수로 교체
  const newFunc = `/**
 * ✅ [2026-03-15] 쿠팡 제품 크롤링 (공유 브라우저 + 이미지 수집)
 * - crawlerBrowser의 AdsPower/Stealth 공유 브라우저 사용
 * - 갤러리(대표+추가) 먼저 → 리뷰 나중 (prioritizeImages 사용)
 */
async function crawlCoupangProduct(url: string): Promise<ProductSpec | null> {
    let page: any = null;

    try {
        const { createPage, releasePage } = await import('./crawlerBrowser.js');
        page = await createPage();

        // ✅ 어필리에이트 링크 리다이렉트 처리
        let crawlUrl = url;
        if (url.includes('link.coupang.com') || url.includes('coupa.ng')) {
            console.log('[쿠팡] 🔗 어필리에이트 링크 → 리다이렉트 추적...');
            try {
                const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                crawlUrl = page.url();
                console.log('[쿠팡] 📍 리다이렉트 완료:', crawlUrl.substring(0, 80));
                // 이미 페이지에 있으므로 추가 이동 불필요
            } catch {
                // 리다이렉트 실패 시 원본 URL 사용
                console.log('[쿠팡] ⚠️ 리다이렉트 실패, 원본 URL 사용');
            }
        } else {
            // 쿠팡 메인 경유 (쿠키 생성)
            console.log('[쿠팡] 🏠 쿠팡 메인 방문 (쿠키 생성)...');
            try {
                await page.goto('https://www.coupang.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
                await page.mouse.move(500, 300);
                await page.waitForTimeout(1000 + Math.random() * 1000);
                await page.mouse.wheel(0, 200);
                await page.waitForTimeout(500 + Math.random() * 500);
            } catch { /* 메인 방문 실패는 치명적이지 않음 */ }

            // 상품 페이지 이동
            console.log('[쿠팡] 🎯 상품 페이지 이동...');
            await page.goto(crawlUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        }

        await page.waitForTimeout(2000 + Math.random() * 1500);

        // Access Denied 체크
        const pageContent = await page.content();
        if (pageContent.includes('Access Denied') || pageContent.includes('차단')) {
            console.log('[쿠팡] ❌ Access Denied');
            await releasePage(page);
            return null;
        }

        console.log('[쿠팡] ✅ 페이지 접근 성공!');

        // ✅ 제품 정보 추출
        const productInfo = await page.evaluate(() => {
            const getTextContent = (selector: string): string => {
                const el = document.querySelector(selector);
                return el?.textContent?.trim() || '';
            };

            const productName = getTextContent('.prod-buy-header__title, h2.prod-title, .product-title');
            const priceEl = document.querySelector('.total-price strong, .prod-price .total-price, .prod-origin-price');
            const price = priceEl?.textContent?.replace(/[^\\d,]/g, '').replace(',', '') || '';
            const discountEl = document.querySelector('.discount-percentage, .prod-discount');
            const discount = discountEl?.textContent?.trim() || '';
            const ratingEl = document.querySelector('.rating-star-num, .prod-rating-num');
            const rating = ratingEl?.textContent?.trim() || '';
            const reviewCountEl = document.querySelector('.count, .prod-review-count');
            const reviewCount = reviewCountEl?.textContent?.replace(/[^\\d]/g, '') || '';
            const brandEl = document.querySelector('.prod-brand-name a, .prod-brand');
            const brand = brandEl?.textContent?.trim() || '';
            const shippingEl = document.querySelector('.prod-shipping-fee, .free-shipping-badge');
            let shipping = shippingEl?.textContent?.trim() || '';
            if (!shipping || shipping.includes('무료')) shipping = '무료 배송';

            const specs: Array<{ label: string; value: string }> = [];
            const specRows = document.querySelectorAll('.prod-spec-table tr, .product-detail-spec tr');
            specRows.forEach(row => {
                const th = row.querySelector('th, td:first-child');
                const td = row.querySelector('td:last-child');
                if (th && td) {
                    const label = th.textContent?.trim() || '';
                    const value = td.textContent?.trim() || '';
                    if (label && value && label !== value) {
                        specs.push({ label, value });
                    }
                }
            });

            return {
                productName,
                price: price ? \`\${parseInt(price).toLocaleString()}원\` : '',
                discount, brand,
                rating: rating ? \`⭐ \${rating}\` : '',
                reviewCount: reviewCount ? \`\${parseInt(reviewCount).toLocaleString()}개 리뷰\` : '',
                shipping, mallName: '쿠팡', specs,
                images: [] as string[],
            };
        });

        // ✅ 1단계: 갤러리 이미지 수집 (썸네일 클릭)
        console.log('[쿠팡] 🖼️ 갤러리 이미지 수집...');
        const galleryImages: string[] = [];
        try {
            const thumbs = await page.$$('.prod-image__item img, .prod-image__subimg-inner img, .gallery-image-item img');
            console.log('[쿠팡] 📷 갤러리 썸네일:', thumbs.length, '개');
            const seen = new Set<string>();

            for (let ti = 0; ti < thumbs.length && ti < 15; ti++) {
                try {
                    await thumbs[ti].click();
                    await page.waitForTimeout(300 + Math.random() * 200);
                    const bigUrl = await page.evaluate(() => {
                        const bigImg = document.querySelector('.prod-image__detail img, .zoom-image img, .prod-image__big img') as HTMLImageElement;
                        return bigImg ? (bigImg.src || bigImg.dataset?.src || null) : null;
                    });
                    if (bigUrl && bigUrl.length > 20) {
                        const base = bigUrl.split('?')[0];
                        if (!seen.has(base) && !bigUrl.includes('data:')) {
                            galleryImages.push(bigUrl);
                            seen.add(base);
                        }
                    }
                } catch {}
            }

            // 직접 이미지 수집 (클릭 실패 시)
            if (galleryImages.length === 0) {
                const directImgs = await page.evaluate(() => {
                    const imgs: string[] = [];
                    const seen = new Set<string>();
                    document.querySelectorAll('.prod-image__item img, img[src*=\"thumbnail\"], img[src*=\"image\"]').forEach(el => {
                        const img = el as HTMLImageElement;
                        const src = img.src || '';
                        if (src && !src.includes('data:') && !src.includes('svg') && src.length > 30) {
                            const base = src.split('?')[0];
                            if (!seen.has(base)) {
                                // 쿠팡 이미지: 썸네일 → 원본 변환
                                const hi = src.replace(/\\/thumbnails\\//, '/').replace(/_230x230ex\\./i, '.').replace(/_160x160ex\\./i, '.');
                                imgs.push(hi);
                                seen.add(base);
                            }
                        }
                    });
                    return imgs;
                });
                galleryImages.push(...directImgs);
            }

            // OG 이미지 추가
            const ogImg = await page.evaluate(() => document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '');
            if (ogImg && ogImg.length > 20 && !galleryImages.some(g => g.split('?')[0] === ogImg.split('?')[0])) {
                galleryImages.unshift(ogImg);
            }

            console.log('[쿠팡] 🎯 갤러리 이미지:', galleryImages.length, '장');
        } catch (galleryErr) {
            console.log('[쿠팡] ⚠️ 갤러리 수집 실패:', (galleryErr as Error).message);
        }

        // ✅ 2단계: 리뷰 이미지 수집 (스크롤 다운)
        console.log('[쿠팡] 📸 리뷰 이미지 수집...');
        const reviewImages: string[] = [];
        try {
            // 스크롤 다운으로 리뷰 로드
            for (let si = 0; si < 10; si++) {
                await page.evaluate(() => window.scrollBy(0, 800));
                await page.waitForTimeout(400 + Math.random() * 200);
            }
            await page.waitForTimeout(1500);

            // 리뷰 포토 수집
            const revImgs = await page.evaluate(() => {
                const imgs: string[] = [];
                const seen = new Set<string>();
                // 쿠팡 리뷰 이미지 셀렉터들
                const sels = [
                    '.sdp-review__article__list__review__content__img-list img',
                    '.js_reviewArticlePhotoImg',
                    'img[src*="review"]',
                    '.review-content img',
                    '.photo-review img',
                    '.sdp-review img',
                ];
                sels.forEach(sel => {
                    document.querySelectorAll(sel).forEach(el => {
                        const img = el as HTMLImageElement;
                        const src = img.src || img.dataset?.src || img.getAttribute('data-src') || '';
                        if (!src || src.length < 20 || src.includes('data:') || src.includes('svg')) return;
                        if (src.includes('icon') || src.includes('logo') || src.includes('badge')) return;
                        const base = src.split('?')[0];
                        if (!seen.has(base)) {
                            // 썸네일 → 원본
                            const hi = src.replace(/\\/thumbnails\\//, '/').replace(/_230x230ex\\./i, '.').replace(/_80x80ex\\./i, '.');
                            imgs.push(hi);
                            seen.add(base);
                        }
                    });
                });
                return imgs.slice(0, 10);
            });
            reviewImages.push(...revImgs);
            console.log('[쿠팡] 📸 리뷰 이미지:', reviewImages.length, '장');
        } catch (revErr) {
            console.log('[쿠팡] ⚠️ 리뷰 수집 실패:', (revErr as Error).message);
        }

        // ✅ 이미지 우선순위 정렬 (갤러리 먼저 → 리뷰 나중)
        const sortedImages = prioritizeImages(galleryImages, reviewImages);

        await releasePage(page);

        if (!productInfo.productName) {
            console.log('[쿠팡] ⚠️ 제품명 추출 실패');
            return null;
        }

        console.log(\`[쿠팡] ✅ 크롤링 완료: \${productInfo.productName.substring(0, 40)}... (이미지 \${sortedImages.length}장)\`);

        return {
            ...productInfo,
            images: sortedImages,
            mallName: '쿠팡',
        };

    } catch (error) {
        console.error('[쿠팡] ❌ 크롤링 실패:', (error as Error).message);
        if (page) {
            try { const { releasePage } = await import('./crawlerBrowser.js'); await releasePage(page); } catch {}
        }
        return null;
    }
}`;

  const newLines = newFunc.split('\n');
  lines.splice(commentStart, funcEnd - commentStart + 1, ...newLines);
  console.log('  ✅ Replaced', (funcEnd - commentStart + 1), 'lines with', newLines.length, 'lines');
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('\n✅ All done!');
