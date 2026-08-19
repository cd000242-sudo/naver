/**
 * 방문자 개인 API 키 보관소.
 *
 * 어디에 저장하나: **이 브라우저의 localStorage 에만** 둔다. 우리 서버에 저장하지
 * 않고, 조회할 때만 요청 본문에 실어 보낸다(GET 쿼리로 보내면 URL 로그·브라우저
 * 기록에 키가 남는다). 서버는 요청 하나가 끝나면 버린다.
 *
 * 왜 개인 키를 받나: 자기 키로 돌리면 자기 쿼터를 쓰므로 조회 제한이 없다.
 * 사장님 키로 돌리는 무료 이용자와 쿼터가 섞이지 않는다.
 */

const STORE_KEY = 'leaderspro.keyword.userKeys.v1';

export type UserKeyField =
    | 'searchAdLicense'
    | 'searchAdSecret'
    | 'searchAdCustomer'
    | 'openApiId'
    | 'openApiSecret'
    | 'youtubeKey'
    | 'coupangAccessKey'
    | 'coupangSecretKey'
    | 'coupangSubId'
    | 'brandconnectSpaceId'
    | 'apihubKeyId'
    | 'apihubKey';

export type UserKeys = Partial<Record<UserKeyField, string>>;

export type KeyGroup = {
    id: 'searchad' | 'openapi' | 'apihub' | 'youtube' | 'coupang' | 'brandconnect';
    label: string;
    desc: string;
    /** 어디서 발급받는지. 사용자가 바로 갈 수 있어야 한다. */
    issueUrl: string;
    fields: Array<{ key: UserKeyField; label: string; secret: boolean; placeholder: string; minLength: number }>;
};

export const KEY_GROUPS: readonly KeyGroup[] = [
    {
        id: 'searchad',
        label: '네이버 검색광고',
        desc: '월간 검색량·경쟁도를 조회합니다.',
        issueUrl: 'https://manage.searchad.naver.com/customers',
        fields: [
            { key: 'searchAdLicense', label: '액세스 라이선스', secret: true, placeholder: '0100000000...' , minLength: 60 },
            { key: 'searchAdSecret', label: '비밀키', secret: true, placeholder: 'AQAAAAA...' , minLength: 40 },
            { key: 'searchAdCustomer', label: '고객 ID', secret: true, placeholder: '1234567' , minLength: 5 },
        ],
    },
    {
        /*
         * 개발자센터 신규 발급이 막혀 새 사용자는 API HUB 키만 받을 수 있다(2026-07 개편).
         * 그래서 이 그룹이 기본이고, 아래 '오픈 API(구키)'는 기존 발급자 전용이다.
         * 둘 중 하나만 있으면 된다 — 서버가 HUB 키를 먼저 쓴다.
         */
        id: 'apihub',
        label: '네이버 API HUB (신규 발급은 여기)',
        desc: '블로그 문서수·노출 순위를 조회합니다. 네이버클라우드에서 API HUB 이용 신청 후 발급받은 키 2개를 넣으세요.',
        issueUrl: 'https://console.ncloud.com/naver-api-hub/application/create',
        fields: [
            { key: 'apihubKeyId', label: 'API HUB Key ID', secret: true, placeholder: 'ijh6o1...' , minLength: 8 },
            { key: 'apihubKey', label: 'API HUB Key', secret: true, placeholder: '••••••••' , minLength: 20 },
        ],
    },
    {
        id: 'openapi',
        label: '네이버 오픈 API (기존 발급자용 구키)',
        desc: '2026년 7월 이전에 개발자센터에서 발급받은 키가 있는 분만 쓰세요. 신규 발급은 위 API HUB 로만 됩니다.',
        issueUrl: 'https://developers.naver.com/apps/#/register',
        fields: [
            { key: 'openApiId', label: '클라이언트 ID', secret: true, placeholder: 'abcdEFGH...' , minLength: 12 },
            { key: 'openApiSecret', label: '클라이언트 시크릿', secret: true, placeholder: '••••••••' , minLength: 8 },
        ],
    },
    {
        id: 'youtube',
        label: '유튜브 Data API',
        desc: '급상승 영상을 조회합니다. 무료이며 하루 10,000유닛입니다.',
        issueUrl: 'https://console.cloud.google.com/apis/credentials',
        fields: [
            { key: 'youtubeKey', label: 'API 키', secret: true, placeholder: 'AIzaSy...' , minLength: 30 },
        ],
    },
    {
        id: 'coupang',
        label: '쿠팡 파트너스',
        desc: '제휴 링크 생성과 상품 검색에 씁니다. 파트너스 승인 후 발급됩니다.',
        issueUrl: 'https://partners.coupang.com/#affiliate/ws/apikey',
        fields: [
            { key: 'coupangAccessKey', label: 'ACCESS KEY', secret: true, placeholder: '00000000-0000-0000-...', minLength: 20 },
            { key: 'coupangSecretKey', label: 'SECRET KEY', secret: true, placeholder: '영문·숫자 30자 이상', minLength: 30 },
            // sub_id 는 비밀이 아니라 실적을 가르는 꼬리표다. 짧아도 정상이라 길이를 안 본다.
            { key: 'coupangSubId', label: 'sub_id (선택)', secret: false, placeholder: 'leword', minLength: 0 },
        ],
    },
    {
        /*
         * 브랜드커넥트는 API 키가 없다. 상품 페이지 주소에 **내 크리에이터 스페이스 ID**가
         * 들어가야만 열린다(없으면 "삭제되었거나 존재하지 않는 페이지" — 실측).
         * 이 값을 넣어 두면 '상품 확인 및 링크발급' 버튼이 사장님 계정의 그 상품 화면으로
         * 바로 열려서, 로그인된 상태 그대로 링크를 발급받을 수 있다.
         * 비밀이 아니라 주소 조각이라 secret 이 아니다.
         */
        id: 'brandconnect',
        label: '네이버 브랜드커넥트',
        desc: '내 스페이스 ID를 넣으면 상품별 링크발급 화면으로 바로 갑니다. 브랜드커넥트에 로그인한 뒤 주소창의 숫자를 복사하세요 — brandconnect.naver.com/[이 숫자]/affiliate/products',
        issueUrl: 'https://brandconnect.naver.com/',
        fields: [
            { key: 'brandconnectSpaceId', label: '내 스페이스 ID', secret: false, placeholder: '876491907827712', minLength: 8 },
        ],
    },
];
/*
 * AI 추론에는 API 키 그룹이 없다(사장님 지시 2026-08-17: "API 키를 여기 두지
 * 말고 클로드코드를 웹에서 쓰게 하라"). 웹의 AI 는 사용자 PC 의 LEWORD 앱
 * 브리지(127.0.0.1)를 통해 그 사람의 클로드코드 구독으로 돈다 — lib/bridge.ts.
 */

export function loadUserKeys(): UserKeys {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

export function saveUserKeys(keys: UserKeys): void {
    try {
        // 빈 값은 저장하지 않는다. 빈 문자열이 남아 있으면 서버가 "넣었다"고
        // 착각해 사장님 키로 넘어가는 폴백을 막아 버린다.
        const cleaned: UserKeys = {};
        for (const [field, value] of Object.entries(keys)) {
            const trimmed = String(value || '').trim();
            if (trimmed) cleaned[field as UserKeyField] = trimmed;
        }
        localStorage.setItem(STORE_KEY, JSON.stringify(cleaned));
    } catch {
        // 저장이 안 되더라도 이번 세션 조회는 되게 둔다.
    }
}

export function clearUserKeys(): void {
    try {
        localStorage.removeItem(STORE_KEY);
    } catch {
        // noop
    }
}

/** 그룹 하나가 쓸 수 있는 상태인지(필수 항목이 전부 찼는지). */
export function isGroupReady(group: KeyGroup, keys: UserKeys): boolean {
    return group.fields.every((field) => String(keys[field.key] || '').trim().length > 0);
}

/** 하나라도 자기 키를 넣었는지. 화면 문구를 바꾸는 데 쓴다. */
export function hasAnyUserKey(keys: UserKeys = loadUserKeys()): boolean {
    return KEY_GROUPS.some((group) => isGroupReady(group, keys));
}

/**
 * 넣은 값이 그 자리에 들어갈 물건으로 보이는가.
 *
 * 왜 필요한가: 브라우저 비밀번호 관리자가 `type="password"` 를 보고 **사이트
 * 로그인 아이디·비번을 여기에 자동으로 채웠다**(실제로 사장님 화면에서 일어났다).
 * 그대로 저장하면 사이트 비번이 "검색광고 비밀키"로 서버에 전송된다.
 * 네이버 키는 전부 길다 — 길이만 봐도 걸러진다.
 *
 * 형식을 완벽히 검증하지는 않는다. 자동완성 사고를 잡는 것이 목적이다.
 */
export function checkKeyShape(keys: UserKeys): { field: UserKeyField; label: string; reason: string }[] {
    const problems: { field: UserKeyField; label: string; reason: string }[] = [];
    for (const group of KEY_GROUPS) {
        for (const field of group.fields) {
            const value = (keys[field.key] || '').trim();
            if (!value) continue;
            if (value.length < field.minLength) {
                problems.push({
                    field: field.key,
                    label: `${group.label} · ${field.label}`,
                    reason: `${value.length}자 — 이 자리에 발급되는 값은 ${field.minLength}자 이상입니다. 브라우저가 자동으로 채운 로그인 정보가 아닌지 확인해 주세요`,
                });
            }
        }
    }
    return problems;
}
