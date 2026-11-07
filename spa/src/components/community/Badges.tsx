import type { AuthorGrade } from '../../lib/communityData';
import { noticeBadgeLabel } from '../../lib/accountModel.mjs';
import { statusBadge } from '../../lib/communityModel.mjs';

const GRADE_KEYS = new Set(['sprout', 'leaf', 'fruit', 'tree']);

/** Grade next to a nickname; the operator wears the staff badge instead of a grade. */
export function GradeBadge({ grade, isOperator }: { grade: AuthorGrade | null; isOperator: boolean }) {
    if (isOperator) return <span className="lp-grade lp-g-staff">운영진</span>;
    if (!grade) return null;
    // The class comes from a fixed list, never from the server's text.
    const tone = GRADE_KEYS.has(grade.key) ? ` lp-g-${grade.key}` : '';
    return <span className={`lp-grade${tone}`}>{grade.label}</span>;
}

/** Inquiry and request posts carry a status; every other board shows nothing. */
export function StatusBadge({ board, status }: { board: string; status: string }) {
    const badge = statusBadge(board, status);
    if (!badge) return null;
    return <span className={`lp-state lp-state-${badge.tone}`}>{badge.label}</span>;
}

/** Posts that came from the home-operations notice list. */
export function NoticeBadge({ kind = '' }: { kind?: string }) {
    const label = noticeBadgeLabel(kind);
    return (
        <>
            <span className="lp-state lp-state-notice">공지</span>
            {label ? <span className="lp-state lp-state-notice-kind">{label}</span> : null}
        </>
    );
}
