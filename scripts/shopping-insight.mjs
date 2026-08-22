/*
 * [쌍둥이 주의] 같은 파일이 앱 레포(leword-app)의 scripts/shopping-insight.mjs 에도 있다.
 * 두 레포가 따로 배포되므로 공유할 방법이 없어 사본을 둔다.
 * 판정 기준(MIN_MONTHS)을 고칠 때는 **양쪽을 같이** 고칠 것.
 */
/**
 * 네이버 쇼핑인사이트 실측 — "이 말이 쇼핑에서 실제로 클릭되는가".
 *
 * 왜 필요한가(사장님 지시 2026-08-23): 지금 '제휴·쇼핑각' 판정이 검색광고
 * 경쟁도 '높음' 하나뿐이라, 유튜브 급상승 50건에서 2건밖에 못 잡았다.
 * 그런데 정작 돈이 되는 건 '나연 혀클리너'처럼 방송·유튜브에 나온 제품이고,
 * 그런 말은 광고 경쟁이 낮아도 잘 팔린다. 그 판정을 광고주가 아니라
 * **사는 사람** 쪽에서 해야 한다.
 *
 * 무엇을 주고 무엇을 못 주나(2026-08-23 실측):
 *   · 준다   — 분야 안에서의 상대 클릭량 추이
 *   · 못 준다 — 상품 수, 절대 클릭 수, 가격. 쇼핑 *검색* API 는 종료됐고
 *              쇼핑인사이트가 그 대체가 아니다. 둘은 다른 것이다.
 * 그래서 여기서는 **있다/없다**만 쓴다. 상대값을 절대 수치처럼 화면에 싣지 않는다.
 *
 * 규격(실측 확정): 서비스 이름이 `shopping` 이다.
 *   POST https://naverapihub.apigw.ntruss.com/shopping/v1/category/keywords
 *   헤더 X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY
 *   category 는 **문자열 하나**, keyword 는 [{name, param:[말]}]
 * 카테고리를 틀리게 주면 오류가 아니라 200 + data: [] 로 온다.
 * 검색어만으로 묻는 창구는 없다 — 그래서 대분류를 훑는다.
 */

const HUB = 'https://naverapihub.apigw.ntruss.com/shopping/v1/category/keywords';

/** 쇼핑 대분류. 어느 분야에서든 클릭이 잡히면 '사는 말'로 본다. */
export const SHOPPING_CATEGORIES = [
    '50000008', // 생활/건강 — 생활용품이 여기 많아 먼저 본다(실측: 나연 혀클리너)
    '50000003', // 디지털/가전
    '50000002', // 화장품/미용
    '50000004', // 가구/인테리어
    '50000000', // 패션의류
    '50000001', // 패션잡화
    '50000006', // 식품
    '50000007', // 스포츠/레저
    '50000005', // 출산/육아
];

function headers(keyId, key) {
    return { 'X-NCP-APIGW-API-KEY-ID': keyId, 'X-NCP-APIGW-API-KEY': key, 'Content-Type': 'application/json' };
}

function lastThreeMonths() {
    const end = new Date();
    const start = new Date(end.getTime() - 92 * 24 * 60 * 60 * 1000);
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { startDate: fmt(start), endDate: fmt(end) };
}

/**
 * 몇 달치가 잡혀야 '사는 말'로 볼 것인가.
 *
 * 2 로 둔다 — 실측(2026-08-23, 3개월 창)에서 이 값이 깨끗하게 갈랐다.
 *   팔 물건    나연 혀클리너 2 · 스탠리 텀블러 3 · 메모리폼 베개 3
 *              다이슨 에어랩 3 · 에어프라이어 3      → 전부 2 이상
 *   아닌 것    인상주의를 넘어 1 · 실업급여 조건 0 · 청년내일저축계좌 0
 *              전세보증금 반환 0 · 국민연금 수령나이 0
 * 1 로 낮추면 '인상주의를 넘어'(전시)가 통과한다 — 한 달 반짝은 근거가 얇다.
 */
export const MIN_MONTHS = 2;

/**
 * 이 말이 쇼핑에서 **꾸준히** 클릭되는가.
 *   { category, points } — 사는 말(최다 분야에서 MIN_MONTHS 개월 이상 잡힘)
 *   null                 — 물어봤는데 그만큼은 아니다
 *   undefined            — 못 물어봤다(키 없음·전부 실패). '없음'과 다르다.
 *
 * 기준을 채우는 분야를 만나면 거기서 멈춘다 — 나머지 분야에 호출을 쓰지 않는다.
 */
export async function probeShoppingClicks(keyword, keyId, key, options = {}) {
    if (!keyId || !key || !String(keyword || '').trim()) return undefined;
    const cats = options.categories || SHOPPING_CATEGORIES;
    const minMonths = Number.isFinite(options.minMonths) ? options.minMonths : MIN_MONTHS;
    const { startDate, endDate } = lastThreeMonths();
    let asked = 0;
    let best = null;
    for (const category of cats) {
        try {
            const response = await fetch(HUB, {
                method: 'POST',
                headers: headers(keyId, key),
                body: JSON.stringify({
                    startDate, endDate, timeUnit: 'month',
                    category, keyword: [{ name: keyword, param: [keyword] }],
                    device: '', gender: '', ages: [],
                }),
            });
            if (!response.ok) continue;
            asked += 1;
            const parsed = await response.json();
            const points = (((parsed.results || [])[0] || {}).data || []).length;
            if (points > (best ? best.points : 0)) best = { category, points };
            // 기준을 채웠으면 더 볼 필요가 없다.
            if (best && best.points >= minMonths) return best;
        } catch {
            // 이 분야만 건너뛴다 — 한 번 실패가 판정을 뒤집으면 안 된다.
        }
    }
    if (asked === 0) return undefined;
    return best && best.points >= minMonths ? best : null;
}
