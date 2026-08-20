import { useEffect, useState } from 'react';
import { fetchKeywordPostIdeas, formatCount, type KinPostIdea } from '../../lib/keywordApi';
import { TabIntro } from './LewordShared';

/**
 * 유튜브 급상승 → 네이버 빈자리.
 *
 * 예전 이 탭은 유튜브 인기 목록을 그대로 다시 보여 줬다. 유튜브 앱을 켜면
 * 똑같은 걸 본다 — 우리가 낼 값이 없었다(사장님 판정 2026-08-20).
 *
 * 지금은 한 줄이 셋으로 나뉜다(사장님 지정 배치):
 *   좌  영상 — 눌러서 그 자리에서 본다
 *   중  검색어와 실측 — 검색량·문서수·부족 배수, 어느 영상에서 나왔는지, 날짜
 *   우  이 검색어로 쓸 수 있는 것 — 확장 검색어와 키워드마다의 제목
 *
 * 확장 검색어는 수집 때 네이버 자동완성으로 실측한 값이고, 제목만 누를 때
 * 구독 엔진으로 만든다. 화면에서 계산하는 숫자는 없다.
 */

type GapRow = {
    keyword: string;
    expansions?: string[];
    searchVolume: number;
    documentCount: number;
    ratio: number;
    video: {
        videoId: string; title: string; channel: string;
        thumbnail: string; viewCount: number | null; publishedAt: string;
    };
};

type GapData = {
    collectedAt: string;
    videoCount: number;
    candidateCount: number;
    gate: { minVolume: number; maxDocs: number; minRatio: number };
    rows: GapRow[];
};

type IdeaState = { status: 'idle' | 'loading' | 'done' | 'error'; ideas?: KinPostIdea[]; message?: string };

function agoText(iso: string, suffix: string): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return '';
    const minutes = Math.round((Date.now() - at.getTime()) / 60000);
    if (minutes < 1) return `방금 ${suffix}`;
    if (minutes < 60) return `${minutes}분 전 ${suffix}`;
    if (minutes < 60 * 24) return `${Math.round(minutes / 60)}시간 전 ${suffix}`;
    return `${Math.round(minutes / (60 * 24))}일 전 ${suffix}`;
}

/** 영상 날짜는 그대로 적는다 — "3일 전" 만으로는 언제 터진 건지 모른다. */
function dateText(iso: string): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return '';
    return at.toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });
}

function YoutubeTab({ onAnalyze }: { onAnalyze: (keyword: string) => void }) {
    const [data, setData] = useState<GapData | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    /** 지금 재생 중인 카드. 60개를 한꺼번에 띄우면 화면이 죽는다 — 누른 하나만 iframe 이 된다. */
    const [playing, setPlaying] = useState('');
    const [ideas, setIdeas] = useState<Record<string, IdeaState>>({});

    useEffect(() => {
        let cancelled = false;
        fetch('/data/youtube-gap.json')
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
            .then((json) => { if (!cancelled) { setData(json); setStatus('ready'); } })
            .catch(() => { if (!cancelled) setStatus('error'); });
        return () => { cancelled = true; };
    }, []);

    const makeIdeas = async (row: GapRow) => {
        if (ideas[row.keyword]?.status === 'loading') return;
        setIdeas((previous) => ({ ...previous, [row.keyword]: { status: 'loading' } }));
        const result = await fetchKeywordPostIdeas(row.keyword, row.video.title);
        setIdeas((previous) => ({
            ...previous,
            [row.keyword]: result.ok && result.data
                ? { status: 'done', ideas: result.data.ideas }
                : { status: 'error', message: result.message || result.error || '만들지 못했습니다.' },
        }));
    };

    const rows = data?.rows || [];

    return (
        <>
            <TabIntro
                title="유튜브 급상승 → 네이버 빈자리"
                desc="지금 유튜브에서 터지는 중인데 네이버엔 아직 글이 없는 검색어입니다. 영상 제목을 자른 게 아니라, 네이버 자동완성이 인정한 실제 검색어만 싣습니다."
                source="유튜브 급상승 + 네이버 자동완성·검색량·문서수 실측"
            />

            <div className="lw-toolbar">
                <span className="lw-count">
                    {status === 'loading' ? '불러오는 중…' : `빈자리 ${rows.length}건`}
                </span>
                {data && (
                    <span className="lw-yt-meta">
                        급상승 {data.videoCount}편에서 검색어 {data.candidateCount}개 실측 · {agoText(data.collectedAt, '수집')}
                    </span>
                )}
            </div>

            {status === 'error' && (
                <div className="lw-note">
                    <strong>아직 수집분이 없습니다.</strong>
                    <p>15분마다 도는 수집이 한 번 돌면 채워집니다.</p>
                </div>
            )}

            {status === 'ready' && rows.length === 0 && (
                <div className="lw-note">
                    <strong>이번 회차엔 빈자리가 없었습니다.</strong>
                    <p>
                        급상승 검색어가 전부 이미 글이 많다는 뜻입니다
                        (기준: 검색량 {data?.gate.minVolume}+ · 문서수 {data?.gate.maxDocs}↓).
                    </p>
                </div>
            )}

            <div className="lw-yt-gap">
                {rows.map((row) => {
                    const idea = ideas[row.keyword];
                    return (
                        <article key={row.keyword} className="lw-yt-row">
                            <div className="lw-yt-video">
                                {playing === row.video.videoId ? (
                                    <iframe
                                        src={`https://www.youtube-nocookie.com/embed/${row.video.videoId}?autoplay=1`}
                                        title={row.video.title}
                                        allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                                        allowFullScreen
                                    />
                                ) : (
                                    <button type="button" onClick={() => setPlaying(row.video.videoId)} aria-label={`${row.video.title} 재생`}>
                                        {row.video.thumbnail
                                            ? <img src={row.video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
                                            : <span className="lw-video-noimg" aria-hidden="true" />}
                                        <span className="lw-yt-play" aria-hidden="true">▶</span>
                                    </button>
                                )}
                            </div>

                            <div className="lw-yt-body">
                                <h3>{row.keyword}</h3>
                                <div className="lw-yt-metrics">
                                    <span>검색량 <strong>{formatCount(row.searchVolume)}</strong></span>
                                    <span>문서수 <strong>{formatCount(row.documentCount)}</strong></span>
                                    {/* 비율은 나눗셈 하나다 — 점수가 아니다. 클수록 자리가 넓다. */}
                                    <span className="lw-yt-ratio">검색 대비 글 <strong>{row.ratio}배 부족</strong></span>
                                </div>
                                <p className="lw-yt-from">
                                    {row.video.channel} · 조회 {formatCount(row.video.viewCount)} · {row.video.title}
                                </p>
                                <p className="lw-yt-date">
                                    영상 날짜 {dateText(row.video.publishedAt)}
                                    <span> · {agoText(row.video.publishedAt, '업로드')}</span>
                                </p>
                                <button type="button" className="lw-yt-analyze" onClick={() => onAnalyze(row.keyword)}>
                                    키워드 분석
                                </button>
                            </div>

                            <div className="lw-yt-write">
                                <h4>이 키워드로 쓸 수 있는 것</h4>
                                {(row.expansions || []).length > 0 && (
                                    <div className="lw-yt-chips">
                                        {(row.expansions || []).map((expansion) => (
                                            <button key={expansion} type="button" onClick={() => onAnalyze(expansion)} title="이 검색어 분석하기">
                                                {expansion}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {!idea && (
                                    <button type="button" className="lw-yt-make" onClick={() => makeIdeas(row)}>
                                        제목 만들기
                                    </button>
                                )}
                                {idea?.status === 'loading' && <p className="lw-yt-hint">만드는 중…</p>}
                                {idea?.status === 'error' && (
                                    <>
                                        <p className="lw-yt-err">{idea.message}</p>
                                        <button type="button" className="lw-yt-make" onClick={() => makeIdeas(row)}>다시</button>
                                    </>
                                )}
                                {idea?.status === 'done' && (
                                    <ul className="lw-yt-ideas">
                                        {(idea.ideas || []).map((item) => (
                                            <li key={item.keyword}>
                                                <button type="button" className="lw-yt-ideakey" onClick={() => onAnalyze(item.keyword)}>
                                                    {item.keyword}
                                                </button>
                                                <p><em>SEO</em> {item.seo}</p>
                                                <p><em>홈판</em> {item.home}</p>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </article>
                    );
                })}
            </div>
        </>
    );
}

export default YoutubeTab;
