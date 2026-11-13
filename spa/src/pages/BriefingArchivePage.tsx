import { useEffect, useMemo, useState } from 'react';
import SplitWords from '../components/motion/SplitWords';
import { useParams } from 'react-router-dom';
import { ShellIcon } from '../components/ShellIcons';
import { light, lightRadius, motion, type } from '../styles/tokens';

type SeedRow = { keyword: string; searchVolume: number; documentCount: number; opportunity: number };

const numberFormatter = new Intl.NumberFormat('ko-KR');
// One notation for the opportunity index: always one decimal, so the column lines up.
const decimalFormatter = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * 날짜 아카이브 페이지 — 그날 브리핑 전체의 고정 기록.
 *
 * 실시간 이슈 키워드는 내일이면 목록에서 사라지지만, 이 페이지는 '그날의 기록'이라
 * 이후에도 값이 바뀌지 않는다. 낡은 자동생성 페이지가 되는 대신 날짜별로 쌓여 자산이 된다.
 *
 * 현재는 오늘자 시드만 클라이언트에서 렌더한다(과거 날짜는 정적 HTML 로만 존재).
 * 정적 프리렌더가 크롤러·직접 방문 모두를 커버하므로 SPA 로는 오늘자만 채운다.
 */
function BriefingArchivePage() {
    const { date = '' } = useParams();
    const [rows, setRows] = useState<SeedRow[]>([]);
    const [seedDate, setSeedDate] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        fetch('/data/home-keyword-briefing-seed.json')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!alive) return;
                setRows(Array.isArray(data?.rows) ? data.rows : []);
                setSeedDate(String(data?.publishedAt || '').slice(0, 10));
                setLoading(false);
            })
            .catch(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    const matchesDate = useMemo(() => Boolean(date) && seedDate === date, [date, seedDate]);

    useEffect(() => {
        const prev = document.title;
        document.title = `${date} 무료 선정 황금키워드 | 리더스프로`;
        return () => { document.title = prev; };
    }, [date]);

    return (
        <section className="briefing-archive" aria-labelledby="briefing-archive-title">
            <style>{`
                /* Top padding clears the fixed nav bar (72px). */
                .briefing-archive { padding: 120px 16px 64px; max-width: 1100px; margin: 0 auto; }
                .briefing-archive-panel {
                    padding: 32px; border-radius: ${lightRadius.panel}px;
                    border: 1px solid ${light.line}; background: ${light.surface}; box-shadow: ${light.shadowSm};
                }
                .briefing-archive h1 {
                    margin: 0 0 12px; color: ${light.text};
                    font-size: ${type.h2}px; font-weight: 700; line-height: 1.3;
                }
                .briefing-archive p {
                    margin: 0 0 24px; max-width: 720px; color: ${light.textSecondary};
                    font-size: ${type.body}px; line-height: 1.7;
                }
                .briefing-archive-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
                .briefing-archive-table th, .briefing-archive-table td {
                    padding: 12px; border-bottom: 1px solid ${light.line};
                    color: ${light.text}; font-size: ${type.small}px; line-height: 1.45;
                }
                .briefing-archive-table thead th {
                    color: ${light.textMuted}; font-size: ${type.meta}px; font-weight: 500;
                    text-align: right; white-space: nowrap; border-bottom-color: ${light.lineStrong};
                }
                .briefing-archive-table thead th:first-child { text-align: left; }
                .briefing-archive-table td { text-align: right; white-space: nowrap; }
                .briefing-archive-table th[scope="row"] { text-align: left; font-weight: 500; }
                .briefing-archive-table tbody tr:last-child th, .briefing-archive-table tbody tr:last-child td { border-bottom: 0; }
                .briefing-archive-back {
                    display: inline-flex; align-items: center; gap: 4px; margin-top: 24px;
                    min-height: 44px; padding: 0 16px;
                    border: 1px solid ${light.line}; border-radius: ${lightRadius.control}px;
                    background: ${light.surface}; color: ${light.text};
                    font-size: ${type.small}px; font-weight: 500; text-decoration: none;
                    transition: background-color ${motion.fast} ${motion.ease}, border-color ${motion.fast} ${motion.ease};
                }
                .briefing-archive-back:hover { background: ${light.raised}; border-color: ${light.lineStrong}; }
                .briefing-archive-back:focus-visible { outline: 2px solid ${light.text}; outline-offset: 2px; }
                @media (max-width: 720px) {
                    .briefing-archive { padding: 96px 16px 48px; }
                    .briefing-archive-panel { padding: 20px 16px; }
                    .briefing-archive-table th, .briefing-archive-table td { padding: 12px 4px; }
                    .briefing-archive-table th[scope="row"], .briefing-archive-table thead th:first-child { padding-left: 0; }
                    .briefing-archive-table td:last-child, .briefing-archive-table thead th:last-child { padding-right: 0; }
                }
            `}</style>

            <div className="briefing-archive-panel">
                <h1 id="briefing-archive-title"><SplitWords text={`${date} 무료 선정 황금키워드`} /></h1>
                {matchesDate ? (
                    <>
                        <p>{date} 기준으로 검토해 올린 무료 선정 황금키워드 {rows.length}개입니다. 이 페이지는 그날의 기록이라 이후에도 값이 바뀌지 않습니다. 기회지수는 검색량 ÷ (문서수 + 1) 로 계산합니다.</p>
                        <table className="briefing-archive-table">
                            <thead>
                                <tr><th scope="col">키워드</th><th scope="col">검색량</th><th scope="col">문서수</th><th scope="col">기회지수</th></tr>
                            </thead>
                            <tbody>
                                {rows.map((row, i) => (
                                    <tr key={`${i}-${row.keyword}`}>
                                        <th scope="row">{row.keyword}</th>
                                        <td>{numberFormatter.format(row.searchVolume)}</td>
                                        <td>{numberFormatter.format(row.documentCount)}</td>
                                        <td>{decimalFormatter.format(row.opportunity)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                ) : (
                    <p>{loading ? '기록을 불러오는 중입니다.' : '이 날짜의 기록은 저장된 페이지에서 볼 수 있습니다. 오늘자 목록은 아래에서 확인하세요.'}</p>
                )}
                <a className="briefing-archive-back" href="/briefing">
                    오늘의 무료 선정 황금키워드
                    <ShellIcon name="chevronRight" size={16} />
                </a>
            </div>
        </section>
    );
}

export default BriefingArchivePage;
