import { useState } from 'react';
import {
    KEY_GROUPS,
    checkKeyShape,
    clearUserKeys,
    isGroupReady,
    loadUserKeys,
    saveUserKeys,
    type UserKeys,
} from '../../lib/userKeys';
import { TabIntro } from './LewordShared';

/**
 * 내 API 키.
 *
 * 사장님 키로만 돌리면 남이 긁어가는 만큼 사장님 쿼터가 탄다. 자기 키를 넣은
 * 사람은 자기 쿼터를 쓰므로 조회 제한이 없다 — 이게 이 화면의 존재 이유다.
 *
 * 키는 이 브라우저에만 저장한다. 조회할 때만 요청 본문(POST)에 실어 보내고
 * 서버는 요청이 끝나면 버린다. 그 사실을 화면에도 적어 둔다 — 남의 API 키를
 * 넣으라고 하면서 어디로 가는지 안 알려주는 건 못 할 짓이다.
 */
function KeysTab() {
    const [keys, setKeys] = useState<UserKeys>(() => loadUserKeys());
    const [saved, setSaved] = useState(false);
    const [revealed, setRevealed] = useState<Record<string, boolean>>({});

    const update = (field: string, value: string) => {
        setKeys((previous) => ({ ...previous, [field]: value }));
        setSaved(false);
    };

    const problems = checkKeyShape(keys);

    const persist = () => {
        // 형식이 이상하면 저장하지 않는다. 자동완성으로 들어온 로그인 정보를
        // 그대로 저장하면 다음 조회에서 그게 서버로 간다.
        if (problems.length > 0) return;
        saveUserKeys(keys);
        setKeys(loadUserKeys());
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2600);
    };

    const removeAll = () => {
        clearUserKeys();
        setKeys({});
        setSaved(false);
    };

    return (
        <>
            <TabIntro
                title="내 API 키"
                desc="자기 키를 넣으면 자기 쿼터로 조회하므로 무료 횟수 제한이 없습니다. 넣지 않아도 무료 조회는 그대로 됩니다."
                source="키는 이 브라우저에만 저장 · 조회할 때만 전송 · 서버 보관 없음"
            />

            <div className="lw-note lw-note-plain">
                <strong>키가 어디로 가는지</strong>
                입력한 키는 <strong>이 브라우저의 저장소</strong>에만 남습니다. 조회를 누를 때만 요청 본문에 담겨
                서버로 가고(주소창·기록에 남지 않도록 POST로 보냅니다), 서버는 조회가 끝나면 버립니다.
                시트·로그·설정 어디에도 저장하지 않습니다. 브라우저를 바꾸면 다시 입력해야 합니다.
            </div>

            {KEY_GROUPS.map((group) => {
                const ready = isGroupReady(group, keys);
                return (
                    <section key={group.id} className="lw-panel" aria-label={group.label}>
                        <div className="lw-panel-head">
                            <h2>{group.label}</h2>
                            <span className={ready ? 'lw-key-on' : ''}>{ready ? '● 사용 중' : '미입력 — 사장님 키로 조회'}</span>
                            <a className="lw-key-issue" href={group.issueUrl} target="_blank" rel="noreferrer">발급받기 →</a>
                        </div>
                        <p className="lw-card-note" style={{ marginBottom: 12 }}>{group.desc}</p>
                        {/* 구독 무료 경로가 첫 번째다 — 키 입력은 그다음 선택지. */}
                        {group.id === 'ai' && (
                            <p className="lw-card-note" style={{ marginBottom: 12 }}>
                                <a href="/download" style={{ color: '#b8a6ff', fontWeight: 800, textDecoration: 'none' }}>
                                    ⬇ LEWORD 앱 받기 — Claude Code·Codex 로그인 자동 감지, 구독으로 무료 추론 →
                                </a>
                            </p>
                        )}
                        <div className="lw-key-fields">
                            {group.fields.map((field) => {
                                /*
                                 * 기본은 가린다. 예전엔 액세스 라이선스·고객 ID 를 '비밀 아님'으로
                                 * 두고 화면에 그대로 띄웠는데, 그것도 남이 보면 안 되는 값이다.
                                 * 지금은 sub_id 같은 꼬리표만 열어 둔다.
                                 */
                                const showing = Boolean(revealed[field.key]) || !field.secret;
                                return (
                                    <label key={field.key} className="lw-key-field">
                                        <span>{field.label}</span>
                                        <div>
                                            <input
                                                type={showing ? 'text' : 'password'}
                                                value={keys[field.key] || ''}
                                                onChange={(event) => update(field.key, event.target.value)}
                                                placeholder={field.placeholder}
                                                /*
                                                 * 브라우저 비밀번호 관리자 차단.
                                                 * `off` 는 크롬이 무시한다 — 비밀 칸에는 `new-password`
                                                 * 를 줘야 저장된 로그인을 안 채운다. name 도 로그인처럼
                                                 * 보이지 않게 바꾸고, 외부 관리자용 표시도 함께 단다.
                                                 */
                                                name={`lw-nofill-${field.key}`}
                                                autoComplete={field.secret ? 'new-password' : 'off'}
                                                data-lpignore="true"
                                                data-1p-ignore=""
                                                data-form-type="other"
                                                spellCheck={false}
                                            />
                                            {field.secret && (
                                                <button
                                                    type="button"
                                                    className="lw-mini lw-mini-ghost"
                                                    onClick={() => setRevealed((p) => ({ ...p, [field.key]: !p[field.key] }))}
                                                >{showing ? '가리기' : '보기'}</button>
                                            )}
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    </section>
                );
            })}

            {problems.length > 0 && (
                <div className="lw-note lw-note-error" role="alert">
                    <strong>이 값은 네이버 키가 아닌 것 같습니다 — 저장하지 않았습니다</strong>
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                        {problems.map((problem) => (
                            <li key={problem.field}>{problem.label}: {problem.reason}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="lw-key-actions">
                <button type="button" className="lw-key-save" onClick={persist} disabled={problems.length > 0}>
                    {saved ? '✓ 저장됨' : '저장'}
                </button>
                <button type="button" className="lw-mini lw-mini-ghost" onClick={removeAll}>전부 지우기</button>
            </div>
        </>
    );
}

export default KeysTab;
