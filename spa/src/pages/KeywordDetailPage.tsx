import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { buildKeywordDetail, keywordSlug } from '../lib/keywordDetailContent.mjs';

type SeedRow = { keyword: string; searchVolume: number; documentCount: number; opportunity: number };
type Detail = ReturnType<typeof buildKeywordDetail>;

const numberFormatter = new Intl.NumberFormat('ko-KR');

function searchUrl(keyword: string, provider: 'naver' | 'daum' | 'google'): string {
    const q = encodeURIComponent(keyword);
    if (provider === 'daum') return `https://search.daum.net/search?w=tot&q=${q}`;
    if (provider === 'google') return `https://www.google.com/search?q=${q}`;
    return `https://search.naver.com/search.naver?query=${q}`;
}

function KeywordDetailPage() {
    const { slug = '' } = useParams();
    const [rows, setRows] = useState<SeedRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        fetch('/data/home-keyword-briefing-seed.json')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!alive) return;
                setRows(Array.isArray(data?.rows) ? data.rows : []);
                setLoading(false);
            })
            .catch(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    const detail = useMemo<Detail | null>(() => {
        const target = rows.find((row) => keywordSlug(row.keyword) === slug);
        return target ? buildKeywordDetail(target, rows) : null;
    }, [rows, slug]);

    useEffect(() => {
        if (!detail) return;
        const prev = document.title;
        document.title = `${detail.keyword} 키워드 분석 | 리더스프로`;
        return () => { document.title = prev; };
    }, [detail]);

    return (
        <section className="kw-detail" aria-labelledby="kw-detail-title">
            <style>{`
                .kw-detail { padding: 104px 16px 56px; max-width: 880px; margin: 0 auto; }
                .kw-detail-panel {
                    padding: 22px; border-radius: 16px;
                    border: 1px solid rgba(255,255,255,.12);
                    background: rgba(8,12,20,.62); backdrop-filter: blur(6px);
                }
                .kw-detail h1 { font-size: 27px; line-height: 1.34; margin: 0 0 10px; }
                .kw-detail h2 { font-size: 17px; margin: 26px 0 10px; color: #63efd0; }
                .kw-detail p { margin: 0 0 10px; font-size: 15px; line-height: 1.75; color: rgba(255,255,255,.86); }
                .kw-metrics { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; margin: 16px 0 6px; }
                .kw-metric { padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.04); }
                .kw-metric strong { display: block; font-size: 20px; font-weight: 900; }
                .kw-metric span { font-size: 12px; opacity: .7; }
                .kw-detail ol, .kw-detail ul { margin: 0; padding-left: 20px; }
                .kw-detail li { margin-bottom: 8px; font-size: 15px; line-height: 1.7; color: rgba(255,255,255,.86); }
                .kw-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
                .kw-links a, .kw-back {
                    display: inline-block; padding: 8px 14px; border-radius: 999px; font-size: 13px;
                    font-weight: 700; text-decoration: none; border: 1px solid rgba(255,255,255,.18);
                    color: rgba(255,255,255,.9);
                }
                .kw-links a:hover, .kw-back:hover { border-color: rgba(105,183,255,.6); }
                .kw-related { display: flex; flex-wrap: wrap; gap: 8px; }
                .kw-related a { font-size: 13px; padding: 7px 12px; border-radius: 10px; text-decoration: none;
                    border: 1px solid rgba(244,201,93,.35); background: rgba(244,201,93,.08); color: #f4c95d; }
                .kw-back { margin-top: 22px; }
                @media (max-width: 720px) {
                    .kw-detail { padding: 92px 12px 44px; }
                    .kw-detail h1 { font-size: 22px; }
                    .kw-metrics { grid-template-columns: 1fr; }
                }
            `}</style>

            {!detail ? (
                <div className="kw-detail-panel">
                    <h1 id="kw-detail-title">{loading ? '키워드를 불러오는 중입니다' : '키워드를 찾을 수 없습니다'}</h1>
                    <p>{loading ? '잠시만 기다려 주세요.' : '주소가 바뀌었거나 목록에서 내려간 키워드일 수 있습니다.'}</p>
                    <a className="kw-back" href="/briefing">← 무료 선정 황금키워드 전체 보기</a>
                </div>
            ) : (
                <article className="kw-detail-panel">
                    <h1 id="kw-detail-title">{detail.keyword}</h1>
                    <p>{detail.meaning}</p>

                    <div className="kw-metrics">
                        <div className="kw-metric">
                            <strong>{detail.volume === null ? '-' : numberFormatter.format(detail.volume)}</strong>
                            <span>월 검색량 (실측)</span>
                        </div>
                        <div className="kw-metric">
                            <strong>{detail.documents === null ? '-' : numberFormatter.format(detail.documents)}</strong>
                            <span>관련 문서수 (실측)</span>
                        </div>
                        <div className="kw-metric">
                            <strong>{detail.opportunity === null ? '-' : detail.opportunity.toFixed(1)}</strong>
                            <span>기회지수 = 검색량 ÷ (문서수+1)</span>
                        </div>
                    </div>

                    <h2>지금 이 키워드의 경쟁 상황</h2>
                    <p>{detail.competition}</p>
                    <p>검색량과 문서수는 검토 시점에 실제로 측정한 값입니다. 실시간 값이 아니라 고정 스냅샷이라, 글을 쓰기 전에 현재 상태를 한 번 더 확인하시는 편이 좋습니다.</p>

                    <h2>글에 넣어야 할 것</h2>
                    <ol>
                        {detail.outline.map((item: string) => <li key={item}>{item}</li>)}
                    </ol>

                    <h2>직접 확인해 보기</h2>
                    <div className="kw-links">
                        <a href={searchUrl(detail.keyword, 'naver')} target="_blank" rel="noopener noreferrer">네이버에서 검색</a>
                        <a href={searchUrl(detail.keyword, 'daum')} target="_blank" rel="noopener noreferrer">다음에서 검색</a>
                        <a href={searchUrl(detail.keyword, 'google')} target="_blank" rel="noopener noreferrer">구글에서 검색</a>
                    </div>

                    {detail.related.length > 0 && (
                        <>
                            <h2>같은 브리핑의 관련 키워드</h2>
                            <div className="kw-related">
                                {detail.related.map((row: SeedRow) => (
                                    <a key={row.keyword} href={`/keyword/${keywordSlug(row.keyword)}`}>{row.keyword}</a>
                                ))}
                            </div>
                        </>
                    )}

                    <a className="kw-back" href="/briefing">← 무료 선정 황금키워드 전체 보기</a>
                </article>
            )}
        </section>
    );
}

export default KeywordDetailPage;
