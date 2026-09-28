import { loadSavedBoard, boardSourceNote } from '../../lib/boardBridge';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import LicenseGate, { isUnlocked } from './LicenseGate';
import { naverSearchUrl } from './preemptionMeta';
import { BoardFreshness } from './BoardFreshness';
import WritingWorkbench from './WritingWorkbench';
import { normalizeTopicBrief, partitionTopicBriefs, searchVolumeLabel, topicBriefCopy, type BriefMetric, type TopicBriefView } from '../../lib/topicBriefsModel';
import './TopicBriefsBoard.css';
import { writingTrial, WRITING_TRIAL_CHECKED_AT } from '../../lib/writingTrial';

type RoundSlot = '아침' | '오후' | '저녁';
interface BriefRound { slot: RoundSlot; builtAt: string; briefs: unknown[] }
export interface TopicBriefs { builtAt: string; slot?: RoundSlot; rounds?: BriefRound[]; briefs?: unknown[] }
const SLOT_TIME: Record<RoundSlot, string> = { 아침: '04:23', 오후: '10:23', 저녁: '16:23' };
const FREE_BRIEFS = 3;
const TIMING_LABEL = { NOW: '최근 소식', NEXT: '예정된 일정', ALWAYS: '지속 주제' };
const kst = (iso: string) => Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '시간 확인 필요';
const kstDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

function Metric({ item }: { item: BriefMetric }) {
    return <div className="tb-metric">
        <a href={naverSearchUrl(item.keyword)} target="_blank" rel="noreferrer">{item.keyword}</a>
        <span>월 검색량 {searchVolumeLabel(item.searchVolume, item.searchVolumeUnder10)}</span>
        <span>정면 글 {item.serpFacing === null ? '미측정' : `${item.serpFacing}/10`}</span>
        <span>경쟁 여유 {item.fit}</span>
    </div>;
}

export function BriefCard({ brief, initialOpen = false, featured = false, onAnalyze }: { brief: TopicBriefView; initialOpen?: boolean; featured?: boolean; onAnalyze?: (keyword: string) => void }) {
    const groupId = useId();
    const [open, setOpen] = useState(initialOpen);
    const [selectedTitle, setSelectedTitle] = useState(brief.titles[0]?.text || brief.title);
    const [feedback, setFeedback] = useState('');
    const [manualCopy, setManualCopy] = useState('');
    const copy = async (whole: boolean) => {
        const content = whole ? topicBriefCopy(brief, selectedTitle) : selectedTitle;
        try {
            if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(content);
            setManualCopy('');
            setFeedback(whole ? '제목·답변·근거·추가 확인을 포함한 작성안을 복사했습니다.' : '선택한 제목을 복사했습니다.');
        } catch {
            setManualCopy(content);
            setFeedback('자동 복사가 되지 않았습니다. 아래 내용을 선택해 복사하세요.');
        }
    };
    return <details className={`tb-card ${featured ? 'tb-card-featured' : ''} ${brief.recommended ? 'tb-card-recommended' : ''} ${brief.status === 'supported' ? 'tb-card-ready' : 'tb-card-research'}`} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
        <summary><div className="tb-card-heading">
            <div className="tb-card-badges">{brief.recommended && <span className="tb-recommended-badge"><span aria-hidden="true">★</span> 추천 글감</span>}{featured && <span className="tb-feature-label">먼저 만나보세요</span>}
            <span className={`tb-state ${brief.status === 'supported' ? 'is-ready' : ''}`}>{brief.writing?.status === 'ready' ? '작성 패키지 준비 완료' : brief.status === 'supported' ? '근거 검토 완료' : '추가 확인 필요'}</span></div>
            <span className="tb-category">{brief.field} · {TIMING_LABEL[brief.timing]}</span>
            <h3>{brief.writing?.title || brief.title}</h3><p>{brief.summary}</p>
            <span className="tb-keyword"><span aria-hidden="true">#</span> {brief.recommendation?.keyword || brief.core.keyword}</span>
            {brief.audience && <span className="tb-audience">읽을 사람 · {brief.audience}</span>}
            <div className="tb-card-foot"><span className="tb-evidence-count">{brief.writing ? `본문 ${brief.writing.sections.length}개 단락` : `답변 ${brief.answers.length}개`} <i>·</i> 원문 {brief.sources.length}개</span><span className="tb-open-label">{open ? '작성안 접기' : brief.writing ? '원고 열고 다듬기' : '작성안 펼치기'}</span></div>
        </div></summary>
        <div className="tb-card-body">
            {brief.writing ? <WritingWorkbench brief={brief} /> : <p className="tb-legacy-note">기존 조사 자료입니다. 아래 답변과 근거를 참고해 글을 구성하세요. 완성형 작성 패키지는 아직 연결되지 않았습니다.</p>}
            <div className="tb-workflow" aria-label="작성 순서"><span><b>01</b> 질문과 근거</span><span><b>02</b> 글의 구성</span><span><b>03</b> 제목과 복사</span></div>
            {brief.recommendation && <div className="tb-recommendation"><strong>살펴볼 이유</strong><p>{brief.recommendation.reason}</p><span>작성할 검색어 · {brief.recommendation.keyword}</span></div>}
            {brief.question && <div className="tb-question"><strong>{brief.legacy ? '조사할 질문' : '독자의 질문'}</strong><p>{brief.question}</p></div>}
            {!brief.audience && <p className="tb-muted">읽을 사람은 원문을 확인하며 정하세요.</p>}
            <section className="tb-answers" aria-label="질문별 답과 근거"><h4>질문별 답과 근거</h4>
                {brief.answers.length ? brief.answers.map((answer, index) => <div className="tb-answer" key={`${answer.question}-${index}`}>
                    <h5><span className="tb-answer-number">Q{index + 1}</span>{answer.question}</h5><p>{answer.answer}</p>
                    {answer.excerpts.map((excerpt, excerptIndex) => <blockquote key={`${excerpt.factId}-${excerptIndex}`}>
                        <span className="tb-quote-label">원문 발췌</span><p>{excerpt.text}</p><a href={excerpt.source.link} target="_blank" rel="noreferrer">{excerpt.source.title} ↗</a>
                    </blockquote>)}
                </div>) : <p className="tb-muted">아직 답을 뒷받침할 발췌가 준비되지 않았습니다. 아래 원문에서 조사할 질문의 답을 확인하세요.</p>}
            </section>
            <section className="tb-missing" aria-label="추가 확인"><h4>추가 확인</h4><ul>{(brief.missing.length ? brief.missing : ['작성 전 최신 공고·수치·일정을 확인하세요.']).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section>
            <div className="tb-plan">
                <section><h4>목차 초안</h4>{brief.outline.length ? <ol>{brief.outline.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ol> : <p className="tb-muted">질문과 근거를 확인한 뒤 구성하세요.</p>}</section>
                <section><h4>접근 각도</h4><p>{brief.angle || '독자가 해결할 질문을 정한 뒤 구성하세요.'}</p></section>
            </div>
            {!brief.writing && <><fieldset className="tb-titles"><legend>제목 선택</legend>
                {brief.titles.map(title => <label key={title.text}><input type="radio" name={`${groupId}-title`} value={title.text} checked={selectedTitle === title.text} onChange={() => setSelectedTitle(title.text)} /><span className="tb-title-kind">{title.kind}</span><span>{title.text}</span></label>)}
            </fieldset>
            <div className="tb-copy-actions">
                <button type="button" className="lw-picks-btn tb-copy-all" onClick={() => void copy(true)}>작성안 전체 복사</button>
                <button type="button" className="lw-picks-btn" onClick={() => void copy(false)}>선택 제목 복사</button>
                {onAnalyze && <button type="button" className="lw-picks-btn" onClick={() => onAnalyze(brief.recommendation?.keyword || brief.core.keyword)}>검색어 분석</button>}
            </div>
            <p className="tb-feedback" role="status" aria-live="polite">{feedback}</p>
            {manualCopy && <textarea className="tb-manual-copy" aria-label="직접 복사할 작성안" readOnly value={manualCopy} onFocus={event => event.currentTarget.select()} />}</>}
            {brief.writing && onAnalyze && <div className="tb-copy-actions"><button type="button" className="lw-picks-btn" onClick={() => onAnalyze(brief.recommendation?.keyword || brief.core.keyword)}>검색어 분석</button></div>}
            <details className="tb-measurements"><summary>검색 수치 확인</summary>
                <p className="tb-muted">정면 글 수는 측정한 상위 10개 결과 중 같은 질문을 다룬 글의 수입니다. 2개 이하는 경쟁 여유 높음, 3~5개는 보통으로 표시합니다. 검색 결과와 수요는 달라질 수 있습니다.</p>
                <Metric item={brief.core} />
                {brief.recommendation && brief.recommendation.keyword !== brief.core.keyword && <Metric item={brief.recommendation.metric} />}
                {brief.related.length > 0 && <><h5>함께 조사할 검색어</h5>{brief.related.map((item, index) => <Metric key={`${item.keyword}-${index}`} item={item} />)}</>}
            </details>
            <section className="tb-sources" aria-label="조사할 원문"><h4>조사할 원문 · {brief.sources.length}개</h4>
                {brief.sources.length ? <ul>{brief.sources.map((source, index) => <li key={`${source.id}-${index}`}><a href={source.link} target="_blank" rel="noreferrer">{source.title} ↗</a><small>{source.press}{source.publishedAt ? ` · ${kst(source.publishedAt)}` : ''}</small></li>)}</ul> : <p>연결된 원문이 없습니다. 출처를 확보한 뒤 작성하세요.</p>}
            </section>
        </div>
    </details>;
}

export function WritingTrialPanel() {
    const [showTrial, setShowTrial] = useState(false);
    const trial = useMemo(() => normalizeTopicBrief(writingTrial, -1), []);
    return <section className="tb-trial" aria-label="작성실 체험"><div className="tb-trial-heading"><div><span className="tb-section-kicker">먼저 써보세요 · BETA</span><h3>읽기에서 끝내지 말고, 내 글로.</h3><p>공식 자료로 구성한 체험 원고로 제목 수정부터 본문 복사까지 시험해 보세요.</p></div><button type="button" aria-expanded={showTrial} className="tb-trial-button" onClick={() => setShowTrial(value => !value)}>{showTrial ? '체험 원고 접기' : '체험 원고 열기 →'}</button></div><small>웹사이트 운영 안내 · 자료 확인 {kst(WRITING_TRIAL_CHECKED_AT)} · 검색 수요·경쟁 미측정 · 일일 추천과 별도</small>{trial.writing && <div hidden={!showTrial}><WritingWorkbench brief={trial} /></div>}</section>;
}

export function WritingTrialPreview() {
    return <section className="lw-picks lw-picks-tab lw-briefs tb-board" aria-label="오늘의 글감 체험"><header className="tb-hero"><div className="tb-hero-copy"><span className="tb-eyebrow">LEWORD · WRITING STUDIO</span><h2>발견의 순간을,<br/><span>한 편의 글로.</span></h2><p>공식 자료로 만든 원고를 열고, 직접 다듬어 보세요.<br/>체험 원고는 로그인 없이 사용할 수 있습니다.</p></div></header><WritingTrialPanel /></section>;
}
export function TopicBriefsContent({ data, error = '', onAnalyze, sourceNotice }: { data: TopicBriefs | null; error?: string; onAnalyze?: (keyword: string) => void; sourceNotice?: ReactNode }) {
    const [unlocked, setUnlocked] = useState(() => isUnlocked());
    const [field, setField] = useState('전체');
    const [slot, setSlot] = useState<RoundSlot | null>(null);
    const rounds = useMemo(() => {
        const raw = data ? (Array.isArray(data.rounds) && data.rounds.length ? data.rounds : [{ slot: data.slot || '아침', builtAt: data.builtAt, briefs: data.briefs || [] }]) : [];
        return raw.map(round => ({ ...round, items: (Array.isArray(round.briefs) ? round.briefs : []).map(normalizeTopicBrief) }));
    }, [data]);
    const activeRound = rounds.find(round => round.slot === slot) || rounds[rounds.length - 1];
    const all = activeRound?.items || [];
    const latestBuiltAt = rounds[rounds.length - 1]?.builtAt || null;
    const isStale = latestBuiltAt && kstDay(latestBuiltAt) !== kstDay(new Date().toISOString());
    const fields = ['전체', ...new Set(all.map(brief => brief.field))];
    const activeField = fields.includes(field) ? field : '전체';
    const filtered = activeField === '전체' ? all : all.filter(brief => brief.field === activeField);
    const withWritingFirst = (items: TopicBriefView[]) => items.sort((a, b) => Number(Boolean(b.writing)) - Number(Boolean(a.writing)));
    const ordered = [...withWritingFirst(filtered.filter(brief => brief.recommended)), ...withWritingFirst(filtered.filter(brief => !brief.recommended && brief.status === 'supported')), ...withWritingFirst(filtered.filter(brief => !brief.recommended && brief.status !== 'supported'))];
    const visible = unlocked ? ordered : ordered.slice(0, FREE_BRIEFS);
    const firstWritingId = visible.find(brief => brief.writing)?.id;
    const sections = partitionTopicBriefs(visible);
    const ready = sections.remaining.filter(brief => brief.status === 'supported');
    const research = sections.remaining.filter(brief => brief.status !== 'supported');
    const supportedCount = all.filter(brief => brief.status === 'supported').length;
    return <section className="lw-picks lw-picks-tab lw-briefs tb-board" aria-label="오늘의 글감">
        <header className="tb-hero">
            <div className="tb-hero-copy"><span className="tb-eyebrow"><span aria-hidden="true">✦</span> LEWORD · 오늘의 글감 · BETA 작성실</span><h2>발견의 순간을,<br /><em>내 글의 시작으로.</em></h2><p>검색어부터 제목, 답변과 근거까지.<br />마음에 드는 글감을 열고, 나만의 글로 다듬어 보세요.</p><div className="tb-hero-tags"><span>검색어 발견</span><i aria-hidden="true">→</i><span>근거 확인</span><i aria-hidden="true">→</i><span>내 글 완성</span></div></div>
            <div className="tb-edition"><span className="tb-edition-symbol" aria-hidden="true">✦</span><span>{activeRound ? `${activeRound.slot} 회차` : '오늘의 글감 보드'}</span><strong>{data ? all.length : '—'}<small>개 글감</small></strong><div><span><i className="tb-dot-ready" />근거 검토 {supportedCount}</span><span><i className="tb-dot-research" />추가 조사 {all.length - supportedCount}</span></div></div>
        </header>
        <WritingTrialPanel />
        {sourceNotice && <div className="tb-source-notice" role="status">{sourceNotice}</div>}
        <details className="tb-freshness"><summary>{latestBuiltAt ? `최근 공개 · ${kst(latestBuiltAt)}` : '갱신 일정 확인'}<span>갱신 일정·상태</span></summary><BoardFreshness cadence="매일 아침·낮·저녁 세 번" rounds={[{ hour: 4, minute: 23, label: '아침' }, { hour: 10, minute: 23, label: '오후' }, { hour: 16, minute: 23, label: '저녁' }]} lastBuiltAt={latestBuiltAt} /></details>
        {error && <p className="lw-note lw-note-error">{error}</p>}
        {!error && !data && <p className="lw-note">불러오는 중…</p>}
        {isStale && latestBuiltAt && <p className="lw-note">최근 공개 회차는 {kst(latestBuiltAt)}입니다. 작성 전 일정과 조건을 다시 확인하세요.</p>}
        {rounds.length > 0 && <div className="tb-rounds" aria-label="회차 선택">{(['아침', '오후', '저녁'] as const).map(name => {
            const round = rounds.find(item => item.slot === name);
            return <button type="button" key={name} disabled={!round} aria-pressed={activeRound?.slot === name} className={`tb-round${activeRound?.slot === name ? ' is-active' : ''}`} onClick={() => { setSlot(name); setField('전체'); }}><strong>{name}</strong><span>{round ? `${round.items.length}건 · ${kst(round.builtAt)}` : `${SLOT_TIME[name]} 예정`}</span></button>;
        })}</div>}
        {data && <div className="tb-fields" aria-label="분야 선택">{fields.map(name => <button type="button" key={name} aria-pressed={activeField === name} className={`tb-field${activeField === name ? ' is-active' : ''}`} onClick={() => setField(name)}>{name}<b>{name === '전체' ? all.length : all.filter(brief => brief.field === name).length}</b></button>)}</div>}
        {data && sections.recommended.length > 0 && <section className="tb-shortlist" aria-label="먼저 살펴볼 작성안"><div className="tb-section-heading"><div><span className="tb-section-kicker">LEWORD PICKS</span><h3><span className="tb-heading-star" aria-hidden="true">★</span> 오늘 눈여겨볼 추천 글감 <span>{sections.recommended.length}</span></h3></div><span className="tb-selection-rule">근거 검토 + 정면 글 2개 이하</span></div>
            <p className="tb-muted">작성할 검색어의 수요와 경쟁을 함께 확인한 작성안입니다. 최대 5개를 골라 보여드립니다.</p>
            {sections.recommended.map((brief, index) => <BriefCard key={`${activeRound?.builtAt}-${brief.id}`} brief={brief} featured={index === 0} initialOpen={brief.id === firstWritingId} onAnalyze={onAnalyze} />)}
        </section>}
        {data && filtered.length > 0 && !sections.recommended.length && <p className="tb-no-recommendation">추천 조건을 충족한 작성안이 없습니다. 아래 글감의 근거를 살펴보세요.</p>}
        {ready.length > 0 && <section className="tb-secondary" aria-label="근거를 확인한 글감"><div className="tb-section-heading"><div><span className="tb-section-kicker">근거 검토 완료</span><h3>근거를 확인한 글감 <span>{ready.length}</span></h3></div></div><p className="tb-muted">답변의 근거를 확인한 글감입니다. 추천 여부와 별개로 검색 수요와 경쟁을 살펴보세요.</p><div className="tb-card-grid">{ready.map(brief => <BriefCard key={`${activeRound?.builtAt}-${brief.id}`} brief={brief} initialOpen={brief.id === firstWritingId} onAnalyze={onAnalyze} />)}</div></section>}
        {research.length > 0 && <section className="tb-secondary tb-research-section" aria-label="추가 조사가 필요한 글감"><div className="tb-section-heading"><div><span className="tb-section-kicker">리서치 노트</span><h3>추가 조사가 필요한 글감 <span>{research.length}</span></h3></div></div><p className="tb-muted">아직 작성 준비가 끝나지 않았습니다. 원문과 확인할 질문을 출발점으로 활용하세요.</p><div className="tb-card-grid">{research.map(brief => <BriefCard key={`${activeRound?.builtAt}-${brief.id}`} brief={brief} initialOpen={brief.id === firstWritingId} onAnalyze={onAnalyze} />)}</div></section>}
        {data && !error && !filtered.length && <p className="tb-empty">이 회차에 공개된 글감이 없습니다.</p>}
        {data && !unlocked && filtered.length > FREE_BRIEFS && <LicenseGate onUnlock={() => setUnlocked(isUnlocked())} remaining={filtered.length - FREE_BRIEFS} freeRows={FREE_BRIEFS} boardLabel="오늘의 글감" />}
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
