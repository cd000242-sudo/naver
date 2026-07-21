/**
 * [v2.11.134] 쇼핑커넥트 리뷰 수집 심화 배선 잠금.
 *
 * 배경: 리뷰가 존재하는 상품에서도 (1) 고정 대기가 lazy-load보다 먼저 끝나
 * "리뷰 0건" 발행, (2) 첫 화면 ~20건만 후보라 알짜 리뷰 누락, (3) 어떤 글이
 * 후기형 체급으로 나갔는지 로그로 확인 불가 문제가 있었다. 이 테스트는
 * 폴링·더보기 확장·수집 로그 배선이 회귀로 사라지지 않도록 잠근다.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { clickReviewListExpand } from '../crawler/shopping/providers/brandStore/brandStoreDom';
import { selectDecisionUsefulReviewTexts } from '../crawler/shopping/utils/reviewTextSelection';
import { parseMobileShoppingMarketItems } from '../sourceAssembler';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('리뷰 수집 폴링 (고정 대기 → 안정화 폴링)', () => {
  const crawler = read('crawler/productSpecCrawler.ts');

  it('collectVisibleProductReviewTexts가 후보 수 안정화 폴링을 사용한다', () => {
    const fn = crawler.slice(
      crawler.indexOf('async function collectVisibleProductReviewTexts'),
      crawler.indexOf('export interface ProductSpec'),
    );
    expect(fn).toMatch(/stablePolls/);
    expect(fn).toMatch(/candidates\.length === lastCount/);
    // 리뷰 탭 미클릭 + 미렌더 시 조기 종료 (전체 폴링 예산 낭비 방지)
    expect(fn).toMatch(/!tab\?\.clicked && poll >= 4 && candidates\.length === 0/);
    // 더보기/페이지 확장 클릭 배선
    expect(fn).toMatch(/clickReviewListExpand/);
    // 수집 로그 (DOM 후보 → 정선)
    expect(fn).toMatch(/DOM 후보 \$\{accumulated\.length\}건 → 정선/);
  });

  it('BrandStoreProvider가 0건 재시도 + 확장 클릭을 배선한다', () => {
    const provider = read('crawler/shopping/providers/BrandStoreProvider.ts');
    expect(provider).toMatch(/reviewCandidates\.length === 0/);
    expect(provider).toMatch(/clickReviewListExpand/);
    expect(provider).toMatch(/JSON-LD \$\{jsonLdInfo\.reviewTexts\.length\}건 \+ DOM \$\{visibleReviewTexts\.length\}건/);
  });
});

describe('clickReviewListExpand — navigation 가드 (리뷰이벤트 회귀 클래스 차단)', () => {
  it('실제 href를 가진 앵커는 클릭 대상에서 제외하는 가드가 소스에 있다', () => {
    const dom = read('crawler/shopping/providers/brandStore/brandStoreDom.ts');
    const fn = dom.slice(dom.indexOf('export function clickReviewListExpand'));
    expect(fn).toMatch(/noNavigation/);
    expect(fn).toMatch(/href\.startsWith\('#'\)/);
    // 리뷰 영역 밖의 더보기(상세정보 더보기 등)는 클릭하지 않는다.
    expect(fn).toMatch(/inReviewArea/);
  });

  it('DOM이 없는 환경에서 호출돼도 예외 대신 미클릭을 반환하는 구조가 아니다 — 브라우저 전용 함수임을 명시', () => {
    // page.evaluate 안에서만 실행되는 함수 — Node에서 직접 호출하면 document
    // 참조로 throw한다. 여기서는 함수가 존재하고 직렬화 가능한지만 확인한다.
    expect(typeof clickReviewListExpand).toBe('function');
    expect(String(clickReviewListExpand)).toContain('document.querySelectorAll');
  });
});

describe('checkForError/checkForCaptcha — 본문 키워드 오탐 차단 (라이브 실측 버그)', () => {
  // 실측: 리뷰 "과전류시 자동차단기능"의 '차단'이 에러 키워드에 걸려 정상 상품
  // 페이지 크롤 전체가 실패했다. 키워드는 에러 페이지 형태(제목 매칭 or 짧은
  // 본문)에서만 신뢰해야 한다.
  const code = read('crawler/crawlerBrowser.ts');

  it('에러 키워드는 제목 매칭 또는 1,500자 미만 본문에서만 신뢰한다', () => {
    const fn = code.slice(code.indexOf('export async function checkForError'), code.indexOf('export async function checkForCaptcha'));
    expect(fn).toMatch(/errorKeywords\.some\(k => titleLower\.includes\(k\)\)/);
    expect(fn).toMatch(/body\.trim\(\)\.length < 1500/);
    // 본문 전체(combined) 무조건 스캔 패턴이 부활하면 안 된다.
    expect(fn).not.toMatch(/const combined = \(title \+ ' ' \+ body\)\.toLowerCase\(\);\s*\n\s*const errorKeywords/);
  });

  it('캡차 키워드 스캔도 짧은 페이지로 한정한다 (오탐 시 120초 대기 유발)', () => {
    const fn = code.slice(code.indexOf('export async function checkForCaptcha'), code.indexOf('async function waitForCaptchaSolved'));
    expect(fn).toMatch(/body\.trim\(\)\.length >= 1500\) return false/);
  });

  it('navigateWithRetry는 domcontentloaded 우선으로 이동한다 (스토어 SPA는 networkidle 미도달)', () => {
    const fn = code.slice(code.indexOf('export async function navigateWithRetry'));
    expect(fn).toMatch(/waitUntil: 'domcontentloaded', timeout: 45000/);
    expect(fn).not.toMatch(/waitUntil: 'networkidle', timeout: 30000/);
  });
});

describe('리뷰 정선 — 메타데이터 제거·장문 보존·상한 (라이브 실측 샘플 기반)', () => {
  it('평점/마스킹 아이디/날짜 배지를 앞머리에서 제거한다 (실측: 삼성 에어컨 리뷰)', () => {
    const [out] = selectDecisionUsefulReviewTexts([
      '평점5hoch*****26.05.06.설치 가능일 확인 후 2일뒤 바로 설치 했습니다. 설치 기사님 너무 친절히 잘 설치해주셨습니다.',
    ]);
    expect(out.startsWith('설치 가능일')).toBe(true);
    expect(out).not.toContain('평점5');
    expect(out).not.toContain('*****');
  });

  it('언더스코어 포함 마스킹 아이디(100_****)도 제거한다 (실측: 에어컨 리뷰)', () => {
    const [out] = selectDecisionUsefulReviewTexts([
      '100_****26.03.17.원하는 날짜에 정확히 배송해 주셨습니다. 기사님 두분 오셔서 현장 점검 먼저 하셨습니다.',
    ]);
    expect(out.startsWith('원하는 날짜에')).toBe(true);
    expect(out).not.toContain('****');
  });

  it('동영상컨텐츠 배지를 제거하되 속성 평가(소음보통이에요)는 보존한다', () => {
    const [out] = selectDecisionUsefulReviewTexts([
      '동영상컨텐츠평점5소음보통이에요삼성페스타를 통해 20년 이상 사용한 에어컨을 교체했는데 설치까지 빨랐습니다.',
    ]);
    expect(out.startsWith('소음보통이에요')).toBe(true);
    expect(out).not.toContain('동영상컨텐츠');
  });

  it('"재구매 의사"로 시작하는 진짜 문장은 훼손하지 않는다', () => {
    const [out] = selectDecisionUsefulReviewTexts([
      '재구매 의사 있어요. 필터 교체 주기가 길어서 관리가 편합니다.',
    ]);
    expect(out.startsWith('재구매 의사 있어요')).toBe(true);
  });

  it('600자 초과 장문 리뷰는 버리지 않고 600자로 절단해 보존한다', () => {
    const longReview = '설치 과정과 소음 관련 자세한 후기입니다. ' + '실사용 정보 문장입니다. '.repeat(60);
    expect(longReview.length).toBeGreaterThan(600);
    const out = selectDecisionUsefulReviewTexts([longReview]);
    expect(out.length).toBe(1);
    expect(out[0].length).toBeLessThanOrEqual(600);
    expect(out[0].startsWith('설치 과정과 소음')).toBe(true);
  });

  it('정선 상한은 12건이다 (후보 20건 → 12건)', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      `설치 후 ${i + 1}주 사용해 보니 소음이 생각보다 작고 전기 요금 부담도 크지 않았습니다. 단점은 크기입니다.`
      + ` 고유번호${i}`,
    );
    expect(selectDecisionUsefulReviewTexts(many).length).toBe(12);
  });
});

describe('상세 스펙 수집 체인 — 제공고시 모달 (v2.11.135, 라이브 실측 구조)', () => {
  it('brandStoreDom이 탭→아코디언→모달수집→닫기 함수 4종을 제공한다', () => {
    const dom = read('crawler/shopping/providers/brandStore/brandStoreDom.ts');
    expect(dom).toMatch(/export function clickProductDetailTab/);
    expect(dom).toMatch(/export function openProductInfoNoticeLayer/);
    expect(dom).toMatch(/export function collectProductNoticeSpecText/);
    expect(dom).toMatch(/export function closeTopLayer/);
    // placeholder 값("상품상세참조" 류)과 판매자 연락처 행은 스펙이 아니다.
    expect(dom).toMatch(/상품상세참조\|상세설명에 표시\|상세정보 확인/);
    expect(dom).toMatch(/판매자\|사업자\|통신판매\|연락처\|전화번호/);
  });

  it('brandconnect 경로가 스펙 체인을 리뷰 수집 전에 실행하고 모달을 닫는다', () => {
    const crawler = read('crawler/productSpecCrawler.ts');
    const specIdx = crawler.indexOf('openProductInfoNoticeLayer);');
    const closeIdx = crawler.indexOf('closeTopLayer);');
    const reviewIdx = crawler.indexOf('collectVisibleProductReviewTexts(bcPage)');
    expect(specIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeGreaterThan(specIdx);
    expect(reviewIdx).toBeGreaterThan(closeIdx);
    // 스펙이 설명에 합류하고 프롬프트 예산 캡이 있다.
    expect(crawler).toMatch(/상품 상세 정보:\\n\$\{detailSpecText\}/);
    expect(crawler).toMatch(/\.substring\(0, 3000\)/);
  });

  it('BrandStoreProvider도 동일 체인을 배선한다', () => {
    const provider = read('crawler/shopping/providers/BrandStoreProvider.ts');
    expect(provider).toMatch(/openProductInfoNoticeLayer/);
    expect(provider).toMatch(/collectProductNoticeSpecText/);
    expect(provider).toMatch(/closeTopLayer/);
  });
});

describe('naver.me/brandconnect 분기 — 리뷰 증거 배선 (앱 레벨 E2E로 발견된 버그)', () => {
  // 실측: 사용자가 실제로 붙여넣는 naver.me 링크가 타는 fetchSingleSource 분기가
  // 리뷰 섹션도 shoppingEvidence도 없이 반환 → P0 가드가 리뷰 0건으로 판정,
  // 후기형이 전부 스펙분석으로 강등됐다. (수정 후 실측: rawText 382→5,575자,
  // productReviews 0→12건)
  it('스토어 매칭 성공 시 리뷰 섹션과 shoppingEvidence를 함께 반환한다', () => {
    const assembler = read('sourceAssembler.ts');
    const branch = assembler.slice(
      assembler.indexOf('정확한 상품 매칭'),
      assembler.indexOf('crawlFromAffiliateLink 결과 부족'),
    );
    expect(branch).toMatch(/실제 구매자 리뷰/);
    expect(branch).toMatch(/buildCompetitorComparisonSection\(productName\)/);
    expect(branch).toMatch(/buildShoppingEvidenceSnapshot\(/);
    expect(branch).toMatch(/affiliateEvidence\.usable \? \{ shoppingEvidence: affiliateEvidence \} : \{\}/);
  });
});

describe('쇼핑 검색 API 종료 대비 (2026-07-31, 공지 32564)', () => {
  it('searchShopping은 절대 throw하지 않고 빈 결과로 강등된다', () => {
    const api = read('naverSearchApi.ts');
    const fn = api.slice(api.indexOf('export async function searchShopping'), api.indexOf('export async function searchBlog'));
    expect(fn).toMatch(/try \{\s*\n\s*return await callNaverSearchApi<ShoppingItem>/);
    expect(fn).toMatch(/items: \[\]/);
  });

  it('경쟁상품 비교 재료는 API → 모바일 검색 HTML 파싱 폴백 체인을 가진다', () => {
    const assembler = read('sourceAssembler.ts');
    const fn = assembler.slice(
      assembler.indexOf('export async function buildCompetitorComparisonSection'),
      assembler.indexOf('export async function assembleContentSource'),
    );
    expect(fn).toMatch(/searchShopping\(\{ query, display: 10/);
    expect(fn).toMatch(/fetchMobileShoppingMarketItems\(query\)/);
  });

  it('모바일 검색 파서가 실측 마크업 패턴에서 상품명+가격 쌍을 추출한다', () => {
    // 라이브 실측 구조 재현: 한 텍스트런에 상품들이 ';'로 이어지고
    // 조회수 숫자가 가격 앞에 붙는 형태.
    const html = '<span class="sds-comps-text">비브르 <mark>무선청소기</mark> 원룸 진공 흡입력 좋은 차이슨 거치대 V25000138,000원 · VIVRE KOREA ; '
      + '클래파 초경량 자동먼지비움 <mark>청소기</mark> 가벼운 핸디 물걸레키트168,000원 · 클래파 ; '
      + '집게 3,900원 · 소형몰</span>';
    const items = parseMobileShoppingMarketItems(html);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0].price).toBe(138000);
    expect(items[0].title).toContain('무선청소기');
    expect(items[0].title).not.toMatch(/\d{4,}$/);
    expect(items[0].mall).toBe('VIVRE KOREA');
    expect(items[1].price).toBe(168000);
  });

  it('파서는 빈/무관 HTML에서 빈 배열을 반환한다 (파이프라인 무해)', () => {
    expect(parseMobileShoppingMarketItems('')).toEqual([]);
    expect(parseMobileShoppingMarketItems('<html><body>검색 결과가 없습니다</body></html>')).toEqual([]);
  });
});

describe('발행 로그 — 리뷰 근거 체급 표기', () => {
  it('sourceAssembler가 사용자 로그에 리뷰 수집 건수와 스펙 분석 모드 여부를 표기한다', () => {
    const assembler = read('sourceAssembler.ts');
    expect(assembler).toMatch(/구매자 리뷰 \$\{crawledReviews\.length\}건/);
    expect(assembler).toMatch(/구매자 리뷰 \$\{retryReviews\.length\}건/);
    expect(assembler).toMatch(/스펙 분석 모드로 진행/);
  });
});
