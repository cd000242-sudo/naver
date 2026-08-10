import { useCallback, useEffect, useState } from 'react';
import {
    fetchTrendingVideos,
    formatCount,
    type KeywordUsage,
    type TrendingVideo,
} from '../../lib/keywordApi';
import { ErrorNote, TabIntro, UsageBar } from './LewordShared';

/**
 * 유튜브 실시간 · 급상승.
 *
 * 유튜브가 직접 고른 한국 인기 목록(chart=mostPopular)을 그대로 보여 준다.
 * 순위를 우리가 다시 매기지 않는다 — 매기는 순간 유튜브 순위가 아니게 된다.
 * 조회수·좋아요·댓글수는 API 가 준 실측이다.
 */

const CATEGORIES: Array<[string, string]> = [
    ['', '전체'],
    ['25', '뉴스·정치'],
    ['24', '엔터테인먼트'],
    ['10', '음악'],
    ['20', '게임'],
    ['17', '스포츠'],
    ['26', '노하우·스타일'],
];

function relativeTime(iso: string): string {
    const time = new Date(iso).getTime();
    if (!Number.isFinite(time)) return '';
    const minutes = Math.round((Date.now() - time) / 60000);
    if (minutes < 60) return `${Math.max(1, minutes)}분 전`;
    if (minutes < 60 * 24) return `${Math.round(minutes / 60)}시간 전`;
    return `${Math.round(minutes / (60 * 24))}일 전`;
}

function YoutubeTab({ onAnalyze }: { onAnalyze: (keyword: string) => void }) {
    const [category, setCategory] = useState('');
    const [videos, setVideos] = useState<TrendingVideo[]>([]);
    const [usage, setUsage] = useState<KeywordUsage | null>(null);
    const [error, setError] = useState<{ code?: string; message?: string; missing?: string[] }>({});
    const [loading, setLoading] = useState(false);

    const load = useCallback(async (categoryId: string) => {
        setLoading(true);
        setError({});
        const response = await fetchTrendingVideos(categoryId);
        setLoading(false);
        if (response.usage) setUsage(response.usage);
        if (response.ok && response.data) {
            setVideos(response.data.items || []);
            return;
        }
        setVideos([]);
        setError({ code: response.error, message: response.message, missing: response.missing });
    }, []);

    useEffect(() => { load(category); }, [category, load]);

    return (
        <>
            <TabIntro
                title="유튜브 실시간 · 급상승"
                desc="유튜브가 고른 한국 인기 영상 목록입니다. 지금 사람들이 무엇을 보고 있는지 그대로 보여 줍니다."
                source="YouTube Data API · chart=mostPopular (regionCode=KR)"
            />

            <div className="lw-toolbar">
                <div className="lw-segment lw-segment-wrap" role="group" aria-label="카테고리">
                    {CATEGORIES.map(([id, label]) => (
                        <button
                            key={id || 'all'}
                            type="button"
                            className={category === id ? 'on' : ''}
                            onClick={() => setCategory(id)}
                        >{label}</button>
                    ))}
                </div>
                <span className="lw-count">{loading ? '불러오는 중…' : `${videos.length}개`}</span>
            </div>

            <UsageBar usage={usage} />
            <ErrorNote error={error.code} message={error.message} missing={error.missing} />

            <div className="lw-grid lw-grid-video">
                {videos.map((video) => (
                    <article key={video.videoId} className="lw-card lw-card-video">
                        <a
                            className="lw-video-thumb"
                            href={`https://www.youtube.com/watch?v=${video.videoId}`}
                            target="_blank"
                            rel="noreferrer"
                        >
                            {video.thumbnail
                                ? <img src={video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
                                : <span className="lw-video-noimg" aria-hidden="true" />}
                            <span className="lw-video-rank">{video.rank}</span>
                        </a>
                        <h3>{video.title}</h3>
                        <p className="lw-card-note">{video.channel} · {relativeTime(video.publishedAt)}</p>
                        <div className="lw-card-metrics">
                            <div><span>조회수</span><strong>{formatCount(video.viewCount)}</strong></div>
                            <div><span>좋아요</span><strong>{formatCount(video.likeCount)}</strong></div>
                            <div><span>댓글</span><strong>{formatCount(video.commentCount)}</strong></div>
                        </div>
                        <div className="lw-card-actions">
                            {/* 영상 제목을 그대로 키워드로 넘기지 않는다. 제목은 문장이라
                                검색어가 아니다. 채널명·제목 앞부분만 사용자가 고쳐 쓰게 한다. */}
                            <button type="button" onClick={() => onAnalyze(video.title.split(/[|\-–—[\]()]/)[0].trim().slice(0, 25))}>
                                제목으로 키워드 분석
                            </button>
                        </div>
                    </article>
                ))}
            </div>

            {!loading && videos.length === 0 && !error.code && (
                <div className="lw-note">표시할 영상이 없습니다.</div>
            )}
        </>
    );
}

export default YoutubeTab;
