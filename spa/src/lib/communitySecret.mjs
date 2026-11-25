/**
 * 시크릿 클래스 (the locked board) and the two boards of the level-up path, 가입인사 / 등업신청 (2026-11-25).
 * The server decides who gets secret posts (communitySecretAccess_ in the GAS code) and sends the answer in the profile
 * as `secretClass: { allowed, lifetime }`; these only shape the screen.
 */

export const GREETING_BOARD = 'greeting';
export const LEVELUP_BOARD = 'levelup';
export const SECRET_BOARD = 'secret';

const NONE = Object.freeze({ allowed: false, lifetime: false });

/** Only exact `true` opens anything: an old server (no block) or a strange value means no access. */
export function normalizeSecretClass(raw) {
    if (!raw || typeof raw !== 'object') return NONE;
    const allowed = raw.allowed === true;
    return allowed ? Object.freeze({ allowed: true, lifetime: raw.lifetime === true }) : NONE;
}

/** May this profile open the secret board? `lifetime` = a lifetime licence (1:1 remote help). */
export function secretAccess(profile) {
    if (!profile) return NONE;
    if (profile.role === 'owner') return Object.freeze({ allowed: true, lifetime: false });
    return normalizeSecretClass(profile.secretClass);
}

/** The words of the lock screen, short on purpose (many readers are seniors). */
export const SECRET_LOCK = Object.freeze({
    title: '시크릿 클래스',
    tag: '올인원 1년 이상 이용자 전용',
    lines: Object.freeze([
        '본인 블로그를 올려 주시면 리더남이 블로그를 진단하고 방향성과 키워드를 피드백해 드립니다',
        '1대1 원격도 올인원 1년 이상부터 가능합니다',
        '영구제 이용자는 직접 만나서 오프라인으로 꼼꼼하게 봐 드립니다',
    ]),
    pricing: '/pricing',
    pricingLabel: '가격 보기',
});

/** The line of the write form on the secret board for every member (1:1 remote starts at a one-year 올인원, 2026-11-25). */
export const SECRET_REMOTE_HINT = '1대1 원격을 원하시면 글에 적어 주세요';

/** The extra line for a lifetime member: the owner meets them in person. */
export const SECRET_LIFETIME_HINT = '직접 만나서 보길 원하시면 글에 적어 주세요';
