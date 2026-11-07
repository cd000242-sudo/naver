import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { forgetLewordVerification, resolveLewordAccess, type LewordAccess } from '../../lib/communityAuth';
import { useSiteSession } from '../../lib/useSiteSession';
import LicenseRegister from './LicenseRegister';
import LoginRequired from './LoginRequired';
import '../../styles/light-page.css';
import './auth.css';

type ViewProps = {
    /** null while the server is being asked. */
    access: LewordAccess | null;
    onRetry: () => void;
    /** The code was registered; the gate asks the server again. */
    onOpened: () => void;
    next: string;
};

function Card({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
    return (
        <div className="lp">
            <div className="lp-wrap au-main">
                <section className="lp-box au-gate" aria-labelledby="leword-gate-title">
                    <div className="au-gate-icon" aria-hidden="true">{icon}</div>
                    <h1 id="leword-gate-title">{title}</h1>
                    {children}
                </section>
            </div>
        </div>
    );
}

/** What the visitor sees for each answer of the server. `ok` renders nothing here: the gate shows the page itself. */
export function LewordGateView({ access, onRetry, onOpened, next }: ViewProps) {
    if (!access) {
        return <Card icon="L" title="LEWORD"><p className="au-sub" role="status">이용 권한을 확인하고 있어요…</p></Card>;
    }
    switch (access.kind) {
        case 'ok':
            return null;
        case 'login':
            return <LoginRequired area="leword" next={next} message={access.message} />;
        case 'not-activated':
        case 'expired': {
            const expired = access.kind === 'expired';
            return (
                <Card icon="L" title={expired ? '이용 기간이 끝났어요' : 'LEWORD 는 이용권이 필요합니다'}>
                    <p className="au-sub">
                        {expired
                            ? '새 코드를 등록하면 같은 계정으로 다시 열려요.'
                            : '커뮤니티 회원은 이용권 코드를 등록하면 LEWORD 를 쓸 수 있어요.'}
                    </p>
                    {expired && access.message ? <p className="lp-note">{access.message}</p> : null}
                    <div className="au-actions">
                        <Link className="lp-btn lp-btn-cta lp-btn-full" to="/pricing">구매하기</Link>
                    </div>
                    <LicenseRegister onRegistered={onOpened} />
                </Card>
            );
        }
        case 'blocked':
            return (
                <Card icon="!" title="이 계정은 쓸 수 없어요">
                    <p className="au-sub">{access.message || '차단된 계정입니다. 문의해 주세요.'}</p>
                </Card>
            );
        default:
            return (
                <Card icon="!" title="확인하지 못했어요">
                    <p className="lp-error" role="alert">{access.message}</p>
                    <div className="au-actions">
                        <button type="button" className="lp-btn lp-btn-dark lp-btn-full" onClick={onRetry}>다시 확인하기</button>
                    </div>
                </Card>
            );
    }
}

/**
 * Route guard for /leword. No login → "log in first". A login → the SERVER decides (verify-web-login with the
 * community token); the role shown on screen is never trusted. The LEWORD page is rendered only on a yes.
 */
function LewordGate({ children }: { children: ReactNode }) {
    const location = useLocation();
    const site = useSiteSession(location.pathname);
    const [access, setAccess] = useState<LewordAccess | null>(null);
    const next = location.pathname + location.search;
    const loginKey = `${site.community?.communityToken ?? ''}|${site.community ? '' : site.leword?.userId ?? ''}`;

    const check = useCallback(() => {
        let alive = true;
        setAccess(null);
        void resolveLewordAccess().then((result) => { if (alive) setAccess(result); });
        return () => { alive = false; };
    }, []);

    // Ask again whenever the login itself changes (login, logout, another tab).
    useEffect(() => check(), [check, loginKey]);

    const retry = () => { forgetLewordVerification(); check(); };

    if (!site.community && !site.leword) {
        return <LewordGateView access={{ kind: 'login', message: '' }} onRetry={retry} onOpened={retry} next={next} />;
    }
    if (access?.kind === 'ok') return <>{children}</>;
    return <LewordGateView access={access} onRetry={retry} onOpened={retry} next={next} />;
}

export default LewordGate;
