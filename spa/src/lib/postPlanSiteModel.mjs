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
export function questionChecklist(items, limit, keyword = '') {
  const words = String(keyword).split(/\s+/).filter((w) => w.length >= 2);
  const relevant = (title) => {
    if (!words.length) return true;
    const compact = String(title).replace(/\s+/g, '');
    return words.filter((w) => compact.includes(w)).length * 2 >= words.length;
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
