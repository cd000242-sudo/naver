const timestamp = value => Number.isFinite(value) && value > 0 ? value : null;
const rows = value => Array.isArray(value) ? value.filter(item => item && Number.isInteger(item.rank) && item.rank > 0 && typeof item.keyword === 'string' && item.keyword.trim()) : [];

/** Keep each upstream ranking and its own freshness evidence; never substitute request time. */
export function realtimeSources(realtime, hot) {
    const lane = (id, label, detail) => {
        const data = hot?.lanes?.[id];
        return { id, label, detail, items: rows(data?.items), sourceAt: timestamp(data?.sourceUpdatedAt), checkedAt: timestamp(data?.updatedAt) };
    };
    return [
        { id: 'signal', label: '시그널', detail: 'signal.bz 뉴스 기반 이슈', items: rows(realtime?.items), sourceAt: timestamp(realtime?.sourceBatchAt), checkedAt: timestamp(realtime?.checkedAt) },
        lane('popular', '네이트', '네이트 실시간 이슈'),
        lane('daum', '다음', '다음 실시간 트렌드'),
        lane('google', '구글', 'Google Trends 급상승'),
    ];
}
