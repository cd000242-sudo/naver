/**
 * Grades, score rules and rewards as the screen draws them. The server is the authority (`community-boards` carries
 * `grades` and `scoreRules`); the table below is what is drawn when the server sends none. Pure data and functions.
 */

const entry = (key, label, min, range, reward) => Object.freeze({ key, label, min, range, reward });

/** 새싹 0 · 잎새 300 · 열매 1,500 · 나무 5,000 · 숲 15,000 (the owner's thresholds), one reward line each. */
export const GRADE_TABLE = Object.freeze([
    entry('sprout', '새싹', 0, '0~299점', ''),
    entry('leaf', '잎새', 300, '300~1,499점', '올인원 3일'),
    entry('fruit', '열매', 1500, '1,500~4,999점', '올인원 7일'),
    entry('tree', '나무', 5000, '5,000~14,999점', '올인원 30일(확인 후 지급)'),
    entry('forest', '숲', 15000, '15,000점~', '올인원 1년(확인 후 지급)'),
]);

/** The grade the owner account always wears, whatever an older server sent. */
export const FOREST_GRADE = Object.freeze({ key: 'forest', label: '숲', min: 15000, nextAt: null, nextLabel: null });

/** Shown for the owner instead of a score bar. */
export const OWNER_GRADE_TEXT = '숲 · 최고 등급(관리자)';

/** The score sentence when the server sent no numbers. */
export const SCORE_RULES = '글 10점 · 댓글 2점 · 들르기 1점 · 내 글 좋아요 1점 · 하루 최대 50점';

const text = (value) => (typeof value === 'string' ? value : '');
const plural = (value) => Number.isFinite(value) && value > 0;
const grouped = (value) => value.toLocaleString('en-US');

/** "올인원 3일", "올인원 1년(확인 후 지급)": the days of a `{ days, mode }` reward; '' when there is none. */
export function rewardText(reward) {
    const days = Math.floor(Number(reward?.days));
    if (!plural(days)) return '';
    const span = days === 365 ? '1년' : `${days}일`;
    return `올인원 ${span}${reward.mode === 'approval' ? '(확인 후 지급)' : ''}`;
}

function pickReward(raw) {
    const days = Math.floor(Number(raw?.days));
    if (!raw || typeof raw !== 'object' || !plural(days)) return null;
    return { days, mode: raw.mode === 'approval' ? 'approval' : 'auto' };
}

/** The server's grade list cut to what the screen reads, in score order. [] when it cannot be used as a scale. */
export function pickGrades(raw) {
    const seen = new Set();
    const list = (Array.isArray(raw) ? raw : [])
        .map((item) => ({ key: text(item?.key), label: text(item?.label), min: Number(item?.min), reward: pickReward(item?.reward) }))
        .filter((item) => /^[a-z]{2,20}$/.test(item.key) && item.label && Number.isFinite(item.min) && item.min >= 0)
        .filter((item) => (seen.has(item.key) ? false : seen.add(item.key)))
        .sort((a, b) => a.min - b.min)
        .map((item) => ({ key: item.key, label: item.label, min: Math.floor(item.min), reward: item.reward }));
    return list.length >= 2 ? list : [];
}

/** The grade guide: the server's grades when it sent a usable scale (ranges from their `min`), else the table. */
export function gradeGuide(config) {
    const list = pickGrades(config?.grades);
    if (list.length === 0) return GRADE_TABLE;
    return list.map((item, index) => {
        const next = list[index + 1];
        const range = next ? `${grouped(item.min)}~${grouped(next.min - 1)}점` : `${grouped(item.min)}점~`;
        return entry(item.key, item.label, item.min, range, rewardText(item.reward));
    });
}

/** `{ post, comment, visit, likeReceived, dailyCap }` when every number is a real positive one; else null. */
export function pickScoreRules(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const keys = ['post', 'comment', 'visit', 'likeReceived', 'dailyCap'];
    const values = keys.map((key) => Math.floor(Number(raw[key])));
    if (!values.every(plural)) return null;
    return Object.fromEntries(keys.map((key, index) => [key, values[index]]));
}

/** "글 10점 · 댓글 2점 · 들르기 1점 · 내 글 좋아요 1점 · 하루 최대 50점" from the server's numbers, or the default sentence. */
export function scoreRulesText(raw) {
    const rules = pickScoreRules(raw);
    if (!rules) return SCORE_RULES;
    return `글 ${rules.post}점 · 댓글 ${rules.comment}점 · 들르기 ${rules.visit}점 · 내 글 좋아요 ${rules.likeReceived}점 · 하루 최대 ${rules.dailyCap}점`;
}

const STATUSES = Object.freeze({
    granted: { label: '지급 완료', tone: 'done' },
    pending: { label: '확인 중', tone: 'wait' },
    approved: { label: '승인됨 · 곧 지급', tone: 'review' },
    rejected: { label: '지급되지 않았어요', tone: 'wait' },
});

const tierLabel = (tier, given) => given || GRADE_TABLE.find((grade) => grade.key === tier)?.label || tier;

/** My rewards (`rewards[]` of the profile): only known statuses and real day counts survive; anything else is dropped. */
export function normalizeRewards(raw) {
    return (Array.isArray(raw) ? raw : []).flatMap((item) => {
        const tier = text(item?.tier).trim();
        const days = Math.floor(Number(item?.days));
        if (!tier || !plural(days) || !Object.hasOwn(STATUSES, item?.status)) return [];
        return [{
            tier, label: text(item.label), days, mode: item.mode === 'approval' ? 'approval' : 'auto', status: item.status,
            createdAt: text(item.createdAt), decidedAt: text(item.decidedAt),
        }];
    });
}

/** Rows for the "내 보상" box: tier name, the reward line, and the state in words. */
export function rewardRows(rewards) {
    return normalizeRewards(rewards).map((reward, index) => ({
        key: `${reward.tier}-${index}`,
        tierLabel: tierLabel(reward.tier, reward.label),
        text: `올인원 ${reward.days === 365 ? '1년' : `${reward.days}일`}`,
        status: reward.status,
        statusLabel: STATUSES[reward.status].label,
        tone: STATUSES[reward.status].tone,
    }));
}

/** The reward line of a request in the owner's desk: tier name and days (the desk has no `mode` wording). */
export const requestTierLabel = tierLabel;
