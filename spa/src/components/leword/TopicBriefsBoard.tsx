import { loadSavedBoard, boardSourceNote } from '../../lib/boardBridge';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { shuffleWithinTiers } from '../../lib/hourlyShuffle.mjs';
import { useShuffleSeed } from '../../lib/useShuffleSeed';
import LicenseGate, { isUnlocked } from './LicenseGate';
import { naverSearchUrl } from './preemptionMeta';
import { BoardFreshness } from './BoardFreshness';
import { normalizeTopicBrief, searchVolumeLabel, briefVolumeLabel, briefVolumeDetail, topicBriefCopy, type TopicBriefView } from '../../lib/topicBriefsModel';
import './TopicBriefsBoard.css';

type RoundSlot = '아침' | '오후' | '저녁';
// day 는 7일 창고(2026-09-29)부터 적힌다. 없으면 builtAt 의 KST 날짜로 읽는다.
interface BriefRound { day?: string; slot: RoundSlot; builtAt: string; briefs: unknown[] }
export interface TopicBriefs { builtAt: string; day?: string; slot?: RoundSlot; shelfDays?: number; rounds?: BriefRound[]; briefs?: unknown[] }
const SLOT_TIME: Record<RoundSlot, string> = { 아침: '04:23', 오후: '10:23', 저녁: '16:23' };
const SLOT_ORDER: Record<RoundSlot, number> = { 아침: 0, 오후: 1, 저녁: 2 };
const FREE_BRIEFS = 3;
const PAGE_SIZE = 30;
const PRIORITY_STORAGE = 'leword.briefs.main-field.v1';
const FINANCIAL_FIRST = '__financial__';
const ORIGINAL_ORDER = '__all__';
const financialField = (field: string) => /지원금|복지|비즈니스|소상공인|경제|금융|부동산/.test(field);
const loadPreference = () => { try { const value = localStorage.getItem(PRIORITY_STORAGE); return value && value.length <= 80 ? value : FINANCIAL_FIRST; } catch { return FINANCIAL_FIRST; } };
const TIMING_LABEL = { NOW: '지금 작성', NEXT: '일정 전 작성', ALWAYS: '상시 작성' };
const kst = (iso: string) => Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '시간 확인 필요';
const kstDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

/** 제목 후보 한 줄 복사(2026-10-11 사장님 "얘네들 제목들도 복사 버튼") — 라벨 안이라 누를 때 라디오 선택은 안 바꾼다. */
function CopyTitle({ text }: { text: string }) {
    const [done, setDone] = useState('');
    const copy = async (event: { preventDefault(): void; stopPropagation(): void }) => {
        event.preventDefault(); event.stopPropagation();
        try { await navigator.clipboard.writeText(text); setDone('복사됨'); } catch { setDone('선택해 복사해 주세요'); }
        window.setTimeout(() => setDone(''), 1500);
    };
    return <button type="button" className="tb-title-copy" onClick={(event) => void copy(event)} aria-label={`제목 복사: ${text}`}>{done || '복사'}</button>;
}

export function BriefCard({ brief, featured = false, onAnalyze }: { brief: TopicBriefView; featured?: boolean; onAnalyze?: (keyword: string) => void }) {
    const groupId = useId();
    const seoTitles = brief.guide.seoTitles.length ? brief.guide.seoTitles : brief.titles.map(title => title.text);
    const [selectedTitle, setSelectedTitle] = useState(seoTitles[0] || brief.title);
    const [feedback, setFeedback] = useState('');
    const [manualCopy, setManualCopy] = useState('');
    const copy = async (whole: boolean) => {
        const content = whole ? topicBriefCopy(brief, selectedTitle) : selectedTitle;
        try {
            if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(content); setManualCopy('');
            setFeedback(whole ? '작성 방향·제목·근거·출처를 복사했습니다.' : '선택한 제목을 복사했습니다.');
        } catch { setManualCopy(content); setFeedback('자동 복사가 되지 않았습니다. 아래 내용을 선택해 복사하세요.'); }
    };
    const list = (items: string[], fallback: string) => items.length ? <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="tb-muted">{fallback}</p>;
    const terms = [...new Set([...brief.guide.relatedTerms, ...brief.related.map(item => item.keyword)])];
    return <article className={`tb-card ${featured ? 'tb-card-featured' : ''} ${brief.recommended ? 'tb-card-recommended' : ''}`}>
        <div className="tb-card-top"><span className={`tb-timing tb-timing-${brief.timing}`}>{TIMING_LABEL[brief.timing]}</span>{brief.recommended && <span className="tb-recommended-badge"><span aria-hidden="true">★</span> 추천 글감</span>}<span className="tb-category">{brief.field}</span><span className="tb-state">{brief.status === 'supported' ? '근거 검토 완료' : '추가 확인 필요'}</span></div>
        <h3>{brief.title}</h3>
        <div className="tb-metrics"><a className="tb-keyword" href={naverSearchUrl(brief.core.keyword)} target="_blank" rel="noreferrer">{brief.core.keyword}</a><span title={briefVolumeDetail(brief.core)}>월 검색량 <b>{briefVolumeLabel(brief.core)}</b></span><span title={brief.core.documentCountMeasuredAt ? `문서량 측정 ${kst(brief.core.documentCountMeasuredAt)}` : undefined}>블로그 문서량 <b>{searchVolumeLabel(brief.core.documentCount)}</b></span><span className={`tb-fit tb-fit-${brief.core.fit}`}>상위노출 가능성 <b>{brief.core.fit === '미측정' ? '판단 보류' : `경쟁 여유 ${brief.core.fit}`}</b></span>{brief.alternative && <a className="tb-alternative" href={naverSearchUrl(brief.alternative.keyword)} target="_blank" rel="noreferrer">대안 · {brief.alternative.keyword}</a>}</div>
        <p className="tb-volume-note">{briefVolumeDetail(brief.core)}</p>
        <p className="tb-measurement-note">{brief.core.serpFacing === null ? '상위 검색 결과 미측정' : `상위 10개 중 핵심어를 포함한 제목 ${brief.core.serpFacing}개`} · 노출 보장 아님{!brief.alternative && ' · 대안 키워드 미확보'}</p>
        <section className="tb-summary"><h4>무슨 일이 있었나요</h4><p>{brief.summary}</p></section>
        <fieldset className="tb-titles"><legend>제목 후보</legend><h4>네이버 SEO 제목 <small>{brief.guide.seoTitles.length ? '검색 의도 중심' : '기존 제목 후보 · 적합성 확인'}</small></h4>{seoTitles.map((title, index) => <label key={`seo-${index}`}><input type="radio" name={`${groupId}-title`} checked={selectedTitle === title} onChange={() => setSelectedTitle(title)} /><span className="tb-title-kind">검색</span><span>{title}</span><CopyTitle text={title} /></label>)}<h4>네이버 홈판 제목 <small>따옴표 스타터 · 후킹형</small></h4>{brief.guide.homeTitles.length ? brief.guide.homeTitles.map((title,index) => <label key={`home-${index}`}><input type="radio" name={`${groupId}-title`} checked={selectedTitle === title} onChange={() => setSelectedTitle(title)} /><span className="tb-title-kind tb-home-title">홈판</span><span>{title}</span><CopyTitle text={title} /></label>) : <p className="tb-muted">확인된 내용에 맞춘 홈판 제목을 아직 확보하지 못했습니다.</p>}</fieldset>
        <section className="tb-direction"><h4>글을 쓰는 방향</h4><p>{brief.guide.direction || brief.angle || '원문에서 대상·조건·시점을 확인하고 독자가 해결할 질문부터 설명하세요.'}</p></section>
        <div className="tb-guide-columns"><section><h4>반드시 넣을 내용</h4>{list(brief.guide.mustInclude.length ? brief.guide.mustInclude : brief.outline, '대상, 적용 조건, 기준일과 원문에서 확인한 사실을 포함하세요.')}</section><section className="tb-avoid"><h4>넣지 말아야 할 내용</h4>{list(brief.guide.avoid, '확인되지 않은 금액·일정, 누구나 가능하다는 단정, 해보지 않은 경험담은 쓰지 마세요.')}</section></div>
        <section className="tb-related"><h4>같이 넣을 말 · 키워드</h4>{terms.length ? <div>{terms.map(term => {const metric = brief.related.find(item => item.keyword === term);return <a key={term} href={naverSearchUrl(term)} target="_blank" rel="noreferrer">{term}{metric && <small title={briefVolumeDetail(metric)}>{briefVolumeLabel(metric)}</small>}</a>;})}</div> : <p className="tb-muted">관련 검색어 미확보 · 원문의 용어를 확인하세요.</p>}</section>
        <section className="tb-images"><h4>이미지 · 캡처 가이드</h4>{brief.guide.images.length ? <ul>{brief.guide.images.map((image,index) => <li key={index}><span className="tb-image-kind">{image.kind === 'capture' ? '캡처' : '참고 이미지'}</span><div><a href={image.url} target="_blank" rel="noreferrer">{image.description} ↗</a>{image.captureArea && <p>확인할 위치 · {image.captureArea}</p>}</div></li>)}</ul> : <p className="tb-muted">확인된 이미지·캡처 위치가 없습니다. 아래 원문에서 시각 자료를 확인하세요.</p>}<small>참고 자료입니다. 게시 전 해당 사이트의 이미지 이용 조건을 확인하세요.</small></section>
        {brief.missing.length > 0 && <details className="tb-missing"><summary>작성 전 추가 확인 · {brief.missing.length}개</summary>{list(brief.missing,'')}</details>}
        {brief.answers.length > 0 && <details className="tb-evidence"><summary>질문별 답과 근거 · {brief.answers.length}개</summary>{brief.answers.map((answer,index) => <div key={index}><strong>{answer.question}</strong><p>{answer.answer}</p>{answer.excerpts.map((excerpt,i) => <a key={i} href={excerpt.source.link} target="_blank" rel="noreferrer">{excerpt.source.title} ↗</a>)}</div>)}</details>}
        <footer className="tb-sources"><h4>출처</h4>{brief.sources.length ? brief.sources.map((source,index) => <a key={`${source.id}-${index}`} href={source.link} target="_blank" rel="noreferrer">{source.title}<small>{source.press}{source.publishedAt ? ` · ${kst(source.publishedAt)}` : ''}</small> ↗</a>) : <p className="tb-muted">연결된 원문이 없습니다. 출처 확보 후 작성하세요.</p>}</footer>
        <div className="tb-copy-actions"><button type="button" className="lw-picks-btn" onClick={() => void copy(true)}>작성안 전체 복사</button><button type="button" className="lw-picks-btn" onClick={() => void copy(false)}>선택 제목 복사</button>{onAnalyze && <button type="button" className="lw-picks-btn" onClick={() => onAnalyze(brief.core.keyword)}>검색어 분석</button>}</div><p className="tb-feedback" role="status" aria-live="polite">{feedback}</p>{manualCopy && <textarea className="tb-manual-copy" aria-label="직접 복사할 작성안" readOnly value={manualCopy} onFocus={event => event.currentTarget.select()} />}
    </article>;
}

export function TopicBriefsContent({ data, error = '', onAnalyze, sourceNotice }: { data: TopicBriefs | null; error?: string; onAnalyze?: (keyword: string) => void; sourceNotice?: ReactNode }) {
    const [unlocked, setUnlocked] = useState(() => isUnlocked());
    const [preferred, setPreferred] = useState(loadPreference);
    const choosePreference = (value: string) => { setPreferred(value); try { localStorage.setItem(PRIORITY_STORAGE, value); } catch { /* This session still uses the selected order. */ } };
    const [seed, reshuffle] = useShuffleSeed();
    const [field, setField] = useState('전체'); const [slot, setSlot] = useState<RoundSlot | null>(null); const [shown, setShown] = useState(PAGE_SIZE);
    const rounds = useMemo(() => {
        const raw = data ? (Array.isArray(data.rounds) && data.rounds.length ? data.rounds : [{ slot: data.slot || '아침', builtAt: data.builtAt, briefs: data.briefs || [] }]) : [];
        return raw.map(round => ({ ...round, day: round.day || kstDay(round.builtAt), items: (Array.isArray(round.briefs) ? round.briefs : []).map(normalizeTopicBrief) }))
            .sort((a, b) => a.day.localeCompare(b.day) || (SLOT_ORDER[a.slot] ?? 0) - (SLOT_ORDER[b.slot] ?? 0));
    }, [data]);
    // 전체 누적(기본 보기): 최신 회차부터 합치고 같은 검색어는 최신 회차 것만 남긴다.
    const shelfItems = useMemo(() => {
        const seen = new Set<string>();
        return [...rounds].reverse().flatMap(round => round.items.map(brief => ({ brief, key: `${round.day}-${round.slot}-${brief.id}` })))
            .filter(({ brief }) => { const keyword = brief.core.keyword.trim(); if (!keyword || seen.has(keyword)) return false; seen.add(keyword); return true; });
    }, [rounds]);
    const latestDay = rounds[rounds.length - 1]?.day || '';
    const latestRounds = rounds.filter(round => round.day === latestDay);
    const activeRound = slot ? latestRounds.find(round => round.slot === slot) || null : null;
    const items = activeRound ? activeRound.items.map(brief => ({ brief, key: `${activeRound.day}-${activeRound.slot}-${brief.id}` })) : shelfItems;
    const all = items.map(({ brief }) => brief);
    const latestBuiltAt = rounds[rounds.length - 1]?.builtAt || null;
    const shelfDays = data?.shelfDays && Number.isFinite(data.shelfDays) ? data.shelfDays : 7;
    const dayCount = new Set(rounds.map(round => round.day)).size;
    const showRound = (name: RoundSlot | null) => { setSlot(name); setField('전체'); setShown(PAGE_SIZE); };
    const showField = (name: string) => { setField(name); setShown(PAGE_SIZE); };
    const fields = ['전체', ...new Set(all.map(brief => brief.field))]; const activeField = fields.includes(field) ? field : '전체';
    const filtered = activeField === '전체' ? items : items.filter(({ brief }) => brief.field === activeField);
    const activePreference = preferred === ORIGINAL_ORDER || preferred === FINANCIAL_FIRST || fields.includes(preferred) ? preferred : FINANCIAL_FIRST;
    const priority = (brief: TopicBriefView) => activePreference === FINANCIAL_FIRST ? Number(financialField(brief.field)) : Number(brief.field === activePreference);
    // 먼저 볼 분야 → 추천 → 작성 안내 있음 묶음은 지키고, 묶음 안은 매시 정각 새로 섞는다(2026-10-10 사장님 "오늘의 글감도 1시간 주기로 섞고 수동 버튼").
    // 무료(잠김)는 고정 3장 그대로 — 섞으면 매시간 다른 3장이 보여 무료 한도가 사실상 풀린다.
    const tier = ({ brief }: { brief: TopicBriefView }) => (1 - priority(brief)) * 4 + (brief.recommended ? 0 : 2) + (brief.writing ? 0 : 1);
    const ordered = unlocked ? shuffleWithinTiers(filtered, tier, seed) : [...filtered].sort((a, b) => tier(a) - tier(b));
    const visible = unlocked ? ordered.slice(0, shown) : ordered.slice(0, FREE_BRIEFS);
    const remaining = unlocked ? ordered.length - visible.length : 0;
    return <section className="lw-picks lw-picks-tab lw-briefs tb-board" aria-label="오늘의 글감">
        <header className="tb-toolbar"><div><span className="tb-brand">LEWORD BRIEF</span><h2>오늘의 글감 <b>{data ? all.length : '—'}</b></h2></div><p>키워드부터 제목·작성 방향·이미지 출처까지</p></header>
        {sourceNotice && <div className="tb-source-notice" role="status">{sourceNotice}</div>}
        <details className="tb-freshness"><summary>{latestBuiltAt ? `최근 공개 · ${kst(latestBuiltAt)}` : '갱신 일정 확인'} · 갱신 일정·상태</summary><BoardFreshness cadence="매일 아침·낮·저녁 세 번" rounds={[{hour:4,minute:23,label:'아침'},{hour:10,minute:23,label:'오후'},{hour:16,minute:23,label:'저녁'}]} lastBuiltAt={latestBuiltAt} /></details>
        {error && <p className="lw-note lw-note-error">{error}</p>}{!error && !data && <p className="lw-note">불러오는 중…</p>}
        {latestBuiltAt && kstDay(latestBuiltAt) !== kstDay(new Date().toISOString()) && <p className="lw-note">최근 공개 회차는 {kst(latestBuiltAt)}입니다. 작성 전 일정과 조건을 다시 확인하세요.</p>}
        {rounds.length > 0 && <div className="tb-rounds" aria-label="회차 선택"><button type="button" aria-pressed={!activeRound} className={`tb-round${!activeRound?' is-active':''}`} onClick={()=>showRound(null)}><strong>전체 누적</strong><span>{shelfItems.length}건 · {dayCount > 1 ? `최근 ${shelfDays}일 ${dayCount}일치` : `최근 ${shelfDays}일 · 오늘 회차만`}</span></button>{(['아침','오후','저녁'] as const).map(name => {const round=latestRounds.find(item=>item.slot===name);return <button type="button" key={name} disabled={!round} aria-pressed={activeRound?.slot===name} className={`tb-round${activeRound?.slot===name?' is-active':''}`} onClick={()=>showRound(name)}><strong>{name}</strong><span>{round?`${round.items.length}건 · ${kst(round.builtAt)}`:`${SLOT_TIME[name]} 예정`}</span></button>;})}</div>}
        {data && <div className="tb-preference"><label>먼저 볼 분야 <select aria-label="먼저 볼 분야" value={activePreference} onChange={event => choosePreference(event.target.value)}><option value={FINANCIAL_FIRST}>지원금·비즈니스·경제 우선</option><option value={ORIGINAL_ORDER}>전체 분야</option>{fields.filter(name => name !== '전체').map(name => <option key={name} value={name}>{name}</option>)}</select></label><small>공개된 글감의 표시 순서만 바뀝니다. 다른 분야도 함께 볼 수 있습니다. 같은 묶음 안은 매시 정각 새로 섞입니다.</small>{unlocked && <button type="button" className="tb-shuffle" onClick={() => { reshuffle(); setShown(PAGE_SIZE); }}>순서 섞기</button>}</div>}
        {data && <div className="tb-fields" aria-label="분야 선택"><strong>{filtered.length} / {all.length}개</strong>{fields.map(name=><button type="button" key={name} aria-pressed={activeField===name} className={`tb-field${activeField===name?' is-active':''}`} onClick={()=>showField(name)}>{name}<b>{name==='전체'?all.length:all.filter(brief=>brief.field===name).length}</b></button>)}</div>}
        <div className="tb-list">{visible.map(({ brief, key })=><BriefCard key={key} brief={brief} onAnalyze={onAnalyze} />)}</div>
        {remaining > 0 && <button type="button" className="lw-picks-btn tb-more" onClick={()=>setShown(value=>value+PAGE_SIZE)}>더 보기 · 남은 {remaining}개</button>}
        {data && !error && !filtered.length && <p className="tb-empty">이 회차에 공개된 글감이 없습니다.</p>}
        {data && !unlocked && filtered.length>FREE_BRIEFS && <LicenseGate onUnlock={()=>setUnlocked(isUnlocked())} remaining={filtered.length-FREE_BRIEFS} freeRows={FREE_BRIEFS} boardLabel="오늘의 글감" />}
    </section>;
}

export default function TopicBriefsBoard({ onAnalyze }: { onAnalyze?: (keyword: string) => void }) {
    const [data, setData] = useState<TopicBriefs | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [attempt, setAttempt] = useState(0);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let alive = true;
        setLoading(true); setError('');
        loadSavedBoard('topic-briefs').then(result => {
            if (!alive) return;
            if (result.board) setData(result.board as TopicBriefs);
            else setError('새 결과를 불러오지 못했습니다. 앱에서 글감을 만든 뒤 다시 확인하세요.');
            setNotice(boardSourceNote(result)); setLoading(false);
        }).catch(() => { if (alive) {setError('자료를 불러오지 못했습니다. 기존 결과를 유지합니다.');setLoading(false);} });
        return () => { alive = false; };
    }, [attempt]);
    return <TopicBriefsContent data={data} error={error} onAnalyze={onAnalyze} sourceNotice={<><span>{loading ? '사이트와 앱 저장 결과를 확인하고 있습니다…' : notice}</span><button type="button" className="lw-picks-btn" disabled={loading} onClick={() => setAttempt(value => value + 1)}>다시 확인</button></>} />;
}


