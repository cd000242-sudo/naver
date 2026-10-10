/*
 * 홈판 벤치마크 작성 안내 합치기(2026-10-10 사장님 "전부 다 붙이고 싶다 — 확인하는 사람이 있거든").
 * 안내는 앱 레포 안내 작업(scripts/enrich-benchmark-guides.js · homefeed-guides.yml)이 카드마다 구독 AI 로 짓고
 * 자기 파일(/data/homefeed-benchmark-guides.json)에만 쓴다 — 판 파일을 두 작업이 같이 고치면 판 발행이 충돌한다.
 * 화면이 판과 합친다: 카드 id → 없으면 원문 주소(회차마다 카드 id 가 바뀌어도 같은 글이면 안내를 찾는다).
 * 모양이 안 맞는 항목은 버리고, 파일이 없으면 판을 그대로 쓴다(안내 칸이 안 보일 뿐).
 */
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strs = (v, n, max) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);

export function withGuides(board, store) {
  const list = Array.isArray(store?.guides) ? store.guides : [];
  if (!board || !Array.isArray(board.candidates) || list.length === 0) return board;
  const byId = new Map(); const byUrl = new Map();
  for (const g of list) {
    const writingDirection = str(g?.guide?.direction, 600);
    if (typeof g?.id !== 'string' || !writingDirection) continue;
    const guide = { writingDirection, searchTargets: strs(g.guide.searchTargets, 6, 120), mustInclude: strs(g.guide.mustInclude, 6, 200), mustAvoid: strs(g.guide.mustAvoid, 4, 200), checkBefore: strs(g.guide.checkBefore, 4, 200) };
    if (!byId.has(g.id)) byId.set(g.id, guide);
    for (const url of Array.isArray(g.urls) ? g.urls : []) if (typeof url === 'string' && url && !byUrl.has(url)) byUrl.set(url, guide);
  }
  return {
    ...board,
    candidates: board.candidates.map((c) => {
      const guide = byId.get(c?.id) || (Array.isArray(c?.sources) ? c.sources.map((s) => byUrl.get(s?.url)).find(Boolean) : null);
      if (!guide) return c;
      const { checkBefore, ...fields } = guide;
      const warnings = Array.isArray(c.verificationNeeded) ? c.verificationNeeded : [];
      return { ...c, ...fields, verificationNeeded: [...new Set([...checkBefore, ...warnings])] };
    }),
  };
}
