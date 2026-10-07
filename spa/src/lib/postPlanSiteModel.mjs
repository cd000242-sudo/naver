/**
 * 사이트판 글 한 편 유입 설계실(2026-10-06 4차) — 순수 함수.
 * 질문 체크리스트 · 제휴 후보 규칙은 앱 레포 src/utils/post-plan/post-plan-model.ts 와 같다(두 곳을 같이 고칠 것).
 * 추정치(확률 · 예상 유입)는 만들지 않는다.
 */
const whereOf = (item) => {
  if (item.source === 'kin') return '지식인';
  if (item.source === 'cafearticle') return item.cafeName ? `카페 · ${item.cafeName}` : '카페';
  return item.siteName || '커뮤니티';
};

/** 최근 14일 질문(워커가 이미 14일로 거름) → 체크리스트. 작성일 없음 제외 · 키워드 낱말 절반 이상이 제목에 · 최근 순 · 같은 주소 한 번. */
export function questionChecklist(items, limit, keyword = '', alsoKeywords = []) {
  // 띄어쓰기 없는 키워드는 낱말이 하나라 늘 0건이었다(2026-10-07) → 띄운 말(alsoKeywords)로도 본다
  const wordSets = [keyword, ...alsoKeywords].map((k) => String(k).split(/\s+/).filter((w) => w.length >= 2)).filter((ws) => ws.length);
  const relevant = (title) => {
    if (!wordSets.length) return true;
    const compact = String(title).replace(/\s+/g, '');
    return wordSets.some((words) => words.filter((w) => compact.includes(w)).length * 2 >= words.length);
  };
  const when = (item) => Date.parse(item.postedAt || `${item.postdate}T00:00:00+09:00`) || 0;
  const seen = new Set();
  return [...(items || [])]
    .filter((item) => item && item.title && item.link && item.postdate && relevant(item.title))
    .sort((a, b) => when(b) - when(a))
    .filter((item) => { if (seen.has(item.link)) return false; seen.add(item.link); return true; })
    .slice(0, limit)
    .map((item) => ({ title: String(item.title), link: String(item.link), where: whereOf(item), postdate: String(item.postdate) }));
}

const AFFILIATE_STOP = new Set(['할인', '방법', '추천', '후기', '가격', '비교', '정리', '신청', '갱신', '이유', '종류', '차이', '꿀팁']);

/** 키워드 낱말이 상품 이름 · 검색어에 든 제휴 상품 후보. 겹친 낱말 길이 합 순(같으면 받은 순서). 없으면 빈 목록. */
export function affiliateCandidates(keyword, snapshot, limit) {
  const words = [...new Set(String(keyword || '').split(/\s+/).filter((w) => w.length >= 2 && !AFFILIATE_STOP.has(w)))];
  if (!words.length || !snapshot || !snapshot.sites) return [];
  const scored = [];
  let order = 0;
  for (const site of Object.values(snapshot.sites)) {
    for (const item of Array.isArray(site && site.items) ? site.items : []) {
      const text = `${item && item.name || ''} ${item && item.keyword || ''}`;
      const score = words.filter((w) => text.includes(w)).reduce((sum, w) => sum + w.length, 0);
      order += 1;
      if (!score || !item.name) continue;
      scored.push({ score, order, item: { name: String(item.name), platform: String(site.label || ''), keyword: String(item.keyword || ''), reward: String(item.reward || ''), link: String(item.url || item.link || '') } });
    }
  }
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, limit).map((s) => s.item);
}

/** 앱 설계 중 같은 키워드(띄어쓰기 무시)의 가장 최근 것. 없으면 null. */
export function matchAppPlan(plans, keyword) {
  const key = String(keyword || '').replace(/\s+/g, '');
  const hits = (plans || []).filter((p) => p && String(p.keyword || '').replace(/\s+/g, '') === key);
  return hits.sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0))[0] || null;
}

const compactOf = (s) => String(s || '').replace(/\s+/g, '');

/** 검색량 표에서 키워드 값 — 워커는 띄어쓰기 없는 키로 준다(2026-10-06 실측). 없으면 null. */
export function volumeOf(volumes, keyword) {
  if (!volumes || typeof volumes !== 'object') return null;
  const key = compactOf(keyword);
  for (const [k, v] of Object.entries(volumes)) if (compactOf(k) === key && typeof v === 'number') return v;
  return null;
}

/**
 * 제목 재료 연관어 — 키워드 낱말(2자 이상) 절반 이상을 담은 것만, 검색량 큰 순 20개(키워드 자신 제외).
 * 연관어 확장은 엉뚱하게 번진 말('현대차' 665,800)까지 줘서 제목에 섞였다(2026-10-06 실주행). 앱 post-plan 과 같은 규칙.
 */
export function relatedForTitles(keyword, items) {
  const self = compactOf(keyword);
  const words = String(keyword || '').split(/\s+/).filter((w) => w.length >= 2);
  return (items || [])
    .filter((i) => i && typeof i.searchVolume === 'number' && i.searchVolume > 0 && compactOf(i.keyword) !== self)
    .filter((i) => { const c = compactOf(i.keyword); return words.length === 0 || words.filter((w) => c.includes(w)).length * 2 >= words.length; })
    .sort((a, b) => b.searchVolume - a.searchVolume)
    .slice(0, 20)
    .map((i) => ({ keyword: i.keyword, searchVolume: i.searchVolume }));
}

/*
 * ③ 검색에서 궁금해하는 것(2026-10-07 사장님 "지식인 · 카페만 볼 게 아니라 실제 검색에서 사람들이 뭘 궁금해하는지").
 * 재료는 워커 keyword-expansions(자동완성 · 검색광고 연관어 + 실측 검색량). 앱 post-plan-model.ts 와 같은 규칙(두 곳을 같이 고칠 것).
 */
const ROLE_PREFIXES = ['트로트가수', '개그우먼', '개그맨', '아나운서', '방송인', '여배우', '남배우', '유튜버', '아이돌', '배우', '가수', '모델', '감독', '작가', '선수'];
const INTENT_SUFFIXES = ['사망원인', '나무위키', '총정리', '프로필', '이유', '원인', '나이', '근황', '남편', '아내', '부인', '학력', '재산', '결혼', '이혼', '사망', '별세', '부고', '장례',
  '방법', '신청', '기간', '조건', '대상', '자격', '후기', '가격', '추천', '순위', '일정', '시간', '예매', '차이', '종류', '비교', '정리'];

/** 띄어쓰기 없는 긴 키워드에 흔한 앞말(직업) · 뒷말(의도) 자리 띄어쓰기 — 띄어쓰기가 없으면 확장이 0개라서(실측). 없으면 null. */
export function spaceOutKeyword(keyword) {
  const raw = String(keyword || '').trim();
  if (!raw || /\s/.test(raw) || raw.length < 5) return null;
  let core = raw;
  const head = [];
  const tail = [];
  const prefix = ROLE_PREFIXES.find((p) => core.startsWith(p) && core.length - p.length >= 2);
  if (prefix) { head.push(prefix); core = core.slice(prefix.length); }
  for (let guard = 0; guard < 4; guard += 1) {
    const suffix = INTENT_SUFFIXES.find((s) => core.endsWith(s) && core.length - s.length >= 2);
    if (!suffix) break;
    tail.unshift(suffix);
    core = core.slice(0, -suffix.length);
  }
  if (!head.length && !tail.length) return null;
  return [...head, core, ...tail].join(' ');
}

/** 확장이 0개일 때 다시 찾을 말(순서대로) — 직업 앞말 뗀 것 먼저, 그다음 띄운 말 그대로. 띄울 게 없으면 빈 목록. */
export function expansionRetryQueries(keyword) {
  const spaced = spaceOutKeyword(keyword);
  if (!spaced) return [];
  const words = spaced.split(' ');
  const noRole = ROLE_PREFIXES.includes(words[0]) && words.length >= 3 ? words.slice(1).join(' ') : spaced;
  return [...new Set([noRole, spaced])];
}

function longestShared(a, b) {
  let best = 0;
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const keep = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
      if (prev[j] > best) best = prev[j];
      diag = keep;
    }
  }
  return best;
}

/** 검색에서 궁금해하는 말 — 키워드와 3자 이상 겹치는 말만, 키워드 낱말 많이 든 순 → 검색량 순(못 잰 값은 뒤, null). 자기 자신 · 번진 말 제외. */
export function searchCuriosities(keyword, items, limit) {
  const self = compactOf(keyword);
  const words = String(spaceOutKeyword(keyword) || keyword).split(/\s+/).filter((w) => w.length >= 2);
  const seen = new Set();
  const rows = [];
  for (const item of items || []) {
    if (!item || !item.keyword || item.drifted) continue;
    const c = compactOf(item.keyword);
    if (!c || c === self || seen.has(c) || longestShared(c, self) < 3) continue;
    seen.add(c);
    const volume = typeof item.searchVolume === 'number' && Number.isFinite(item.searchVolume) ? item.searchVolume : null;
    rows.push({ keyword: item.keyword, searchVolume: volume, score: words.filter((w) => c.includes(w)).length });
  }
  return rows
    .sort((a, b) => b.score - a.score || (b.searchVolume ?? -1) - (a.searchVolume ?? -1))
    .slice(0, limit)
    .map(({ keyword: k, searchVolume }) => ({ keyword: k, searchVolume }));
}
