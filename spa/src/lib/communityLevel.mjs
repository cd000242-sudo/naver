/**
 * 준회원 → 새싹 (forum contract 1114, section 1). A new account is an associate until it has written one greeting on
 * 자유게시판 and one comment and pressed [등업 신청]. Pure rules: which level an answer means, the two-row checklist,
 * where an associate may write, and the words for a refused application. The server decides; these only shape the screen.
 */

/** The grade an associate wears, whatever the score. */
export const ASSOCIATE_GRADE = Object.freeze({ key: 'associate', label: '준회원', min: 0, nextAt: null, nextLabel: null });

/** Anything but the exact word `associate` is a member: old rows and old servers send no level (grandfathered). */
export const normalizeLevel = (value) => (value === 'associate' ? 'associate' : 'member');

/** The done flags of the two conditions; `true` means done. */
export const normalizeLevelUp = (raw) => ({ post: raw?.post === true, comment: raw?.comment === true });

/** The owner is always a member, whatever the row says. */
export const isAssociate = (profile) => profile?.level === 'associate' && profile?.role !== 'owner';

const STEP_LABELS = Object.freeze({ post: '자유게시판에 가입 인사 1개', comment: '댓글 1개' });

/** The two checklist rows, in the order a person does them. */
export function levelUpSteps(profile) {
    const done = normalizeLevelUp(profile?.levelUp);
    return ['post', 'comment'].map((key) => ({ key, label: STEP_LABELS[key], done: done[key] }));
}

export const levelUpReady = (profile) => isAssociate(profile) && levelUpSteps(profile).every((step) => step.done);

const OPEN = Object.freeze({ open: true, reason: '', message: '' });
const BOARD_HINT = '등업 후 쓸 수 있어요. 자유게시판에 가입 인사와 댓글을 남겨 주세요.';

/**
 * Where an associate may write: 자유게시판 only, one post. `all` opens the form on 자유게시판, so it counts as free.
 * `{ open, reason: 'board' | 'post-done' | '', message }`; a member (or nobody) always gets `open`.
 */
export function associateWriteState(profile, boardId) {
    if (!isAssociate(profile)) return OPEN;
    if (boardId !== 'free' && boardId !== 'all') return { open: false, reason: 'board', message: BOARD_HINT };
    const done = normalizeLevelUp(profile.levelUp);
    if (!done.post) return OPEN;
    return {
        open: false,
        reason: 'post-done',
        message: done.comment
            ? '가입 인사는 1개만 쓸 수 있어요. 이제 [등업 신청]을 눌러 주세요.'
            : '가입 인사는 1개만 쓸 수 있어요. 댓글을 1개 남기고 [등업 신청]을 눌러 주세요.',
    };
}

/** `need` from a refused application says what is STILL MISSING (true = missing); the done flags are the opposite. */
export function levelUpFromNeed(need) {
    if (!need || typeof need !== 'object') return null;
    return { post: need.post !== true, comment: need.comment !== true };
}

/** One short sentence for a refused application, naming only what is still missing. */
export function describeLevelUpFailure(result) {
    const done = result?.code === 'LEVEL_UP_NOT_READY' ? levelUpFromNeed(result.need) : null;
    if (done) {
        if (!done.post && !done.comment) return '자유게시판에 가입 인사 1개와 댓글 1개를 남겨 주세요.';
        if (!done.post) return '자유게시판에 가입 인사 1개만 더 쓰면 돼요.';
        if (!done.comment) return '댓글 1개만 더 남기면 돼요.';
    }
    return typeof result?.message === 'string' && result.message ? result.message : '등업을 신청하지 못했어요. 잠시 뒤 다시 해 주세요.';
}
