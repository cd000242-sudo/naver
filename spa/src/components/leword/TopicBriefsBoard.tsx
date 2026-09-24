import { useEffect, useId, useMemo, useState } from 'react';
import LicenseGate, { isUnlocked } from './LicenseGate';
import { naverSearchUrl } from './preemptionMeta';
import { TabIntro } from './LewordShared';
import { BoardFreshness } from './BoardFreshness';
import { normalizeTopicBrief, partitionTopicBriefs, searchVolumeLabel, topicBriefCopy, type BriefMetric, type TopicBriefView } from '../../lib/topicBriefsModel';
import './TopicBriefsBoard.css';

type RoundSlot = '아침' | '오후' | '저녁';
interface BriefRound { slot: RoundSlot; builtAt: string; briefs: unknown[] }
interface TopicBriefs { builtAt: string; slot?: RoundSlot; rounds?: BriefRound[]; briefs?: unknown[] }
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

function BriefCard({ brief, initialOpen = false, onAnalyze }: { brief: TopicBriefView; initialOpen?: boolean; onAnalyze?: (keyword: string) => void }) {
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
    return <details className="lw-briefs-card tb-card" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
        <summary><div className="tb-card-heading">
            <span className={`tb-state ${brief.status === 'supported' ? 'is-ready' : ''}`}>{brief.status === 'supported' ? '근거 검토 완료' : '추가 확인 필요'}</span>
            <span className="tb-category">{brief.field} · {TIMING_LABEL[brief.timing]}</span>
            <h3>{brief.title}</h3><p>{brief.summary}</p>
            {brief.audience && <span className="tb-audience">읽을 사람 · {brief.audience}</span>}
            <span className="tb-open-label">{open ? '작성안 접기' : '질문·근거와 작성안 보기'}</span>
        </div></summary>
        <div className="tb-card-body">
            {brief.recommendation && <div className="tb-recommendation"><strong>살펴볼 이유</strong><p>{brief.recommendation.reason}</p><span>작성할 검색어 · {brief.recommendation.keyword}</span></div>}
            {brief.question && <div className="tb-question"><strong>{brief.legacy ? '조사할 질문' : '독자의 질문'}</strong><p>{brief.question}</p></div>}
            {!brief.audience && <p className="tb-muted">읽을 사람은 원문을 확인하며 정하세요.</p>}
            <section className="tb-answers" aria-label="질문별 답과 근거"><h4>질문별 답과 근거</h4>
                {brief.answers.length ? brief.answers.map((answer, index) => <div className="tb-answer" key={`${answer.question}-${index}`}>
                    <h5>{answer.question}</h5><p>{answer.answer}</p>
                    {answer.excerpts.map((excerpt, excerptIndex) => <blockquote key={`${excerpt.factId}-${excerptIndex}`}>
                        <p>{excerpt.text}</p><a href={excerpt.source.link} target="_blank" rel="noreferrer">{excerpt.source.title} ↗</a>
                    </blockquote>)}
                </div>) : <p className="tb-muted">아직 답을 뒷받침할 발췌가 준비되지 않았습니다. 아래 원문에서 조사할 질문의 답을 확인하세요.</p>}
            </section>
            <section className="tb-missing" aria-label="추가 확인"><h4>추가 확인</h4><ul>{(brief.missing.length ? brief.missing : ['작성 전 최신 공고·수치·일정을 확인하세요.']).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section>
            <div className="tb-plan">
                <section><h4>목차 초안</h4>{brief.outline.length ? <ol>{brief.outline.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ol> : <p className="tb-muted">질문과 근거를 확인한 뒤 구성하세요.</p>}</section>
                <section><h4>접근 각도</h4><p>{brief.angle || '독자가 해결할 질문을 정한 뒤 구성하세요.'}</p></section>
            </div>
            <fieldset className="tb-titles"><legend>제목 선택</legend>
                {brief.titles.map(title => <label key={title.text}><input type="radio" name={`${groupId}-title`} value={title.text} checked={selectedTitle === title.text} onChange={() => setSelectedTitle(title.text)} /><span className="tb-title-kind">{title.kind}</span><span>{title.text}</span></label>)}
            </fieldset>
            <div className="tb-copy-actions">
                <button type="button" className="lw-picks-btn tb-copy-all" onClick={() => void copy(true)}>작성안 전체 복사</button>
                <button type="button" className="lw-picks-btn" onClick={() => void copy(false)}>선택 제목 복사</button>
                {onAnalyze && <button type="button" className="lw-picks-btn" onClick={() => onAnalyze(brief.recommendation?.keyword || brief.core.keyword)}>검색어 분석</button>}
            </div>
            <p className="tb-feedback" role="status" aria-live="polite">{feedback}</p>
            {manualCopy && <textarea className="tb-manual-copy" aria-label="직접 복사할 작성안" readOnly value={manualCopy} onFocus={event => event.currentTarget.select()} />}
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

export default function TopicBriefsBoard({ onAnalyze }: { onAnalyze?: (keyword: string) => void }) {
    const [data, setData] = useState<TopicBriefs | null>(null);
    const [error, setError] = useState('');
    const [unlocked, setUnlocked] = useState(() => isUnlocked());
    const [field, setField] = useState('전체');
    const [slot, setSlot] = useState<RoundSlot | null>(null);
    useEffect(() => {
        let alive = true;
        fetch('/data/topic-briefs.json', { cache: 'no-cache' })
            .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
            .then(json => { if (alive) setData(json && typeof json === 'object' ? json as TopicBriefs : { builtAt: '', briefs: [] }); })
            .catch(() => { if (alive) setError('글감을 불러오지 못했습니다. 잠시 후 페이지를 다시 열어 주세요.'); });
        return () => { alive = false; };
    }, []);
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
    const ordered = [...filtered.filter(brief => brief.recommended), ...filtered.filter(brief => !brief.recommended)];
    const visible = unlocked ? ordered : ordered.slice(0, FREE_BRIEFS);
    const sections = partitionTopicBriefs(visible);
    const count = rounds.reduce((sum, round) => sum + round.items.length, 0);
    return <section className="lw-picks lw-picks-tab lw-briefs tb-board" aria-label="오늘의 글감">
        <TabIntro title="오늘의 글감" desc={`독자의 질문과 근거를 확인하고 작성안을 고르세요.${data ? ` ${rounds.length}회차 · ${count}건` : ''}`} source="기사 자료와 검색 수치를 바탕으로 구성합니다. 작성안의 준비 상태와 추가 확인할 내용을 함께 확인하세요." />
        <BoardFreshness cadence="매일 아침·낮·저녁 세 번" rounds={[{ hour: 4, minute: 23, label: '아침' }, { hour: 10, minute: 23, label: '오후' }, { hour: 16, minute: 23, label: '저녁' }]} lastBuiltAt={latestBuiltAt} />
        {error && <p className="lw-note lw-note-error">{error}</p>}
        {!error && !data && <p className="lw-note">불러오는 중…</p>}
        {isStale && latestBuiltAt && <p className="lw-note">최근 공개 회차는 {kst(latestBuiltAt)}입니다. 작성 전 일정과 조건을 다시 확인하세요.</p>}
        {rounds.length > 0 && <div className="lw-briefs-rounds" aria-label="회차 선택">{(['아침', '오후', '저녁'] as const).map(name => {
            const round = rounds.find(item => item.slot === name);
            return <button type="button" key={name} disabled={!round} aria-pressed={activeRound?.slot === name} className={`lw-briefs-round${activeRound?.slot === name ? ' is-active' : ''}`} onClick={() => { setSlot(name); setField('전체'); }}><strong>{name}</strong><span>{round ? `${round.items.length}건 · ${kst(round.builtAt)}` : `${SLOT_TIME[name]} 예정`}</span></button>;
        })}</div>}
        {data && <div className="lw-picks-topics" aria-label="분야 선택">{fields.map(name => <button type="button" key={name} aria-pressed={activeField === name} className={`lw-picks-topic-btn${activeField === name ? ' is-active' : ''}`} onClick={() => setField(name)}>{name}<b>{name === '전체' ? all.length : all.filter(brief => brief.field === name).length}</b></button>)}</div>}
        {data && <section className="tb-shortlist" aria-label="먼저 살펴볼 작성안"><h3>먼저 살펴볼 작성안 <span>{sections.recommended.length}건</span></h3>
            <p className="tb-muted">근거 검토를 마치고, 작성할 검색어의 정면 글이 2개 이하인 작성안을 최대 5개 보여드립니다.</p>
            {sections.recommended.length ? sections.recommended.map((brief, index) => <BriefCard key={brief.id} brief={brief} initialOpen={index === 0} onAnalyze={onAnalyze} />) : <p className="tb-empty">이 회차·분야에는 조건을 충족한 추천이 없습니다. 전체 글감에서 조사할 주제를 골라보세요.</p>}
        </section>}
        {sections.remaining.length > 0 && <details className="tb-all" key={`${activeRound?.slot}-${activeField}`} open={!sections.recommended.length}><summary>전체 글감 보기 · {sections.remaining.length}건{sections.recommended.length ? ' (위 추천 제외)' : ''}</summary><p className="tb-muted">추가 확인이 필요한 글감도 원문과 질문을 출발점으로 조사할 수 있습니다.</p>{sections.remaining.map(brief => <BriefCard key={brief.id} brief={brief} onAnalyze={onAnalyze} />)}</details>}
        {data && !error && !filtered.length && <p className="tb-empty">이 회차에 공개된 글감이 없습니다.</p>}
        {data && !unlocked && filtered.length > FREE_BRIEFS && <LicenseGate onUnlock={() => setUnlocked(isUnlocked())} remaining={filtered.length - FREE_BRIEFS} freeRows={FREE_BRIEFS} boardLabel="오늘의 글감" />}
    </section>;
}
