/**
 * Which collected photo to try first (2026-10-29 사장님 "공식 출처 먼저, 없으면 뉴스·검색 사진").
 * Lower tier = earlier. Nothing is refused here: the owner agreed that using collected photos is their own
 * responsibility, so a slot is filled from a later tier rather than left empty.
 * Domain lists follow the LDB extension's officialSourceRejection (extension/js/bridge-real-images.mjs).
 *
 * 2026-10-29 실측: most collected photos carry no page address, only the image server's (imgnews.naver.net,
 * post-phinf.pstatic.net …). Judging an unknown host as "official" put news photos first, so a host counts as
 * official only when it clearly is one; everything unrecognised sits with search results.
 */
export type DailyImageSourceTier = 0 | 1 | 2 | 3;

const PRESS = new Set(['isplus.com', 'ize.co.kr', 'tenasia.co.kr', 'osen.co.kr', 'mydaily.co.kr', 'sportsseoul.com', 'sportschosun.com', 'dispatch.co.kr', 'yna.co.kr',
  'edaily.co.kr', 'mk.co.kr', 'hankyung.com', 'chosun.com', 'joongang.co.kr', 'donga.com', 'hani.co.kr', 'khan.co.kr', 'kmib.co.kr', 'seoul.co.kr', 'segye.com',
  'munhwa.com', 'heraldcorp.com', 'asiae.co.kr', 'mt.co.kr', 'sedaily.com', 'pressian.com', 'ytn.co.kr', 'tvreport.co.kr', 'wikitree.co.kr', 'insight.co.kr',
  'huffingtonpost.kr', 'sportalkorea.com', 'stoo.com', 'sportsworldi.com', 'mhnse.com', 'hankookilbo.com', 'mksports.co.kr', 'sportsq.co.kr', 'slist.kr', 'ajunews.com',
  'autotribune.co.kr', 'autodaily.co.kr', 'motorgraph.com', 'etnews.com', 'zdnet.co.kr', 'bloter.net', 'etoday.co.kr', 'newsis.com', 'news1.kr', 'nocutnews.co.kr']);
const PERSONAL = ['blog.naver.com', 'cafe.naver.com', 'post.naver.com', 'kin.naver.com', 'tistory.com', 'brunch.co.kr', 'velog.io', 'namu.wiki', 'wikipedia.org',
  'dcinside.com', 'dcinside.co.kr', 'theqoo.net', 'fmkorea.com', 'instiz.net', 'pann.nate.com', 'ruliweb.com', 'clien.net', 'pinterest.com', 'pinterest.co.kr',
  'instagram.com', 'cdninstagram.com', 'x.com', 'twitter.com', 'twimg.com', 'facebook.com', 'fbcdn.net', 'threads.net', 'tiktok.com', 'reddit.com', 'redd.it',
  'humoruniv.com', 'blogspot.com', 'ppomppu.co.kr', 'bobaedream.co.kr', 'inven.co.kr', 'todayhumor.co.kr', '82cook.com', 'daangn.com',
  'coupang.com', 'coupangcdn.com', '11st.co.kr', 'gmarket.co.kr', 'auction.co.kr', 'smartstore.naver.com', 'shopping.naver.com', 'aliexpress.com', 'temu.com',
  'kream.co.kr', 'danawa.com', 'enuri.com', 'musinsa.com', 'bunjang.co.kr', 'joongna.com', 'banksalad.com'];
const OFFICIAL_HOSTS = [/(?:^|\.)(?:go\.kr|korea\.kr|or\.kr|mil\.kr)$/, /(?:^|\.)(?:tving|netflix|coupangplay|wavve|disneyplus|watcha)\.com$/, /(?:^|\.)cjenm\.com$/,
  /^(?:program|programs|tv)\.(?:kbs|sbs|imbc|jtbc)\./];
const within = (host: string, domain: string): boolean => host === domain || host.endsWith(`.${domain}`);
function registrable(host: string): string {
  const labels = host.split('.');
  return labels.slice(/\.(?:co|or|go|ne|re|ac|pe)\.kr$/.test(host) ? -3 : -2).join('.');
}

/** 0 official site · 1 news · 2 search result, image server or unknown host · 3 blog/community/SNS/shop (last resort). */
export function dailyImageSourceTier(pageUrl: string | undefined): DailyImageSourceTier {
  let url: URL;
  try { url = new URL(String(pageUrl || '')); } catch { return 2; }
  const host = url.hostname.toLowerCase();
  const labels = host.split('.').slice(0, -2);
  if (/newsroom/.test(host) || /\/newsroom(?:\/|$)/i.test(url.pathname) || OFFICIAL_HOSTS.some(pattern => pattern.test(host))) return 0;
  // Image servers name their service in a label: post-phinf, blogfiles, cafeptthumb, shop1.phinf, shopping-phinf …
  if (PERSONAL.some(domain => within(host, domain)) || /^(?:bbs|cafe|community|forum|gall)\./.test(host)
    || labels.some(label => /blog|cafe|(?:^|-)post(?:-|$)|shop/.test(label))) return 3;
  if (PRESS.has(registrable(host)) || labels.some(label => /news/.test(label))
    || /\/news\/articleView|\/articleView\.html/i.test(url.pathname)) return 1;
  return 2;
}
