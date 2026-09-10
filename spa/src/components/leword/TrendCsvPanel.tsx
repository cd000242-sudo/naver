import { useMemo, useRef, useState } from 'react';
import { fetchKeywordDocs, fetchKeywordFrontal, fetchKeywordVolumes } from '../../lib/keywordApi';
import { countFacing, parseTrendCsv, seatFromFacing, volumeKey, type TrendCsvRow, type TrendSeat } from '../../lib/trendCsv';

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
/** 검색광고 묶음 — 워커가 한 번에 100개까지만 받는다(searchAdVolumes 의 slice(0,100)). */
const VOLUME_CHUNK = 100;
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
    const [dragOver, setDragOver] = useState(false);

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

    /**
     * 자리 재기 — 아직 안 잰 것 중 **문서가 적은 것부터** 상한만큼. 빈자리는 그쪽에 있을 확률이
     * 높고 워커도 아낀다. 상한에서 끊고 '이어 재기'로 다음 묶음을 잇는다 — 553개를 한 번에
     * 몰아치면 워커 주소가 네이버에 막혀 모든 방문자가 못 쓴다.
     */
    const measureSeats = async (base: Row[]) => {
        let working = base;
        const targets = working
            .filter((row) => row.documentCount !== null && row.facing === null)
            .sort((a, b) => (a.documentCount as number) - (b.documentCount as number))
            .slice(0, SEAT_CAP)
            .map((row) => row.keyword);
        if (targets.length === 0) {
            setStatus('더 잴 것이 없습니다.');
            return;
        }
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
        const measured = working.filter((row) => row.facing !== null).length;
        const opened = working.filter((row) => seatFromFacing(row.facing) === '열림').length;
        const left = working.filter((row) => row.documentCount !== null && row.facing === null).length;
        setStatus(`고유 ${working.length}개 · 자리 잰 것 ${measured} · 빈자리 ${opened}`
            + (left > 0 ? ` · 아직 안 잰 것 ${left} — [이어 재기]` : ''));
    };

    /** 상한에서 끊긴 다음 묶음을 잇는다. */
    const measureMore = async () => {
        setBusy(true);
        try { await measureSeats(rows); } finally { setBusy(false); }
    };

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

            // 검색량 — 워커가 한 번에 100개까지만 받고(searchAdVolumes), 응답 키는 띄어쓰기를 없앤 것이다.
            // 원래 키워드로 찾으면 띄어쓰기 있는 것이 전부 빈 값이 된다(2026-09-10 실사고: 553개 전량 '—').
            let volumeDenied = false;
            for (const [index, part] of chunk(keywords, VOLUME_CHUNK).entries()) {
                setStatus(`검색량 재는 중… ${index * VOLUME_CHUNK + part.length}/${keywords.length}`);
                const res = await fetchKeywordVolumes(part).catch(() => null);
                if (res && !res.ok) { volumeDenied = true; break; }
                const volumes = res?.ok ? res.data?.volumes || {} : {};
                working = working.map((row) => (volumes[volumeKey(row.keyword)] === undefined
                    ? row : { ...row, searchVolume: Number(volumes[volumeKey(row.keyword)]) }));
                setRows(working);
            }
            if (volumeDenied) setStatus('검색량을 못 잽니다 — 내 API 키 탭에서 검색광고 키를 넣어 주세요. 문서수·자리는 계속 잽니다.');

            // 문서수
            for (const [index, part] of chunk(keywords, DOC_CHUNK).entries()) {
                setStatus(`문서수 재는 중… ${index * DOC_CHUNK + part.length}/${keywords.length}`);
                const res = await fetchKeywordDocs(part).catch(() => null);
                const docs = res?.ok ? res.data?.docs || {} : {};
                working = working.map((row) => (docs[row.keyword] === undefined
                    ? row : { ...row, documentCount: Number(docs[row.keyword]) }));
                setRows(working);
            }

            await measureSeats(working);
        } catch (cause: unknown) {
            setStatus(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setBusy(false);
        }
    };

    /* 요약 타일 — 들인 것 중 몇 개를 쟀고 몇 개가 열렸는지. 안 잰 것은 '아직'이라고 적는다. */
    const measuredVolume = rows.filter((row) => row.searchVolume !== null).length;
    const measuredSeat = rows.filter((row) => row.facing !== null).length;
    const openSeats = rows.filter((row) => row.facing !== null && seatFromFacing(row.facing) === '열림').length;
    const pending = rows.filter((row) => row.documentCount !== null && row.facing === null).length;

    return (
        <section className="lw-csv" aria-labelledby="lw-csv-title">
            <style>{`
                .lw-csv { margin: 4px 0 0; }
                .lw-csv button, .lw-csv select { font: inherit; }
                .lw-csv-drop {
                    display: grid; place-items: center; gap: 10px; text-align: center;
                    padding: 40px 20px; border: 1.5px dashed rgba(255,255,255,.18); border-radius: 14px;
                    background: rgba(255,255,255,.02); transition: border-color .12s, background .12s;
                }
                .lw-csv-drop.over { border-color: #2fd39a; background: rgba(47,211,154,.06); }
                .lw-csv-drop .big { font-size: 15px; font-weight: 700; }
                .lw-csv-drop ol { margin: 0; padding: 0; list-style: none; display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; font-size: 12px; opacity: .62; }
                .lw-csv-btn { padding: 9px 18px; border: 0; border-radius: 9px; background: #2fd39a; color: #05221a; font-weight: 700; cursor: pointer; }
                .lw-csv-btn[disabled] { opacity: .55; cursor: default; }
                .lw-csv-ghost { padding: 6px 12px; border: 1px solid rgba(255,255,255,.16); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font-size: 12.5px; }
                .lw-csv-ghost.on { background: #2fd39a; color: #05221a; border-color: #2fd39a; font-weight: 700; }
                .lw-csv-ghost[disabled] { opacity: .5; cursor: default; }
                .lw-csv-tiles { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 10px; }
                .lw-csv-tile { flex: 1 1 130px; padding: 10px 13px; border: 1px solid rgba(255,255,255,.1); border-radius: 11px; background: rgba(255,255,255,.03); }
                .lw-csv-tile em { display: block; font-style: normal; font-size: 11px; opacity: .55; margin-bottom: 3px; }
                .lw-csv-tile b { font-size: 19px; font-variant-numeric: tabular-nums; }
                .lw-csv-tile.good b { color: #2fd39a; }
                .lw-csv-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 0 0 10px; font-size: 12.5px; }
                .lw-csv-bar .grow { flex: 1; }
                .lw-csv-status { opacity: .72; font-variant-numeric: tabular-nums; }
                .lw-csv-wrap { overflow-x: auto; max-height: 560px; overflow-y: auto; border: 1px solid rgba(255,255,255,.1); border-radius: 11px; }
                .lw-csv table { width: 100%; border-collapse: collapse; font-size: 13px; }
                .lw-csv th { position: sticky; top: 0; background: #16202e; text-align: left; font-size: 11.5px; font-weight: 500; opacity: .8; padding: 9px 10px; }
                .lw-csv td { padding: 9px 10px; border-top: 1px solid rgba(255,255,255,.06); }
                .lw-csv td.r, .lw-csv th.r { text-align: right; font-variant-numeric: tabular-nums; }
                .lw-csv .seat { font-weight: 700; }
                .lw-csv .seat.open { color: #2fd39a; }
                .lw-csv .seat.semi { color: #d9b23c; }
                .lw-csv .seat.locked { color: #e0706f; }
                .lw-csv .seat.none { opacity: .45; font-weight: 400; }
                .lw-csv .up { color: #2fd39a; }
                .lw-csv .empty { padding: 18px; opacity: .55; font-size: 13px; text-align: center; }
            `}</style>

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

            {rows.length === 0 ? (
                <div
                    className={`lw-csv-drop${dragOver ? ' over' : ''}`}
                    onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(event) => {
                        event.preventDefault();
                        setDragOver(false);
                        const file = event.dataTransfer.files?.[0];
                        if (file) void onPick(file);
                    }}
                >
                    <div className="big" id="lw-csv-title">CSV 파일을 여기에 끌어다 놓으세요</div>
                    <ol>
                        <li><b>1</b> 네이버 크리에이터 어드바이저</li>
                        <li><b>2</b> 트렌드 → CSV 저장</li>
                        <li><b>3</b> 그 파일을 여기에</li>
                    </ol>
                    <button type="button" className="lw-csv-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
                        {busy ? '재는 중…' : 'CSV 고르기'}
                    </button>
                    <div style={{ fontSize: 12, opacity: .55, maxWidth: '52ch', lineHeight: 1.6 }}>
                        네이버가 주제별로 알려 준 <b>내 유입 검색어</b>입니다. 넣으면 검색량·문서수를 재고,
                        글이 적은 것부터 블로그 탭 자리를 {SEAT_CAP}개까지 잽니다.
                        더 많이 재려면 앱에서 하세요 — 앱은 내 PC 브라우저로 재기 때문에 상한이 없습니다.
                    </div>
                    {status && <div className="lw-csv-status">{status}</div>}
                </div>
            ) : (
                <>
                    <div className="lw-csv-tiles">
                        <div className="lw-csv-tile"><em>들인 검색어</em><b>{rows.length}</b></div>
                        <div className="lw-csv-tile"><em>검색량 잰 것</em><b>{measuredVolume}</b></div>
                        <div className="lw-csv-tile">
                            <em>자리 잰 것</em>
                            <b>{measuredSeat}</b>
                            {pending > 0 && <span style={{ fontSize: 11, opacity: .5 }}> · {pending}개 남음</span>}
                        </div>
                        <div className="lw-csv-tile good"><em>지금 빈자리</em><b>{openSeats}</b></div>
                    </div>

                    <div className="lw-csv-bar">
                        <button type="button" className={`lw-csv-ghost${openOnly ? ' on' : ''}`} onClick={() => setOpenOnly(true)}>빈자리만</button>
                        <button type="button" className={`lw-csv-ghost${openOnly ? '' : ' on'}`} onClick={() => setOpenOnly(false)}>전체</button>
                        {categories.length > 0 && (
                            <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="주제 고르기">
                                <option value="">주제 전체</option>
                                {categories.map((name) => <option key={name} value={name}>{name}</option>)}
                            </select>
                        )}
                        {pending > 0 && (
                            <button type="button" className="lw-csv-ghost" disabled={busy} onClick={() => void measureMore()}>
                                이어 재기 (+{SEAT_CAP})
                            </button>
                        )}
                        <span className="grow" />
                        <span className="lw-csv-status">{fileName ? `${fileName} · ` : ''}{status}</span>
                        <button type="button" className="lw-csv-ghost" disabled={busy} onClick={() => fileRef.current?.click()}>다른 CSV</button>
                    </div>

                    {shown.length === 0 ? (
                        <div className="empty">이 조건에 맞는 키워드가 없습니다. [전체] 로 바꿔 보세요.</div>
                    ) : (
                        <div className="lw-csv-wrap">
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
                </>
            )}
        </section>
    );
}
