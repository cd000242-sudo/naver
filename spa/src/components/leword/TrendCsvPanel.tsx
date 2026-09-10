import { useMemo, useRef, useState } from 'react';
import { fetchKeywordDocs, fetchKeywordFrontal, fetchKeywordVolumes } from '../../lib/keywordApi';
import { countFacing, parseTrendCsv, seatFromFacing, type TrendCsvRow, type TrendSeat } from '../../lib/trendCsv';

/**
 * 트렌드 CSV 들이기 — 분석기 탭 안.
 *
 * 사장님 2026-09-10 "사이트에는 어디에 놔둘래? 키워드 분석기에 놔두는 게 낫지 않나".
 * 맞다 — 분석기가 이미 "이 검색어의 검색량·문서수·정면 글을 재라"는 판이고, CSV 는 그 입력을
 * 여러 개로 늘린 것뿐이다.
 *
 * 앱과 나눈 몫(같은 판정, 다른 상한):
 *   앱    내 PC 브라우저로 잰다 — 자리 상한 120~250.
 *   여기  워커 주소로 잰다 — 그 주소는 모든 방문자가 같이 쓴다. 한 사람이 몰아치면
 *         네이버가 워커를 막고 전원이 못 쓴다. 그래서 자리는 상한을 낮게 둔다.
 *
 * 워커 한도(실측): 문서수 한 번에 120개 · 정면 글 한 번에 12개.
 */

const SEAT_ORDER: Record<TrendSeat, number> = { '열림': 0, '반열림': 1, '잠김': 2, '안 잼': 3 };
const SEAT_CLASS: Record<TrendSeat, string> = { '열림': 'open', '반열림': 'semi', '잠김': 'locked', '안 잼': 'none' };
const DOC_CHUNK = 120;
const FRONTAL_CHUNK = 12;
const SEAT_CAP = 60;

interface Row extends TrendCsvRow {
    searchVolume: number | null;
    documentCount: number | null;
    facing: number | null;
}

const num = (value: number | null) => (value === null ? '—' : value.toLocaleString('ko-KR'));
const chunk = <T,>(list: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
};

export default function TrendCsvPanel() {
    const fileRef = useRef<HTMLInputElement>(null);
    const [rows, setRows] = useState<Row[]>([]);
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
    const [openOnly, setOpenOnly] = useState(true);
    const [category, setCategory] = useState('');
    const [fileName, setFileName] = useState('');

    const categories = useMemo(
        () => Array.from(new Set(rows.map((row) => row.category).filter(Boolean))).sort(),
        [rows],
    );

    const shown = useMemo(() => {
        let list = rows;
        if (category) list = list.filter((row) => row.category === category);
        if (openOnly) list = list.filter((row) => {
            const seat = seatFromFacing(row.facing);
            return seat === '열림' || seat === '반열림';
        });
        return [...list].sort((a, b) => {
            const gap = SEAT_ORDER[seatFromFacing(a.facing)] - SEAT_ORDER[seatFromFacing(b.facing)];
            return gap !== 0 ? gap : (b.searchVolume || 0) - (a.searchVolume || 0);
        });
    }, [rows, category, openOnly]);

    const openCount = rows.filter((row) => seatFromFacing(row.facing) === '열림').length;

    /**
     * 파일 하나를 읽어 재기 — 검색량 → 문서수 → 자리 순.
     * 단계마다 화면을 다시 그린다("넣는 족족 검색량 문서량 바로 보여주고").
     * 실패한 묶음은 건너뛰고 계속한다 — 한 묶음 때문에 전부 잃지 않는다.
     */
    const onPick = async (file: File) => {
        setBusy(true);
        setFileName(file.name);
        try {
            const parsed = parseTrendCsv(await file.text());
            if (parsed.rows.length === 0) {
                setStatus('CSV 에서 키워드를 찾지 못했습니다. 크리에이터 어드바이저 트렌드에서 내보낸 파일인지 확인해 주세요.');
                setRows([]);
                return;
            }
            let working: Row[] = parsed.rows.map((row) => ({ ...row, searchVolume: null, documentCount: null, facing: null }));
            setRows(working);
            setStatus(`${parsed.total}행에서 고유 키워드 ${working.length}개 · 주제 ${parsed.categories.length}개`);

            const keywords = working.map((row) => row.keyword);

            // 검색량
            for (const [index, part] of chunk(keywords, DOC_CHUNK).entries()) {
                setStatus(`검색량 재는 중… ${index * DOC_CHUNK + part.length}/${keywords.length}`);
                const res = await fetchKeywordVolumes(part).catch(() => null);
                const volumes = res?.ok ? res.data?.volumes || {} : {};
                working = working.map((row) => (volumes[row.keyword] === undefined
                    ? row : { ...row, searchVolume: Number(volumes[row.keyword]) }));
                setRows(working);
            }

            // 문서수
            for (const [index, part] of chunk(keywords, DOC_CHUNK).entries()) {
                setStatus(`문서수 재는 중… ${index * DOC_CHUNK + part.length}/${keywords.length}`);
                const res = await fetchKeywordDocs(part).catch(() => null);
                const docs = res?.ok ? res.data?.docs || {} : {};
                working = working.map((row) => (docs[row.keyword] === undefined
                    ? row : { ...row, documentCount: Number(docs[row.keyword]) }));
                setRows(working);
            }

            // 자리 — 문서가 적은 것부터, 상한까지만. 빈자리는 그쪽에 있을 확률이 높고 워커도 아낀다.
            const targets = working
                .filter((row) => row.documentCount !== null)
                .sort((a, b) => (a.documentCount as number) - (b.documentCount as number))
                .slice(0, SEAT_CAP)
                .map((row) => row.keyword);
            let done = 0;
            for (const part of chunk(targets, FRONTAL_CHUNK)) {
                const res = await fetchKeywordFrontal(part).catch(() => null);
                const titles = res?.ok ? res.data?.titles || {} : {};
                working = working.map((row) => (part.includes(row.keyword)
                    ? { ...row, facing: countFacing(titles[row.keyword], row.keyword) } : row));
                done += part.length;
                setRows(working);
                setStatus(`자리 재는 중… ${done}/${targets.length}`);
            }
            const opened = working.filter((row) => seatFromFacing(row.facing) === '열림').length;
            setStatus(`끝 — 고유 ${working.length}개 · 자리 잰 것 ${targets.length} · 빈자리 ${opened}`);
        } catch (cause: unknown) {
            setStatus(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="lw-trendcsv" aria-labelledby="lw-trendcsv-title">
            <style>{`
                .lw-trendcsv { margin: 18px 0 0; border: 1px solid rgba(255,255,255,.1); border-radius: 12px; padding: 14px 16px; background: rgba(255,255,255,.03); }
                .lw-trendcsv-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
                .lw-trendcsv-head h3 { margin: 0; font-size: 16px; }
                .lw-trendcsv-head .hint { font-size: 11.5px; opacity: .6; }
                .lw-trendcsv-note { margin: 6px 0 10px; font-size: 12px; opacity: .62; line-height: 1.6; }
                .lw-trendcsv-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; font-size: 12.5px; }
                .lw-trendcsv-tools select, .lw-trendcsv button { font: inherit; }
                .lw-trendcsv-btn { padding: 8px 14px; border: 0; border-radius: 8px; background: #2fd39a; color: #05221a; font-weight: 700; cursor: pointer; }
                .lw-trendcsv-btn[disabled] { opacity: .55; cursor: default; }
                .lw-trendcsv-toggle { padding: 6px 11px; border: 1px solid rgba(255,255,255,.16); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
                .lw-trendcsv-toggle.on { background: #2fd39a; color: #05221a; border-color: #2fd39a; font-weight: 700; }
                .lw-trendcsv-status { opacity: .75; font-variant-numeric: tabular-nums; }
                .lw-trendcsv-wrap { overflow-x: auto; max-height: 480px; overflow-y: auto; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; }
                .lw-trendcsv table { width: 100%; border-collapse: collapse; font-size: 13px; }
                .lw-trendcsv th { position: sticky; top: 0; background: #16202e; text-align: left; font-size: 11.5px; font-weight: 500; opacity: .8; padding: 9px 10px; }
                .lw-trendcsv td { padding: 9px 10px; border-top: 1px solid rgba(255,255,255,.06); }
                .lw-trendcsv td.r, .lw-trendcsv th.r { text-align: right; font-variant-numeric: tabular-nums; }
                .lw-trendcsv .seat { font-weight: 700; }
                .lw-trendcsv .seat.open { color: #2fd39a; }
                .lw-trendcsv .seat.semi { color: #d9b23c; }
                .lw-trendcsv .seat.locked { color: #e0706f; }
                .lw-trendcsv .seat.none { opacity: .45; font-weight: 400; }
                .lw-trendcsv .up { color: #2fd39a; }
                .lw-trendcsv .empty { padding: 14px; opacity: .55; font-size: 13px; }
            `}</style>

            <div className="lw-trendcsv-head">
                <h3 id="lw-trendcsv-title">📥 트렌드 CSV 들이기</h3>
                <span className="hint">네이버 크리에이터 어드바이저 → 트렌드 → CSV 저장</span>
                <span style={{ flex: 1 }} />
                <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    hidden
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void onPick(file);
                        event.target.value = '';
                    }}
                />
                <button type="button" className="lw-trendcsv-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
                    {busy ? '재는 중…' : 'CSV 고르기'}
                </button>
            </div>

            <p className="lw-trendcsv-note">
                네이버가 주제별로 알려주는 <b>실제 유입 검색어</b>입니다. 넣으면 검색량·문서수를 재고,
                문서가 적은 것부터 블로그 탭 자리를 {SEAT_CAP}개까지 잽니다.
                더 많이 재려면 앱에서 하세요 — 앱은 내 PC 브라우저로 재기 때문에 상한이 없습니다.
            </p>

            <div className="lw-trendcsv-tools">
                <button
                    type="button"
                    className={`lw-trendcsv-toggle${openOnly ? ' on' : ''}`}
                    onClick={() => setOpenOnly(true)}
                >빈자리만</button>
                <button
                    type="button"
                    className={`lw-trendcsv-toggle${openOnly ? '' : ' on'}`}
                    onClick={() => setOpenOnly(false)}
                >전체</button>
                {categories.length > 0 && (
                    <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="주제 고르기">
                        <option value="">주제 전체</option>
                        {categories.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                )}
                <span className="lw-trendcsv-status">
                    {fileName ? `${fileName} · ` : ''}{status || '아직 안 들였습니다.'}
                    {rows.length > 0 ? ` · 빈자리 ${openCount}` : ''}
                </span>
            </div>

            {shown.length === 0 ? (
                <div className="empty">{rows.length === 0 ? 'CSV 를 고르면 여기에 채워집니다.' : '이 조건에 맞는 키워드가 없습니다.'}</div>
            ) : (
                <div className="lw-trendcsv-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>키워드</th>
                                <th>주제</th>
                                <th className="r">주제 순위</th>
                                <th className="r">검색량</th>
                                <th className="r">문서수</th>
                                <th>자리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((row) => {
                                const seat = seatFromFacing(row.facing);
                                return (
                                    <tr key={`${row.category}-${row.keyword}`}>
                                        <td><b>{row.keyword}</b></td>
                                        <td style={{ opacity: .7 }}>{row.category}</td>
                                        <td className="r" style={{ opacity: .7 }}>
                                            {row.rank || '—'}
                                            {row.change !== null && row.change > 0 ? <span className="up"> ▲{row.change}</span> : null}
                                        </td>
                                        <td className="r">{num(row.searchVolume)}</td>
                                        <td className="r">{num(row.documentCount)}</td>
                                        <td>
                                            <span className={`seat ${SEAT_CLASS[seat]}`}>{seat}</span>
                                            {row.facing !== null && <span style={{ opacity: .5, fontSize: 11.5 }}> · 정면 {row.facing}</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
