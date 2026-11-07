import { Link } from 'react-router-dom';
import type { CommunityProfile } from '../../lib/communitySession';
import { ALL_BOARD, GRADE_GUIDE, SCORE_RULES, communityPath, gradeProgress, type BoardConfig } from '../../lib/communityModel.mjs';
import { GradeBadge } from './Badges';

type Props = {
    profile: CommunityProfile;
    boards: readonly BoardConfig[];
    boardId: string;
    /** Post counts per board id, as far as they are known. */
    counts: Record<string, number>;
};

function MyActivity({ profile }: { profile: CommunityProfile }) {
    const progress = gradeProgress(profile);
    return (
        <section className="lp-box cm-me" aria-labelledby="cm-me-title">
            <h2 id="cm-me-title" className="lp-sr">내 활동</h2>
            <div className="cm-me-top">
                {profile.nickname
                    ? <b className="cm-me-nick">{profile.nickname}</b>
                    : <b className="cm-me-nick is-empty">닉네임을 정해 주세요</b>}
                <GradeBadge grade={profile.grade} isOperator={profile.role === 'owner'} />
            </div>
            <p className="cm-me-score"><b>{profile.score}점</b><span>{progress.text}</span></p>
            <div className="cm-bar" role="progressbar" aria-label="다음 등급까지" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
                <i style={{ width: `${progress.percent}%` }} />
            </div>
            <dl className="cm-me-stats">
                <div><dt>내 글</dt><dd>{profile.activity.posts}</dd></div>
                <div><dt>내 댓글</dt><dd>{profile.activity.comments}</dd></div>
                <div><dt>들른 글</dt><dd>{profile.activity.visits}</dd></div>
            </dl>
        </section>
    );
}

function boardEntries(boards: readonly BoardConfig[]) {
    return [{ id: ALL_BOARD, label: '전체글' }, ...boards.map((board) => ({ id: board.id, label: board.label }))];
}

/** Desktop side column: my activity, the board menu, the grade guide. */
function CommunitySidebar({ profile, boards, boardId, counts }: Props) {
    return (
        <aside className="cm-side">
            <MyActivity profile={profile} />
            <nav className="lp-box cm-menu" aria-label="게시판">
                <h2>게시판</h2>
                <ul>
                    {boardEntries(boards).map((entry) => (
                        <li key={entry.id}>
                            <Link className={`cm-tab${entry.id === boardId ? ' on' : ''}`} to={communityPath({ board: entry.id })}
                                aria-current={entry.id === boardId ? 'page' : undefined}>
                                <span>{entry.label}</span>
                                {typeof counts[entry.id] === 'number' ? <em>{counts[entry.id]}</em> : null}
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>
            <section className="lp-box cm-guide" aria-labelledby="cm-guide-title">
                <h2 id="cm-guide-title">등급 안내</h2>
                <ul>
                    {GRADE_GUIDE.map((grade) => (
                        <li key={grade.key}><span className={`lp-grade lp-g-${grade.key}`}>{grade.label}</span><span>{grade.range}</span></li>
                    ))}
                </ul>
                <p>{SCORE_RULES}</p>
            </section>
        </aside>
    );
}

/** Phone / narrow screens: the boards as a row of round tabs above the list. */
export function BoardTabs({ boards, boardId }: { boards: readonly BoardConfig[]; boardId: string }) {
    return (
        <nav className="cm-htabs" aria-label="게시판 바로가기">
            {boardEntries(boards).map((entry) => (
                <Link key={entry.id} className={`cm-htab${entry.id === boardId ? ' on' : ''}`} to={communityPath({ board: entry.id })}
                    aria-current={entry.id === boardId ? 'page' : undefined}>{entry.label}</Link>
            ))}
        </nav>
    );
}

export default CommunitySidebar;
