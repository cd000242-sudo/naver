/**
 * 라이프스타일 상품 키워드 추출 테스트 (모바일 API + 일반 네이버 검색 우회)
 */
const axios = require('axios');
const cheerio = require('cheerio');

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const FOOD_KW = ['떡','과자','쿠키','초콜릿','빵','케이크','젤리','캔디','사탕','라면','즉석','간식','음료','우유','커피믹스','양념','소스','견과','반찬','밀키트','냉동','통조림','식빵','아이스크림','젤라또','마카롱','도넛','베이커리','롯데웰푸드','농심','오리온','해태','크라운','삼양','풀무원','비비고','햇반'];
function isFoodItem(name) { return FOOD_KW.some(fw => name.toLowerCase().includes(fw)); }

// 방법 1: 네이버 통합검색 쇼핑 영역에서 상품명 추출 (Bot 우회 가능)
async function searchNaverIntegrated(query) {
  const keywords = [];
  try {
    const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(query + ' 추천')}`;
    const r = await axios.get(url, {
      headers: { 'User-Agent': MOBILE_UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
      timeout: 10000,
    });
    const $ = cheerio.load(r.data);
    
    // 쇼핑 영역의 상품명
    $('[class*="product_title"], [class*="title_area"] a, [class*="shop_tit"], .product_info .name, [class*="item_title"]').each((_, el) => {
      const name = $(el).text().trim();
      if (name && name.length >= 4 && name.length <= 40 && !isFoodItem(name)) {
        keywords.push(name);
      }
    });
    
    // 연관 검색어
    $('[class*="related"] a, [class*="keyword"] a').each((_, el) => {
      const txt = $(el).text().trim();
      if (txt && txt.length >= 3 && txt.length <= 20 && !isFoodItem(txt)) {
        keywords.push(txt);
      }
    });
  } catch (e) {
    console.log(`   ❌ 통합검색: ${e.message}`);
  }
  return [...new Set(keywords)];
}

// 방법 2: 모바일 네이버 쇼핑 검색
async function searchMobileShopping(query) {
  const keywords = [];
  try {
    const url = `https://msearch.shopping.naver.com/search/all?query=${encodeURIComponent(query)}&sort=rel`;
    const r = await axios.get(url, {
      headers: { 
        'User-Agent': MOBILE_UA, 
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': 'https://m.naver.com/',
      },
      timeout: 10000,
    });
    const $ = cheerio.load(r.data);
    
    // __NEXT_DATA__
    const nextScript = $('script#__NEXT_DATA__').html();
    if (nextScript) {
      try {
        const data = JSON.parse(nextScript);
        const products = data?.props?.pageProps?.initialState?.products?.list || [];
        for (const p of products.slice(0, 15)) {
          const name = p?.item?.productTitle || p?.item?.title || '';
          if (name && name.length >= 4 && name.length <= 40 && !isFoodItem(name)) {
            keywords.push(name.replace(/<[^>]*>/g, ''));
          }
        }
      } catch {}
    }
    
    // HTML 폴백
    if (keywords.length === 0) {
      $('a').each((_, el) => {
        const name = $(el).text().trim();
        if (name && name.length >= 6 && name.length <= 40 && !isFoodItem(name) && !name.includes('네이버') && !name.includes('로그인')) {
          keywords.push(name);
        }
      });
    }
  } catch (e) {
    console.log(`   ❌ 모바일쇼핑: ${e.message}`);
  }
  return [...new Set(keywords)];
}

// 방법 3: 네이버 키워드 자동완성 (쇼핑 카테고리)
async function getShoppingAutocomplete(query) {
  const keywords = [];
  try {
    const url = `https://ac.shopping.naver.com/ac?q=${encodeURIComponent(query)}&st=111111&r_lt=11&q_enc=UTF-8`;
    const r = await axios.get(url, {
      headers: { 'User-Agent': MOBILE_UA },
      timeout: 5000,
    });
    if (r.data?.items?.[0]) {
      for (const item of r.data.items[0]) {
        const kw = item[0];
        if (kw && kw.length >= 3 && !isFoodItem(kw)) {
          keywords.push(kw);
        }
      }
    }
  } catch (e) {
    console.log(`   ❌ 자동완성: ${e.message}`);
  }
  return keywords;
}

// 블로그 경쟁도
async function checkBlogCount(keyword) {
  try {
    const url = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}`;
    const r = await axios.get(url, { headers: { 'User-Agent': MOBILE_UA }, timeout: 8000 });
    const $ = cheerio.load(r.data);
    const match = ($('.title_num').text() || '').match(/([\d,]+)\s*건/);
    return match ? parseInt(match[1].replace(/,/g, '')) : 0;
  } catch { return -1; }
}

(async () => {
  console.log('========================================');
  console.log(' 🛍️  라이프스타일 상품 키워드 테스트 v2');
  console.log('========================================');
  
  const queries = ['에어프라이어', '무선청소기', '블루투스 이어폰'];
  const allKeywords = [];
  
  for (const query of queries) {
    console.log(`\n🔍 "${query}"...`);
    
    // 3가지 방법 병렬 시도
    const [integ, mobile, autocomplete] = await Promise.allSettled([
      searchNaverIntegrated(query),
      searchMobileShopping(query),
      getShoppingAutocomplete(query),
    ]);
    
    const results = [];
    if (integ.status === 'fulfilled') results.push(...integ.value);
    if (mobile.status === 'fulfilled') results.push(...mobile.value);
    if (autocomplete.status === 'fulfilled') results.push(...autocomplete.value);
    
    const unique = [...new Set(results)];
    console.log(`   통합:${integ.status === 'fulfilled' ? integ.value.length : 'X'} 모바일:${mobile.status === 'fulfilled' ? mobile.value.length : 'X'} 자동완성:${autocomplete.status === 'fulfilled' ? autocomplete.value.length : 'X'} → 합계: ${unique.length}`);
    unique.slice(0, 5).forEach(kw => console.log(`     → ${kw}`));
    allKeywords.push(...unique);
    await new Promise(r => setTimeout(r, 500));
  }
  
  const final = [...new Set(allKeywords)];
  console.log(`\n📋 총 상품 키워드: ${final.length}개`);
  
  // 블로그 경쟁도 분석
  if (final.length > 0) {
    console.log('\n📊 블로그 경쟁도...');
    for (const kw of final.slice(0, 5)) {
      const bc = await checkBlogCount(kw);
      const s = bc === -1 ? '?' : bc <= 100 ? '🔥 초저경쟁' : bc <= 1000 ? '✅ 저경쟁' : bc <= 5000 ? '📊 중저' : bc <= 50000 ? '⚠️ 중' : '🚫 고';
      console.log(`  [${kw.substring(0, 25)}] ${bc >= 0 ? bc.toLocaleString()+'건' : '?'} ${s}`);
      await new Promise(r => setTimeout(r, 300));
    }
  }
  
  console.log('\n' + '='.repeat(40));
  console.log(final.length >= 3 ? ' ✅ 상품 키워드 추출 성공!' : ' ⚠️ 키워드 부족');
  console.log('='.repeat(40));
})();
