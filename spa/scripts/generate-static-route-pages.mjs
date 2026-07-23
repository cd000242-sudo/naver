import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    title: '부방장 선정 황금키워드 | Leaders Pro',
    description: '매일 검토해 올린 부방장 선정 황금키워드 전체 목록입니다. 검색량, 문서수, 기회지수를 함께 확인하세요.',
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

console.log(`Generated ${routes.length} static route pages for search crawlers.`);
