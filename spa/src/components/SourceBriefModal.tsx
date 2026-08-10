import { useEffect, useRef } from 'react';
import {
    buildSourceSearchUrl,
    cleanLiveText,
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
 */

type Props = {
    lane: SourceLane;
    item: SourceSignal;
    onClose: () => void;
};

function SourceBriefModal({ lane, item, onClose }: Props) {
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);

    const keyword = cleanLiveText(item.keyword || item.title, lane.label);
    const description = cleanLiveText(item.description || item.title, lane.description);
    const searchUrl = buildSourceSearchUrl(lane.id, keyword);
    const rank = Math.max(1, Number(item.rank) || (101 - Number(item.priority || 100)));

    const brief = item.insight;
    const facts = brief?.facts || [];
    const links = (brief?.links || []).slice(0, 6);
    const photo = (brief?.images || [])[0] || item.image;
    const titles = brief?.titles || {};
    const expansions = (item.expansions || []).slice(0, 12);

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
                        <section className="brief-modal-facts" aria-label={`${keyword} 무슨 일이 있었나`}>
                            <div className="brief-modal-section-head">
                                <strong>무슨 일이 있었나</strong>
                                <small>기사 원문에서 확인된 문장입니다</small>
                            </div>
                            {photo && (
                                <img
                                    src={photo}
                                    alt={`${keyword} 관련 보도 사진`}
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                />
                            )}
                            <ul>
                                {facts.map((fact) => (
                                    <li key={fact.text.slice(0, 60)}>{fact.text}</li>
                                ))}
                            </ul>
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

                        {links.length > 0 && (
                            <section aria-label={`${keyword} 출처`}>
                                <div className="brief-modal-section-head">
                                    <strong>출처 기사</strong>
                                    <small>눌러서 원문 확인</small>
                                </div>
                                <ul className="brief-modal-links">
                                    {links.map((link) => (
                                        <li key={link.url}>
                                            <a href={link.url} target="_blank" rel="noreferrer">{link.press || '기사 원문'}</a>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {expansions.length > 0 && (
                            <section aria-label={`${keyword} 함께 검색되는 말`}>
                                <div className="brief-modal-section-head">
                                    <strong>함께 검색되는 말</strong>
                                    <small>네이버 자동완성 실측</small>
                                </div>
                                <div className="brief-modal-chips">
                                    {expansions.map((expansion) => (
                                        <a
                                            key={expansion}
                                            href={buildSourceSearchUrl(lane.id, expansion)}
                                            target="_blank"
                                            rel="noreferrer"
                                        >{expansion}</a>
                                    ))}
                                </div>
                            </section>
                        )}
                    </aside>
                </div>

                <footer className="brief-modal-foot">
                    <a href={searchUrl} target="_blank" rel="noreferrer" style={{ background: lane.accent }}>
                        {lane.label} 원본에서 검색
                    </a>
                    <button type="button" onClick={onClose}>닫기</button>
                </footer>
            </div>
        </div>
    );
}

export default SourceBriefModal;
