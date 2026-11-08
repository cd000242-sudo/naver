/**
 * "Show it first, ask the server after": one small helper for the clicks whose answer is almost always yes
 * (report, hide, pin, status). The change is drawn at once; a refusal or a lost connection draws it back and
 * returns one sentence for the screen to show.
 */

type Outcome = { ok: boolean; message?: string };

export async function runOptimistic<T extends Outcome>(plan: {
    apply: () => void;
    revert: () => void;
    call: () => Promise<T>;
    /** Turns a refusal into the sentence shown to the reader (default: the server's own words). */
    describe?: (result: T) => string;
}): Promise<string> {
    plan.apply();
    try {
        const result = await plan.call();
        if (result.ok) return '';
        plan.revert();
        return plan.describe ? plan.describe(result) : String(result.message || '처리하지 못했어요.');
    } catch {
        plan.revert();
        return '처리하지 못했어요. 잠시 뒤 다시 해 주세요.';
    }
}
