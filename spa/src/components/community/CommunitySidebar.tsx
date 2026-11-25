import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { isAssociate } from '../../lib/communityLevel.mjs';
import type { CommunityProfile } from '../../lib/communitySession';
import { GRADE_GUIDE, SCORE_RULES, communityPath, gradeProgress, type BoardConfig } from '../../lib/communityModel.mjs';
import type { GradeEntry } from '../../lib/communityGrades.mjs';
import { useAvatars } from '../../lib/useAvatars';
import Avatar from './Avatar';
import { GradeBadge } from './Badges';
import LockMark from './LockMark';

type Props = {
    /** null = a guest: `guestCard` takes the place of my activity. */
    profile: CommunityProfile | null;
    guestCard?: ReactNode;
    /** Board link (a guest's members-only boards go to the login); the board list itself when not given. */
    hrefOf?: (id: string) => string;
    boards: readonly BoardConfig[];
    boardId: string;
    /** Post counts per board id, as far as they are known. */
    counts: Record<string, number>;
    /** The grade scale (server grades when it sent them); the built-in table when not given. */
    grades?: readonly GradeEntry[];
    /** The score sentence drawn from the server's numbers; the default sentence when not given. */
    scoreRules?: string;
};

function MyActivity({ profile }: { profile: CommunityProfile }) {
    const progress = gradeProgress(profile);
    const photos = useAvatars([profile.avatarKey]);
    return (
        <section className="lp-box cm-me" aria-labelledby="cm-me-title">
            <h2 id="cm-me-title" className="lp-sr">내 활동</h2>
            <div className="cm-me-top">
                <Avatar name={profile.nickname || profile.userId} src={photos[profile.avatarKey]} size={40} />
                {profile.nickname
                    ? <b className="cm-me-nick">{profile.nickname}</b>
                    : <b className="cm-me-nick is-empty">닉네임을 정해 주세요</b>}
                <GradeBadge grade={profile.grade} isOperator={profile.role === 'owner'} />
            </div>
            {/* The owner already wears the top grade: the score is shown, a "points to the next grade" line is not. */}
            {profile.role === 'owner' ? <p className="cm-me-score is-owner"><b>{profile.score}점</b><span>{progress.text}</span></p> : (
                <>
                    <p className="cm-me-score"><b>{profile.score}점</b><span>{progress.text}</span></p>
                    {isAssociate(profile) ? (
                        <Link className="cm-me-levelup" to={communityPath({ board: 'levelup' })}>등업 신청하러 가기 →</Link>
                    ) : (
                        <div className="cm-bar" role="progressbar" aria-label="다음 등급까지" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
                            <i style={{ width: `${progress.percent}%` }} />
                        </div>
                    )}
                </>
            )}
            <dl className="cm-me-stats">
                <div><dt>내 글</dt><dd>{profile.activity.posts}</dd></div>
                <div><dt>내 댓글</dt><dd>{profile.activity.comments}</dd></div>
                <div><dt>들른 글</dt><dd>{profile.activity.visits}</dd></div>
            </dl>
        </section>
    );
}

/** The boards only (2026-11-25: the 전체글 entry left the list; /community itself still opens on the all-boards view). */
function boardEntries(boards: readonly BoardConfig[]) {
    return boards.map((board) => ({ id: board.id, label: board.label, locked: board.locked === true }));
}

/** Desktop side column: my activity, the board menu, the grade guide. */
function CommunitySidebar({ profile, guestCard = null, hrefOf, boards, boardId, counts, grades = GRADE_GUIDE, scoreRules = SCORE_RULES }: Props) {
    return (
        <aside className="cm-side">
            {profile ? <MyActivity profile={profile} /> : guestCard}
            <nav className="lp-box cm-menu" aria-label="게시판">
                <h2>게시판</h2>
                <ul>
                    {boardEntries(boards).map((entry) => (
                        <li key={entry.id}>
                            <Link className={`cm-tab${entry.id === boardId ? ' on' : ''}${entry.locked ? ' cm-silver' : ''}`} to={hrefOf ? hrefOf(entry.id) : communityPath({ board: entry.id })}
                                aria-current={entry.id === boardId ? 'page' : undefined}>
                                <span>{entry.label}{entry.locked ? <LockMark /> : null}</span>
                                {typeof counts[entry.id] === 'number' ? <em>{counts[entry.id]}</em> : null}
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>
            <section className="lp-box cm-guide" aria-labelledby="cm-guide-title">
                <h2 id="cm-guide-title">등급 안내</h2>
                <ul>
                    {grades.map((grade) => (
                        <li key={grade.key}>
                            <span className={`lp-grade lp-g-${grade.key}`}>{grade.label}</span><span>{grade.range}</span>
                            {grade.reward ? <small className="cm-guide-reward">{grade.reward}</small> : null}
                            {grade.condition ? <small className="cm-guide-reward cm-guide-cond">{grade.condition}</small> : null}
                            {grade.conditionDetail ? (
                                <details className="cm-guide-more">
                                    <summary>설명 보기</summary>
                                    <p>{grade.conditionDetail}</p>
                                </details>
                            ) : null}
                        </li>
                    ))}
                </ul>
                <p>{scoreRules}</p>
            </section>
        </aside>
    );
}

/** Phone / narrow screens: the boards as a row of round tabs above the list. */
export function BoardTabs({ boards, boardId, hrefOf }: { boards: readonly BoardConfig[]; boardId: string; hrefOf?: (id: string) => string }) {
    return (
        <nav className="cm-htabs" aria-label="게시판 바로가기">
            {boardEntries(boards).map((entry) => (
                <Link key={entry.id} className={`cm-htab${entry.id === boardId ? ' on' : ''}${entry.locked ? ' cm-silver' : ''}`} to={hrefOf ? hrefOf(entry.id) : communityPath({ board: entry.id })}
                    aria-current={entry.id === boardId ? 'page' : undefined}>{entry.label}{entry.locked ? <LockMark /> : null}</Link>
            ))}
        </nav>
    );
}

export default CommunitySidebar;
