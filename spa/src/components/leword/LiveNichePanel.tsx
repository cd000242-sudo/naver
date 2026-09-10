import { useMemo, useState } from 'react';
import { fetchKeywordDocs, fetchKeywordFrontal, fetchKeywordVolumes } from '../../lib/keywordApi';
import { countFacing, seatFromFacing, volumeKey, type TrendSeat } from '../../lib/trendCsv';

/**
 * 지금 실시간 바로 재기 — 실검 틈새 탭.
 *
 * 사장님 2026-09-10 "이것도 수정해줘야지 실시간이라고".
 *
 * 무엇이 어긋났나: 맨 위 '지금 실시간' 줄은 5분마다 새로 받아 진짜 지금 것이다. 그런데 아래
 * 카드는 하루 3회 배치 결과라 최대 8시간(예약이 밀리면 그 이상) 낡는다. 화면 이름은 '실시간'인데
 * 판정은 실시간이 아니었다.
 *
 * 그래서 이 줄을 둔다 — **지금 목록에 올라와 있는 검색어를 그 자리에서 재는** 판이다.
 * 배치 카드는 그대로 둔다(근거·브리핑이 붙어 있어 값이 다르다). 이건 그 위에 얹는 즉석 판정이다.
 *
 * 재는 것은 배치와 같다: 검색량 · 문서수 · 정면 글(실제 블로그 탭 상위 10 제목).
 * 다른 건 시점뿐이다. 워커 한도(실측)에 맞춰 정면 글은 12개씩 나눠 부른다.
 */

const FRONTAL_CHUNK = 12;
/** 한 번에 잴 상한. 실시간 목록이 보통 10~20개라 넉넉하다. 워커 주소는 모두가 같이 쓴다. */
const MAX = 20;

const SEAT_ORDER: Record<TrendSeat, number> = { '열림': 0, '반열림': 1, '잠김': 2, '안 잼': 3 };
const SEAT_CLASS: Record<TrendSeat, string> = { '열림': 'open', '반열림': 'semi', '잠김': 'locked', '안 잼': 'none' };

interface Row {
    rank: number;
    keyword: string;
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

export default function LiveNichePanel({ items }: { items: Array<{ rank: number; keyword: string }> }) {
    const [rows, setRows] = useState<Row[]>([]);
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
    const [measuredAt, setMeasuredAt] = useState<string>('');

    const targets = useMemo(() => items.slice(0, MAX), [items]);

    const shown = useMemo(
        () => [...rows].sort((a, b) => {
            const gap = SEAT_ORDER[seatFromFacing(a.facing)] - SEAT_ORDER[seatFromFacing(b.facing)];
            return gap !== 0 ? gap : a.rank - b.rank;
        }),
        [rows],
    );
    const open = rows.filter((row) => seatFromFacing(row.facing) === '열림').length;

    /** 검색량 → 문서수 → 정면 글. 단계마다 표를 다시 그린다. 실패한 묶음은 건너뛰고 계속한다. */
    const measure = async () => {
        if (targets.length === 0) return;
        setBusy(true);
        try {
            let working: Row[] = targets.map((item) => ({
                rank: item.rank, keyword: item.keyword, searchVolume: null, documentCount: null, facing: null,
            }));
            setRows(working);
            const keywords = working.map((row) => row.keyword);

            setStatus('검색량 재는 중…');
            const volumeRes = await fetchKeywordVolumes(keywords).catch(() => null);
            // 워커는 띄어쓰기를 없앤 키로 돌려준다 — 원래 키워드로 찾으면 전부 빈 값이 된다.
            const volumes = volumeRes?.ok ? volumeRes.data?.volumes || {} : {};
            if (volumeRes && !volumeRes.ok) setStatus('검색량을 못 잽니다 — 내 API 키 탭에서 검색광고 키를 넣어 주세요.');
            working = working.map((row) => (volumes[volumeKey(row.keyword)] === undefined
                ? row : { ...row, searchVolume: Number(volumes[volumeKey(row.keyword)]) }));
            setRows(working);

            setStatus('문서수 재는 중…');
            const docRes = await fetchKeywordDocs(keywords).catch(() => null);
            const docs = docRes?.ok ? docRes.data?.docs || {} : {};
            working = working.map((row) => (docs[row.keyword] === undefined
                ? row : { ...row, documentCount: Number(docs[row.keyword]) }));
            setRows(working);

            let done = 0;
            for (const part of chunk(keywords, FRONTAL_CHUNK)) {
                setStatus(`자리 재는 중… ${done}/${keywords.length}`);
                const res = await fetchKeywordFrontal(part).catch(() => null);
                const titles = res?.ok ? res.data?.titles || {} : {};
                working = working.map((row) => (part.includes(row.keyword)
                    ? { ...row, facing: countFacing(titles[row.keyword], row.keyword) } : row));
                done += part.length;
                setRows(working);
            }
            const opened = working.filter((row) => seatFromFacing(row.facing) === '열림').length;
            setMeasuredAt(new Date().toLocaleTimeString('ko-KR'));
            setStatus(opened > 0
                ? `끝 — ${keywords.length}개 중 자리가 빈 것 ${opened}개`
                : `끝 — ${keywords.length}개 모두 상위 10에 정면 글이 있습니다.`);
        } catch (cause: unknown) {
            setStatus(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="lw-livenc" aria-labelledby="lw-livenc-title">
            <style>{`
                .lw-livenc { margin: 12px 0 16px; border: 1px solid rgba(255,255,255,.1); border-radius: 12px; padding: 13px 15px; background: rgba(255,255,255,.03); }
                .lw-livenc-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
                .lw-livenc-head h3 { margin: 0; font-size: 15px; }
                .lw-livenc-btn { padding: 7px 13px; border: 0; border-radius: 8px; background: #2fd39a; color: #05221a; font: inherit; font-weight: 700; cursor: pointer; }
                .lw-livenc-btn[disabled] { opacity: .55; cursor: default; }
                .lw-livenc-status { font-size: 12.5px; opacity: .75; font-variant-numeric: tabular-nums; }
                .lw-livenc-note { margin: 6px 0 0; font-size: 12px; opacity: .6; line-height: 1.6; }
                .lw-livenc table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px; }
                .lw-livenc th { text-align: left; font-size: 11.5px; font-weight: 500; opacity: .7; padding: 7px 9px; border-bottom: 1px solid rgba(255,255,255,.1); }
                .lw-livenc td { padding: 8px 9px; border-top: 1px solid rgba(255,255,255,.06); }
                .lw-livenc td.r, .lw-livenc th.r { text-align: right; font-variant-numeric: tabular-nums; }
                .lw-livenc .seat { font-weight: 700; }
                .lw-livenc .seat.open { color: #2fd39a; }
                .lw-livenc .seat.semi { color: #d9b23c; }
                .lw-livenc .seat.locked { color: #e0706f; }
                .lw-livenc .seat.none { opacity: .45; font-weight: 400; }
            `}</style>

            <div className="lw-livenc-head">
                <h3 id="lw-livenc-title">⚡ 지금 실시간 바로 재기</h3>
                <span style={{ flex: 1 }} />
                <span className="lw-livenc-status">
                    {status || `위 목록 ${targets.length}개를 이 자리에서 잽니다.`}
                    {measuredAt ? ` · ${measuredAt} 잼` : ''}
                    {rows.length > 0 && !busy ? ` · 빈자리 ${open}` : ''}
                </span>
                <button type="button" className="lw-livenc-btn" disabled={busy || targets.length === 0} onClick={() => void measure()}>
                    {busy ? '재는 중…' : '지금 재기'}
                </button>
            </div>
            <p className="lw-livenc-note">
                아래 카드는 하루 3회 회차 결과라 최대 여덟 시간 낡습니다. 이 줄은 <b>지금 목록에 올라와 있는 검색어</b>를
                그 자리에서 재는 판입니다. 재는 항목은 회차와 같습니다 — 검색량 · 문서수 · 블로그 탭 상위 10 정면 글.
                자리가 비었다는 것은 상위 10에 이 검색어로 정면 답한 글이 없다는 사실이고, 상위노출을 약속하지 않습니다.
            </p>

            {shown.length > 0 && (
                <table>
                    <thead>
                        <tr>
                            <th className="r" style={{ width: 44 }}>순위</th>
                            <th>검색어</th>
                            <th className="r" style={{ width: 96 }}>검색량</th>
                            <th className="r" style={{ width: 96 }}>문서수</th>
                            <th style={{ width: 130 }}>자리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((row) => {
                            const seat = seatFromFacing(row.facing);
                            return (
                                <tr key={row.keyword}>
                                    <td className="r" style={{ opacity: .6 }}>{row.rank}</td>
                                    <td><b>{row.keyword}</b></td>
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
            )}
        </section>
    );
}
