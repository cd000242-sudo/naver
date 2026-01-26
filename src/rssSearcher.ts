/**
 * RSS 검색 및 수집 기능
 * 제목 키워드로 네이버 블로그, 카페, 뉴스 등을 검색하고 수집합니다.
 * 네이버 검색 API를 사용하여 더 정확하고 빠른 검색을 제공합니다.
 */

export interface RssSearchResult {
  title: string;
  url: string;
  description?: string;
  source: 'naver_blog' | 'naver_cafe' | 'naver_news' | 'google_news' | 'other';
  publishedAt?: string;
}

export interface RssFeedItem {
  title: string;
  content: string;
  url: string;
  publishedAt?: string;
  images?: string[];
  source: string;
}

// ✅ 불용어 리스트 (조사, 접속사 등)
const STOP_WORDS = new Set([
  '은', '는', '이', '가', '을', '를', '의', '에', '에서', '으로', '로', '와', '과',
  '도', '만', '까지', '부터', '에게', '한테', '께', '보다', '처럼', '같이',
  '대해', '대한', '위한', '통한', '관한', '있는', '없는', '하는', '되는', '된',
  '할', '될', '하고', '되고', '그리고', '하지만', '그러나', '또한', '및', '등',
  '것', '수', '때', '중', '후', '전', '내', '외', '더', '안', '못', '잘',
]);

/**
 * 키워드에서 핵심 단어 추출 (조사/접속사 제거)
 * - 특수문자(·, /, :, -)로 복합 키워드 분리
 * - 인물명 등 고유명사는 유지
 */
function extractCoreKeywords(keyword: string): string[] {
  // 1단계: 복합 키워드 분리 (·, /, :, - 등)
  // 예: "김설·5살 진주 폭풍 성장" → ["김설", "5살", "진주", "폭풍", "성장"]
  const complexSeparators = /[·\/:\-–—|,;]+/g;
  const segments = keyword.split(complexSeparators).map(s => s.trim()).filter(s => s.length >= 2);

  // 2단계: 각 세그먼트에서 공백으로 단어 분리
  const allWords: string[] = [];
  for (const seg of segments) {
    const words = seg.split(/[\s]+/).filter(w => w.length >= 2);
    allWords.push(...words);
  }

  // 3단계: 불용어 제거 (단, 인물명 패턴은 유지)
  const coreWords = allWords.filter(w => {
    // 숫자+단위 패턴 (예: 5살, 10년)은 유지
    if (/^\d+/.test(w)) return true;
    // 불용어 제거
    return !STOP_WORDS.has(w);
  });

  // 핵심 키워드가 없으면 전체 세그먼트 반환
  return coreWords.length > 0 ? coreWords : segments.slice(0, 4);
}

/**
 * 복합 키워드에서 주요 키워드 추출 (인물명/주제 우선)
 * 예: "이제훈, 삼흥도 범죄 공범 의혹" → "이제훈" (첫 번째 고유명사)
 */
export function extractPrimaryKeyword(keyword: string): string {
  const segments = keyword.split(/[·\/:\-–—|,;]+/).map(s => s.trim()).filter(s => s.length >= 2);

  // 첫 번째 세그먼트가 보통 주요 인물/주제
  if (segments.length > 0) {
    // 첫 세그먼트에서 첫 단어 추출 (인물명일 확률 높음)
    const firstWords = segments[0].split(/\s+/).filter(w => w.length >= 2);
    if (firstWords.length > 0) {
      return firstWords[0];
    }
    return segments[0];
  }

  return keyword.split(/\s+/)[0] || keyword;
}

/**
 * 검색 결과의 관련성 검증
 * @param keyword 원본 검색 키워드
 * @param title 검색 결과 제목
 * @param description 검색 결과 설명 (선택)
 * @returns 관련성 점수 (0~1), 0.5 이상이면 관련 있음
 */
function validateSearchRelevance(keyword: string, title: string, description?: string): number {
  const coreKeywords = extractCoreKeywords(keyword);
  if (coreKeywords.length === 0) return 1; // 키워드 추출 실패시 통과

  const searchTarget = `${title} ${description || ''}`.toLowerCase();

  // 각 핵심 키워드가 제목/설명에 포함되어 있는지 확인
  let matchCount = 0;
  for (const coreWord of coreKeywords) {
    if (searchTarget.includes(coreWord.toLowerCase())) {
      matchCount++;
    }
  }

  // 관련성 점수: 일치하는 핵심 키워드 비율
  const relevanceScore = matchCount / coreKeywords.length;
  return relevanceScore;
}

/**
 * HTML 태그 제거 유틸리티
 */
function stripHtmlTags(str: string): string {
  return str.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
}

/**
 * ✅ 공통: 401 에러 로그 (간소화)
 */
function log401Error(apiType: string, clientId?: string): void {
  console.error(`[네이버 검색 API] ${apiType} 인증 실패 (401)`);
  console.error(`[네이버 검색 API] Client ID: ${clientId ? `${clientId.substring(0, 8)}...` : '없음'}`);
  console.error(`[네이버 검색 API] → 개발자센터에서 API 키 확인 필요: https://developers.naver.com`);
}

/**
 * ✅ 공통: API 응답에서 관련 URL 추출
 */
function extractRelevantUrls(
  items: Array<{ link?: string; title?: string; description?: string }>,
  keyword: string,
  maxResults: number
): string[] {
  const relevantItems = items.filter(item => {
    if (!item.link || !item.link.startsWith('http')) return false;
    const title = stripHtmlTags(item.title || '');
    const desc = stripHtmlTags(item.description || '');
    const relevance = validateSearchRelevance(keyword, title, desc);
    return relevance >= 0.5;
  });

  return relevantItems.map(item => item.link!).slice(0, maxResults);
}

/**
 * 네이버 검색 API를 사용한 블로그 검색
 */
export async function searchNaverBlogRss(
  keyword: string,
  maxResults: number = 10,
  clientId?: string,
  clientSecret?: string,
  targetDate?: string // ✅ 발행 날짜 기준 크롤링
): Promise<string[]> {
  try {
    // 네이버 검색 API 사용 (API 키가 있는 경우)
    if (clientId && clientSecret) {
      // ✅ 날짜 범위 설정 (발행 날짜 기준으로 최근 30일 이내 검색)
      let dateParams = '';
      if (targetDate) {
        try {
          const target = new Date(targetDate);
          const dateFrom = new Date(target);
          dateFrom.setDate(dateFrom.getDate() - 30); // 발행 날짜 기준 30일 전부터
          const dateTo = new Date(target);
          dateTo.setDate(dateTo.getDate() + 1); // 발행 날짜 다음날까지

          const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '');
          dateParams = `&datefrom=${formatDate(dateFrom)}&dateto=${formatDate(dateTo)}`;
          console.log(`[네이버 검색 API] 날짜 범위 검색: ${formatDate(dateFrom)} ~ ${formatDate(dateTo)}`);
        } catch (e) {
          console.warn('[네이버 검색 API] 날짜 파싱 실패, 날짜 필터 없이 검색:', e);
        }
      }

      const searchUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=${Math.min(maxResults, 100)}&sort=date${dateParams}`;

      const fetch = await ensureFetch();
      const response = await fetch(searchUrl, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.warn(`[네이버 검색 API] 블로그 검색 실패: ${response.status} ${response.statusText}`);
        console.warn(`[네이버 검색 API] 요청 URL: ${searchUrl}`);
        console.warn(`[네이버 검색 API] Client ID 길이: ${clientId?.length || 0}, Client Secret 길이: ${clientSecret?.length || 0}`);

        if (errorText) {
          try {
            const errorJson = JSON.parse(errorText);
            console.warn(`[네이버 검색 API] 오류 내용:`, errorJson);
            if (errorJson.errorMessage) {
              console.error(`[네이버 검색 API] 오류 메시지: ${errorJson.errorMessage}`);
            }
          } catch {
            console.warn(`[네이버 검색 API] 오류 내용 (텍스트): ${errorText.substring(0, 300)}`);
          }
        }

        // 401 오류인 경우 간소화된 메시지
        if (response.status === 401) {
          log401Error('블로그', clientId);
        }

        // API 실패 시 RSS로 폴백
        return await searchNaverBlogRssFallback(keyword, maxResults);
      }

      const data = await response.json() as { items?: Array<{ link?: string; title?: string; description?: string }> };

      if (data.items && Array.isArray(data.items)) {
        // ✅ 관련성 필터링 적용
        const relevantItems = data.items.filter(item => {
          if (!item.link || !item.link.startsWith('http')) return false;
          const title = stripHtmlTags(item.title || '');
          const desc = stripHtmlTags(item.description || '');
          const relevance = validateSearchRelevance(keyword, title, desc);
          if (relevance < 0.5) {
            console.log(`[네이버 검색 API] 관련성 낮음 (${Math.round(relevance * 100)}%): "${title.substring(0, 40)}..." 제외`);
            return false;
          }
          return true;
        });

        const links = relevantItems
          .map(item => item.link!)
          .slice(0, maxResults);

        console.log(`[네이버 검색 API] 블로그 ${data.items.length}개 중 ${links.length}개 관련 URL 발견`);
        return links;
      }
    }

    // API 키가 없거나 실패한 경우 RSS로 폴백
    return await searchNaverBlogRssFallback(keyword, maxResults);
  } catch (error) {
    console.error(`[네이버 검색 API] 블로그 검색 오류:`, (error as Error).message);
    // 오류 발생 시 RSS로 폴백
    return await searchNaverBlogRssFallback(keyword, maxResults);
  }
}

/**
 * 네이버 블로그 RSS 검색 (폴백)
 */
async function searchNaverBlogRssFallback(keyword: string, maxResults: number = 10): Promise<string[]> {
  try {
    const searchUrl = `https://rss.search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}&display=${maxResults}`;

    const fetch = await ensureFetch();
    const response = await fetch(searchUrl);

    if (!response.ok) {
      console.warn(`[RSS 검색] 네이버 블로그 RSS 검색 실패: ${response.status}`);
      return [];
    }

    const xml = await response.text();

    // RSS 피드에서 링크 추출
    const linkMatches = xml.match(/<link>([^<]+)<\/link>/g) || [];
    const links = linkMatches
      .map(match => match.replace(/<\/?link>/g, '').trim())
      .filter(link => link.startsWith('http'))
      .slice(0, maxResults);

    return links;
  } catch (error) {
    console.error(`[RSS 검색] 네이버 블로그 RSS 검색 오류:`, (error as Error).message);
    return [];
  }
}

/**
 * 특정 블로그 ID의 최근 게시글 목록 가져오기
 */
export async function getBlogRecentPosts(
  blogId: string,
  clientId?: string,
  clientSecret?: string,
  maxResults: number = 20
): Promise<{ title: string; url: string; date: string }[]> {
  try {
    // 1. 네이버 검색 API 사용 시도 (검색어: blogId)
    if (clientId && clientSecret) {
      const searchUrl = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(blogId)}&display=${Math.min(maxResults, 100)}&sort=date`;

      const fetch = await ensureFetch();
      const response = await fetch(searchUrl, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      });

      if (response.ok) {
        const data = await response.json() as { items?: Array<{ title: string; link: string; postdate: string }> };
        if (data.items && Array.isArray(data.items)) {
          // 해당 블로그 ID가 URL에 포함된 글만 필터링
          return data.items
            .filter(item => item.link.includes(blogId))
            .map(item => ({
              title: item.title.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"'),
              url: item.link,
              date: item.postdate // YYYYMMDD
            }))
            .slice(0, maxResults);
        }
      }
    }

    // 2. RSS 직접 파싱 (폴백)
    const rssUrl = `https://rss.blog.naver.com/${blogId}.xml`;
    const fetch = await ensureFetch();
    const rssRes = await fetch(rssUrl);

    if (rssRes.ok) {
      const xml = await rssRes.text();
      const items: { title: string; url: string; date: string }[] = [];

      // <item> 블록 추출
      const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

      for (const block of itemBlocks) {
        const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || block.match(/<title>([^<]+)<\/title>/);
        const linkMatch = block.match(/<link>([^<]+)<\/link>/);
        const dateMatch = block.match(/<pubDate>([^<]+)<\/pubDate>/);

        if (titleMatch && linkMatch) {
          const title = titleMatch[1].trim();
          const url = linkMatch[1].trim();
          let dateStr = '';

          if (dateMatch) {
            try {
              const d = new Date(dateMatch[1]);
              dateStr = d.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD 형식으로 통일
            } catch {
              dateStr = dateMatch[1];
            }
          }

          items.push({ title, url, date: dateStr });
        }

        if (items.length >= maxResults) break;
      }

      if (items.length > 0) return items;
    }

    return [];
  } catch (error) {
    console.error(`[getBlogRecentPosts] 오류:`, (error as Error).message);
    return [];
  }
}

/**
 * 네이버 검색 API를 사용한 카페 검색
 */
export async function searchNaverCafeRss(
  keyword: string,
  maxResults: number = 10,
  clientId?: string,
  clientSecret?: string
): Promise<string[]> {
  try {
    // 네이버 검색 API 사용 (API 키가 있는 경우)
    if (clientId && clientSecret) {
      // ✅ 최신순 정렬로 변경 (sim → date)
      const searchUrl = `https://openapi.naver.com/v1/search/cafearticle.json?query=${encodeURIComponent(keyword)}&display=${Math.min(maxResults, 100)}&sort=date`;

      const fetch = await ensureFetch();
      const response = await fetch(searchUrl, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.warn(`[네이버 검색 API] 카페 검색 실패: ${response.status} ${response.statusText}`);
        if (errorText) {
          console.warn(`[네이버 검색 API] 오류 내용: ${errorText.substring(0, 200)}`);
        }

        // 401 오류인 경우 간소화된 메시지
        if (response.status === 401) {
          log401Error('카페', clientId);
        }

        // API 실패 시 RSS로 폴백
        return await searchNaverCafeRssFallback(keyword, maxResults);
      }

      const data = await response.json() as { items?: Array<{ link?: string; title?: string; description?: string }> };

      if (data.items && Array.isArray(data.items)) {
        // ✅ 관련성 필터링 적용
        const relevantItems = data.items.filter(item => {
          if (!item.link || !item.link.startsWith('http')) return false;
          const title = stripHtmlTags(item.title || '');
          const desc = stripHtmlTags(item.description || '');
          const relevance = validateSearchRelevance(keyword, title, desc);
          if (relevance < 0.5) {
            console.log(`[네이버 검색 API] 카페 관련성 낮음 (${Math.round(relevance * 100)}%): "${title.substring(0, 40)}..." 제외`);
            return false;
          }
          return true;
        });

        const links = relevantItems
          .map(item => item.link!)
          .slice(0, maxResults);

        console.log(`[네이버 검색 API] 카페 ${data.items.length}개 중 ${links.length}개 관련 URL 발견`);
        return links;
      }
    }

    // API 키가 없거나 실패한 경우 RSS로 폴백
    return await searchNaverCafeRssFallback(keyword, maxResults);
  } catch (error) {
    console.error(`[네이버 검색 API] 카페 검색 오류:`, (error as Error).message);
    // 오류 발생 시 RSS로 폴백
    return await searchNaverCafeRssFallback(keyword, maxResults);
  }
}

/**
 * 네이버 카페 RSS 검색 (폴백)
 */
async function searchNaverCafeRssFallback(keyword: string, maxResults: number = 10): Promise<string[]> {
  try {
    const searchUrl = `https://rss.search.naver.com/search.naver?where=cafe&query=${encodeURIComponent(keyword)}&display=${maxResults}`;

    const fetch = await ensureFetch();
    const response = await fetch(searchUrl);

    if (!response.ok) {
      console.warn(`[RSS 검색] 네이버 카페 RSS 검색 실패: ${response.status}`);
      return [];
    }

    const xml = await response.text();

    // RSS 피드에서 링크 추출
    const linkMatches = xml.match(/<link>([^<]+)<\/link>/g) || [];
    const links = linkMatches
      .map(match => match.replace(/<\/?link>/g, '').trim())
      .filter(link => link.startsWith('http'))
      .slice(0, maxResults);

    return links;
  } catch (error) {
    console.error(`[RSS 검색] 네이버 카페 RSS 검색 오류:`, (error as Error).message);
    return [];
  }
}

/**
 * 네이버 검색 API를 사용한 뉴스 검색
 */
export async function searchNaverNewsRss(
  keyword: string,
  maxResults: number = 10,
  clientId?: string,
  clientSecret?: string,
  targetDate?: string // ✅ 발행 날짜 기준 크롤링
): Promise<string[]> {
  try {
    // 네이버 검색 API 사용 (API 키가 있는 경우)
    if (clientId && clientSecret) {
      // ✅ 날짜 범위 설정 (발행 날짜 기준으로 최근 30일 이내 검색)
      let dateParams = '';
      if (targetDate) {
        try {
          const target = new Date(targetDate);
          const dateFrom = new Date(target);
          dateFrom.setDate(dateFrom.getDate() - 30); // 발행 날짜 기준 30일 전부터
          const dateTo = new Date(target);
          dateTo.setDate(dateTo.getDate() + 1); // 발행 날짜 다음날까지

          const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '');
          dateParams = `&datefrom=${formatDate(dateFrom)}&dateto=${formatDate(dateTo)}`;
          console.log(`[네이버 검색 API] 뉴스 날짜 범위 검색: ${formatDate(dateFrom)} ~ ${formatDate(dateTo)}`);
        } catch (e) {
          console.warn('[네이버 검색 API] 날짜 파싱 실패, 날짜 필터 없이 검색:', e);
        }
      }

      const searchUrl = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=${Math.min(maxResults, 100)}&sort=date${dateParams}`;

      const fetch = await ensureFetch();
      const response = await fetch(searchUrl, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.warn(`[네이버 검색 API] 뉴스 검색 실패: ${response.status} ${response.statusText}`);
        console.warn(`[네이버 검색 API] 요청 URL: ${searchUrl}`);

        if (errorText) {
          try {
            const errorJson = JSON.parse(errorText);
            console.warn(`[네이버 검색 API] 오류 내용:`, errorJson);
            if (errorJson.errorMessage) {
              console.error(`[네이버 검색 API] 오류 메시지: ${errorJson.errorMessage}`);
            }
          } catch {
            console.warn(`[네이버 검색 API] 오류 내용 (텍스트): ${errorText.substring(0, 300)}`);
          }
        }

        // 401 오류인 경우 간소화된 메시지
        if (response.status === 401) {
          log401Error('뉴스', clientId);
        }

        // API 실패 시 RSS로 폴백
        return await searchNaverNewsRssFallback(keyword, maxResults);
      }

      const data = await response.json() as { items?: Array<{ link?: string; title?: string; description?: string }> };

      if (data.items && Array.isArray(data.items)) {
        // ✅ 관련성 필터링 적용
        const relevantItems = data.items.filter(item => {
          if (!item.link || !item.link.startsWith('http')) return false;
          const title = stripHtmlTags(item.title || '');
          const desc = stripHtmlTags(item.description || '');
          const relevance = validateSearchRelevance(keyword, title, desc);
          if (relevance < 0.5) {
            console.log(`[네이버 검색 API] 뉴스 관련성 낮음 (${Math.round(relevance * 100)}%): "${title.substring(0, 40)}..." 제외`);
            return false;
          }
          return true;
        });

        const links = relevantItems
          .map(item => item.link!)
          .slice(0, maxResults);

        console.log(`[네이버 검색 API] 뉴스 ${data.items.length}개 중 ${links.length}개 관련 URL 발견`);
        return links;
      }
    }

    // API 키가 없거나 실패한 경우 RSS로 폴백
    return await searchNaverNewsRssFallback(keyword, maxResults);
  } catch (error) {
    console.error(`[네이버 검색 API] 뉴스 검색 오류:`, (error as Error).message);
    // 오류 발생 시 RSS로 폴백
    return await searchNaverNewsRssFallback(keyword, maxResults);
  }
}

/**
 * 네이버 뉴스 RSS 검색 (폴백)
 */
async function searchNaverNewsRssFallback(keyword: string, maxResults: number = 10): Promise<string[]> {
  try {
    const searchUrl = `https://rss.search.naver.com/search.naver?where=news&query=${encodeURIComponent(keyword)}&display=${maxResults}`;

    const fetch = await ensureFetch();
    const response = await fetch(searchUrl);

    if (!response.ok) {
      console.warn(`[RSS 검색] 네이버 뉴스 RSS 검색 실패: ${response.status}`);
      return [];
    }

    const xml = await response.text();

    // RSS 피드에서 링크 추출
    const linkMatches = xml.match(/<link>([^<]+)<\/link>/g) || [];
    const links = linkMatches
      .map(match => match.replace(/<\/?link>/g, '').trim())
      .filter(link => link.startsWith('http'))
      .slice(0, maxResults);

    return links;
  } catch (error) {
    console.error(`[RSS 검색] 네이버 뉴스 RSS 검색 오류:`, (error as Error).message);
    return [];
  }
}

/**
 * 구글 뉴스 RSS 검색
 */
export async function searchGoogleNewsRss(keyword: string, maxResults: number = 10): Promise<string[]> {
  try {
    // 구글 뉴스 RSS URL
    const searchUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=ko&gl=KR&ceid=KR:ko&num=${maxResults}`;

    const fetch = await ensureFetch();
    const response = await fetch(searchUrl);

    if (!response.ok) {
      console.warn(`[RSS 검색] 구글 뉴스 RSS 검색 실패: ${response.status}`);
      return [];
    }

    const xml = await response.text();

    // RSS 피드에서 링크 추출
    const linkMatches = xml.match(/<link>([^<]+)<\/link>/g) || [];
    const links = linkMatches
      .map(match => match.replace(/<\/?link>/g, '').trim())
      .filter(link => link.startsWith('http'))
      .slice(0, maxResults);

    return links;
  } catch (error) {
    console.error(`[RSS 검색] 구글 뉴스 RSS 검색 오류:`, (error as Error).message);
    return [];
  }
}

/**
 * 키워드로 모든 소스에서 검색 (네이버 검색 API 우선 사용)
 */
export async function searchAllRssSources(
  keyword: string,
  options: {
    maxPerSource?: number;
    sources?: ('naver_blog' | 'naver_cafe' | 'naver_news' | 'google_news')[];
    clientId?: string;
    clientSecret?: string;
    targetDate?: string; // ✅ 발행 날짜 기준 크롤링 (YYYY-MM-DD 또는 YYYY-MM-DDTHH:mm 형식)
  } = {}
): Promise<string[]> {
  const { maxPerSource = 10, sources = ['naver_blog', 'naver_cafe', 'naver_news', 'google_news'], clientId, clientSecret, targetDate } = options;

  const dateInfo = targetDate ? ` (발행 날짜 기준: ${targetDate})` : '';
  console.log(`[검색] 키워드 "${keyword}"로 검색 시작...${dateInfo} (네이버 검색 API ${clientId ? '사용' : '미사용'})`);

  const allUrls: string[] = [];

  // 병렬로 모든 소스 검색
  const searchPromises: Promise<string[]>[] = [];

  if (sources.includes('naver_blog')) {
    searchPromises.push(searchNaverBlogRss(keyword, maxPerSource, clientId, clientSecret, targetDate));
  }

  if (sources.includes('naver_cafe')) {
    searchPromises.push(searchNaverCafeRss(keyword, maxPerSource, clientId, clientSecret));
  }

  if (sources.includes('naver_news')) {
    searchPromises.push(searchNaverNewsRss(keyword, maxPerSource, clientId, clientSecret, targetDate));
  }

  if (sources.includes('google_news')) {
    searchPromises.push(searchGoogleNewsRss(keyword, maxPerSource));
  }

  const results = await Promise.allSettled(searchPromises);

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const urls = result.value;
      allUrls.push(...urls);
      const sourceNames = ['네이버 블로그', '네이버 카페', '네이버 뉴스', '구글 뉴스'];
      const sourceIndex = index % sourceNames.length;
      console.log(`[검색] ${sourceNames[sourceIndex]}: ${urls.length}개 URL 발견`);
    } else {
      console.warn(`[검색] 검색 실패:`, (result.reason as Error).message);
    }
  });

  // 중복 제거
  const uniqueUrls = Array.from(new Set(allUrls));

  console.log(`[검색] 총 ${uniqueUrls.length}개의 고유 URL 발견`);

  return uniqueUrls;
}

/**
 * Fetch 함수 확보
 */
async function ensureFetch(): Promise<typeof globalThis.fetch> {
  if (typeof fetch === 'function') {
    return fetch;
  }
  const module = await import('node-fetch');
  return module.default as unknown as typeof globalThis.fetch;
}


