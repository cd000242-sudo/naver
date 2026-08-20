/**
 * 쇼핑 글 제목 대장간 — 제품명 + 서브 키워드 + 후킹 3부품 조립.
 *
 * 사장님 지시(2026-08-20): "홈판처럼 쇼핑모드도 제목을 생성해줘야지 —
 * 제품명 + 서브 키워드 + 클릭할 수밖에 없는 후킹."
 *
 * 원시 상품명("[여름특가]드리미 X60 Ultra 올인원 로봇청소기+악세사리 키트
 * 증정 화이트, 단품")은 제목이 아니다. 여기서 하는 일:
 *   ① 상품명 정리 — 행사 괄호·옵션 꼬리(", 단품"·"+증정")·색상·수량을 걷어낸다
 *   ② 서브 키워드 — 니즈 검색어(실측 수요)에서 제품명과 겹치는 어절을 뺀 나머지
 *   ③ 후킹 — 상품군 신호(상품명·검색어)로 고른 클릭 문구. 광고 규제어
 *      (1위·최저가·무조건·필수템 등)와 상투구(총정리·핵심 정리)는 쓰지 않는다
 *
 * 규칙만으로 돈다(LLM 없음) — 실측 필드와 매칭 사실만 쓰고 추정을 만들지 않는다.
 * 변형 선택은 상품명 길이 기반이라 같은 상품이면 항상 같은 제목이다(난수 금지).
 */

export type ShoppingTitleInput = {
    name: string;
    brand?: string | null;
    /** 상품명에서 뽑은 검색어. */
    keyword?: string | null;
    /** 니즈 검색어 — 실측 최고 수요. 있으면 서브 키워드의 1순위 재료다. */
    needKeyword?: string | null;
};

export type ShoppingTitle = {
    text: string;
    parts: { product: string; sub: string; hook: string };
    /** 어떤 재료로 조립했는가 — 화면 툴팁용. */
    basis: string;
};

/**
 * 옵션·수량·행사·마케팅 수식 어절 — 제목에 실을 가치가 없는 것들.
 * 마케팅 수식(올인원·인테리어·스마트앱연동 등)까지 걷어야 제품명 상한에서
 * 정작 모델·품목 어절이 잘려 나가는 일이 줄어든다(2026-08-20 실측:
 * "르젠 BLDC 저소음 스마트앱연동 인테리어"에서 써큘레이터가 잘림).
 */
const JUNK_TOKEN_RE = /^(단품|증정|증정품|사은품|세트|기획|리필|본품|정품|무료배송|묶음|올인원|인테리어|스마트앱연동|프리미엄|고급형|가정용|휴대용|키트|악세사리|악세서리|쓰레기|음쓰|\d+(개|매|입|장|구|팩|병|캔|포|스틱|박스|세트|리터)|\d+(g|kg|ml|l|mm|cm)|화이트|블랙|그레이|베이지|네이비|핑크|실버|골드색?)$/i;

/** 상품명 맨 앞 행사 괄호("[여름특가]"·"(오늘출발)")를 걷어낸다. */
function stripPromoBrackets(raw: string): string {
    return raw.replace(/^\s*(\[[^\]]*\]|\([^)]*\))\s*/g, '').trim();
}

function tokensOf(text: string): string[] {
    return text.split(/\s+/).filter(Boolean);
}

function normalizeToken(token: string): string {
    return token.toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
}

/**
 * ① 상품명 정리 — 괄호·콤마 옵션·"+증정" 꼬리·색상/수량 어절 제거, 24자 상한.
 * 앞자리(브랜드+모델)는 절대 안 자른다 — 뒤 어절부터 덜어낸다.
 */
export function cleanProductName(rawName: string): string {
    const noBracket = stripPromoBrackets(String(rawName || ''));
    // 콤마 뒤는 옵션이다("…화이트, 단품" / "…100매, 10개").
    const beforeComma = noBracket.split(',')[0];
    const words = tokensOf(beforeComma)
        // "로봇청소기+악세사리" → "로봇청소기" (+ 뒤는 증정 꼬리)
        .map((w) => w.split('+')[0])
        .filter((w) => w.length > 0 && !JUNK_TOKEN_RE.test(w));
    let kept = [...words];
    while (kept.join(' ').length > 24 && kept.length > 2) {
        kept = kept.slice(0, -1);
    }
    return kept.join(' ');
}

/**
 * ② 서브 키워드 — 니즈 검색어(없으면 상품명 검색어)에서 제품명과 겹치는
 * 어절을 뺀 나머지. "드리미 X60 Ultra" 카드에 "드리미"를 또 싣는 반복
 * ("X60 Ultra X60 Ultra 드리미 X60 Ultra")이 이 중복 제거의 존재 이유다.
 */
export function pickSubKeyword(product: string, needKeyword?: string | null, keyword?: string | null): string {
    const productSet = new Set(tokensOf(product).map(normalizeToken));
    const source = String(needKeyword || keyword || '').trim();
    if (!source) return '';
    return tokensOf(source)
        // 제품명에서 걷어낸 수식 어절("휴대용")이 서브로 되살아나면 안 된다.
        .filter((t) => !JUNK_TOKEN_RE.test(t) && !productSet.has(normalizeToken(t)))
        .join(' ');
}

type HookDomain = {
    match: RegExp;
    /** 서브 키워드가 있을 때 — 서브를 훅 안에 녹인다. */
    withSub: ReadonlyArray<(sub: string) => string>;
    /** 서브가 전부 제품명과 겹쳐 비었을 때 — 명사 반복 없이 훅만. */
    bare: ReadonlyArray<() => string>;
};

/*
 * 상품군별 후킹 풀. 위에서부터 먼저 매칭되는 하나를 쓴다(구체적인 것부터).
 * 금지: 1위·최저가·무조건·필수템·인생템·오늘만·품절 임박(광고 규제),
 *       총정리·핵심 정리·한눈에(상투구), 근거 없는 체험 단정.
 */
/*
 * 후킹 원칙(사장님 지적 2026-08-20 "너무 당연한데"):
 * 제품의 당연한 기능 결과는 0점이다 — "로봇청소기 돌려두면 깨끗해진다"는
 * 독자가 이미 아는 것이라 클릭할 이유가 없다. 훅은 독자가 **모르는 판단**을
 * 약속해야 한다: 그 상품군에서 실제로 구매 만족이 갈리는 숨은 축
 * (관리 부담·소음 기준·우리 집/우리 애 궁합·리뷰 양극화·한 달 뒤 후회 지점).
 * 기능을 말하는 훅을 추가하려거든 이 주석 앞에서 멈춰라.
 */
const HOOK_DOMAINS: readonly HookDomain[] = [
    {
        // 로봇청소기의 만족은 흡입력이 아니라 물걸레 통 관리·바닥 궁합에서 갈린다.
        // "물걸레 통" 훅은 이 도메인 전용 — 세제·일반 청소기에 걸리면 사실 날조다.
        match: /(로봇\s*청소기|로봇청소기|물걸레)/,
        withSub: [
            (s) => `${s} 잘 산 집과 후회한 집, 갈린 건 흡입력이 아니었다`,
            (s) => `${s} 리뷰가 잘 말 안 해주는 물걸레 통 그 부분`,
            (s) => `${s} 사기 전에 우리 집 바닥부터 봐야 하는 이유`,
        ],
        bare: [
            () => `잘 산 집과 후회한 집, 갈린 건 흡입력이 아니었다`,
            () => `리뷰가 잘 말 안 해주는 물걸레 통 관리 이야기`,
            () => `사기 전에 우리 집 바닥부터 봐야 하는 이유`,
        ],
    },
    {
        // 일반 청소·세정 용품 — 기능 결과("깨끗해진다")는 당연하니 후회 축으로만 간다.
        match: /(청소기|세제|살균|탈취|먼지|청소)/,
        withSub: [
            (s) => `${s} 잘 산 집과 후회한 집, 갈린 건 성능이 아니었다`,
            (s) => `${s} 리뷰가 극과 극인 데는 이유가 있다`,
        ],
        bare: [
            () => `잘 산 집과 후회한 집, 갈린 건 성능이 아니었다`,
            () => `리뷰가 극과 극인 데는 이유가 있다`,
        ],
    },
    {
        // 냉방가전의 갈림길은 시원함(당연)이 아니라 소음 기준·세척 구조·전기료다.
        match: /(선풍기|서큐|서큘|냉풍|쿨링|냉감|에어컨|제습|손풍기)/,
        withSub: [
            (s) => `${s} 저소음이라는 말, 잠귀 밝으면 기준이 다르다`,
            (s) => `${s} 바람 세기보다 먼저 봐야 하는 게 있다`,
            (s) => `${s} 여름 끝나고 후회한 집이 안 본 한 가지`,
        ],
        bare: [
            () => `저소음이라는 말, 잠귀 밝은 사람 기준은 다르다`,
            () => `바람 세기보다 먼저 봐야 하는 게 있다`,
            () => `여름 끝나고 후회한 집이 안 본 한 가지`,
        ],
    },
    {
        // 구강: 처음 쓰는 날의 충격(잇몸 피·물튀김)과 치실 대비 논쟁이 진짜 긴장이다.
        match: /(미백|치약|치아|화이트닝|구강|칫솔|세정기)/,
        withSub: [
            (s) => `${s} 처음 쓰는 날 다들 놀라는 그 부분`,
            (s) => `${s} 치실이면 되지 않냐는 질문에 대한 답`,
            (s) => `${s} 임플란트·교정이면 이야기가 달라진다`,
        ],
        bare: [
            () => `처음 쓰는 날 다들 놀라는 그 부분`,
            () => `한번 쓰면 못 돌아간다는 말이 나오는 이유`,
            () => `임플란트·교정이면 이야기가 달라진다`,
        ],
    },
    {
        // 뷰티: 후기 불신(피부 타입 궁합)이 핵심 긴장 — 효과 약속은 광고법 지뢰밭이기도 하다.
        match: /(화장품|스킨|로션|세럼|앰플|선크림|클렌징|샴푸|바디워시|헤어|마스크팩|뷰티)/,
        withSub: [
            (s) => `${s} 남의 후기가 나한테 안 맞는 이유`,
            (s) => `${s} 성분표보다 먼저 볼 것 하나`,
        ],
        bare: [
            () => `남의 후기가 나한테 안 맞았던 이유`,
            () => `성분표보다 먼저 볼 것 하나`,
        ],
    },
    {
        // 식품: 맛있다(당연)가 아니라 재구매가 갈리는 숨은 이유(양·보관·손질)로 간다.
        match: /(커피|캡슐|간식|음료|스낵|초코|젤리|라면|밀키트|견과|바나나|과일|참치|반찬|김치|도시락김|광천김|정육|한돈|돼지|소고기|닭|갈비|고기|수산|생선|복숭아|포도|거봉|사과|즙|동치미|장아찌|젓갈|쌀|잡곡)/,
        withSub: [
            (s) => `${s} 재구매가 갈리는 건 맛이 아니었다`,
            (s) => `${s} 별점 높은 리뷰가 못 알려주는 한 가지`,
            (s) => `${s} 한 번 먹어본 사람만 아는 갈림길`,
        ],
        bare: [
            () => `재구매 버튼을 누르는 집은 따로 있다`,
            () => `별점 높은 리뷰가 못 알려주는 한 가지`,
            () => `한 번 먹어본 사람만 아는 갈림길`,
        ],
    },
    {
        // 육아: 좋은 물건보다 개월수·물려받기 판단이 먼저다.
        match: /(유아|아기|육아|기저귀|분유|이유식|카시트|유모차)/,
        withSub: [
            (s) => `${s} 개월수 안 맞으면 좋은 것도 소용없다`,
            (s) => `${s} 물려받을지 새로 살지 갈리는 기준`,
        ],
        bare: [
            () => `개월수 안 맞으면 좋은 것도 소용없다`,
            () => `물려받을지 새로 살지, 갈리는 기준 하나`,
        ],
    },
    {
        // 펫: 스펙이 아니라 우리 애 거부 여부가 전부다 — 후기로도 모르는 부분.
        match: /(강아지|고양이|반려|펫|사료|배변)/,
        withSub: [
            (s) => `${s} 바꿨다가 되돌아오는 집이 있는 이유`,
            (s) => `${s} 우리 애한테 맞는지 후기로는 모르는 부분`,
        ],
        bare: [
            () => `바꿨다가 되돌아오는 집이 있는 이유`,
            () => `우리 애한테 맞는지, 후기로는 모르는 부분`,
        ],
    },
    {
        // 가전/디지털: 스펙표 밖(체감 차이·윗급 대비 가성비)이 판단 긴장이다.
        match: /(이어폰|충전|배터리|블루투스|스마트|노트북|모니터|마우스|키보드|공기청정|가전|디지털|처리기|분쇄기|건조기)/,
        withSub: [
            (s) => `${s} 스펙표에 없는 그 한 줄에서 갈린다`,
            (s) => `${s} 윗급이랑 값 차이만큼 다를까`,
            (s) => `${s} 리뷰가 극과 극인 데는 이유가 있다`,
        ],
        bare: [
            () => `스펙표에 없는 그 한 줄에서 갈린다`,
            () => `윗급이랑 값 차이만큼 다를까`,
            () => `리뷰가 극과 극인 데는 이유가 있다`,
        ],
    },
];

const GENERIC_DOMAIN: HookDomain = {
    match: /.*/,
    withSub: [
        (s) => `${s} 리뷰가 극과 극인 데는 이유가 있다`,
        (s) => `${s} 가격보다 먼저 봐야 하는 게 있다`,
        (s) => `${s} 사고 한 달 뒤에 갈리는 건 이 부분`,
    ],
    bare: [
        () => `리뷰가 극과 극인 데는 이유가 있다`,
        () => `가격보다 먼저 봐야 하는 게 있다`,
        () => `사고 한 달 뒤에 갈리는 건 이 부분`,
    ],
};

function pickDomain(signal: string): HookDomain {
    for (const domain of HOOK_DOMAINS) {
        if (domain.match.test(signal)) return domain;
    }
    return GENERIC_DOMAIN;
}

/**
 * 상한을 넘으면 훅의 뒤 어절부터 덜어낸다 — 제품명(앞자리)은 안 자른다.
 * 덜어낸 끝이 관형형("끝나는"·"달라지는")으로 끊기면 그 어절까지 마저 덜어
 * 반토막 문장을 화면에 내보내지 않는다(2026-08-20 실측: "…한 번에 끝나는").
 */
function fitWithin(product: string, hook: string, max: number): string {
    let hookWords = tokensOf(hook);
    while (`${product}, ${hookWords.join(' ')}`.length > max && hookWords.length > 2) {
        hookWords = hookWords.slice(0, -1);
        while (hookWords.length > 2 && /(하는|나는|지는|리는|이는|이|가|은|는|을|를|도|만|와|과|에|의|로|보다|부터|까지)$/.test(hookWords[hookWords.length - 1])) {
            hookWords = hookWords.slice(0, -1);
        }
    }
    return `${product}, ${hookWords.join(' ')}`;
}

/** ③ 조립 — 제품명 + 서브 키워드 + 후킹. 이름이 없으면 만들지 않는다. */
export function forgeShoppingTitle(input: ShoppingTitleInput): ShoppingTitle | null {
    const product = cleanProductName(input.name);
    if (!product) return null;

    const sub = pickSubKeyword(product, input.needKeyword, input.keyword);
    // 원시 상품명은 신호로 못 쓴다 — "2팩"·"30팩" 같은 수량 꼬리가
    // 마스크팩 상품군을 오탐시킨다(실측). 정리된 제품명과 검색어만 본다.
    const signal = [product, input.keyword, input.needKeyword, input.brand]
        .filter(Boolean).join(' ');
    const domain = pickDomain(signal);

    // 난수 금지 — 상품명 문자합으로 변형을 고정한다. 같은 상품이면 항상 같은
    // 제목이고, 길이가 비슷한 상품끼리도 변형이 갈린다(길이 % 는 전부 같은
    // 변형으로 쏠렸다 — 2026-08-20 실측).
    const pool = sub ? domain.withSub : domain.bare;
    const seed = Array.from(String(input.name || ''))
        .reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    const renderAt = (index: number): string => (sub
        ? (pool as ReadonlyArray<(s: string) => string>)[index](sub)
        : (pool as ReadonlyArray<() => string>)[index]());

    /*
     * 충돌 회피 — 상품명이 이미 말한 어절("저소음")을 훅이 또 말하면
     * ("…저소음, 써큘레이터 저소음이라는 말…" — 2026-08-20 실측) 반복으로
     * 읽힌다. 시드 변형부터 돌며 상품명 어절과 안 겹치는 첫 변형을 쓴다.
     * 서브 키워드 어절은 의도된 재료라 충돌로 치지 않는다.
     */
    // 조사 붙은 형태("저소음이라는")도 잡아야 하므로 완전일치가 아니라 접두 일치.
    const productTokens = tokensOf(product).map(normalizeToken).filter((t) => t.length >= 2);
    const subTokens = new Set(tokensOf(sub).map(normalizeToken));
    const collides = (hookText: string): boolean => tokensOf(hookText)
        .map(normalizeToken)
        .some((t) => t.length >= 2 && !subTokens.has(t)
            && productTokens.some((p) => t.startsWith(p) || p.startsWith(t)));

    let hook = renderAt(seed % pool.length);
    for (let offset = 0; offset < pool.length; offset += 1) {
        const candidate = renderAt((seed + offset) % pool.length);
        if (!collides(candidate)) { hook = candidate; break; }
    }

    const text = fitWithin(product, hook, 52);
    const basis = sub
        ? `제품명 + 니즈 검색어 '${input.needKeyword || input.keyword}' + 상품군 후킹 — 규칙 조립`
        : `제품명 + 상품군 후킹 (니즈 검색어는 제품명과 전부 겹쳐 생략) — 규칙 조립`;

    return { text, parts: { product, sub, hook }, basis };
}
