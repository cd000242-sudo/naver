/** Presentation never promotes legacy metadata to measured evidence. */
import { verifiedProductEvidence, validateEvidenceTitle } from './affiliateRecommendation.mjs';
export function recommendationReason(reason) {
  return ({
    'product-stale-or-unverified': '상품 판매·제휴 조건의 최근 확인이 필요합니다.',
    'demand-unverified': '이 검색어 자체의 최신 검색량이 확인되지 않았습니다.',
    'no-measured-demand': '조회된 검색량이 0입니다.',
    'demand-below-screening-minimum': '초기 추천 기준보다 검색량이 적습니다.',
    'product-intent-mismatch': '검색어와 이 상품의 식별 정보가 맞지 않습니다.',
    'product-intent-unverified': '큰 상품군의 수요인지 이 상품을 찾는 수요인지 확인이 필요합니다.',
    'same-query-serp-unverified': '같은 검색어의 최신 경쟁 결과가 확인되지 않았습니다.',
    'competition-saturated': '현재 수요·경쟁 측정값이 추천 기준을 통과하지 못했습니다.',
    'direct-competition-needs-review': '정면 대응 글이 있어 본문 경쟁 검토가 필요합니다.',
    'collection-failed': '최근 수집에 실패해 상품 상태를 다시 확인해야 합니다.',
  })[reason] || reason;
}
export function sourceUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase().replace(/\.+$/, '');
    if (url.protocol !== 'https:' || url.username || url.password
      || host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost')
      || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')) return null;
    return url.href;
  } catch { return null; }
}

function productName(item) {
  return String(item?.name || item?.keyword || '').replace(/^\s*(\[[^\]]*\]|\([^)]*\))\s*/g, '')
    .split(',')[0].replace(/\s+/g, ' ').trim();
}

export function affiliateTitle(item) {
  const verified = item?.aiTitle?.status === 'verified'
    ? validateEvidenceTitle(item, { ...item.aiTitle, title: item.aiTitle.text }) : null;
  if (verified) return { text: verified.text, label: '✍ 공식 표기 근거 제목', basis: '공식 제품 자료의 인용 구절과 제목을 대조했습니다. 성과 보장이 아닙니다.', verified: true };
  const name = productName(item);
  return {
    text: name ? `${name} 구매 전 확인할 사양·구성·판매 조건` : '',
    label: '✍ 작성 초안 · 사실 확인 필요',
    basis: '상품명만 사용한 중립 초안입니다. 성능·후기·사용 경험을 추정하지 않습니다.',
    verified: false,
  };
}

export function affiliateWritingBrief(item, assessment = {}) {
  const query = assessment.demand?.status === 'verified' && assessment.demand.query
    ? assessment.demand.query : String(item.keyword || productName(item));
  const sources = verifiedProductEvidence(item)
    .filter(e => sourceUrl(e.sourceUrl))
    .map(e => ({ id: e.id, url: sourceUrl(e.sourceUrl), excerpt: e.excerpt, measuredAt: e.verifiedAt }));
  return {
    query,
    ready: assessment.status === 'ready',
    warning: assessment.status === 'ready'
      ? '근거 통과 작성 후보입니다. 노출·주문·수익을 보장하지 않습니다.'
      : '추가 조사 대상이며 작성 추천이 아닙니다. 아래 미확인 근거를 먼저 확인하세요.',
    reasons: Array.isArray(assessment.reasons) && assessment.reasons.length
      ? assessment.reasons.map(recommendationReason) : [assessment.status === 'ready'
        ? '동일 검색어의 수요·경쟁·상품 식별 정보가 초기 검토 기준을 통과했습니다. 상품군 수요는 특정 모델의 수요와 다를 수 있습니다.'
        : '추천 근거를 아직 확인하지 못했습니다.'],
    title: affiliateTitle(item),
    sections: [
      `검색 의도: '${query}'를 찾는 사람이 해결하려는 구매 질문`,
      '상품 일치: 모델·옵션·구성품을 공식 상세정보와 대조',
      '선택 기준: 확인된 사양과 판매 조건으로 적합한 경우·맞지 않는 경우 설명',
      '경쟁 보완: 상위 글의 본문에서 빠진 질문을 직접 확인하고 보완',
      '구매 안내: 최신 판매 상태·제휴 조건 확인 및 제휴 사실 표시',
    ],
    sources,
  };
}
