import { Link } from 'react-router-dom';
import { communityPath, formatPostDate, pageNumbers } from '../../lib/communityModel.mjs';
import type { ReportItem, ReportStatus, Resolution } from '../../lib/communityModeration';

type Props = {
    reports: ReportItem[];
    status: ReportStatus;
    page: number;
    totalPages: number;
    loading: boolean;
    error: string;
    /** Id of the report being worked on (its buttons wait). */
    busyId: string;
    now?: number;
    onResolve: (report: ReportItem, status: Resolution) => void;
    onHideToggle: (report: ReportItem) => void;
    onStatus: (status: ReportStatus) => void;
    onPage: (page: number) => void;
    onRetry: () => void;
};

const STATUS_TABS: ReadonlyArray<{ key: ReportStatus; label: string }> = [{ key: 'open', label: '처리 전' }, { key: 'all', label: '전체' }];

function Row({ report, busy, now, onResolve, onHideToggle }: { report: ReportItem; busy: boolean; now: number } & Pick<Props, 'onResolve' | 'onHideToggle'>) {
    const { target } = report;
    const open = report.status === 'open';
    return (
        <li className="cm-report">
            <p className="cm-report-why"><b>{report.reasonLabel || '신고'}</b><span>{report.targetType === 'comment' ? '댓글' : '글'} · {formatPostDate(report.createdAt, now)}</span></p>
            {report.detail ? <p className="cm-report-detail">{report.detail}</p> : null}
            {target.missing ? <p className="cm-gone">이미 지워졌어요</p> : (
                <div className="cm-report-target">
                    <b>{target.title}</b>
                    {target.excerpt ? <p>{target.excerpt}</p> : null}
                    <span>글쓴이 {target.nickname}{target.hidden ? ' · 숨겨진 상태' : ''}</span>
                </div>
            )}
            <p className="cm-report-by">신고한 사람 {report.reporterNickname || '-'}{open ? '' : ` · ${report.status === 'actioned' ? '조치함' : '문제 없음'}`}</p>
            <div className="cm-admin-row">
                {target.missing ? null : <Link className="cm-act" to={communityPath({ board: target.board, post: target.postId })}>글 보기</Link>}
                {target.missing ? null : <button type="button" className="cm-act" disabled={busy} onClick={() => onHideToggle(report)}>{target.hidden ? '보이기' : '숨기기'}</button>}
                {open ? <button type="button" className="cm-act" disabled={busy} onClick={() => onResolve(report, 'dismissed')}>문제 없어요</button> : null}
                {open ? <button type="button" className="cm-act cm-act-danger" disabled={busy} onClick={() => onResolve(report, 'actioned')}>조치했어요</button> : null}
            </div>
        </li>
    );
}

/** The owner's list of reports: what was reported, why, and three ways to settle it. Presentational; the panel loads it. */
function ReportList({ reports, status, page, totalPages, loading, error, busyId, now = Date.now(), onResolve, onHideToggle, onStatus, onPage, onRetry }: Props) {
    return (
        <section className="lp-box cm-reports" aria-labelledby="cm-reports-title">
            <div className="cm-board-head">
                <h2 id="cm-reports-title">신고 목록</h2>
                <nav className="cm-sorts" aria-label="신고 보기">
                    {STATUS_TABS.map((tab) => (
                        <button key={tab.key} type="button" className={`cm-sort${tab.key === status ? ' on' : ''}`} aria-pressed={tab.key === status}
                            onClick={() => onStatus(tab.key)}>{tab.label}</button>
                    ))}
                </nav>
            </div>
            {loading ? <p className="cm-empty" role="status">불러오는 중입니다…</p> : null}
            {error ? (
                <div className="cm-empty" role="alert">
                    <p>{error}</p>
                    <button type="button" className="lp-btn lp-btn-line lp-btn-sm" onClick={onRetry}>다시 불러오기</button>
                </div>
            ) : null}
            {!loading && !error && reports.length === 0 ? <p className="cm-empty">처리할 신고가 없어요.</p> : null}
            <ul className="cm-report-list">
                {reports.map((report) => <Row key={report.reportId} report={report} busy={busyId === report.reportId} now={now} onResolve={onResolve} onHideToggle={onHideToggle} />)}
            </ul>
            {totalPages > 1 ? (
                <nav className="cm-pager" aria-label="쪽 이동">
                    {pageNumbers(page, totalPages).map((number) => (
                        <button key={number} type="button" className={`cm-pg${number === page ? ' on' : ''}`} aria-label={`${number}쪽`}
                            aria-current={number === page ? 'page' : undefined} onClick={() => onPage(number)}>{number}</button>
                    ))}
                </nav>
            ) : null}
        </section>
    );
}

export default ReportList;
