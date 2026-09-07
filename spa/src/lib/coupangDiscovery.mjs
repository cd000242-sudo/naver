/** Discovery is a product investigation route, not a search-ranking or sales score. */
import { AFFILIATE_MAX_AGE_MS } from './affiliateRecommendation.mjs';

const categories = new Set(['가전디지털', '생활용품', '뷰티', '홈인테리어', '반려동물', '헬스·건강식품',
  '식품', '주방용품', '여성패션', '남성패션', '출산·유아동', '스포츠·레저', '자동차용품',
  '완구·취미', '문구·오피스', '유아동패션', '도서·음반']);

// Each rule needs both an explicit feature and a compatible use. Marketing adjectives,
// price and discount are intentionally not feature evidence. These are title cues only.
const rules = [
  { feature: /무타공|부착식/, use: /선반|수납|거치대|홀더|행거|후크|걸이/,
    question: '설치할 벽·책상 재질에 맞는가? 부착 방식과 허용 하중을 확인하세요.' },
  { feature: /접이식|폴딩|접는/, use: /바구니|수납|건조대|테이블|책상|의자|카트|선반|대야|욕조|매트/,
    question: '사용 후 보관 공간을 줄일 수 있는 구조인가? 펼친 크기·접은 크기를 비교하세요.' },
  { feature: /틈새|슬림형/, use: /브러시|청소|수납|선반|트롤리|카트/,
    question: '평소 손이 닿지 않거나 비어 있는 좁은 공간에 맞는가? 폭과 실제 사용 사진을 확인하세요.' },
  { feature: /자석|마그네틱/, use: /부착|거치대|홀더|케이블|수납|정리|선반/,
    question: '붙일 곳의 소재와 사용할 물건에 맞는가? 자력·하중·분리 편의성을 확인하세요.' },
  { feature: /자동급수|자동 급수|자동급식|자동 급식|자동센서|자동 센서|센서형|센서식/,
    use: /화분|급수|급식|디스펜서|쓰레기통|조명|무드등/,
    question: '반복하던 어떤 동작을 대신하는가? 작동 조건·세척·전원·소모품을 확인하세요.' },
  { feature: /길이조절|길이 조절|높이조절|높이 조절|확장형/, use: /선반|수납|거치대|책상|테이블|건조대|정리대/,
    question: '기존 제품이 맞지 않던 공간에 조절해 쓸 수 있는가? 조절 범위와 고정 방식을 확인하세요.' },
  { feature: /일체형|분리형|탈부착/, use: /세척|청소|수납|거치대|정리|브러시/,
    question: '결합·분리 구조가 실제 사용이나 관리에 도움이 되는가? 구성과 세척 방법을 확인하세요.' },
];

export function coupangProductUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !(url.hostname === 'coupang.com' || url.hostname.endsWith('.coupang.com'))) return null;
    return url.href;
  } catch { return null; }
}

export function assessCoupangDiscovery(input, { now = Date.now() } = {}) {
  const row = input || {};
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  const cues = rules.flatMap(rule => {
    const feature = name.match(rule.feature)?.[0];
    const use = name.match(rule.use)?.[0];
    return feature && use ? [{ quote: feature, use, question: rule.question }] : [];
  });
  const age = now - Date.parse(row.measuredAt);
  const fresh = Number.isFinite(age) && age >= 0 && age <= AFFILIATE_MAX_AGE_MS;
  const listed = Number.isInteger(row.bestRank) && row.bestRank > 0;
  const sourceKind = categories.has(row.source) ? 'category' : row.source === '골드박스 특가' ? 'promotion' : 'unknown';
  const sourceKnown = sourceKind !== 'unknown' && listed;
  const reasons = [
    ...(!fresh ? ['최근 48시간 이내 상품 목록 관측을 다시 확인해야 합니다.'] : []),
    ...(!sourceKnown ? ['상품 목록의 수집 출처와 위치를 확인해야 합니다.'] : []),
    ...(!(typeof row.price === 'number' && Number.isFinite(row.price) && row.price > 0) ? ['판매 가격 확인이 필요합니다.'] : []),
    ...(!coupangProductUrl(row.url) ? ['유효한 쿠팡 상품 링크가 필요합니다.'] : []),
    ...(cues.length === 0 ? ['상품명만으로 구체적인 편의 기능과 사용 장면을 연결하지 못했습니다. 상세정보를 확인해 보세요.'] : []),
  ];
  return {
    status: reasons.length ? 'inspect' : 'candidate', cues, reasons, sourceKind,
    sourceLabel: sourceKnown
      ? `${row.source}${sourceKind === 'promotion' ? ' 목록' : ' 베스트 목록'} ${row.bestRank}번째`
      : '수집 출처 확인 필요',
    fresh, measuredAt: fresh ? row.measuredAt : null,
    // Neither API list position nor product-name features verify these claims.
    salesVerified: false, noveltyVerified: false,
  };
}

export function compareCoupangDiscovery(a, b) {
  const statusOrder = { candidate: 0, inspect: 1 };
  const sourceOrder = { category: 0, promotion: 1, unknown: 2 };
  return statusOrder[a.discovery.status] - statusOrder[b.discovery.status]
    || Number(b.discovery.fresh) - Number(a.discovery.fresh)
    || sourceOrder[a.discovery.sourceKind] - sourceOrder[b.discovery.sourceKind]
    || (a.row.bestRank || Infinity) - (b.row.bestRank || Infinity)
    || String(a.row.name || '').localeCompare(String(b.row.name || ''), 'ko');
}
