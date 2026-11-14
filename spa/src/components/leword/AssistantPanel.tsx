import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { askAssistant, OPERATOR_INQUIRY_URL, type AssistantTurn } from '../../lib/assistantChat';
import { bridgeFailureNote } from '../../lib/bridge';
import { loadAdvisorDaily } from '../../lib/homefeedEvidenceLoad';
import { autopsyPosts } from '../../lib/postAutopsy.mjs';
import { ASSIST_FAB_TOP } from './AssistantFab';

/*
 * LEWORD 비서(2026-10-01) — 사장님 "비서는 너가 앱이나 사이트에 있어서 나 대신 사람들을 도와주는 거야".
 * 이 PC 앱이 사용자 본인 구독(Claude Sonnet → Codex → agy)으로 답한다. 운영자 키는 쓰지 않는다.
 * 운영자만 처리할 일이면 답 아래 '1:1 문의' 버튼이 뜬다.
 * 2026-10-06: 우측 상단 떠 있는 버튼(AssistantFab) 아래 카드로. 접으면 숨기기만 한다 — 대화는 페이지를 떠날 때까지 남는다.
 */
type Msg = AssistantTurn & { escalate?: boolean; provider?: string; failed?: boolean; tools?: string[] };

const PANEL_TOP = ASSIST_FAB_TOP + 44;
const PANEL: React.CSSProperties = {
    position: 'fixed', top: PANEL_TOP, right: 16, width: 'min(420px, calc(100vw - 32px))', height: `min(680px, calc(100vh - ${PANEL_TOP + 16}px))`, zIndex: 10050,
    display: 'flex', flexDirection: 'column', background: 'var(--lw-surface)', border: '1px solid var(--lw-line)', borderRadius: 18, overflow: 'hidden',
    boxShadow: 'var(--lw-shadow-float)', color: 'var(--lw-text)', fontSize: 15, lineHeight: 1.65,
};
const BUBBLE_ME: React.CSSProperties = { alignSelf: 'flex-end', background: 'var(--lw-accent-soft)', border: '1px solid var(--lw-accent-line)', borderRadius: '14px 14px 4px 14px', padding: '8px 12px', maxWidth: '85%', whiteSpace: 'pre-wrap' };
const BUBBLE_AI: React.CSSProperties = { alignSelf: 'flex-start', background: 'var(--lw-raised)', border: '1px solid var(--lw-line)', borderRadius: '14px 14px 14px 4px', padding: '8px 12px', maxWidth: '92%', whiteSpace: 'pre-wrap' };
const GHOST_BTN: React.CSSProperties = { minHeight: 44, background: 'var(--lw-surface)', border: '1px solid var(--lw-line)', color: 'var(--lw-text-secondary)', borderRadius: 10, fontSize: 13, cursor: 'pointer' };
const ENGINE: Record<string, string> = { claude: 'Claude', codex: 'Codex', gemini: 'Antigravity', grok: 'Grok' };
// 2026-10-06: 비서가 앱의 실측 도구(검색량 · 문서수 · 자리 · 홈판 흐름)를 쓴다 — 첫 화면에서 그 일을 보여 준다.
const STARTERS = ['내 블로그로 오늘 쓸 키워드 골라줘', '지금 홈판에 유리한 제목 5개 추천해줘', '내 블로그 주제로 빈자리 있는 키워드 찾아줘', 'AI 연결은 어떻게 하나요?'];

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

export default function AssistantPanel({ open, tabId, tabLabel, onClose, onBusyChange }: { open: boolean; tabId: string; tabLabel: string; onClose: () => void; onBusyChange?: (busy: boolean) => void }) {
    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
    useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [msgs, busy, open]);
    useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

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
            setMsgs((prev) => [...prev, { role: 'assistant', content: res.result.answer, escalate: res.result.escalate, provider: res.result.provider, tools: res.result.tools }]);
            return;
        }
        const note = res.status === 'offline'
            ? 'AI 비서는 이 PC 에서 LEWORD 앱이 켜져 있어야 답합니다. 앱을 켠 뒤 다시 물어봐 주세요.'
            : bridgeFailureNote(res, '답을 받지 못했습니다');
        setMsgs((prev) => [...prev, { role: 'assistant', content: note, failed: true }]);
    };

    return (
        <aside id="lw-assistant-panel" style={{ ...PANEL, display: open ? 'flex' : 'none' }} role="dialog" aria-label="LEWORD AI 비서" aria-hidden={!open}>
            <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 8px 16px', borderBottom: '1px solid var(--lw-line)', background: 'var(--lw-surface)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ color: 'var(--lw-text)', fontSize: 15, fontWeight: 600 }}>AI 비서</strong>
                    <div style={{ fontSize: 13, color: 'var(--lw-text-muted)' }}>내 구독 AI로 답합니다 · 운영자 일은 1:1 문의로 연결</div>
                </div>
                <button type="button" onClick={() => { if (!busy) setMsgs([]); }} title="대화 지우고 새로 시작" style={{ ...GHOST_BTN, padding: '0 12px' }}>새 대화</button>
                <button type="button" onClick={onClose} aria-label="비서 접기" title="접기 (대화는 남습니다)" style={{ ...GHOST_BTN, width: 44, height: 44, fontSize: 17, lineHeight: 1 }}>−</button>
            </header>

            <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {msgs.length === 0 && (
                    <div style={{ color: 'var(--lw-text-secondary)', fontSize: 15 }}>
                        <p style={{ margin: '0 0 12px 0' }}>내 블로그 주제로 쓸 키워드를 찾아 고르고, 지금 홈판에 맞는 제목을 추천합니다. 검색량 · 문서수 · 빈자리는 이 PC 앱이 직접 재서 답합니다. 사용법 · 결과 해석도 물어보세요(지금 화면: {tabLabel}).</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {STARTERS.map((q) => (
                                <button key={q} type="button" onClick={() => void send(q)} style={{ ...GHOST_BTN, borderRadius: 999, padding: '0 12px', textAlign: 'left' }}>{q}</button>
                            ))}
                        </div>
                        <p style={{ margin: '16px 0 0 0', fontSize: 13, color: 'var(--lw-text-muted)' }}>
                            앱이 필요합니다(이 PC 에서 켜 두기). AI 는 Claude 구독이 없어도 ChatGPT · 구글 무료 계정으로 연결됩니다 — 앱의 '처음 설정 마법사'에서 3분이면 됩니다. 앱이 없다면 <Link to="/download" style={{ color: 'var(--lw-accent-ink)' }}>다운로드</Link>.
                        </p>
                    </div>
                )}
                {msgs.map((m, i) => (
                    <div key={i} style={m.role === 'user' ? BUBBLE_ME : { ...BUBBLE_AI, ...(m.failed ? { background: 'var(--lw-negative-soft)', borderColor: 'var(--lw-negative-soft)', color: 'var(--lw-text)' } : {}) }}>
                        {m.content}
                        {m.escalate && (
                            <div style={{ marginTop: 8 }}>
                                <a href={OPERATOR_INQUIRY_URL} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, background: 'var(--lw-btn)', color: 'var(--lw-on-btn)', fontWeight: 600, borderRadius: 10, padding: '0 12px', fontSize: 13, textDecoration: 'none' }}>운영자에게 1:1 문의</a>
                            </div>
                        )}
                        {m.provider && <div style={{ marginTop: 4, fontSize: 13, color: 'var(--lw-text-muted)' }}>{ENGINE[m.provider] || m.provider} · 내 구독{m.tools?.length ? ` · 실측 ${m.tools.length}회` : ''}</div>}
                    </div>
                ))}
                {busy && <div style={{ ...BUBBLE_AI, color: 'var(--lw-text-secondary)' }} role="status">답을 쓰는 중… 키워드 · 자리를 재야 하면 1~3분 걸립니다</div>}
            </div>

            <form onSubmit={(event) => { event.preventDefault(); void send(draft); }} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--lw-line)' }}>
                <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(draft); } }}
                    placeholder="무엇이든 물어보세요 (Enter 보내기 · Shift+Enter 줄바꿈)"
                    aria-label="비서에게 질문"
                    rows={2}
                    maxLength={1500}
                    style={{ flex: 1, resize: 'none', background: 'var(--lw-surface)', color: 'var(--lw-text)', border: '1px solid var(--lw-line-strong)', borderRadius: 10, padding: '8px 12px', font: 'inherit', fontSize: 15 }}
                />
                <button type="submit" disabled={busy || !draft.trim()} style={{ minHeight: 44, background: 'var(--lw-accent)', border: 'none', color: 'var(--lw-on-accent)', fontSize: 15, fontWeight: 600, borderRadius: 10, padding: '0 16px', cursor: busy ? 'wait' : 'pointer', opacity: busy || !draft.trim() ? 0.55 : 1 }}>보내기</button>
            </form>
        </aside>
    );
}
