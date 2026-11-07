import { useEffect, useState } from 'react';
import { describeModerationFailure } from '../../lib/accountModel.mjs';
import { moderationApi, normalizeReports, type ReportItem, type ReportStatus, type Resolution } from '../../lib/communityModeration';
import ReportList from './ReportList';

type State = { reports: ReportItem[]; totalPages: number; loading: boolean; error: string };

/** The owner's report desk: loads the list from the server and settles reports. The server decides who may. */
function ModerationPanel() {
    const [status, setStatus] = useState<ReportStatus>('open');
    const [page, setPage] = useState(1);
    const [reload, setReload] = useState(0);
    const [busyId, setBusyId] = useState('');
    const [state, setState] = useState<State>({ reports: [], totalPages: 1, loading: true, error: '' });

    useEffect(() => {
        let alive = true;
        setState((previous) => ({ ...previous, loading: true, error: '' }));
        void moderationApi.reports(status, page).then((result) => {
            if (!alive) return;
            if (!result.ok) { setState({ reports: [], totalPages: 1, loading: false, error: describeModerationFailure(result) }); return; }
            const pages = Math.floor(Number(result.totalPages));
            setState({ reports: normalizeReports(result.reports), totalPages: pages >= 1 ? pages : 1, loading: false, error: '' });
        });
        return () => { alive = false; };
    }, [status, page, reload]);

    const work = async (report: ReportItem, call: () => Promise<{ ok: boolean; message?: string }>) => {
        if (busyId) return;
        setBusyId(report.reportId);
        const result = await call();
        setBusyId('');
        if (result.ok) setReload((value) => value + 1);
        else setState((previous) => ({ ...previous, error: describeModerationFailure(result as { message: string }) }));
    };

    return (
        <ReportList reports={state.reports} status={status} page={page} totalPages={state.totalPages} loading={state.loading}
            error={state.error} busyId={busyId}
            onStatus={(next) => { setStatus(next); setPage(1); }} onPage={setPage} onRetry={() => setReload((value) => value + 1)}
            onResolve={(report, resolution: Resolution) => { void work(report, () => moderationApi.resolveReport(report.reportId, resolution)); }}
            onHideToggle={(report) => { void work(report, () => moderationApi.hide(report.targetType, report.targetId, !report.target.hidden)); }} />
    );
}

export default ModerationPanel;
