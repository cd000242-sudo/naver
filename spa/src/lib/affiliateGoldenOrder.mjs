/**
 * 제휴 황금키워드 기본 정렬 — 검색량÷문서수가 큰 순(2026-10-28 사장님 "검색량은 많고 문서수가 작은 순서대로" → "기본 정렬 자체를 바꾸세요").
 *
 * 토스·브랜드커넥트(AffiliateTab)와 쿠팡(CoupangBoard)이 같은 기준으로 줄을 선다.
 * 검색량·문서수는 니즈 검색어 값이 있으면 그것, 없으면 상품명(쿠팡은 그 검색어) 값. 둘 다 잰 값이어야 비율을 낸다.
 * 검색량 100 미만은 비율이 커도 뒤로 — 문서 6개·검색 60 같은 말이 맨 위를 차지하지 않게(2026-09-16 지적과 같은 함정).
 * 숫자가 없는 상품은 맨 뒤에 원래 순서대로 남는다(정렬은 안정적이다).
 */
const MIN_VOLUME = 100;
const positive = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);

export function goldenMetrics(item) {
  for (const [rawVolume, rawDocs] of [[item?.needVolume, item?.needDocs], [item?.searchVolume, item?.documentCount]]) {
    const volume = positive(rawVolume), docs = positive(rawDocs);
    if (volume && docs) return { volume, docs, ratio: volume / docs };
  }
  return { volume: positive(item?.needVolume) ?? positive(item?.searchVolume), docs: null, ratio: null };
}

const tier = (metrics) => (metrics.ratio === null ? 2 : metrics.volume >= MIN_VOLUME ? 0 : 1);

export function compareGoldenRatio(a, b) {
  const x = goldenMetrics(a), y = goldenMetrics(b);
  return tier(x) - tier(y) || (y.ratio ?? 0) - (x.ratio ?? 0) || (y.volume ?? 0) - (x.volume ?? 0);
}
