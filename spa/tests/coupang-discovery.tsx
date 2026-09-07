// Dev fixture only: not a Vite build entry or a production authentication path.
import React from 'react';
import { createRoot } from 'react-dom/client';
import CoupangBoard from '../src/components/leword/CoupangBoard';
import LewordStyles from '../src/components/leword/LewordStyles';

let calls = 0;
let errors = 0;
window.addEventListener('error', () => { document.getElementById('errors')!.textContent = `화면 오류 ${++errors}건`; });
window.addEventListener('unhandledrejection', () => { document.getElementById('errors')!.textContent = `화면 오류 ${++errors}건`; });
const base = { price: 17900, wasPrice: null, discountPercent: null, image: '', rocket: false,
    source: '생활용품', goldboxRank: 2, bestRank: 2, measuredAt: new Date().toISOString(),
    searchVolume: 0, documentCount: 100000, serpTop: { sampled: 10, exact: 7, partial: 1 } };
const products = [
    { ...base, name: '테스트 무타공 자석 부착식 욕실 수납 선반', keyword: '테스트 선반', url: 'https://link.coupang.com/a/fixture1' },
    { ...base, name: '테스트 생수 2L', keyword: '테스트 생수', url: 'https://link.coupang.com/a/fixture2', bestRank: 1 },
    { ...base, name: '테스트 접이식 수납 바구니', keyword: '테스트 바구니', url: 'https://link.coupang.com/a/fixture3', source: '골드박스 특가', bestRank: 1 },
    { ...base, name: '테스트 틈새 청소 브러시', keyword: '테스트 브러시', url: 'https://link.coupang.com/a/fixture4', measuredAt: '2020-01-01T00:00:00Z' },
];
window.fetch = async (_url, options) => {
    const action = JSON.parse(String(options?.body || '{}')).action;
    if (action !== 'keyword-coupang-board') throw new Error('Fixture blocks all other requests');
    document.getElementById('network')!.textContent = `모의 API 호출 ${++calls}회 · 외부 네트워크 차단`;
    return new Response(JSON.stringify({ ok: true, needsKeys: false, products }), { headers: { 'Content-Type': 'application/json' } });
};
createRoot(document.getElementById('root')!).render(<><LewordStyles /><CoupangBoard onAnalyze={keyword => {
    document.getElementById('network')!.textContent += ` · 분석 대상 ${keyword}`;
}} /></>);
