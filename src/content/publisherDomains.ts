// src/content/publisherDomains.ts
//
// [P1 relevance v2] Small, explicit domain -> publisher-name table for major
// Korean news outlets. Used only as a last-resort fallback in
// resolveSourceName() (src/content/sourceName.ts) — API-provided publisher
// names and title-suffix parsing take priority. Deliberately does NOT cover
// go.kr / or.kr government domains: the organization name cannot be inferred
// from the domain alone, so those stay null rather than guessed.

export const PUBLISHER_DOMAINS: Record<string, string> = {
  'chosun.com': '조선일보',
  'joongang.co.kr': '중앙일보',
  'donga.com': '동아일보',
  'hani.co.kr': '한겨레',
  'khan.co.kr': '경향신문',
  'mk.co.kr': '매일경제',
  'hankyung.com': '한국경제',
  'yna.co.kr': '연합뉴스',
  'newsis.com': '뉴시스',
  'news1.kr': '뉴스1',
  'mt.co.kr': '머니투데이',
  'edaily.co.kr': '이데일리',
  'etnews.com': '전자신문',
  'segye.com': '세계일보',
  'hankookilbo.com': '한국일보',
  'kmib.co.kr': '국민일보',
  'seoul.co.kr': '서울신문',
  'heraldcorp.com': '헤럴드경제',
  'ytn.co.kr': 'YTN',
  'sbs.co.kr': 'SBS',
  'imbc.com': 'MBC',
  'kbs.co.kr': 'KBS',
  'jtbc.co.kr': 'JTBC',
  'chosunbiz.com': '조선비즈',
  'asiae.co.kr': '아시아경제',
  'fnnews.com': '파이낸셜뉴스',
  'dt.co.kr': '디지털타임스',
  'moneys.co.kr': '머니S',
  'sisajournal.com': '시사저널',
  'newsway.co.kr': '뉴스웨이',
  'nocutnews.co.kr': '노컷뉴스',
  'ohmynews.com': '오마이뉴스',
  'pressian.com': '프레시안',
};
