/**
 * 네이버 광고 3위 입찰가 — 화면 문구와 줄 세우기의 단일 출처(2026-09-24).
 *
 * 사장님: "지금 이건 황금키워드는 맞는데 메리트가 별로 없어. 돈 될 만한 황금키워드가 절대 아냐."
 *
 * 값은 leword-app 이 네이버 검색광고(파워링크 3위 평균 입찰가)로 잰 실측이다 — 우리가 만든 수익
 * 추정이 아니라, 광고주들이 그 검색어에 실제로 거는 값이다. 화면은 숫자와 출처를 함께 적는다
 * (사장님 '숫자 + 출처' 선택). 못 잰 행은 money 가 없다 — '—' 로 두고 지어내지 않는다.
 * 구간 기준(3,000 · 1,000 · 70원)은 leword-app src/utils/money-keywords.ts 와 같다.
 */

export type MoneyTier = 'high' | 'mid' | 'low' | 'none';

export type MoneyBid = {
    /** PC · 모바일 중 큰 값(원). */
    value: number;
    tier: MoneyTier;
    pc: number | null;
    mobile: number | null;
};

export const MONEY_TIER_LABEL: Record<MoneyTier, string> = {
    high: '고단가',
    mid: '중단가',
    low: '저단가',
    none: '광고 경쟁 없음',
};

const MONEY_TIER_RANK: Record<MoneyTier, number> = { high: 0, mid: 1, low: 2, none: 3 };

export const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;

/** "네이버 광고 3위 입찰가 13,380원" — 70원(최저가)이면 "최저 70원". */
export function moneyAmountText(money: MoneyBid): string {
    return `네이버 광고 3위 입찰가 ${money.tier === 'none' ? '최저 ' : ''}${won(money.value)}`;
}

/** "고단가 · 네이버 광고 3위 입찰가 13,380원" */
export function moneyLine(money: MoneyBid): string {
    return `${MONEY_TIER_LABEL[money.tier]} · ${moneyAmountText(money)}`;
}

/** 마우스를 올리면 보이는 설명 — 무엇을 잰 값이고 어떻게 읽는지. */
export function moneyTitle(money: MoneyBid): string {
    const devices = [
        money.pc != null ? `PC ${won(money.pc)}` : '',
        money.mobile != null ? `모바일 ${won(money.mobile)}` : '',
    ].filter(Boolean).join(' · ');
    const lines = [
        '이 검색어의 네이버 파워링크 광고를 3위에 걸려면 클릭 한 번에 이만큼 걸어야 합니다(네이버 검색광고 실측).',
        '광고주들이 비싸게 사는 말일수록 돈이 되는 말입니다.',
        money.tier === 'none' ? '70원은 최저가 — 3위 자리까지 광고 경쟁이 없다는 뜻입니다.' : '',
        devices,
    ];
    return lines.filter(Boolean).join('\n');
}

/** 줄 세우기 순위: 고단가 0 → 중단가 1 → 저단가 2 → 광고 경쟁 없음 3. 못 잰 행은 null(그 축을 건너뛴다). */
export function moneyRank(money?: MoneyBid | null): number | null {
    return money ? MONEY_TIER_RANK[money.tier] ?? null : null;
}
