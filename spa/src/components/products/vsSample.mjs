/**
 * LEWORD 첫 화면 비교 재료 — 애드센스 고수 판(/data/adsense-benchmarks.json)의 실제 카드 하나를 고른다.
 * 고수 블로그 제목 3개 vs LEWORD 검색용 제목 3개 + 고수보다 나은 점 + 실측(대표 검색어 · 검색량 · 문서수).
 * 판을 못 받으면 2026-10-07 실측 사본을 그대로 보여 준다(지어내지 않는다 — 실제 카드에서 옮긴 값).
 */

// 2026-10-07 애드센스 고수 판 실제 카드(문화누리카드잔액)에서 옮긴 사본.
export const VS_SNAPSHOT = {
    query: '문화누리카드 잔액',
    searchVolume: 7180,
    documentCount: 16294,
    sourceCount: 5,
    theirs: [
        '문화누리카드 취소 환불 2026, 잔액은 언제 돌아오나요?',
        '2026 문화누리카드 잔액 사용처, 12월 31일 소멸 전 확인할 것',
        '문화누리카드 2026 잔액 소멸 전 사용처, 12월 31일까지 쓰세요',
    ],
    ours: [
        { text: '문화누리카드 잔액 확인법, 발급 대상과 연 15만 원 지원 기준', edge: "고수 5명이 안 다룬 '조건·자격'까지" },
        { text: '문화누리카드 잔액 조회와 충전 차이, 15만 원 어떻게 받나', edge: "고수 5명이 안 다룬 '비교·차이'까지" },
        { text: '문화누리카드 잔액 환불 조건과 신청 서류, 돌아오는 기간까지', edge: "고수 5명이 안 다룬 '조건·자격' · '서류·준비물'까지" },
    ],
    asOf: '2026-10-07',
};

/** 보여 줄 카드 — ★ 먼저, 실측 검색량 1,000 이상, 고수 제목 3개 · 나은 점 붙은 우리 제목 3개. 없으면 null. */
export function pickVsSample(cards, asOf) {
    const usable = (Array.isArray(cards) ? cards : []).filter((c) => {
        const edges = (c?.titleEdges || []).filter(Boolean);
        const volume = c?.metrics?.searchVolume;
        return (c?.sources || []).length >= 3 && edges.length >= 3 && (c?.titles || []).length >= 3
            && typeof volume === 'number' && volume >= 1000 && !!c?.metrics?.query;
    });
    const card = usable.find((c) => c.recommended) || usable[0];
    if (!card) return null;
    return {
        query: String(card.metrics.query),
        searchVolume: Number(card.metrics.searchVolume),
        documentCount: typeof card.metrics.documentCount === 'number' ? card.metrics.documentCount : null,
        // 화면엔 3편만 싣는다 — 나은 점 문구("고수 N명이 안 다룬")는 카드의 고수 글 전체를 센 값이라 그 수를 함께 적는다.
        sourceCount: card.sources.length,
        theirs: card.sources.slice(0, 3).map((s) => String(s?.title || '')),
        ours: card.titles.slice(0, 3).map((t, i) => ({ text: String(t), edge: String(card.titleEdges[i] || '') })),
        asOf,
    };
}
