import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildKeywordDetail, keywordSlug, isEvergreenKeyword } from '../src/lib/keywordDetailContent.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');
const templatePath = path.join(distDir, 'index.html');
const legacyAdminDir = path.resolve(__dirname, '..', '..', 'admin');
const legacyAdminPath = path.join(legacyAdminDir, 'index.html');
const siteOrigin = 'https://leaderspro.kr';

const routes = [
  {
    path: 'products',
    title: '제품정보 | Leaders Pro',
    description: 'LEWORD, Better Life Naver, Leaders Orbit 제품 정보를 한곳에서 확인하세요.',
  },
  {
    path: 'detail',
    title: 'Better Life Naver | 네이버 블로그 자동화',
    description: 'AI 글쓰기, 이미지 생성, 예약 발행까지 처리하는 네이버 블로그 자동화 솔루션입니다.',
  },
  {
    path: 'leword-detail',
    title: 'LEWORD 상세 | AI 키워드 인텔리전스',
    description: '검색량, 문서수, 경쟁 비율, 실시간 신호를 바탕으로 블로그 키워드 후보를 발굴합니다.',
  },
  {
    path: 'leword',
    title: 'LEWORD Pro Web | 실시간 키워드 분석',
    description: '서버 기반 실시간 키워드 분석과 황금 키워드 보드를 제공하는 LEWORD Pro Web입니다.',
  },
  {
    path: 'briefing',
    title: '무료 선정 황금키워드 | Leaders Pro',
    description: '매일 검토해 올린 무료 선정 황금키워드 전체 목록입니다. 검색량, 문서수, 기회지수를 함께 확인하세요.',
  },
  {
    path: 'orbit',
    title: 'Leaders Orbit | 외부유입 자동화',
    description: '블로그스팟, 워드프레스, 티스토리로 외부유입 보조 글을 발행하는 자동화 도구입니다.',
  },
  {
    path: 'pricing',
    title: '구매 및 요금제 | Leaders Pro',
    description: 'Leaders Pro 제품별 요금제, 구매 옵션, 기간제 이용권 안내를 확인하세요.',
  },
  {
    path: 'download',
    title: '다운로드 | Leaders Pro',
    description: 'LEWORD와 Leaders Pro 제품 설치 파일 및 업데이트 안내를 확인하세요.',
  },
  {
    path: 'chatbots',
    title: '무료 챗봇 | Leaders Pro',
    description: 'Leaders Pro가 제공하는 무료 AI 챗봇과 키워드 도구를 확인하세요.',
  },
  {
    path: 'reviews',
    title: '후기 | Leaders Pro',
    description: 'Leaders Pro 사용자 후기와 자동화 성과 사례를 확인하세요.',
  },
  {
    path: 'community',
    title: '커뮤니티 | Leaders Pro',
    description: 'Leaders Pro 공지, 업데이트, 사용 팁과 커뮤니티 소식을 확인하세요.',
  },
  {
    path: 'lookup',
    title: '주문 조회 | Leaders Pro',
    description: 'Leaders Pro 주문 및 라이선스 정보를 조회합니다.',
  },
  {
    path: 'refund',
    title: '환불 및 취소 정책 | Leaders Pro',
    description: 'Leaders Pro 환불, 취소, 구독 정책을 확인하세요.',
  },
  {
    path: 'privacy',
    title: '개인정보처리방침 | Leaders Pro',
    description: 'Leaders Pro 개인정보 수집, 이용, 보관 정책을 확인하세요.',
  },
  {
    path: 'terms',
    title: '이용약관 | Leaders Pro',
    description: 'Leaders Pro 서비스 이용약관과 사용자 권리 및 의무를 확인하세요.',
  },
];

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function escapeText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function replaceRequired(html, pattern, replacement, label) {
  const next = html.replace(pattern, replacement);
  if (next === html) {
    throw new Error(`Failed to update ${label} in ${templatePath}`);
  }
  return next;
}

const numberFormat = new Intl.NumberFormat('ko-KR');

/**
 * 검색 크롤러용 본문 프리렌더.
 *
 * SPA 는 내용을 브라우저에서 불러오기 때문에 크롤러에게는 빈 껍데기로 보인다
 * (측정값: /briefing 본문 텍스트 112자). 그래서 빌드 시점에 실제 키워드 표를
 * #root 안에 미리 그려 둔다. React 가 마운트하면 이 내용을 그대로 교체하므로
 * 사용자에게는 항상 최신 데이터가 보이고, 크롤러에게만 본문이 남는다.
 *
 * 주의: 빌드 시점 시드 스냅샷이라 관리자가 새로 발행하면 정적 본문은 다음
 * 빌드까지 이전 내용이다. 사용자 화면은 API 최신본이라 영향 없다.
 */
function briefingPrerender() {
  const seedPath = path.resolve(__dirname, '..', 'public', 'data', 'home-keyword-briefing-seed.json');
  if (!fs.existsSync(seedPath)) return '';
  let seed;
  try {
    seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  } catch (error) {
    console.warn(`[static-routes] briefing seed parse failed: ${error.message}`);
    return '';
  }
  const rows = Array.isArray(seed?.rows) ? seed.rows : [];
  if (!rows.length) return '';

  const items = rows
    .filter((row) => row && typeof row.keyword === 'string' && row.keyword.trim())
    .map((row) => {
      const raw = row.keyword.trim();
      const keyword = escapeText(raw);
      const slug = keywordSlug(raw);
      const volume = Number.isFinite(Number(row.searchVolume)) ? numberFormat.format(Number(row.searchVolume)) : '-';
      const documents = Number.isFinite(Number(row.documentCount)) ? numberFormat.format(Number(row.documentCount)) : '-';
      const opportunity = Number.isFinite(Number(row.opportunity)) ? Number(row.opportunity).toFixed(1) : '-';
      // 상세 페이지로 링크한다 — 내부 링크가 없으면 크롤러가 상세를 타고 들어가지 못한다.
      const cell = slug ? `<a href="/keyword/${encodeURIComponent(slug)}">${keyword}</a>` : keyword;
      return `<tr><th scope="row">${cell}</th><td>${volume}</td><td>${documents}</td><td>${opportunity}</td></tr>`;
    });
  if (!items.length) return '';

  const title = escapeText(seed.title || '무료 선정 황금키워드');
  const author = escapeText(seed.author || '');
  const published = escapeText(seed.publishedAt || '');
  const byline = [author && `${author} 제공`, published].filter(Boolean).join(' · ');

  return [
    '<div id="briefing-prerender">',
    `<h1>${title}</h1>`,
    byline ? `<p>${byline}</p>` : '',
    `<p>매일 검토해 올린 무료 선정 황금키워드 ${items.length}개입니다. 실시간 값이 아니라 검토 시점의 고정 스냅샷이며, 기회지수는 검색량 ÷ (문서수 + 1) 로 계산합니다. 문서수가 검색량에 비해 적을수록 아직 글이 적어 노려볼 만한 키워드입니다.</p>`,
    '<table><caption>키워드별 검색량·문서수·기회지수</caption><thead><tr>',
    '<th scope="col">키워드</th><th scope="col">검색량</th><th scope="col">문서수</th><th scope="col">기회지수</th>',
    '</tr></thead><tbody>',
    items.join(''),
    '</tbody></table>',
    '</div>',
  ].filter(Boolean).join('');
}

const PRERENDER_BY_PATH = {
  briefing: briefingPrerender,
};

function loadBriefingRows() {
  const seedPath = path.resolve(__dirname, '..', 'public', 'data', 'home-keyword-briefing-seed.json');
  if (!fs.existsSync(seedPath)) return [];
  try {
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    return Array.isArray(seed?.rows) ? seed.rows : [];
  } catch (error) {
    console.warn(`[static-routes] briefing seed parse failed: ${error.message}`);
    return [];
  }
}

/** 키워드 상세 페이지 본문. 얇으면 저품질로 취급되므로 실측 근거·해석·목차·연관을 모두 넣는다. */
function keywordDetailPrerender(detail) {
  const esc = escapeText;
  const num = (value) => (Number.isFinite(value) ? numberFormat.format(value) : '-');
  const related = detail.related.length
    ? `<h2>같은 브리핑의 관련 키워드</h2><ul>${detail.related
        .map((row) => `<li><a href="/keyword/${encodeURIComponent(keywordSlug(row.keyword))}">${esc(row.keyword)}</a></li>`)
        .join('')}</ul>`
    : '';
  return [
    '<article id="keyword-detail-prerender">',
    `<h1>${esc(detail.keyword)}</h1>`,
    `<p>${esc(detail.meaning)}</p>`,
    '<h2>실측 지표</h2>',
    '<ul>',
    `<li>월 검색량 ${num(detail.volume)}회</li>`,
    `<li>관련 문서수 ${num(detail.documents)}개</li>`,
    `<li>기회지수 ${detail.opportunity === null ? '-' : detail.opportunity.toFixed(1)} (검색량 ÷ (문서수 + 1))</li>`,
    '</ul>',
    '<h2>지금 이 키워드의 경쟁 상황</h2>',
    `<p>${esc(detail.competition)}</p>`,
    '<p>검색량과 문서수는 검토 시점에 실제로 측정한 값입니다. 실시간 값이 아니라 고정 스냅샷이라, 글을 쓰기 전에 현재 상태를 한 번 더 확인하시는 편이 좋습니다.</p>',
    '<h2>글에 넣어야 할 것</h2>',
    `<ol>${detail.outline.map((item) => `<li>${esc(item)}</li>`).join('')}</ol>`,
    related,
    '<p><a href="/briefing">무료 선정 황금키워드 전체 보기</a></p>',
    '</article>',
  ].filter(Boolean).join('');
}

function writeKeywordDetailPages(template) {
  const rows = loadBriefingRows();
  const seen = new Set();
  const written = [];
  for (const row of rows) {
    const keyword = String(row?.keyword || '').trim();
    if (!keyword) continue;
    // 오래 유효한 키워드만 개별 페이지로 만든다. 실시간 이슈는 낡은 자동생성 페이지가 되므로
    // 날짜 아카이브(writeBriefingArchivePage)에만 남긴다.
    if (!isEvergreenKeyword(keyword)) continue;
    const slug = keywordSlug(keyword);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    const detail = buildKeywordDetail(row, rows);
    const url = `${siteOrigin}/keyword/${encodeURIComponent(slug)}`;
    const title = `${keyword} 키워드 분석 | Leaders Pro`;
    let html = template;
    html = replaceRequired(html, /<title>[\s\S]*?<\/title>/, `<title>${escapeText(title)}</title>`, 'title');
    html = replaceRequired(html, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeAttribute(detail.metaDescription)}" />`, 'description');
    html = replaceRequired(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`, 'canonical');
    html = replaceRequired(html, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${escapeAttribute(title)}" />`, 'og:title');
    html = replaceRequired(html, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${escapeAttribute(detail.metaDescription)}" />`, 'og:description');
    html = replaceRequired(html, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`, 'og:url');
    html = replaceRequired(html, /<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${escapeAttribute(title)}" />`, 'twitter:title');
    html = replaceRequired(html, /<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${escapeAttribute(detail.metaDescription)}" />`, 'twitter:description');
    html = replaceRequired(html, /<div id="root"><\/div>/, `<div id="root">${keywordDetailPrerender(detail)}</div>`, 'keyword prerender');

    const dir = path.join(distDir, 'keyword', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    written.push(slug);
  }
  return written;
}

function routeHtml(template, route) {
  const url = `${siteOrigin}/${route.path}`;
  const title = escapeText(route.title);
  const attrTitle = escapeAttribute(route.title);
  const description = escapeAttribute(route.description);
  let html = template;

  html = replaceRequired(html, /<title>[\s\S]*?<\/title>/, `<title>${title}</title>`, 'title');
  html = replaceRequired(html, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${description}" />`, 'description');
  html = replaceRequired(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`, 'canonical');
  html = replaceRequired(html, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${attrTitle}" />`, 'og:title');
  html = replaceRequired(html, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${description}" />`, 'og:description');
  html = replaceRequired(html, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`, 'og:url');
  html = replaceRequired(html, /<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${attrTitle}" />`, 'twitter:title');
  html = replaceRequired(html, /<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${description}" />`, 'twitter:description');

  const prerender = PRERENDER_BY_PATH[route.path];
  if (prerender) {
    const body = prerender();
    if (body) {
      // #root 안에 넣는다 — React 마운트 시 이 내용이 교체되므로 중복 표시가 없다.
      html = replaceRequired(html, /<div id="root"><\/div>/, `<div id="root">${body}</div>`, `${route.path} prerender`);
    } else {
      console.warn(`[static-routes] ${route.path}: prerender produced no content`);
    }
  }

  return html;
}

if (!fs.existsSync(templatePath)) {
  throw new Error(`Missing Vite build output: ${templatePath}`);
}

const template = fs.readFileSync(templatePath, 'utf8');

for (const route of routes) {
  const routeDir = path.join(distDir, route.path);
  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(path.join(routeDir, 'index.html'), routeHtml(template, route), 'utf8');
}

if (fs.existsSync(legacyAdminPath)) {
  const adminDir = path.join(distDir, 'admin');
  fs.cpSync(legacyAdminDir, adminDir, { recursive: true, force: true });
  const adminHtml = fs.readFileSync(legacyAdminPath, 'utf8');
  fs.writeFileSync(path.join(distDir, 'admin.html'), adminHtml, 'utf8');
  console.log('Copied the complete legacy admin panel to dist/admin and generated dist/admin.html.');
} else {
  console.warn(`Legacy admin panel was not found: ${legacyAdminPath}`);
}

/** 그날 브리핑 전체를 담은 날짜 아카이브. 실시간 이슈는 여기에 '그날의 기록'으로 남아 낡지 않는다. */
function writeBriefingArchivePage(template) {
  const rows = loadBriefingRows();
  if (!rows.length) return null;
  const seed = (() => {
    const p = path.resolve(__dirname, '..', 'public', 'data', 'home-keyword-briefing-seed.json');
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
  })();
  // 아카이브 날짜는 브리핑 발행일 기준(publishedAt). 없으면 만들지 않는다(Date.now 미사용).
  const published = String(seed.publishedAt || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(published)) {
    console.warn('[static-routes] briefing archive skipped: no valid publishedAt');
    return null;
  }
  const items = rows
    .filter((row) => row && String(row.keyword || '').trim())
    .map((row) => {
      const keyword = escapeText(String(row.keyword).trim());
      const volume = Number.isFinite(Number(row.searchVolume)) ? numberFormat.format(Number(row.searchVolume)) : '-';
      const documents = Number.isFinite(Number(row.documentCount)) ? numberFormat.format(Number(row.documentCount)) : '-';
      const opportunity = Number.isFinite(Number(row.opportunity)) ? Number(row.opportunity).toFixed(1) : '-';
      return `<tr><th scope="row">${keyword}</th><td>${volume}</td><td>${documents}</td><td>${opportunity}</td></tr>`;
    });
  if (!items.length) return null;

  const body = [
    '<article id="briefing-archive-prerender">',
    `<h1>${published} 무료 선정 황금키워드</h1>`,
    `<p>${published} 기준으로 검토해 올린 무료 선정 황금키워드 ${items.length}개입니다. 이 페이지는 그날의 기록이라 이후에도 값이 바뀌지 않습니다. 기회지수는 검색량 ÷ (문서수 + 1) 로, 문서수가 검색량에 비해 적을수록 아직 글이 적어 노려볼 만한 키워드입니다.</p>`,
    '<table><caption>키워드별 검색량·문서수·기회지수</caption><thead><tr>',
    '<th scope="col">키워드</th><th scope="col">검색량</th><th scope="col">문서수</th><th scope="col">기회지수</th>',
    '</tr></thead><tbody>',
    items.join(''),
    '</tbody></table>',
    '<p><a href="/briefing">오늘의 무료 선정 황금키워드 보기</a></p>',
    '</article>',
  ].join('');

  const url = `${siteOrigin}/briefing/${published}`;
  const title = `${published} 무료 선정 황금키워드 | Leaders Pro`;
  const description = `${published} 기준 무료 선정 황금키워드 ${items.length}개 — 검색량·문서수·기회지수 기록입니다.`;
  let html = template;
  html = replaceRequired(html, /<title>[\s\S]*?<\/title>/, `<title>${escapeText(title)}</title>`, 'title');
  html = replaceRequired(html, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeAttribute(description)}" />`, 'description');
  html = replaceRequired(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`, 'canonical');
  html = replaceRequired(html, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${escapeAttribute(title)}" />`, 'og:title');
  html = replaceRequired(html, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${escapeAttribute(description)}" />`, 'og:description');
  html = replaceRequired(html, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`, 'og:url');
  html = replaceRequired(html, /<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${escapeAttribute(title)}" />`, 'twitter:title');
  html = replaceRequired(html, /<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${escapeAttribute(description)}" />`, 'twitter:description');
  html = replaceRequired(html, /<div id="root"><\/div>/, `<div id="root">${body}</div>`, 'archive prerender');

  const dir = path.join(distDir, 'briefing', published);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
  return { date: published, url };
}

const keywordPages = writeKeywordDetailPages(template);
const archive = writeBriefingArchivePage(template);
console.log(`Generated ${routes.length} static route pages for search crawlers.`);
console.log(`Generated ${keywordPages.length} evergreen keyword detail pages.`);
if (archive) console.log(`Generated briefing archive: ${archive.date}`);

// 사이트맵에 롱테일(evergreen 상세) + 날짜 아카이브를 반영한다.
// 실시간 이슈 개별 페이지는 만들지 않으므로 사이트맵에도 넣지 않는다.
// 아카이브는 append-only: 과거 날짜 URL 은 지우지 않고 유지한다(그날의 기록이라 계속 유효).
const sitemapPath = path.resolve(__dirname, '..', '..', 'payment-page', 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  const original = fs.readFileSync(sitemapPath, 'utf8');
  // 이전 실행이 남긴 실시간 이슈 개별 /keyword URL 은 정리한다(더 이상 만들지 않으므로).
  let sitemap = original.replace(/\s*<url>\s*<loc>[^<]*\/keyword\/[^<]*<\/loc>[\s\S]*?<\/url>/g, '');

  const archiveDate = archive ? archive.date : null;
  const existingArchive = new Set(
    [...original.matchAll(/<loc>[^<]*\/briefing\/(\d{4}-\d{2}-\d{2})<\/loc>/g)].map((m) => m[1]),
  );

  const entries = [];
  for (const slug of keywordPages) {
    entries.push(`  <url>\n    <loc>${siteOrigin}/keyword/${encodeURIComponent(slug)}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`);
  }
  // 오늘 아카이브가 사이트맵에 아직 없으면 추가(있으면 중복 방지).
  if (archiveDate && !existingArchive.has(archiveDate)) {
    entries.push(`  <url>\n    <loc>${siteOrigin}/briefing/${archiveDate}</loc>\n    <lastmod>${archiveDate}</lastmod>\n    <changefreq>never</changefreq>\n    <priority>0.6</priority>\n  </url>`);
  }
  if (entries.length) {
    sitemap = sitemap.replace('</urlset>', `${entries.join('\n')}\n</urlset>`);
  }
  if (sitemap !== original) {
    fs.writeFileSync(sitemapPath, sitemap, 'utf8');
    console.log(`Sitemap updated: ${keywordPages.length} evergreen keyword URLs${archiveDate && !existingArchive.has(archiveDate) ? `, +archive ${archiveDate}` : ''}.`);
  }
}
