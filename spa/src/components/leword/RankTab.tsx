import { useEffect, useState } from 'react';
import { checkRank, type KeywordUsage, type RankResult } from '../../lib/keywordApi';
import { ErrorNote, TabIntro, UsageBar } from './LewordShared';

/**
 * 노출 추적 — 내 글이 이 키워드 검색에서 몇 번째에 있는지.
 *
 * 순위는 네이버가 돌려준 목록에서 **직접 센 자리**다. 예측이 아니다.
 * 100위 안에 없으면 "없다"고 말한다. "곧 오를 것" 같은 말은 하지 않는다.
 *
 * 추적 목록은 이 브라우저에만 저장된다. 서버에 계정을 만들 필요가 없고,
 * 사장님 쿼터도 사용자가 직접 누를 때만 쓴다.
 */

const STORE_KEY = 'leaderspro.leword.rankTargets.v1';

type TrackedRow = {
    id: string;
    keyword: string;
    target: string;
    rank: number | null;
    title: string;
    link: string;
    checkedAt: string;
    scanned: number;
};

function loadTracked(): TrackedRow[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.slice(0, 50) : [];
    } catch {
        return [];
    }
}

function saveTracked(rows: TrackedRow[]) {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify(rows.slice(0, 50)));
    } catch {
        // 저장 실패가 조회를 막으면 안 된다.
    }
}

function RankTab({ initialKeyword }: { initialKeyword: string }) {
    const [keyword, setKeyword] = useState(initialKeyword);
    const [target, setTarget] = useState('');
    const [rows, setRows] = useState<TrackedRow[]>(() => loadTracked());
    const [usage, setUsage] = useState<KeywordUsage | null>(null);
    const [error, setError] = useState<{ code?: string; message?: string; missing?: string[] }>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (initialKeyword) setKeyword(initialKeyword);
    }, [initialKeyword]);

    const applyResult = (result: RankResult) => {
        const row: TrackedRow = {
            id: `${result.keyword}${result.target}`,
            keyword: result.keyword,
            target: result.target,
            rank: result.found ? result.found.rank : null,
            title: result.found ? result.found.title : '',
            link: result.found ? result.found.link : '',
            checkedAt: new Date().toISOString(),
            scanned: result.scanned,
        };
        setRows((previous) => {
            const next = [row, ...previous.filter((entry) => entry.id !== row.id)];
            saveTracked(next);
            return next;
        });
    };

    const run = async (checkKeyword: string, checkTarget: string) => {
        const trimmedKeyword = checkKeyword.trim();
        const trimmedTarget = checkTarget.trim();
        if (!trimmedKeyword || !trimmedTarget || loading) return;
        setLoading(true);
        setError({});
        const response = await checkRank(trimmedKeyword, trimmedTarget);
        setLoading(false);
        if (response.usage) setUsage(response.usage);
        if (response.ok && response.data) {
            applyResult(response.data);
            return;
        }
        setError({ code: response.error, message: response.message, missing: response.missing });
    };

    const removeRow = (id: string) => {
        setRows((previous) => {
            const next = previous.filter((entry) => entry.id !== id);
            saveTracked(next);
            return next;
        });
    };

    return (
        <>
            <TabIntro
                title="노출 추적"
                desc="내 블로그가 그 키워드 검색 결과 몇 번째에 있는지 직접 세어 봅니다. 100위 안에 없으면 없다고 알려 줍니다."
                source="네이버 블로그 검색 API 상위 200건 스캔"
            />

            <form
                className="lw-search lw-search-two"
                onSubmit={(event) => { event.preventDefault(); run(keyword, target); }}
            >
                <input
                    type="search"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="확인할 키워드"
                    aria-label="확인할 키워드"
                />
                <input
                    type="text"
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    placeholder="내 블로그 주소 또는 아이디 (예: blog.naver.com/myid)"
                    aria-label="내 블로그 주소 또는 아이디"
                />
                <button type="submit" disabled={loading || !keyword.trim() || !target.trim()}>
                    {loading ? '확인 중…' : '순위 확인'}
                </button>
            </form>

            <UsageBar usage={usage} />
            <ErrorNote error={error.code} message={error.message} missing={error.missing} />

            {rows.length === 0 && !loading && (
                <div className="lw-note">
                    키워드와 블로그 주소를 넣고 확인하면 여기에 쌓입니다. 목록은 이 브라우저에만 저장됩니다.
                </div>
            )}

            {rows.length > 0 && (
                <section className="lw-panel" aria-label="추적 중인 키워드">
                    <div className="lw-panel-head">
                        <h2>추적 목록</h2>
                        <span>{rows.length}건 · 이 브라우저에만 저장</span>
                    </div>
                    <div className="lw-table-scroll">
                        <table className="lw-table">
                            <thead>
                                <tr>
                                    <th scope="col">키워드</th>
                                    <th scope="col">순위</th>
                                    <th scope="col">확인한 글</th>
                                    <th scope="col">확인 시각</th>
                                    <th scope="col" aria-label="동작" />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr key={row.id}>
                                        <th scope="row">
                                            {row.keyword}
                                            <small>{row.target}</small>
                                        </th>
                                        <td className={row.rank === null ? 'lw-rank-out' : 'lw-rank-in'}>
                                            {row.rank === null ? `${row.scanned}건 중 없음` : `${row.rank}위`}
                                        </td>
                                        <td className="lw-rank-title">
                                            {row.link
                                                ? <a href={row.link} target="_blank" rel="noreferrer">{row.title || '내 글'}</a>
                                                : '—'}
                                        </td>
                                        <td>
                                            {new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                                                .format(new Date(row.checkedAt))}
                                        </td>
                                        <td className="lw-row-actions">
                                            <button type="button" className="lw-mini" onClick={() => run(row.keyword, row.target)}>다시</button>
                                            <button type="button" className="lw-mini lw-mini-ghost" onClick={() => removeRow(row.id)}>삭제</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </>
    );
}

export default RankTab;
