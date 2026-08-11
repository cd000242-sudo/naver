import { useState } from 'react';
import { getStoredLicense, setStoredLicense } from '../../lib/keywordApi';
import { hasAnyUserKey } from '../../lib/userKeys';

/**
 * 라이선스 잠금.
 *
 * 앱과 같은 방식이다 — 라이선스 코드를 사서 넣으면 열린다. 무료로도 맛은 볼 수
 * 있게 두되(황금키워드 5건 · 조회 10회), 그 이상은 코드가 있어야 한다.
 *
 * 자기 API 키를 넣은 사람도 연다. 그 경우 사장님 쿼터를 안 쓰기 때문이다 —
 * 막을 이유가 없다.
 *
 * 코드는 이 브라우저에만 둔다. 유효한지는 조회할 때 서버가 대조한다.
 */

/** 지금 이 브라우저가 잠금을 풀 자격이 있는가. */
export function isUnlocked(): boolean {
    return Boolean(getStoredLicense().trim()) || hasAnyUserKey();
}

/**
 * 베타 기간에는 **전부 연다.**
 *
 * 사장님(2026-08-12): "베타로 오픈해 놓은 거라서 로그인 기능 등등 나중에 넣어야
 * 될 거 아니에요. 당장 지금 바로 보이도록 해 주세요."
 *
 * 맞다. 로그인도 결제도 아직 없는데 5행만 보여 주면, 보드가 27행을 내도 사람이
 * 보는 것은 5행뿐이다 — 만들어 놓고 안 보여 주는 상태다.
 *
 * **로그인·결제가 붙으면 이 값을 5로 되돌린다.** 아래 상수 하나만 고치면 된다.
 */
const BETA_OPEN = true;

export const FREE_BOARD_ROWS = BETA_OPEN ? Number.MAX_SAFE_INTEGER : 5;
export const FREE_LOOKUPS = BETA_OPEN ? 1000 : 10;

function LicenseGate({ onUnlock }: { onUnlock: () => void }) {
    const [code, setCode] = useState(getStoredLicense());
    const [open, setOpen] = useState(false);

    const submit = () => {
        const trimmed = code.trim();
        if (!trimmed) return;
        setStoredLicense(trimmed);
        onUnlock();
    };

    return (
        <div className="lw-gate">
            <div className="lw-gate-body">
                <strong>여기까지가 무료입니다</strong>
                <p>
                    황금키워드 {FREE_BOARD_ROWS}건과 조회 {FREE_LOOKUPS}회까지 그냥 보실 수 있습니다.
                    전체를 보시려면 <b>라이선스 코드</b>로 로그인해 주세요 — 프로그램에서 쓰시는 그 코드입니다.
                </p>
            </div>

            <div className="lw-gate-actions">
                {open
                    ? (
                        <div className="lw-gate-form">
                            <input
                                type="text"
                                value={code}
                                onChange={(event) => setCode(event.target.value)}
                                onKeyDown={(event) => { if (event.key === 'Enter') submit(); }}
                                placeholder="라이선스 코드"
                                aria-label="라이선스 코드"
                                autoComplete="off"
                                spellCheck={false}
                            />
                            <button type="button" onClick={submit}>로그인</button>
                        </div>
                    )
                    : <button type="button" className="lw-gate-login" onClick={() => setOpen(true)}>라이선스 코드로 로그인</button>}
                <a className="lw-gate-buy" href="/pricing">라이선스 구매 →</a>
            </div>
        </div>
    );
}

export default LicenseGate;
