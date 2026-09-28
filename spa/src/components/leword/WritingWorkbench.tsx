import { useId, useState } from 'react';
import { writingPackageBody, writingPackageCopy, type TopicBriefView } from '../../lib/topicBriefsModel';
import './WritingWorkbench.css';

export default function WritingWorkbench({ brief }: { brief: TopicBriefView }) {
    const writing = brief.writing;
    const id = useId();
    const originalBody = writingPackageBody(brief);
    const [title, setTitle] = useState(writing?.title || brief.title);
    const [body, setBody] = useState(originalBody);
    const [mode, setMode] = useState<'preview' | 'edit'>('preview');
    const [feedback, setFeedback] = useState('');
    const [manualCopy, setManualCopy] = useState('');
    if (!writing) return null;
    const edited = title !== writing.title || body !== originalBody;
    const sources = brief.sources.filter(source => writing.sourceIds.includes(source.id));
    const copy = async () => {
        const content = writingPackageCopy(brief, title, body);
        try {
            if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(content);
            setManualCopy(''); setFeedback('수정한 제목·본문과 출처를 복사했습니다.');
        } catch {
            setManualCopy(content); setFeedback('아래 내용을 선택해 직접 복사하세요.');
        }
    };
    return <section className="tb-writing" aria-label="글쓰기 작업실">
        <header className="tb-writing-header"><div><span className="tb-writing-kicker">WRITE YOUR NEXT STORY</span><h4>내 글로 완성하기</h4><p>준비된 내용을 읽고, 내 독자에게 맞는 표현으로 다듬어 보세요.</p></div><span className={`tb-writing-status ${writing.status === 'ready' ? 'is-ready' : ''}`}>{writing.status === 'ready' ? '작성 패키지 준비 완료' : '추가 조사 필요'}</span></header>
        {writing.missing.length > 0 && <div className="tb-writing-missing"><strong>작성 전에 채워야 할 내용</strong><ul>{writing.missing.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
        <div className="tb-writing-toolbar"><div className="tb-writing-modes" role="group" aria-label="작성안 보기 방식"><button type="button" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>원고 미리보기</button><button type="button" aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>직접 다듬기</button></div><span>{edited ? '이 페이지에서 수정 중' : '제공된 작성안'}</span></div>
        {mode === 'edit' ? <div className="tb-writing-editor"><label htmlFor={`${id}-title`}>발행할 제목</label><input id={`${id}-title`} value={title} onChange={event => setTitle(event.target.value)} /><label htmlFor={`${id}-body`}>본문</label><textarea id={`${id}-body`} value={body} onChange={event => setBody(event.target.value)} spellCheck={false} /><p>수정 내용은 이 페이지에서만 유지됩니다. 이동하기 전에 복사해 주세요.</p></div> : <article className="tb-writing-preview"><span className="tb-writing-paper-label">{edited ? '수정한 원고 미리보기' : '작성안 미리보기'}</span><h3>{title}</h3>{body !== originalBody ? <div className="tb-writing-plain">{body}</div> : <><p className="tb-writing-intro">{writing.intro}</p>{writing.sections.map((section, index) => <section key={index}><h4>{section.heading}</h4>{section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}</section>)}{writing.table && <div className="tb-writing-table-scroll" role="region" aria-label={writing.table.caption || '본문 표'} tabIndex={0}><table><caption>{writing.table.caption}</caption><thead><tr>{writing.table.headers.map((header, index) => <th key={index} scope="col">{header}</th>)}</tr></thead><tbody>{writing.table.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>}{writing.faq.length > 0 && <section className="tb-writing-faq"><h4>자주 묻는 질문</h4>{writing.faq.map((item, index) => <div key={index}><h5>{item.question}</h5><p>{item.answer}</p></div>)}</section>}{writing.conclusion && <p className="tb-writing-conclusion">{writing.conclusion}</p>}</>}</article>}
        <div className="tb-writing-bottom"><div className="tb-writing-actions"><button type="button" className="tb-writing-copy" onClick={() => void copy()}>제목 + 본문 + 출처 복사 <span aria-hidden="true">↗</span></button>{mode === 'preview' && <button type="button" onClick={() => setMode('edit')}>내 표현으로 다듬기</button>}{edited && <button type="button" onClick={() => { setTitle(writing.title); setBody(originalBody); setManualCopy(''); setFeedback('제공된 작성안으로 복원했습니다.'); }}>수정 취소 · 원본 복원</button>}</div><p className="tb-feedback" role="status" aria-live="polite">{feedback}</p>{manualCopy && <textarea className="tb-manual-copy" aria-label="직접 복사할 완성 원고" readOnly value={manualCopy} onFocus={event => event.currentTarget.select()} />}</div>
        <div className="tb-writing-reference-grid"><section><h4>발행 전, 이것만 확인하세요</h4>{writing.nextSteps.length ? <ol>{writing.nextSteps.map((step, index) => <li key={index}>{step}</li>)}</ol> : <p>독자에게 맞는 표현과 최신 조건을 확인한 뒤 발행하세요.</p>}</section><section><h4>작성안에 연결된 출처</h4>{sources.length ? <ul>{sources.map(source => <li key={source.id}><a href={source.link} target="_blank" rel="noreferrer">{source.title} ↗</a></li>)}</ul> : <p>연결된 출처를 확인한 뒤 작성하세요.</p>}</section></div>
    </section>;
}
