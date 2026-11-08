/**
 * 숲 needs more than points (forum contract 1115, section D): likes received from other members, and a number of
 * different weekly-top posts that each got at least `topLikesMin` likes. The server sends the member's numbers
 * (`forest`) and the minimums (`extra` on the 숲 row of the grade table); this file only reads and words them, it
 * holds no number of its own. Pure code.
 */

/** 나무 starts here: progress toward 숲 is shown from this score on. */
export const FOREST_PROGRESS_FROM = 5000;

const whole = (value) => {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number > 0 ? number : 0;
};
const grouped = (value) => value.toLocaleString('en-US');

/**
 * `{ likesMin, topsMin, topLikesMin }` when the first two are real positive numbers; else null.
 * `topLikesMin` (likes a top post needs to count) is 0 when the server does not say.
 */
export function pickForestExtra(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const likesMin = whole(raw.likesMin);
    const topsMin = whole(raw.topsMin);
    return likesMin > 0 && topsMin > 0 ? { likesMin, topsMin, topLikesMin: whole(raw.topLikesMin) } : null;
}

/** `{ likes, tops, likesMin, topsMin, topLikesMin }` of the signed-in member; null when the minimums are missing (nothing to show). */
export function pickForest(raw) {
    const extra = pickForestExtra(raw);
    if (!extra) return null;
    return { likes: whole(raw.likes), tops: whole(raw.tops), ...extra };
}

/** "15,000점 + 받은 좋아요 300 + 인기글 5편" under 숲 in the grade guide; '' when the minimums are not known. */
export function forestGuideLine(minScore, extra) {
    const picked = pickForestExtra(extra);
    const score = whole(minScore);
    return picked && score > 0 ? `${grouped(score)}점 + 받은 좋아요 ${picked.likesMin} + 인기글 ${picked.topsMin}편` : '';
}

/** The folded explanation of "인기글": which posts count. '' when the server did not say how many likes a post needs. */
export function forestGuideDetail(extra) {
    const picked = pickForestExtra(extra);
    return picked && picked.topLikesMin > 0
        ? `주간 인기글 중 좋아요를 ${picked.topLikesMin}개 이상 받은 서로 다른 글 ${picked.topsMin}편이 필요해요.`
        : '';
}

/**
 * The progress line of /me: "받은 좋아요 120/300 · 인기글 2/5편". Only for a member at 나무 or higher (5,000 points),
 * never for the owner (who is 숲 already), and only when the server sent the numbers.
 */
export function forestProgress(profile) {
    if (!profile || profile.role === 'owner' || !(Number(profile.score) >= FOREST_PROGRESS_FROM)) return null;
    const forest = pickForest(profile.forest);
    if (!forest) return null;
    const likesText = `받은 좋아요 ${forest.likes}/${forest.likesMin}`;
    const topsText = `인기글 ${forest.tops}/${forest.topsMin}편`;
    return {
        text: `${likesText} · ${topsText}`,
        likesText,
        topsText,
        likesDone: forest.likes >= forest.likesMin,
        topsDone: forest.tops >= forest.topsMin,
    };
}
