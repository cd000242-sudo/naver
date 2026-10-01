import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { askAssistant, OPERATOR_INQUIRY_URL, type AssistantTurn } from '../../lib/assistantChat';
import { bridgeFailureNote } from '../../lib/bridge';
import { loadAdvisorDaily } from '../../lib/homefeedEvidenceLoad';
import { autopsyPosts } from '../../lib/postAutopsy.mjs';

/*
 * LEWORD 비서(2026-10-01) — 사장님 "비서는 너가 앱이나 사이트에 있어서 나 대신 사람들을 도와주는 거야".
 * 이 PC 앱이 사용자 본인 구독(Claude Sonnet → Codex → agy)으로 답한다. 운영자 키는 쓰지 않는다.
 * 운영자만 처리할 일이면 답 아래 '1:1 문의' 버튼이 뜬다. 대화는 이 창이 열린 동안만 남는다.
 */
type Msg = AssistantTurn & { escalate?: boolean; provider?: string; failed?: boolean };

const PANEL: React.CSSProperties = {
    position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(420px, 100vw)', zIndex: 10050,
    display: 'flex', flexDirection: 'column', background: '#0f1726', borderLeft: '1px solid rgba(148,163,184,.25)',
    boxShadow: '-12px 0 40px rgba(0,0,0,.45)', color: '#e2e8f0', fontSize: 14, lineHeight: 1.65,
};
const BUBBLE_ME: React.CSSProperties = { alignSelf: 'flex-end', background: '#3d2b63', border: '1px solid #6d5b93', borderRadius: '12px 12px 2px 12px', padding: '8px 12px', maxWidth: '85%', whiteSpace: 'pre-wrap' };
const BUBBLE_AI: React.CSSProperties = { alignSelf: 'flex-start', background: '#152035', border: '1px solid rgba(148,163,184,.22)', borderRadius: '12px 12px 12px 2px', padding: '8px 12px', maxWidth: '92%', whiteSpace: 'pre-wrap' };
const ENGINE: Record<string, string> = { claude: 'Claude', codex: 'Codex', gemini: 'Antigravity', grok: 'Grok' };
const STARTERS = ['0명 글 부검은 어떻게 보나요?', 'AI 연결은 어떻게 하나요?', '홈판 추천 소재는 어떻게 고르나요?'];

/** 지금 화면의 자료 — 내 블로그 화면이면 0명 글 부검 요약을 붙인다(앱 실측 · 사용자 본인 것). */
async function screenFacts(tabId: string): Promise<string> {
    if (tabId !== 'myblog') return '';
    const loaded = await loadAdvisorDaily().catch(() => null);
    const facts = loaded?.daily?.autopsy;
    if (!facts) return '';
    const { zero, summary } = autopsyPosts(facts, { myHours: loaded?.daily?.myHours ?? [] });
    const lines = zero.slice(0, 8).map((row) => `- "${row.post.title}" (${row.post.publishedOn}) → ${row.verdict}${row.match ? ` · 홈판 ${row.match.day} ${row.match.rank}위 "${row.match.title}"` : ''}${row.flags.length ? ` · ${row.flags.map((f) => f.kind).join(',')}` : ''}`);
    return [`0명 글 부검(${facts.from}~${facts.to}): 글 ${summary.posts}편 · 기록 완전 ${summary.complete}편 · 조회 0명 ${summary.zero}편 · 판정 ${JSON.stringify(summary.verdicts)}`, ...lines].join('\n');
}

export default function AssistantPanel({ tabId, tabLabel, onClose }: { tabId: string; tabLabel: string; onClose: () => void }) {
    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { inputRef.current?.focus(); }, []);
    useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [msgs, busy]);
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const send = async (text: string) => {
        const question = text.trim();
        if (!question || busy) return;
        const history = [...msgs.filter((m) => !m.failed), { role: 'user' as const, content: question }];
        setMsgs((prev) => [...prev, { role: 'user', content: question }]);
        setDraft('');
        setBusy(true);
        const facts = await screenFacts(tabId);
        const res = await askAssistant(history.map(({ role, content }) => ({ role, content })), `LEWORD · ${tabLabel}`, facts);
        setBusy(false);
        if (res.status === 'ok') {
            setMsgs((prev) => [...prev, { role: 'assistant', content: res.result.answer, escalate: res.result.escalate, provider: res.result.provider }]);
            return;
        }
        const note = res.status === 'offline'
            ? 'AI 비서는 이 PC 에서 LEWORD 앱이 켜져 있어야 답합니다. 앱을 켠 뒤 다시 물어봐 주세요.'
            : bridgeFailureNote(res, '답을 받지 못했습니다');
        setMsgs((prev) => [...prev, { role: 'assistant', content: note, failed: true }]);
    };

    return (
        <aside style={PANEL} role="dialog" aria-label="LEWORD AI 비서">
            <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid rgba(148,163,184,.2)' }}>
                <div style={{ flex: 1 }}>
                    <strong style={{ color: '#fff', fontSize: 15 }}>AI 비서</strong>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>내 구독 AI로 답합니다 · 운영자 일은 1:1 문의로 연결</div>
                </div>
                <button type="button" onClick={onClose} aria-label="비서 닫기" style={{ background: 'none', border: '1px solid rgba(148,163,184,.3)', color: '#cbd5e1', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>닫기</button>
            </header>

            <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {msgs.length === 0 && (
                    <div style={{ color: '#a8b6cb', fontSize: 13 }}>
                        <p style={{ margin: '0 0 10px 0' }}>LEWORD 사용법 · 결과 해석 · 문제 해결을 도와드립니다. 지금 보는 화면({tabLabel})의 내용을 함께 봅니다.</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {STARTERS.map((q) => (
                                <button key={q} type="button" onClick={() => void send(q)} style={{ background: '#152035', border: '1px solid rgba(148,163,184,.25)', color: '#cbd5e1', borderRadius: 16, padding: '5px 11px', fontSize: 12, cursor: 'pointer' }}>{q}</button>
                            ))}
                        </div>
                        <p style={{ margin: '14px 0 0 0', fontSize: 12, color: '#8d9db4' }}>
                            앱이 필요합니다(이 PC 에서 켜 두기). AI 는 Claude 구독이 없어도 ChatGPT · 구글 무료 계정으로 연결됩니다 — 앱의 '처음 설정 마법사'에서 3분이면 됩니다. 앱이 없다면 <Link to="/download" style={{ color: '#67e8f9' }}>다운로드</Link>.
                        </p>
                    </div>
                )}
                {msgs.map((m, i) => (
                    <div key={i} style={m.role === 'user' ? BUBBLE_ME : { ...BUBBLE_AI, ...(m.failed ? { borderColor: '#92400e', color: '#fcd9aa' } : {}) }}>
                        {m.content}
                        {m.escalate && (
                            <div style={{ marginTop: 8 }}>
                                <a href={OPERATOR_INQUIRY_URL} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', background: '#fee500', color: '#191919', fontWeight: 700, borderRadius: 8, padding: '5px 12px', fontSize: 12, textDecoration: 'none' }}>운영자에게 1:1 문의</a>
                            </div>
                        )}
                        {m.provider && <div style={{ marginTop: 4, fontSize: 10, color: '#7c8aa0' }}>{ENGINE[m.provider] || m.provider} · 내 구독</div>}
                    </div>
                ))}
                {busy && <div style={{ ...BUBBLE_AI, color: '#94a3b8' }} role="status">답을 쓰는 중… (보통 5~15초)</div>}
            </div>

            <form onSubmit={(event) => { event.preventDefault(); void send(draft); }} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid rgba(148,163,184,.2)' }}>
                <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(draft); } }}
                    placeholder="무엇이든 물어보세요 (Enter 보내기 · Shift+Enter 줄바꿈)"
                    aria-label="비서에게 질문"
                    rows={2}
                    maxLength={1500}
                    style={{ flex: 1, resize: 'none', background: '#101828', color: '#e2e8f0', border: '1px solid rgba(148,163,184,.3)', borderRadius: 8, padding: '8px 10px', font: 'inherit', fontSize: 13 }}
                />
                <button type="submit" disabled={busy || !draft.trim()} style={{ background: '#433069', border: '1px solid #aa88ed', color: '#f3e8ff', borderRadius: 8, padding: '0 14px', cursor: busy ? 'wait' : 'pointer' }}>보내기</button>
            </form>
        </aside>
    );
}
