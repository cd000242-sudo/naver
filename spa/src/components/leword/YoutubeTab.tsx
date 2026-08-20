import { useEffect, useState } from 'react';
import { formatCount } from '../../lib/keywordApi';
import { TabIntro } from './LewordShared';

/**
 * 유튜브 급상승 → 네이버 빈자리.
 *
 * 예전 이 탭은 유튜브 인기 목록을 그대로 다시 보여 줬다. 유튜브 앱을 켜면
 * 똑같은 걸 본다 — 우리가 낼 값이 없었다(사장님 판정 2026-08-20).
 *
 * 지금은 영상이 아니라 **글감**을 준다. 급상승 영상 제목에서 네이버 자동완성이
 * 인정한 실제 검색어를 뽑고, 그 검색량·문서수를 실측해 "찾는 사람은 있는데
 * 글이 없는" 것만 남긴다. 수집은 15분 크론(scripts/youtube-gap.mjs)이 한다.
 *
 * 화면에서 계산하는 값은 없다. 전부 수집 때 잰 실측이다.
 */

type GapRow = {
    keyword: string;
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

function collectedText(iso: string): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return '';
    const minutes = Math.round((Date.now() - at.getTime()) / 60000);
    if (minutes < 1) return '방금 수집';
    if (minutes < 60) return `${minutes}분 전 수집`;
    if (minutes < 60 * 24) return `${Math.round(minutes / 60)}시간 전 수집`;
    return `${Math.round(minutes / (60 * 24))}일 전 수집`;
}

function YoutubeTab({ onAnalyze }: { onAnalyze: (keyword: string) => void }) {
    const [data, setData] = useState<GapData | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

    useEffect(() => {
        let cancelled = false;
        fetch('/data/youtube-gap.json')
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
            .then((json) => { if (!cancelled) { setData(json); setStatus('ready'); } })
            .catch(() => { if (!cancelled) setStatus('error'); });
        return () => { cancelled = true; };
    }, []);

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
                        급상승 {data.videoCount}편에서 검색어 {data.candidateCount}개 실측 · {collectedText(data.collectedAt)}
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
                {rows.map((row) => (
                    <article key={row.keyword} className="lw-card lw-yt-row">
                        <a
                            className="lw-yt-thumb"
                            href={`https://www.youtube.com/watch?v=${row.video.videoId}`}
                            target="_blank"
                            rel="noreferrer"
                            title={row.video.title}
                        >
                            {row.video.thumbnail
                                ? <img src={row.video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
                                : <span className="lw-video-noimg" aria-hidden="true" />}
                        </a>
                        <div className="lw-yt-body">
                            <h3>{row.keyword}</h3>
                            <div className="lw-yt-metrics">
                                <span>검색량 <strong>{formatCount(row.searchVolume)}</strong></span>
                                <span>문서수 <strong>{formatCount(row.documentCount)}</strong></span>
                                {/* 비율은 나눗셈 하나다 — 점수가 아니다. 클수록 자리가 넓다. */}
                                <span className="lw-yt-ratio">검색 대비 글 <strong>{row.ratio}배 부족</strong></span>
                            </div>
                            <p className="lw-card-note">
                                {row.video.channel} · 조회 {formatCount(row.video.viewCount)} · {row.video.title}
                            </p>
                        </div>
                        <div className="lw-yt-actions">
                            <button type="button" onClick={() => onAnalyze(row.keyword)}>키워드 분석</button>
                        </div>
                    </article>
                ))}
            </div>
        </>
    );
}

export default YoutubeTab;
