/**
 * 연관·자동완성 키워드를 검색의도로 쪼갠다 (사장님 지시 2026-08-19:
 * "검색의도로 쪼개서 연관키워드가 나오도록").
 *
 * 분류는 키워드 표면의 **단서 어휘**만 본다 — 추정 점수를 만들지 않는다.
 * 단서가 없으면 '기타'로 정직하게 남긴다. 순서 = 매칭 우선순위이자 표시 순서
 * (돈 되는 의도가 앞).
 */

export type IntentGroupId = 'buy' | 'how' | 'compare' | 'issue' | 'info' | 'etc';

export const INTENT_GROUPS: ReadonlyArray<{ id: IntentGroupId; label: string; clue: RegExp }> = [
    { id: 'buy', label: '구매·거래', clue: /(추천|가격|최저가|구매|할인|쿠폰|내돈내산|후기|리뷰|중고|렌탈|견적|배송|세일|특가)/ },
    { id: 'how', label: '방법·신청', clue: /(방법|하는법|신청|발급|조회|등록|해지|취소|설치|사용법|만들기|환불|예약|접수|다운로드|연동)/ },
    { id: 'compare', label: '비교·순위', clue: /(vs|비교|차이|순위|추천순|어디가|뭐가|고르는)/i },
    { id: 'issue', label: '이슈·근황', clue: /(근황|논란|사건|사고|이혼|열애|결별|사망|재판|입대|은퇴|복귀|하차|불화|폭로|해명)/ },
    { id: 'info', label: '정보·기본', clue: /(뜻|나이|프로필|학력|고향|본명|인스타|결혼|남편|아내|가족|자녀|출시일|일정|시간|위치|주소|영업시간|가사|출연진|등장인물|줄거리|결말|시즌)/ },
];

export interface IntentBucket<T> {
    id: IntentGroupId;
    label: string;
    items: T[];
}

/** 베이스(본 키워드)를 뺀 잔여 문자열에서 단서를 찾는다 — "심권호 근황"의 단서는 "근황"이다. */
export function classifyIntent(keyword: string, base?: string): IntentGroupId {
    const rest = base ? String(keyword).replace(base, ' ') : String(keyword);
    for (const group of INTENT_GROUPS) {
        if (group.clue.test(rest)) return group.id;
    }
    return 'etc';
}

/** 목록 → 의도 버킷들(비어 있지 않은 것만, 표시 순서 유지 + 기타는 맨 뒤). */
export function groupByIntent<T>(items: T[], keywordOf: (item: T) => string, base?: string): IntentBucket<T>[] {
    const buckets = new Map<IntentGroupId, T[]>();
    for (const item of items) {
        const id = classifyIntent(keywordOf(item), base);
        if (!buckets.has(id)) buckets.set(id, []);
        buckets.get(id)!.push(item);
    }
    const ordered: IntentBucket<T>[] = [];
    for (const group of INTENT_GROUPS) {
        const bucketItems = buckets.get(group.id);
        if (bucketItems && bucketItems.length > 0) ordered.push({ id: group.id, label: group.label, items: bucketItems });
    }
    const etc = buckets.get('etc');
    if (etc && etc.length > 0) ordered.push({ id: 'etc', label: '기타', items: etc });
    return ordered;
}
