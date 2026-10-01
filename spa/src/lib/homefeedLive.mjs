/**
 * 홈판 벤치마크 실시간 판(2026-10-01). 사장님: "홈판은 시의성 · 속보성이 강력하니까 … 새로고침하면 새롭게 긁어와야".
 *
 * 워커(action homefeed-benchmark-feeds)가 벤치마크 원천의 원문만 받아 오고, 여기서 게시물로 풀어 소재를 묶고
 * 추천을 가린다 — 워커 CPU 한도 밖(브라우저)에서 계산하려는 구조다.
 *
 * 규칙은 leword-app `scripts/homefeed-benchmarks-core.cjs` 와 **같아야 한다**(파서 · 소재 묶기 · 추천 · 표시).
 * 거기를 바꾸면 여기도 바꾼다 — 같은 사례를 tests/homefeed-live.test.mjs 가 잠근다. 다른 점은 둘뿐이다:
 *   · 반응 증가(이전 수집 대비)는 잴 수 없어 쓰지 않는다(CI 판만 한다).
 *   · 인스타(유료 Bright Data, 하루 1회)와 소재별 홈판 제목 20개는 CI 판에서 가져와 합친다(mergeLiveBoard).
 * 순수 함수 · 네트워크 없음 · Math.random 없음.
 */
const DAY = 86400000;
const LINK_HOSTS = new Set(['blog.naver.com', 'm.blog.naver.com', 'www.youtube.com', 'www.issuelink.co.kr', 'news.nate.com', 'www.instagram.com']);
const POST_PATHS = {
  'blog.naver.com': /^\/[a-zA-Z0-9_-]+\/\d+$/, 'm.blog.naver.com': /^\/[a-zA-Z0-9_-]+\/\d+$/, 'www.youtube.com': /^\/watch$/,
  'www.issuelink.co.kr': /^\/community\/go\/[a-zA-Z0-9_-]+\/\d+$/, 'news.nate.com': /^\/view\/\d{8}n\d+$/, 'www.instagram.com': /^\/(?:p|reel)\/[a-zA-Z0-9_-]+\/?$/,
};
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(value) {
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}
/** 태그를 벗기고 엔티티를 푼 한 줄 글자(수집기 plainText 와 같은 결과). */
export function plainText(value, length = 300) {
  // 태그는 영문자로 시작하는 것만 — '<부활남: 더 레드>' 같은 작품명 꺾쇠는 글자다(수집기 cheerio 도 글자로 둔다).
  // 벗긴 자리엔 빈칸을 넣지 않는다 — cheerio .text() 도 안 넣는다('솔로곡인<Dream>으로' → '솔로곡인으로', 실원문 대조).
  const stripped = String(value || '').replace(/<(script|style|iframe|object|svg)\b[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<\/?[a-zA-Z][^<>]*>/g, '');
  return decodeEntities(stripped).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, length);
}
/** XML 요소 안쪽 글자 — CDATA 를 풀고 엔티티를 한 번 푼다(수집기의 xmlMode .text() 와 같은 단계). */
const xmlText = (inner) => decodeEntities(String(inner).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
function child(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? xmlText(m[1]) : '';
}
function attr(block, name, key) {
  const m = block.match(new RegExp(`<${name}\\b[^>]*\\b${key}=["']([^"']*)["']`, 'i'));
  return m ? decodeEntities(m[1]) : '';
}
export function safeLink(value, base) {
  try {
    const u = new URL(String(value || '').trim(), base);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !LINK_HOSTS.has(u.hostname)) return null;
    if (!POST_PATHS[u.hostname].test(u.pathname)) return null;
    if (u.hostname === 'www.youtube.com' && !/^[a-zA-Z0-9_-]{11}$/.test(u.searchParams.get('v') || '')) return null;
    for (const key of [...u.searchParams.keys()]) if (key !== 'v') u.searchParams.delete(key);
    u.hash = '';
    return u.href;
  } catch { return null; }
}
export function validDate(value, now) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms <= Date.parse(now) + 300000 ? new Date(ms).toISOString() : null;
}
function count(value) { const text = String(value || '').replace(/,/g, '').trim(); return /^\d+$/.test(text) ? Number(text) : null; }
function basePost(source, capturedAt, data) {
  return { sourceId: source.id, platform: source.platform, name: plainText(source.name || source.id, 70), eventAt: null, capturedAt, metrics: { views: null, likes: null, comments: null }, ...data };
}

export function parseRss(xml, source, capturedAt) {
  const text = String(xml || '');
  const head = text.split(/<item[\s>]/i)[0];
  const name = plainText(child(head, 'title'), 70) || source.id;
  const posts = (text.match(/<item[\s>][\s\S]*?<\/item>/gi) || []).slice(0, 20).map((item) => {
    const url = safeLink(child(item, 'link'));
    if (!url || !['blog.naver.com', 'm.blog.naver.com'].includes(new URL(url).hostname)) return null;
    return basePost({ ...source, name }, capturedAt, { title: plainText(child(item, 'title'), 160), url, publishedAt: validDate(child(item, 'pubDate'), capturedAt), summary: plainText(child(item, 'description'), 300) });
  }).filter((p) => p?.title);
  return { name, posts };
}
export function parseYoutube(xml, source, capturedAt) {
  const text = String(xml || '');
  const head = text.split(/<entry[\s>]/i)[0];
  const name = plainText(child(head, 'title'), 70) || source.id;
  const posts = (text.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || []).slice(0, 15).map((entry) => {
    const url = safeLink(attr(entry, 'link', 'href'));
    if (!url) return null;
    return basePost({ ...source, name }, capturedAt, { title: plainText(child(entry, 'title'), 160), url, publishedAt: validDate(child(entry, 'published'), capturedAt), summary: plainText(child(entry, 'media:description'), 300), metrics: { views: count(attr(entry, 'media:statistics', 'views')), likes: null, comments: null } });
  }).filter((p) => p?.title);
  return { name, posts };
}
export function parseCommunity(html, source, capturedAt) {
  const posts = []; const seen = new Set();
  for (const row of String(html || '').match(/<tr[\s>][\s\S]*?<\/tr>/gi) || []) {
    for (const [, attrs, inner] of row.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      if (posts.length >= 50) break;
      const href = (attrs.match(/href=["']([^"']+)["']/i) || [])[1] || '';
      if (!href.includes('/community/go/')) continue;
      const url = safeLink(href, source.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const comments = count(plainText((inner.match(/<small[^>]*>([\s\S]*?)<\/small>/i) || [])[1] || '').replace(/[[\]]/g, ''));
      const title = plainText(inner.replace(/<small[^>]*>[\s\S]*?<\/small>/gi, ''), 160);
      const community = plainText((row.match(/<td[^>]*>[\s\S]*?<small[^>]*>([\s\S]*?)<\/small>/i) || [])[1] || '', 20);
      const date = plainText((row.match(/class=["']second_date["'][^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '');
      posts.push(basePost({ ...source, name: `이슈링크 · ${community}` }, capturedAt, {
        title, url, publishedAt: validDate(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(date) ? `${date.replace(' ', 'T')}+09:00` : null, capturedAt),
        summary: '', metrics: { views: null, likes: null, comments }, metricNote: '집계 사이트에 표시된 원 커뮤니티 댓글 수. 홈판 유입 지표가 아닙니다.',
      }));
    }
  }
  return { name: '이슈링크 댓글순', posts };
}
export function parseNate(html, source, capturedAt) {
  const posts = []; const seen = new Set();
  for (const [, attrs, inner] of String(html || '').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (posts.length >= 30) break;
    if (!/class=["'][^"']*\blt1\b/.test(attrs)) continue;
    const href = (attrs.match(/href=["']([^"']+)["']/i) || [])[1] || '';
    if (!href.includes('/view/')) continue;
    const url = safeLink(href, source.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const pick = (re) => plainText((inner.match(re) || [])[1] || '', 300);
    posts.push(basePost({ ...source, name: '네이트 연예 공감순' }, capturedAt, {
      title: pick(/class=["']tit["'][^>]*>([\s\S]*?)<\/h\d>/i).slice(0, 160), url, publishedAt: null,
      summary: pick(/class=["']desc["'][^>]*>([\s\S]*?)<\/span>/i), metrics: { views: null, likes: null, comments: null },
      reactionLabel: pick(/class=["']img["'][^>]*>([\s\S]*?)<\/span>/i).slice(0, 30), reactionCount: count(pick(/class=["']emcnt["'][^>]*>\s*<em>([\s\S]*?)<\/em>/i)),
    }));
  }
  return { name: '네이트 연예 공감순', posts: posts.filter((p) => p.title && !p.title.includes('�')) };
}

function normalized(title) { return plainText(title, 160).toLowerCase().replace(/[^가-힣a-z0-9]/g, ''); }
function tokens(title) { return [...new Set(plainText(title, 160).replace(/["'“”‘’!?.,()[\]…]/g, ' ').split(/\s+/).filter((s) => s.length >= 2 && !/^(현재|지금|오늘|정리|이유|근황|화제|논란|확인|모음|후기|jpg|ㄷㄷ|ㅎㄷㄷ)/i.test(s)))]; }
const PARTICLE = /(에서|으로|까지|부터|처럼|보다|에게|한테|이랑|과|와|의|이|가|은|는|을|를|도|만|로|에)$/;
const GROUP_STOP = /^(인스타그램|인스타|유튜브|사진|영상|공개|광고|근황|소식|정리|이유|오늘|지금|현재|최근|진짜|요즘|결국|반응|한국|중국|일본|미국|해외|국내|한국인|한국인들|원작|뭐가|다를까|무슨|일이|있었나|이렇게|그동안|동안|만에|하루|벌써|드디어|생각|차이|어디|누구|얼마|알고|보니|이후|이제|다시|직접|모두|가장|처음|제일|이번|지난)$/;
export function groupTokens(title) {
  return [...new Set(tokens(title)
    .map((t) => t.replace(/^#/, '').replace(/[^가-힣a-zA-Z0-9]/g, '').toLowerCase())
    .map((t) => (t.length >= 3 && PARTICLE.test(t) ? t.replace(PARTICLE, '') : t))
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t) && !/^[a-z0-9_.]{6,}$/.test(t) && !GROUP_STOP.test(t)))];
}
// 일반어 · 겹침 단위 · 같은 소재 판정 — 수집기 homefeed-benchmarks-core.cjs 와 같다(2026-10-01 188곳 오묶음 수리).
const GENERIC = new Set(['패션', '스타일', '코디', '얼굴', '몸매', '미모', '비주얼', '연예인', '배우', '여배우', '남배우', '아이돌', '가수', '스타', '셀럽', '화보', '공항', '공항패션', '반전', '레전드', '충격', '대박', '난리', '정체', '방법', '후기', '정보', '추천', '비교', '가격', '신차', '출시', '발표', '사람들', '남자들', '여자들', '여자', '남자', '정신', '모습', '포인트', '느낌', '분위기', '매력', '인기', '순위', '역대', '최고', '최초', '완전', '하는', '되는', '있는', '없는', '보니', '같은', '이유가', '누구', '앞두고', '달라진', '몰라보게', '되더니', '했더니', '결혼', '명품', '가방', '명품백', '신상', '할인', '일정', '이벤트']);
const isGeneric = (token) => GENERIC.has(token) || /^\d{1,2}(대|세|살)$/.test(token) || /^\d+(위|명|개|원|만원|천만원|억|억원|km|%)$/.test(token);
function sharedUnits(a, b) {
  const contains = (t, u) => !/\d/.test(t) && !/\d/.test(u) && t.length >= 2 && u.length >= 2 && (t.includes(u) || u.includes(t));
  const units = new Set();
  for (const t of a) for (const u of b) {
    if (t === u) units.add(t);
    else if (contains(t, u)) units.add(t.length <= u.length ? t : u);
  }
  return [...units];
}
export function sameStory(a, b) {
  const units = sharedUnits(a, b);
  const specific = units.filter((u) => !isGeneric(u)).length;
  const ratio = units.length / Math.min(a.length, b.length);
  return specific >= 2 && ratio >= 0.5;
}
/**
 * 분야(2026-10-01 사장님 "자동차 IT 는 안 보여") — 제목 단서가 먼저, 없으면 출처 블로그 주제(운영자가 목록에 적은 구역)의 다수결,
 * 그것도 없으면 사회·이슈. 예전엔 제목 단서만 봐서 자동차 · IT 분야가 아예 없었고 판 300장 중 225장이 사회·이슈였다.
 * 규칙은 수집기 scripts/homefeed-benchmarks-core.cjs 와 같아야 한다(같은 사례를 양쪽 테스트가 잠갔다).
 */
const TOPIC_CATEGORY = { 'IT/차테크': '자동차·IT', 'IT·컴퓨터': '자동차·IT', '자동차': '자동차·IT', '재테크 라이프': '생활경제·주거', '비즈니스·경제': '생활경제·주거', '연예인 패션': '패션·뷰티', '패션·미용': '패션·뷰티', '미용·패션': '패션·뷰티', '방송 이슈': '문화·연예', '방송': '문화·연예', '드라마': '문화·연예', '스타·연예인': '문화·연예', '스포츠': '스포츠·게임', '건강 상식': '건강', '건강·의학': '건강', '리빙 라이프': '여행·생활', '인테리어·DIY': '여행·생활', '요리·레시피': '여행·생활', '맛집': '여행·생활', '육아·결혼': '여행·생활' };
const CATEGORY_PATTERNS = [
  ['생활경제·주거', /전세|주택|아파트|대출|지원금|연금|세금|청약|금리|부동산|소상공인|보조금|저축/],
  ['자동차·IT', /자동차|신차|전기차|하이브리드|SUV|세단|차량|운전|주차|과태료|벌점|깜빡이|타이어|연비|현대차|기아(?!\s*타이거즈)|제네시스|테슬라|벤츠|BMW|아우디|그랜저|쏘렌토|카니발|아이오닉|스마트폰|아이폰|갤럭시|노트북|태블릿|인공지능|챗GPT|요금제|통신사/],
  ['건강', /건강|다이어트|위고비|비만|혈압|혈당|당뇨|콜레스테롤|영양제|비타민|검진|위암|유방암|폐암|갑상선|두통|불면/],
  ['패션·뷰티', /패션|코디|착장|가방|샤넬|데님|세럼|화장품|여행룩/],
  ['여행·생활', /여행|숙소|호텔|런던|공항|맛집|날씨|교통/],
  ['스포츠·게임', /야구|축구|선수|아시안게임|올림픽|게임|메달|홈런/],
  ['문화·연예', /배우|가수|아이돌|방송|드라마|영화|콘서트|아이브|카즈하|고윤정|카리나|트로트/],
];
export function category(title, topics = []) {
  for (const [name, pattern] of CATEGORY_PATTERNS) if (pattern.test(title)) return name;
  const counts = new Map();
  for (const topic of topics) { const name = TOPIC_CATEGORY[topic]; if (name) counts.set(name, (counts.get(name) || 0) + 1); }
  let best = null;
  for (const [name, n] of counts) if (!best || n > best[1]) best = [name, n];
  return best ? best[0] : '사회·이슈';
}
function flagsFor(post, now) {
  const text = `${post.title} ${post.summary}`; const flags = [];
  if (/무상.{0,12}제공|제공.{0,8}받|협찬|소정의.{0,6}수수료|유료광고|원고료/.test(text)) flags.push('sponsored');
  const match = post.title.match(/^(\d{6}|20\d{6})(?:\s|[^0-9])/); let titleDate = null;
  if (match) { const s = match[1].length === 6 ? `20${match[1]}` : match[1]; titleDate = validDate(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00+09:00`, now); }
  if ((titleDate && Date.parse(now) - Date.parse(titleDate) > 7 * DAY) || /과거.{0,12}(방송|사진|고백)|재조명|추억의|지난\s*20(?:1\d|2[0-5])년/.test(text)) flags.push('recycled-material');
  if (/불륜|외도|성폭행|사기꾼|정신병|정신병원|테러|자살|자해|양육비|법정\s*전쟁|고소|고발|이혼/.test(text)) flags.push('sensitive-claim');
  if (!post.publishedAt) flags.push('publication-date-unknown');
  if (!post.summary) flags.push('headline-only');
  return flags;
}
/** 화면용 아이디 — 결정적 문자열 해시(FNV-1a). CI 판의 아이디(sha256)와는 다르다 — 합칠 때는 원문 주소로 맞춘다. */
function idOf(url) {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i += 1) { h ^= url.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `live-${h.toString(16).padStart(8, '0')}`;
}

const MAX_CARDS = 300;
function bigrams(token) { const out = []; for (let i = 0; i + 1 < token.length; i += 1) out.push(token.slice(i, i + 2)); return out; }
/** 수집기 groupPosts 와 같은 묶기 — 같은 주소 · 같은 제목은 표로, 같은 소재 후보는 두 글자 조각을 나눠 가진 묶음만 견준다. */
function groupPosts(posts) {
  const groups = []; const byUrl = new Map(); const byNorm = new Map(); const byGram = new Map();
  const remember = (map, key, index) => { if (!map.has(key)) map.set(key, index); };
  for (const post of posts.filter((p) => p.title && safeLink(p.url) && !/ㅇㅎ[)\s]|후방주의|여캠시절|노출사진/.test(p.title))) {
    const norm = normalized(post.title); const terms = groupTokens(post.title);
    const exact = [byUrl.get(post.url), byNorm.get(norm)].filter((i) => i !== undefined);
    let index = exact.length ? Math.min(...exact) : -1;
    if (index < 0 && terms.length >= 2) {
      const seen = new Set();
      for (const t of terms) for (const g of bigrams(t)) for (const i of byGram.get(g) || []) seen.add(i);
      for (const i of [...seen].sort((a, b) => a - b)) if (sameStory(terms, groups[i].terms)) { index = i; break; }
    }
    if (index >= 0) {
      const group = groups[index];
      if (!group.urls.has(post.url)) { group.posts.push(post); group.urls.add(post.url); group.norms.set(post, norm); remember(byUrl, post.url, index); remember(byNorm, norm, index); }
    } else {
      index = groups.length;
      groups.push({ posts: [post], terms, urls: new Set([post.url]), norms: new Map([[post, norm]]) });
      for (const t of terms) for (const g of new Set(bigrams(t))) { if (!byGram.has(g)) byGram.set(g, []); byGram.get(g).push(index); }
      remember(byUrl, post.url, index); remember(byNorm, norm, index);
    }
  }
  return groups;
}

/**
 * 수집기 buildCandidates 와 같은 규칙. 최근 48시간 소재, 추천이 앞, 300장까지.
 * 반응 증가는 화면이 잴 수 없어(이전 수집이 없다) CI 판이 잰 글별 증가(growthByUrl: 원문 주소 → 증가)를 같은 기준으로 쓴다.
 */
export function buildLiveCandidates(posts, now, growthByUrl = new Map()) {
  const groups = groupPosts(posts);
  return groups.filter((group) => group.posts.some((p) => p.platform !== 'community-ranking' && p.summary)).map((group) => {
    const sorted = [...group.posts].sort((a, b) => Number(Boolean(b.summary)) - Number(Boolean(a.summary)) || (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
    const lead = sorted[0];
    const flags = [...new Set(sorted.flatMap((p) => flagsFor(p, now)))];
    if (sorted.length > 1 && sorted.some((p, i) => sorted.slice(i + 1).some((q) => group.norms.get(p) === group.norms.get(q)))) flags.push('possible-syndication');
    const age = lead.publishedAt ? (Date.parse(now) - Date.parse(lead.publishedAt)) / DAY : Infinity;
    const stale = (age > 7 && Boolean(lead.publishedAt)) || flags.includes('recycled-material');
    const platforms = new Set(sorted.map((p) => p.platform));
    const reaction = sorted.some((p) => Number(p.metrics?.comments) > 0 || Number(p.metrics?.views) > 0 || Number(p.reactionCount) > 0);
    const growthOf = new Map(sorted.map((p) => [p.url, growthByUrl.get(p.url) || null]));
    const growth = sorted.map((p) => growthOf.get(p.url)).find(Boolean) || null;
    const positiveGrowth = Boolean(growth && Object.entries(growth).some(([key, g]) => g.change >= ({ views: 100, likes: 5, comments: 10 }[key] || Infinity)));
    const channels = new Set(sorted.map((p) => p.sourceId)).size;
    const recommended = age <= 2 && !flags.some((f) => ['sponsored', 'sensitive-claim', 'recycled-material', 'possible-syndication'].includes(f)) && Boolean(lead.summary) && (channels >= 2 || (platforms.size >= 2 && reaction) || positiveGrowth);
    const keyword = tokens(lead.title).slice(0, 5).join(' ').slice(0, 55) || lead.title.slice(0, 55);
    const why = [lead.publishedAt ? `벤치마크 발행 ${lead.publishedAt.slice(0, 10)} · 사건 발생일은 별도 확인` : '발행일을 확인하지 못해 최신 사건으로 판단하지 않았습니다.'];
    if (sorted.length > 1) why.push(`${new Set(sorted.map((p) => p.sourceId)).size}개 채널에서 관련 제목 발견 · 독립 사실 확인과는 다릅니다.`);
    if (reaction) why.push('공개 반응이 있는 소재 · 플랫폼별 지표는 원문별로 표시합니다.');
    if (positiveGrowth) why.push('같은 게시물의 공개 반응이 이전 수집보다 늘었습니다. 채널 평소 대비 성과는 미확인입니다.');
    if (flags.includes('sponsored')) why.push('제품 제공·협찬 고지 감지: 자연 유행 근거에서 제외');
    if (stale) why.push('과거 자료 또는 발행 7일 경과: 새 사실 확보 전 작성 우선순위를 낮춥니다.');
    return {
      id: idOf(lead.url), keyword, title: lead.title, category: category(lead.title, sorted.map((p) => p.topic)),
      status: stale ? 'stale' : recommended ? 'review-now' : 'verify', recommended,
      priority: Math.max(0, (age <= 1 ? 30 : age <= 2 ? 24 : age <= 7 ? 12 : 0) + (lead.summary ? 10 : 0) + Math.min(24, (channels - 1) * 8) + (platforms.size >= 2 ? 15 : 0) + (reaction ? 10 : 0) + (positiveGrowth ? 10 : 0) - (flags.includes('sponsored') ? 25 : 0) - (stale ? 30 : 0) - (flags.includes('sensitive-claim') ? 20 : 0)),
      publishedAt: lead.publishedAt, eventAt: null, capturedAt: lead.capturedAt,
      freshnessLabel: stale ? '시점 재검토' : recommended ? '원문 재확인 후 우선 검토' : '원출처 확인 필요', why,
      summary: lead.summary ? plainText(lead.summary, 140) : '제목과 공개 목록만 확인했습니다. 사건 내용은 원문 확인 후 작성하세요.',
      summaryAttribution: lead.summary ? `${lead.name} 공개 요약 발췌 · 사실 확인 전` : '공개 제목에서 발견 · 본문 미확인',
      homeTitles: [],
      writingDirection: `${keyword}를 검색하는 독자의 질문에 답하는 해설을 작성하세요. 위 벤치마크의 주장과 원출처에서 확인한 사실을 구분하고, 새로 확인한 날짜·조건·변경점부터 제시하세요.`,
      mustInclude: [`${keyword}의 원문 링크와 발행일`, '사건 발생일과 지금 다시 다룰 이유', '독자가 직접 확인할 절차 또는 비교 기준'],
      mustAvoid: ['벤치마크의 경험을 직접 경험한 것처럼 쓰기', '확인하지 않은 가격·정책·인물 주장을 사실로 단정', '실측하지 않은 홈판 노출 확률·수익 보장'],
      relatedKeywords: tokens(lead.title).slice(0, 6),
      verificationNeeded: ['원출처의 실제 사건 날짜와 최신 변경 사항', '사진 원작자와 재사용 조건', ...(flags.includes('sensitive-claim') ? ['당사자·공식 자료 확인 전 인물 관련 의혹 제외'] : []), ...(flags.includes('sponsored') ? ['상업적 관계와 홍보성 주장 확인'] : [])],
      imageGuide: { url: lead.url, instruction: `${lead.name} 원문에서 이미지의 원출처를 먼저 확인하세요. 원본 게시물의 제목·게시일·관련 장면을 확인한 뒤 사용 조건에 맞게 캡처하고 출처를 남기세요. 벤치마크 사진 자체의 재사용 허용 여부는 미확인입니다.` },
      metrics: { searchVolume: null, documentCount: null, rankingPossibility: 'unmeasured', reactionGrowth: growth }, homefeedExposure: 'unverified',
      sources: sorted.slice(0, 5).map((p) => ({ id: p.sourceId, platform: p.platform, name: p.name, title: p.title, url: p.url, publishedAt: p.publishedAt, summary: plainText(p.summary, 140), metrics: p.metrics, ...(p.reactionCount != null ? { reactionCount: p.reactionCount, reactionLabel: p.reactionLabel } : {}), ...(p.metricNote ? { metricNote: p.metricNote } : {}), ...(growthOf.get(p.url) ? { growth: growthOf.get(p.url) } : {}), discoveryOnly: true })),
      flags,
    };
  })
    .filter((c) => !c.publishedAt || Date.parse(now) - Date.parse(c.publishedAt) <= 2 * DAY)
    .sort((a, b) => Number(b.recommended) - Number(a.recommended) || b.priority - a.priority || (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0) || a.sources[0].url.localeCompare(b.sources[0].url))
    .slice(0, MAX_CARDS);
}

/** 워커 원문 → 원천별 게시물. 못 푼 원천은 failed 로 남긴다(지어내지 않는다). */
export function postsFromFeeds(feeds, now) {
  const sources = []; const posts = [];
  for (const feed of Array.isArray(feeds) ? feeds : []) {
    const source = { id: String(feed.id || ''), platform: String(feed.platform || ''), name: String(feed.name || feed.id || ''), url: '' };
    if (source.platform === 'community-ranking') source.url = 'https://www.issuelink.co.kr/community/listview/all/24/comment/_blank';
    if (source.platform === 'news-ranking') source.url = 'https://news.nate.com/rank/emoticon?cate=ent';
    if (feed.status !== 'ok' || typeof feed.text !== 'string') { sources.push({ ...source, status: feed.status === 'unavailable' ? 'unavailable' : 'failed', postCount: 0 }); continue; }
    const parse = { 'naver-blog': parseRss, youtube: parseYoutube, 'community-ranking': parseCommunity, 'news-ranking': parseNate }[source.platform];
    const result = parse ? parse(feed.text, source, now) : { posts: [] };
    sources.push({ ...source, name: result.name || source.name, status: result.posts.length ? 'ok' : 'failed', postCount: result.posts.length });
    posts.push(...result.posts);
  }
  return { sources, posts };
}

/**
 * CI 판 + 실시간 원문 → 화면에 그릴 판.
 *   · 인스타 게시물은 CI 판 카드의 출처에서 되살려 함께 묶는다(하루 1회 유료 수집분).
 *   · 소재별 홈판 제목은 같은 원문 주소를 가진 CI 카드에서 가져온다. 새로 생긴 소재는 다음 CI 회차까지 제목이 없다.
 *   · 편집자가 검토한 카드(editor-reviewed)는 CI 판 것을 그대로 두고, 그 출처와 겹치는 실시간 카드는 뺀다.
 */
export function mergeLiveBoard(board, feeds, now) {
  const live = postsFromFeeds(feeds, now);
  /*
   * 실시간에서 실패했는데 CI 판에선 잡힌 출처는 CI 글을 되살린다(2026-10-01) — 유튜브 RSS 는 같은 주소가 404 · 200 을 오가
   * 새로고침마다 '확인 필요'가 생겼다 없어졌다 했다. 인스타(하루 1회 유료 수집분)도 같은 길로 되살린다.
   */
  const boardOk = new Map((board?.sources || []).filter((s) => s.status === 'ok').map((s) => [s.id, s]));
  const revived = new Set(live.sources.filter((s) => s.status !== 'ok' && boardOk.has(s.id)).map((s) => s.id));
  const igPosts = [];
  const seenIg = new Set();
  for (const c of board?.candidates || []) {
    for (const s of c.sources || []) {
      if ((s.platform !== 'instagram' && !revived.has(s.id)) || !s.url || seenIg.has(s.url)) continue;
      seenIg.add(s.url);
      igPosts.push({ sourceId: s.id, platform: s.platform, topic: boardOk.get(s.id)?.topic || null, name: s.name || s.id, title: s.title || c.title, url: s.url, publishedAt: s.publishedAt || null, capturedAt: c.capturedAt || now, eventAt: null, summary: s.summary || '', metrics: s.metrics || { views: null, likes: null, comments: null } });
    }
  }
  const reviewed = (board?.candidates || []).filter((c) => (c.flags || []).includes('editor-reviewed'));
  const reviewedUrls = new Set(reviewed.flatMap((c) => (c.sources || []).map((s) => s.url)));
  const titlesByUrl = new Map();
  for (const c of board?.candidates || []) {
    const titles = Array.isArray(c.homeTitles) ? c.homeTitles : [];
    if (!titles.length && !c.homeTitle) continue;
    for (const s of c.sources || []) if (s.url && !titlesByUrl.has(s.url)) titlesByUrl.set(s.url, { homeTitles: titles, homeTitle: c.homeTitle || '', homeTitlesAt: c.homeTitlesAt || null });
  }
  /*
   * 공감 수 · 반응 증가는 CI 판이 잰 값을 원문 주소로 붙인다(2026-10-01) — RSS 엔 반응 수치가 없고,
   * 증가는 이전 수집과 견줘야 해서 화면이 직접 잴 수 없다. 못 받은 글은 그대로(빈 칸).
   */
  const likesByUrl = new Map(); const growthByUrl = new Map();
  for (const c of board?.candidates || []) {
    for (const s of c.sources || []) {
      if (!s.url) continue;
      if (Number.isFinite(s.metrics?.likes) && !likesByUrl.has(s.url)) likesByUrl.set(s.url, s.metrics.likes);
      if (s.growth && typeof s.growth === 'object' && !growthByUrl.has(s.url)) growthByUrl.set(s.url, s.growth);
    }
  }
  // 출처 주제(CI 판 출처 목록) — 분야를 수집기와 같게 매긴다(2026-10-01).
  const topicById = new Map((board?.sources || []).map((s) => [s.id, s.topic || null]));
  const livePosts = live.posts.map((p) => ({ ...p, topic: topicById.get(p.sourceId) ?? null, ...(likesByUrl.has(p.url) ? { metrics: { ...p.metrics, likes: likesByUrl.get(p.url) } } : {}) }));
  const built = buildLiveCandidates([...livePosts, ...igPosts], now, growthByUrl)
    .filter((c) => !c.sources.some((s) => reviewedUrls.has(s.url)))
    .map((c) => {
      const hit = c.sources.map((s) => titlesByUrl.get(s.url)).find(Boolean);
      return hit ? { ...c, ...hit } : c;
    });
  const boardSources = new Map((board?.sources || []).map((s) => [s.id, s]));
  const liveIds = new Set(live.sources.map((s) => s.id));
  // 실시간으로 잰 원천은 이번 시각과 원래 채널 주소를 단다(수집 상태 표가 '확인 시각 · 채널 링크'를 그린다).
  const liveSources = live.sources.map((s) => (revived.has(s.id)
    ? { ...boardSources.get(s.id) }
    : { ...s, url: s.url || boardSources.get(s.id)?.url || '', capturedAt: now }));
  const sources = [...liveSources, ...(board?.sources || []).filter((s) => !liveIds.has(s.id))];
  const allOk = sources.every((s) => s.status === 'ok');
  return {
    ...board, generatedAt: now, attemptedAt: now, status: allOk ? 'fresh' : 'partial', live: true,
    sources, sourceCount: sources.length, collectedPostCount: live.posts.length + igPosts.length,
    candidates: [...reviewed, ...built],
  };
}
