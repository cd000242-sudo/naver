import type { ReactNode } from 'react';
import '../../styles/light-page.css';
import './auth.css';

type Props = {
    title: string;
    sub?: string;
    children: ReactNode;
};

/** The bright card every auth screen sits in (under the white top menu). */
function AuthShell({ title, sub, children }: Props) {
    return (
        <div className="lp">
            <div className="lp-wrap au-main">
                <section className="lp-box au-card">
                    <h1>{title}</h1>
                    {sub ? <p className="au-sub">{sub}</p> : null}
                    {children}
                </section>
            </div>
        </div>
    );
}

export default AuthShell;
