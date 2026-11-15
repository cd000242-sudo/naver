import { useEffect, useMemo, useState } from 'react';
import SplitWords from '../components/motion/SplitWords';
import { useParams } from 'react-router-dom';
import { ShellIcon } from '../components/ShellIcons';
import { light, lightRadius, motion, type } from '../styles/tokens';
import { buildKeywordDetail, keywordSlug, isEvergreenKeyword } from '../lib/keywordDetailContent.mjs';

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
    const [publishedAt, setPublishedAt] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        fetch('/data/home-keyword-briefing-seed.json')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!alive) return;
                setRows(Array.isArray(data?.rows) ? data.rows : []);
                setPublishedAt(String(data?.publishedAt || ''));
                setLoading(false);
            })
            .catch(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    const detail = useMemo<Detail | null>(() => {
        const target = rows.find((row) => keywordSlug(row.keyword) === slug);
        return target ? buildKeywordDetail(target, rows, publishedAt) : null;
    }, [rows, slug, publishedAt]);

    // 상세 페이지가 실제로 존재하는 키워드만 링크한다. 링크 대상과 생성 대상이 갈리면 소프트 404.
    const relatedLinkable = useMemo<SeedRow[]>(
        () => (detail?.related || []).filter((row: SeedRow) => isEvergreenKeyword(row.keyword)),
        [detail],
    );

    useEffect(() => {
        if (!detail) return;
        const prev = document.title;
        document.title = `${detail.keyword} 키워드 분석 | 리더스프로`;
        return () => { document.title = prev; };
    }, [detail]);

    return (
        <section className="kw-detail" aria-labelledby="kw-detail-title">
            <style>{`
                /* Top padding clears the fixed nav bar (72px). */
                .kw-detail { padding: 120px 16px 64px; max-width: 880px; margin: 0 auto; }
                .kw-detail-panel {
                    padding: 32px; border-radius: ${lightRadius.panel}px;
                    border: 1px solid ${light.line}; background: ${light.surface}; box-shadow: ${light.shadowSm};
                }
                .kw-detail h1 {
                    margin: 0 0 12px; color: ${light.text};
                    font-size: ${type.h2}px; font-weight: 700; line-height: 1.3;
                }
                .kw-detail h2 {
                    margin: 32px 0 12px; color: ${light.text};
                    font-size: ${type.lead}px; font-weight: 600; line-height: 1.4;
                }
                .kw-detail p { margin: 0 0 12px; color: ${light.textSecondary}; font-size: ${type.body}px; line-height: 1.75; }
                .kw-detail .kw-measured-at { margin: 0 0 4px; color: ${light.textMuted}; font-size: ${type.meta}px; }
                .kw-metrics { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; margin: 16px 0 8px; }
                .kw-metric {
                    padding: 16px; border-radius: ${lightRadius.card}px;
                    border: 1px solid ${light.line}; background: ${light.raised}; text-align: right;
                }
                .kw-metric strong {
                    display: block; color: ${light.text};
                    font-size: ${type.h2}px; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums;
                }
                .kw-metric span { display: block; margin-top: 4px; color: ${light.textMuted}; font-size: ${type.meta}px; line-height: 1.45; }
                .kw-detail ol, .kw-detail ul { margin: 0; padding-left: 24px; }
                .kw-detail li { margin-bottom: 8px; color: ${light.textSecondary}; font-size: ${type.body}px; line-height: 1.7; }
                .kw-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
                .kw-links a, .kw-back, .kw-related a {
                    display: inline-flex; align-items: center; gap: 4px;
                    min-height: 44px; padding: 0 16px;
                    border: 1px solid ${light.line}; border-radius: ${lightRadius.control}px;
                    background: ${light.surface}; color: ${light.text};
                    font-size: ${type.small}px; font-weight: 500; text-decoration: none;
                    transition: background-color ${motion.fast} ${motion.ease}, border-color ${motion.fast} ${motion.ease};
                }
                .kw-links a:hover, .kw-back:hover, .kw-related a:hover { background: ${light.raised}; border-color: ${light.lineStrong}; }
                .kw-links a:focus-visible, .kw-back:focus-visible, .kw-related a:focus-visible { outline: 2px solid ${light.text}; outline-offset: 2px; }
                .kw-related { display: flex; flex-wrap: wrap; gap: 8px; }
                .kw-back { margin-top: 32px; }
                @media (max-width: 720px) {
                    .kw-detail { padding: 96px 16px 48px; }
                    .kw-detail-panel { padding: 20px 16px; }
                    .kw-metrics { grid-template-columns: 1fr; gap: 8px; }
                    .kw-metric { display: flex; flex-direction: row-reverse; align-items: baseline; justify-content: space-between; gap: 12px; padding: 12px 16px; }
                    .kw-metric strong { font-size: ${type.h3}px; }
                    .kw-metric span { margin-top: 0; text-align: left; }
                }
            `}</style>

            {!detail ? (
                <div className="kw-detail-panel">
                    <h1 id="kw-detail-title">{loading ? '키워드를 불러오는 중입니다' : '키워드를 찾을 수 없습니다'}</h1>
                    <p>{loading ? '잠시만 기다려 주세요.' : '주소가 바뀌었거나 목록에서 내려간 키워드일 수 있습니다.'}</p>
                    <a className="kw-back" href="/briefing">
                        <ShellIcon name="chevronLeft" size={16} />
                        무료 선정 황금키워드 전체 보기
                    </a>
                </div>
            ) : (
                <article className="kw-detail-panel">
                    <h1 id="kw-detail-title"><SplitWords text={detail.keyword} /></h1>
                    <p>{detail.meaning}</p>

                    {detail.measuredAt && (
                        <p className="kw-measured-at">실측 기준일: {detail.measuredAt}</p>
                    )}

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
                    <p>검색량과 문서수는 {detail.measuredAt || '검토 시점'}에 실제로 측정한 값입니다. 실시간 값이 아니라 고정 스냅샷이라, 글을 쓰기 전에 현재 상태를 한 번 더 확인하시는 편이 좋습니다.</p>

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

                    {relatedLinkable.length > 0 && (
                        <>
                            <h2>같은 브리핑의 관련 키워드</h2>
                            <div className="kw-related">
                                {relatedLinkable.map((row: SeedRow) => (
                                    <a key={row.keyword} href={`/keyword/${keywordSlug(row.keyword)}`}>{row.keyword}</a>
                                ))}
                            </div>
                        </>
                    )}

                    <a className="kw-back" href="/briefing">
                        <ShellIcon name="chevronLeft" size={16} />
                        무료 선정 황금키워드 전체 보기
                    </a>
                </article>
            )}
        </section>
    );
}

export default KeywordDetailPage;
