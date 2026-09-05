import { useEffect, useRef, useState } from 'react';
import { groupByIntent } from '../lib/intentGroups';
import { ISSUE_TYPE_LABEL, findIssueBrief, loadIssueBoardOnce, type IssueBrief } from '../lib/issueFlow';
import { formatCount } from '../lib/keywordApi';
import { isUnlocked } from './leword/LicenseGate';
import {
    buildSourceSearchUrl,
    cleanLiveText, trimToCompleteSentence,
    type SourceLane,
    type SourceSignal,
} from '../lib/sourceSignalTypes';

/**
 * 실시간 검색어 기사 브리프 — 화면 중앙 큰 모달.
 *
 * 우측 패널은 목록 옆에 끼어 있어서 사진이 작고 사실 문장이 두 줄에서 잘렸다.
 * 정작 이 화면의 값어치는 "기사에 뭐라고 쓰여 있나"와 "출처가 어디인가"인데
 * 그걸 읽으려면 눈을 찌푸려야 했다. 그래서 카드를 누르면 크게 편다.
 *
 * 여기서 새로 만드는 문장은 없다. facts 는 기사 원문 그대로이고, 제목·주제는
 * 배치가 계산해 스냅샷에 담아 준 값을 그대로 보여준다.
 *
 * 이슈 흐름(2026-09-03, 사장님: "실시간 검색어 브릿지가 너무 빈약해"): 실검 틈새
 * 회차(하루 3회 CI)가 실측·추론해 발행한 "왜 뜨나 · 몰린 말 · 다음 물결"을 이
 * 검색어의 이슈 묶음에서 찾아 붙인다. 못 찾으면 구획 자체가 없다.
 */

/** 비로그인에게 보이는 다음 물결 수 — 실검 틈새 탭의 무료 3건과 같은 눈금. */
const FREE_WAVE_CHIPS = 3;

/**
 * 기사 발행 시각 → "N분 전 기사 기준". 실검은 선점 싸움이라(사장님 2026-09-06
 * "최신이 관건") 브리프가 언제 기사를 근거로 하는지 그대로 밝힌다. 못 읽으면 빈 문자열.
 */
function articleAgoLabel(iso?: string): string {
    if (!iso) return '';
    const at = Date.parse(iso);
    if (!Number.isFinite(at)) return '';
    const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
    if (minutes < 1) return '방금 나온 기사 기준';
    if (minutes < 60) return `${minutes}분 전 기사 기준`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전 기사 기준`;
    return `${Math.floor(hours / 24)}일 전 기사 기준`;
}

type Props = {
    lane: SourceLane;
    item: SourceSignal;
    onClose: () => void;
};

function SourceBriefModal({ lane, item, onClose }: Props) {
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);

    const keyword = cleanLiveText(item.keyword || item.title, lane.label);
    /*
     * 출처가 잘라서 준 요약을 그대로 띄우면 '...' 로 끝나 대충 만든 화면이 된다.
     * 온전한 문장이 안 나오면 제목으로 간다 — 제목은 항상 완결돼 있다.
     */
    const description = trimToCompleteSentence(cleanLiveText(item.description, ''))
        || cleanLiveText(item.title, lane.description);
    const searchUrl = buildSourceSearchUrl(lane.id, keyword);
    const rank = Math.max(1, Number(item.rank) || (101 - Number(item.priority || 100)));

    /*
     * 크롤링해 온 바로 그 기사 주소. 사장님(2026-08-19): "원문 기사 보러가기 —
     * 기사로 바로 갈 수 있게 해달라니까." 수집기가 oid/aid 로 조립해 실어 준
     * 좌표(item.articleUrl)가 있는데 모달이 안 쓰고 있었다 — 출처 목록은
     * 브리핑의 links 만 보고 있었다.
     */
    const articleUrl = String(item.articleUrl || '').trim();
    const brief = item.insight;
    const facts = brief?.facts || [];
    const links = (brief?.links || []).slice(0, 6);
    // 사진은 최신 기사 것부터 최대 3장 — 첫 장을 크게, 나머지는 아래 줄에.
    const photos = (brief?.images || []).filter(Boolean).slice(0, 3);
    if (photos.length === 0 && item.image) photos.push(item.image);
    const freshness = articleAgoLabel(brief?.latestArticleAt);
    const titles = brief?.titles || {};
    // 에이전트가 지은 두 문장 요약(있을 때만). 없으면 기존처럼 원문 문장만 보인다.
    const summary = typeof (titles as { summary?: string }).summary === 'string'
        ? (titles as { summary?: string }).summary
        : '';
    const expansions = (item.expansions || []).slice(0, 12);

    // 실검 틈새 회차의 이슈 묶음. 페이지에 한 번만 받고, 검색어가 바뀌면 다시 찾는다.
    const [flow, setFlow] = useState<IssueBrief | null>(null);
    useEffect(() => {
        let alive = true;
        loadIssueBoardOnce().then((board) => {
            if (alive) setFlow(findIssueBrief(board, keyword));
        });
        return () => { alive = false; };
    }, [keyword]);
    const unlocked = isUnlocked();
    const waveAll = flow?.nextWave || [];
    const wave = unlocked ? waveAll : waveAll.slice(0, FREE_WAVE_CHIPS);
    const waveHidden = waveAll.length - wave.length;

    // ESC 로 닫고, 열려 있는 동안 뒤 화면은 스크롤되지 않게 한다.
    // 모달 뒤가 같이 굴러가면 닫았을 때 보던 자리를 잃는다.
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        const previousOverflow = document.body.style.overflow;
        const previousFocus = document.activeElement as HTMLElement | null;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', onKeyDown);
        closeButtonRef.current?.focus();
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus?.();
        };
    }, [onClose]);

    return (
        <div
            className="brief-modal-backdrop"
            role="presentation"
            onClick={(event) => {
                // 내용 안을 눌렀을 때는 닫지 않는다. 텍스트를 드래그해 복사하는
                // 도중 손을 떼면 닫혀 버리는 걸 막는다.
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                ref={dialogRef}
                className="brief-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="brief-modal-keyword"
                style={{ borderColor: lane.accent + '55' }}
            >
                <header className="brief-modal-head">
                    <div>
                        <span className="brief-modal-lane" style={{ color: lane.accent, borderColor: lane.accent + '55' }}>
                            {lane.label} {rank}위{item.ago ? ` · ${item.ago}` : ''}
                        </span>
                        <h2 id="brief-modal-keyword">{keyword}</h2>
                        <p>{description}</p>
                    </div>
                    <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="닫기">✕</button>
                </header>

                <div className="brief-modal-body">
                    {facts.length > 0 ? (
                        <section className="brief-modal-facts" aria-label={`${keyword} 관련 보도 사진`}>
                            <div className="brief-modal-section-head">
                                <strong>무슨 일이 있었나</strong>
                                <small>{freshness || '기사 대표 사진 — 원본 그대로'}</small>
                            </div>
                            {/*
                              사진이 이 칸의 주인공이다(사장님 2026-09-06 "이미지 안 짤리게").
                              전부 contain 으로 원본 비율을 지킨다 — cover 로 자르면 얼굴·자막이
                              잘린다. 요약 문장은 우측 '핵심 요약'으로 옮겼다(사장님 "요약문도 우측에").
                            */}
                            {summary && <p className="brief-modal-summary">{summary}</p>}
                            {photos.map((src) => (
                                <img
                                    key={src}
                                    src={src}
                                    alt={`${keyword} 관련 보도 사진`}
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                />
                            ))}
                        </section>
                    ) : (
                        <section className="brief-modal-facts brief-modal-empty">
                            <div className="brief-modal-section-head">
                                <strong>직접 수집 확인</strong>
                                <small>{lane.label} 실시간 목록에서 수집한 검색 신호입니다</small>
                            </div>
                            <p>
                                관련 보도가 자동 매칭될 때만 기사 브리프가 함께 붙습니다.
                                지금은 아래 원본 검색으로 직접 확인해 주세요.
                            </p>
                        </section>
                    )}

                    <aside className="brief-modal-side">
                        {/* 핵심 요약 — 왼쪽 사진 옆 우측에(사장님 2026-09-06 "요약문도 우측에"). 전부 기사 원문 문장. */}
                        {facts.length > 0 && (
                            <section aria-label={`${keyword} 핵심 요약`}>
                                <div className="brief-modal-section-head">
                                    <strong>핵심 요약</strong>
                                    <small>기사 원문에서 확인된 문장</small>
                                </div>
                                <ul className="brief-modal-summary-list">
                                    {facts.map((fact) => (
                                        <li key={fact.text.slice(0, 60)}>{fact.text}</li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {flow && (
                            <section className="brief-modal-flow" aria-label={`${keyword} 이슈 흐름`}>
                                <div className="brief-modal-section-head">
                                    <strong>이슈 흐름 — 왜 뜨나 · 몰린 말 · 다음 물결</strong>
                                    <small>실검 틈새 회차 실측</small>
                                </div>
                                <p className="brief-modal-flow-issue">
                                    <span>{flow.issue}</span>
                                    <em>{ISSUE_TYPE_LABEL[flow.issueType] || flow.issueType}</em>
                                    {flow.isHot && <em className="hot">급상승</em>}
                                    {flow.rowCount > 0 && <em>실측 카드 {flow.rowCount}</em>}
                                </p>
                                {flow.why ? (
                                    <div className="brief-modal-flow-why">
                                        <b>왜 지금?</b>{flow.why}
                                        <small>뉴스 헤드라인 {flow.headlines.length}건으로 검증된 추론만 싣습니다</small>
                                    </div>
                                ) : (
                                    <div className="brief-modal-flow-why muted">
                                        <b>왜 지금?</b>검증된 이유 없음
                                        <small>헤드라인과 맞지 않는 추론은 싣지 않습니다</small>
                                    </div>
                                )}
                                {flow.concentrated.length > 0 && (
                                    <div className="brief-modal-flow-row">
                                        <em className="brief-modal-intent-label">몰린 말 <small>자동완성·연관검색어 실측</small></em>
                                        <div className="brief-modal-chips">
                                            {flow.concentrated.slice(0, 10).map((word) => (
                                                <a
                                                    key={word.keyword}
                                                    href={buildSourceSearchUrl(lane.id, word.keyword)}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                >
                                                    {word.keyword}
                                                    {typeof word.searchVolume === 'number' && <b>{formatCount(word.searchVolume)}</b>}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {waveAll.length > 0 && (
                                    <div className="brief-modal-flow-row">
                                        <em className="brief-modal-intent-label">다음 물결 <small>에이전트 추론 — 먼저 잡아 둘 말</small></em>
                                        <ul className="brief-modal-flow-wave">
                                            {wave.map((next) => (
                                                <li key={next.keyword}>
                                                    <a href={buildSourceSearchUrl(lane.id, next.keyword)} target="_blank" rel="noreferrer">
                                                        🌊 {next.keyword}
                                                        {typeof next.searchVolume === 'number' && <b>{formatCount(next.searchVolume)}</b>}
                                                    </a>
                                                    <span>{next.reason}</span>
                                                </li>
                                            ))}
                                        </ul>
                                        {waveHidden > 0 && (
                                            <a className="brief-modal-flow-more" href="/leword?tab=issue">
                                                나머지 {waveHidden}개는 실검 틈새 탭에서 로그인 후 열립니다 →
                                            </a>
                                        )}
                                    </div>
                                )}
                                <a className="brief-modal-flow-more" href="/leword?tab=issue">실검 틈새 보드에서 카드로 보기 →</a>
                            </section>
                        )}

                        {(titles.seo || titles.home) && (
                            <section aria-label={`${keyword} 추천 제목`}>
                                <div className="brief-modal-section-head">
                                    <strong>이렇게 쓰세요</strong>
                                    {titles.topic && <span className="brief-modal-topic">주제 · {titles.topic}</span>}
                                </div>
                                <dl className="brief-modal-titles">
                                    {titles.seo && (
                                        <div>
                                            <dt>검색 유입용</dt>
                                            <dd>{titles.seo}</dd>
                                        </div>
                                    )}
                                    {titles.home && (
                                        <div>
                                            <dt>홈판 노출용</dt>
                                            <dd>{titles.home}</dd>
                                        </div>
                                    )}
                                </dl>
                            </section>
                        )}

                        {/* 출처 기사 — 접어 둔다(사장님 2026-09-06 "접었다폈다 가능하게 하고 접어주세요"). */}
                        {(articleUrl || links.length > 0) && (
                            <details className="brief-modal-fold">
                                <summary>
                                    <strong>출처 기사</strong>
                                    <small>{(articleUrl ? 1 : 0) + links.filter((link) => link.url !== articleUrl).length}곳 · 눌러서 펼치기</small>
                                </summary>
                                <ul className="brief-modal-links">
                                    {articleUrl && (
                                        <li key={articleUrl}>
                                            <a href={articleUrl} target="_blank" rel="noreferrer">원문 기사 바로가기</a>
                                        </li>
                                    )}
                                    {links.filter((link) => link.url !== articleUrl).map((link) => {
                                        const linkAgo = articleAgoLabel(link.publishedAt || undefined).replace('기사 기준', '기사');
                                        return (
                                            <li key={link.url}>
                                                <a href={link.url} target="_blank" rel="noreferrer">
                                                    {link.press || '기사 원문'}
                                                    {linkAgo && <small style={{ marginLeft: 6, opacity: 0.6 }}>{linkAgo}</small>}
                                                </a>
                                                {/* 그 기사에서 그대로 가져온 요약 한 문장(2026-09-06 "출처에 요약문이 있어야"). */}
                                                {link.summary && (
                                                    <p style={{ margin: '3px 0 0', fontSize: 12.5, lineHeight: 1.62, color: 'rgba(255,255,255,0.68)' }}>
                                                        {link.summary}
                                                    </p>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </details>
                        )}

                        {/* 추출 키워드 — 접어 둔다. 기사 제목에 두 번 이상 나온 명사만(정확도 개선 2026-09-06). */}
                        {(brief?.extractedKeywords || []).length > 0 && (
                            <details className="brief-modal-fold">
                                <summary>
                                    <strong>추출 키워드</strong>
                                    <small>기사 제목에 두 곳 이상 나온 말 · 눌러서 펼치기</small>
                                </summary>
                                <div className="brief-modal-chips">
                                    {(brief?.extractedKeywords || []).slice(0, 8).map((word) => (
                                        <a
                                            key={word}
                                            href={buildSourceSearchUrl(lane.id, `${keyword} ${word}`)}
                                            target="_blank"
                                            rel="noreferrer"
                                        >{word}</a>
                                    ))}
                                </div>
                            </details>
                        )}

                        {expansions.length > 0 && (
                            <section aria-label={`${keyword} 함께 검색되는 말`}>
                                <div className="brief-modal-section-head">
                                    <strong>함께 검색되는 말 — 검색의도별</strong>
                                    <small>네이버 자동완성 실측</small>
                                </div>
                                {groupByIntent(expansions, (expansion) => expansion, keyword).map((bucket) => (
                                    <div key={bucket.id} className="brief-modal-intent-group">
                                        <em className="brief-modal-intent-label">{bucket.label}</em>
                                        <div className="brief-modal-chips">
                                            {bucket.items.map((expansion) => (
                                                <a
                                                    key={expansion}
                                                    href={buildSourceSearchUrl(lane.id, expansion)}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                >{expansion}</a>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </section>
                        )}
                    </aside>
                </div>

                <footer className="brief-modal-foot">
                    {articleUrl && (
                        <a href={articleUrl} target="_blank" rel="noreferrer" style={{ background: lane.accent }}>
                            원문 기사 보러가기
                        </a>
                    )}
                    <a
                        href={searchUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={articleUrl ? undefined : { background: lane.accent }}
                    >
                        {lane.label} 원본에서 검색
                    </a>
                    <button type="button" onClick={onClose}>닫기</button>
                </footer>
            </div>
        </div>
    );
}

export default SourceBriefModal;
