import type { CommunityIncomeProof } from './siteOps';

/**
 * 애드센스 운영 성과 — 커뮤니티 [수익 인증] 판에 함께 세운다.
 *
 * 사장님 지시(2026-08-23): "이건 수익인증으로 옮겨주세요. 중복되는 거 빼고
 * 애드센스 수익만 추가해서 옮겨 주면 됩니다."
 *
 * 원래는 구매 화면의 올인원 카드 안에서 자동으로 돌던 것이다. 값을 고르는
 * 자리에 증거를 끼워 넣는 것보다, 인증이 모이는 판에 함께 두는 편이 맞다 —
 * 거기서는 사용자 인증과 나란히 놓여 비교가 된다.
 *
 * source 는 'site-proof' 다. 사용자가 올린 인증과 **구분해서 표시**하기 위한
 * 표시이고, 타입에 이미 있는 값이다(운영 성과 vs 제출 인증).
 * 여기 값은 전부 애드센스 화면 그대로이고, 화면에서 계산하는 수치는 없다.
 */
export const ADSENSE_SITE_PROOFS: CommunityIncomeProof[] = [
  {
    id: 'site-adsense-10000-month',
    amount: '이번 달 US$1만',
    author: 'Leaders Pro 운영',
    date: '',
    desc: '애드센스 예상 수입 상승 인증',
    tags: ['애드센스', '월 수익'],
    media: '/images/pricing-proof/adsense-10000-month.jpg',
    mediaType: 'image',
    mediaName: '애드센스 월 수익',
    source: 'site-proof',
  },
  {
    id: 'site-adsense-daily-100',
    amount: '오늘 US$100+',
    author: 'Leaders Pro 운영',
    date: '',
    desc: '일 수익 상승 사례',
    tags: ['애드센스', '일 수익'],
    media: '/images/pricing-proof/adsense-daily-100.jpg',
    mediaType: 'image',
    mediaName: '애드센스 일 수익',
    source: 'site-proof',
  },
  {
    id: 'site-adsense-28days-931',
    amount: '최근 28일 US$931',
    author: 'Leaders Pro 운영',
    date: '',
    desc: '월간 운영 성과',
    tags: ['애드센스', '28일 성과'],
    media: '/images/pricing-proof/adsense-28days-931.jpg',
    mediaType: 'image',
    mediaName: '애드센스 28일 성과',
    source: 'site-proof',
  },
  {
    id: 'site-adsense-today-95',
    amount: '오늘 US$95.57',
    author: 'Leaders Pro 운영',
    date: '',
    desc: '당일 수익 인증',
    tags: ['애드센스', '당일 수익'],
    media: '/images/pricing-proof/adsense-today-95.jpg',
    mediaType: 'image',
    mediaName: '애드센스 당일 수익',
    source: 'site-proof',
  },
  {
    id: 'site-adsense-small-start',
    amount: '작은 블로그도 수익 흐름 확인',
    author: 'Leaders Pro 운영',
    date: '',
    desc: '초기 운영 단계의 수익 상승 사례',
    tags: ['애드센스', '시작 사례'],
    media: '/images/pricing-proof/adsense-small-start.jpg',
    mediaType: 'image',
    mediaName: '애드센스 시작 사례',
    source: 'site-proof',
  },
];

/**
 * 서버에서 온 인증과 합치되 **중복은 뺀다**(사장님 지시).
 * 같은 그림이 이미 올라와 있으면 그쪽을 남긴다 — 사용자가 올린 것이 우선이다.
 */
export function mergeAdsenseProofs(serverItems: CommunityIncomeProof[]): CommunityIncomeProof[] {
  const seen = new Set(
    serverItems
      .map((item) => String(item.media || '').split('/').pop() || '')
      .filter(Boolean),
  );
  const extras = ADSENSE_SITE_PROOFS.filter(
    (item) => !seen.has(String(item.media || '').split('/').pop() || ''),
  );
  return [...serverItems, ...extras];
}
