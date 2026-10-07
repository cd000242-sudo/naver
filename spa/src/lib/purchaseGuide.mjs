/**
 * 구매 뒤 안내(2026-10-07 사장님 "구매하면 다운로드 바로가기랑 비밀번호 알려 주는지 — 어떤 제품이든" · "LEWORD 사용법 노션 볼 수 있게").
 * 상품 표기(예: "LEWORD 1년", "Leaders Pro All in one 1년", "Better Life Naver · LEWORD 1개월") → 다운로드 바로가기 · 코드 이름 · 노션 노출.
 * 카드 완료(payment-page/success.html) · 구매 메일(GAS sendLicenseEmail)과 같은 규칙이다.
 */
export const DOWNLOAD_PASSWORD = '1645';
export const LEWORD_GUIDE_URL = 'https://app.notion.com/p/LEWORD-77c9b1f8e6824ed7b8e70c5d1926dcf8';

const PRODUCTS = [
  { id: 'all', name: 'All in one', match: /all in one|올인원/i },
  { id: 'naver', name: 'Better Life Naver', match: /better life naver/i },
  { id: 'orbit', name: 'Leadernam Orbit', match: /leadernam orbit|leaders orbit|\borbit\b/i },
  { id: 'leword', name: 'LEWORD', match: /leword/i },
];

export function purchaseGuide(label) {
  const text = String(label || '');
  const found = PRODUCTS.filter((p) => p.match.test(text));
  const ids = found.some((p) => p.id === 'all') ? ['all'] : found.map((p) => p.id);
  const single = ids.length === 1 ? ids[0] : '';
  const item = PRODUCTS.find((p) => p.id === single);
  return {
    ids,
    downloadHref: ['naver', 'orbit', 'leword'].includes(single) ? `/download?product=${single}` : '/download',
    codeLabel: item ? `${item.name} 라이선스 코드` : '라이선스 코드',
    showGuide: ids.includes('leword') || ids.includes('all'),
    usage: single === 'leword'
      ? 'leaderspro.kr/leword 에서 [로그인 · 계정 만들기] → 아이디 · 비밀번호를 정하고 위 코드를 입력하세요. PC 앱은 아래에서 설치한 뒤 같은 아이디로 로그인합니다.'
      : single && single !== 'all'
        ? `${item.name} 앱을 아래에서 설치하고, 라이선스 등록 화면에 위 코드를 입력하세요.`
        : '코드 1개로 이용 기간 안에서 Better Life Naver, Leadernam Orbit, LEWORD를 함께 사용할 수 있습니다. 앱을 아래에서 설치하고 라이선스 등록 화면에 입력하세요.',
  };
}
