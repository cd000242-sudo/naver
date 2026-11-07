import { useState } from 'react';
import { PasswordResetPanel } from '../leword/LewordAuth';
import { RESET_TABS, type ResetTab } from '../../lib/accountModel.mjs';
import CommunityReset from './CommunityReset';

type Props = {
    defaultUserId: string;
    initialTab: ResetTab;
    onBack: () => void;
};

const TAB_HELP: Record<ResetTab, string> = {
    community: '이 사이트에서 직접 가입한 아이디예요.',
    license: '이용권(LEWORD) 코드로 만든 아이디예요.',
};

/**
 * 비밀번호 변경 on /login: two kinds of account, two tabs. A forgotten id cannot be told apart safely (the server
 * answers the same for unknown ids so nobody can probe which ids exist), so the person picks the kind instead of
 * the site guessing and texting twice.
 */
function PasswordRecovery({ defaultUserId, initialTab, onBack }: Props) {
    const [tab, setTab] = useState<ResetTab>(initialTab);
    return (
        <div className="au-recovery">
            <div className="au-tabs" role="tablist" aria-label="계정 종류">
                {Object.values(RESET_TABS).map((entry) => (
                    <button key={entry.id} type="button" role="tab" id={`reset-tab-${entry.id}`} aria-selected={tab === entry.id}
                        aria-controls="reset-panel" className={`au-tab${tab === entry.id ? ' on' : ''}`} onClick={() => setTab(entry.id)}>
                        {entry.label}
                    </button>
                ))}
            </div>
            <p className="au-help">{TAB_HELP[tab]}</p>
            <div id="reset-panel" role="tabpanel" aria-labelledby={`reset-tab-${tab}`}>
                {tab === 'community'
                    ? <CommunityReset defaultUserId={defaultUserId} onBack={onBack} onLicense={() => setTab('license')} />
                    : <div className="au-reset"><PasswordResetPanel defaultUserId={defaultUserId} onBack={onBack} /></div>}
            </div>
        </div>
    );
}

export default PasswordRecovery;
