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
    | 'youtubeKey';

export type UserKeys = Partial<Record<UserKeyField, string>>;

export type KeyGroup = {
    id: 'searchad' | 'openapi' | 'youtube';
    label: string;
    desc: string;
    /** 어디서 발급받는지. 사용자가 바로 갈 수 있어야 한다. */
    issueUrl: string;
    fields: Array<{ key: UserKeyField; label: string; secret: boolean; placeholder: string }>;
};

export const KEY_GROUPS: readonly KeyGroup[] = [
    {
        id: 'searchad',
        label: '네이버 검색광고',
        desc: '월간 검색량·경쟁도를 조회합니다.',
        issueUrl: 'https://manage.searchad.naver.com/customers',
        fields: [
            { key: 'searchAdLicense', label: '액세스 라이선스', secret: false, placeholder: '0100000000...' },
            { key: 'searchAdSecret', label: '비밀키', secret: true, placeholder: 'AQAAAAA...' },
            { key: 'searchAdCustomer', label: '고객 ID', secret: false, placeholder: '1234567' },
        ],
    },
    {
        id: 'openapi',
        label: '네이버 오픈 API',
        desc: '블로그 문서수·쇼핑 상품수·노출 순위를 조회합니다.',
        issueUrl: 'https://developers.naver.com/apps/#/register',
        fields: [
            { key: 'openApiId', label: '클라이언트 ID', secret: false, placeholder: 'abcdEFGH...' },
            { key: 'openApiSecret', label: '클라이언트 시크릿', secret: true, placeholder: '••••••••' },
        ],
    },
    {
        id: 'youtube',
        label: '유튜브 Data API',
        desc: '급상승 영상을 조회합니다. 무료이며 하루 10,000유닛입니다.',
        issueUrl: 'https://console.cloud.google.com/apis/credentials',
        fields: [
            { key: 'youtubeKey', label: 'API 키', secret: true, placeholder: 'AIzaSy...' },
        ],
    },
];

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
