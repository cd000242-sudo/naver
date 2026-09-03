import { loadSession } from '../../lib/lewordAuth';

/**
 * 잠금 안내.
 *
 * 무료로도 맛은 볼 수 있게 두되(황금키워드 5건 · 조회 10회), 그 이상은
 * 로그인해야 한다. 라이선스 코드는 계정을 만들 때 쓰인다 — 코드만 브라우저에
 * 적어 두는 길은 없앴다(그건 계정에 묶이지 않은 그냥 글자다).
 *
 * 자기 API 키를 넣은 사람도 연다. 그 경우 사장님 쿼터를 안 쓰기 때문이다 —
 * 막을 이유가 없다.
 *
 * 코드는 이 브라우저에만 둔다. 유효한지는 조회할 때 서버가 대조한다.
 */

/** 지금 이 브라우저가 잠금을 풀 자격이 있는가. */
/**
 * 잠금을 여는 것은 **로그인 하나뿐**이다.
 *
 * 예전엔 라이선스 코드 문자열이 들어 있거나 자기 API 키를 넣어 두기만 해도
 * 열렸다. 그래서 로그인을 붙여 놓고도 전부 보였다(사장님 실측 2026-08-20
 * "상위 5건만 보인다면서 다 보이는데?"). 두 값은 성격이 다르다 —
 *   · 라이선스 코드 문자열 : 그냥 브라우저에 적어 둔 글자다. 계정에 묶여야 값이 된다
 *   · 자기 API 키          : 조회 한도를 자기 몫으로 쓰는 것이지 이용권이 아니다
 * 코드를 가진 사람은 계정을 만들면 그대로 열린다 — 잃는 것은 없다.
 */
export function isUnlocked(): boolean {
    return loadSession() !== null;
}

/**
 * 베타 개방은 끝났다(2026-08-20).
 *
 * 2026-08-12 에 전부 열어 둔 이유는 "로그인도 결제도 아직 없는데 5행만 보여
 * 주면 만들어 놓고 안 보여 주는 상태"였기 때문이다. 그 조건이 사라졌다 —
 * 로그인이 붙었고, 위 isUnlocked 가 로그인한 사람을 먼저 통과시킨다.
 * 이제 비로그인만 5행을 본다(사장님 사양: "맛보기 상위 5개").
 */
const BETA_OPEN = false;

export const FREE_BOARD_ROWS = BETA_OPEN ? Number.MAX_SAFE_INTEGER : 5;
export const FREE_LOOKUPS = BETA_OPEN ? 1000 : 10;

/**
 * @param remaining 로그인하면 열리는 남은 건수. 자리표시자였던 곳이다 —
 *   화면에 `{남은 건수}` 라는 글자가 그대로 찍히고 있었다(사장님 실측 2026-08-23).
 * @param freeRows 이 보드의 무료 건수. 보드마다 다르다 — 황금키워드 5, 실검 틈새 3
 *   (사장님 사양 2026-09-03). 안 주면 황금키워드 기본.
 * @param boardLabel 안내문에 찍히는 보드 이름. 틈새 탭이 "황금키워드 5건" 이라고
 *   말하고 있었다 — 보드가 다른데 같은 문장을 쓴 탓이다.
 */
function LicenseGate({ onUnlock, remaining, freeRows = FREE_BOARD_ROWS, boardLabel = '황금키워드' }: {
    onUnlock: () => void;
    remaining?: number;
    freeRows?: number;
    boardLabel?: string;
}) {
    return (
        <div className="lw-gate">
            <div className="lw-gate-body">
                <strong>여기까지가 무료입니다</strong>
                <p>
                    {boardLabel} {freeRows}건과 조회 {FREE_LOOKUPS}회까지 그냥 보실 수 있습니다.
                    {typeof remaining === 'number' && remaining > 0
                        ? ` 나머지 ${remaining.toLocaleString('ko-KR')}건은 로그인하면 열립니다`
                        : ' 나머지는 로그인하면 열립니다'} — 라이선스 코드가 있으면 1분이면 됩니다.
                </p>
            </div>

            <div className="lw-gate-actions">
                {/*
                  * 예전엔 여기서 라이선스 코드를 직접 받아 브라우저에 적어 뒀다.
                  * 이제 코드는 계정에 묶인다 — 코드만 적어 두는 길은 없앴다.
                  * 계정을 만들면 그 코드가 그대로 쓰인다.
                  */}
                <button
                    type="button"
                    className="lw-gate-login"
                    onClick={() => {
                        // 로그인 화면은 페이지가 갖고 있다. 보드를 거쳐 넘기면 소품이 길어진다.
                        window.dispatchEvent(new CustomEvent('leword:login'));
                        onUnlock();
                    }}
                >로그인 · 계정 만들기</button>
                <a className="lw-gate-buy" href="/pricing">라이선스 구매 →</a>
            </div>
        </div>
    );
}

export default LicenseGate;
