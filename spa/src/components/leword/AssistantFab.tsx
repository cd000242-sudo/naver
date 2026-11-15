import { useState } from 'react';

/*
 * 떠 있는 AI 비서 버튼(2026-10-06) — 사장님 "고급진 버튼으로, 리워드 켜면 어디서든 볼 수 있도록 우측 상단에 고정해서
 * 접었다 폈다 가능하고 스크롤 따라다니게". 상단 메뉴(높이 72, z 999) 바로 아래 오른쪽에 붙는다.
 * 앱(keyword-master.html #lwAssistFab)과 같은 모양 — 금빛 테두리 · ✦ 원.
 */
export const ASSIST_FAB_TOP = 84;

/*
 * 2026-10-06 사장님 "비서랑 뒤에 버튼이 겹쳐 있다, 분리시켜 줘" — 떠 있으면 스크롤할 때 내용 위에 얹힌다.
 * 본문 맨 위 고정 띠(.lw-assist-bar, sticky) 안에 놓아 내용이 띠 밑으로 지나가게 한다(docked).
 */
export default function AssistantFab({ open, busy, onToggle, docked = false }: { open: boolean; busy: boolean; onToggle: () => void; docked?: boolean }) {
    const [hover, setHover] = useState(false);
    const label = busy ? '답 쓰는 중…' : open ? '비서 접기' : 'AI 비서';
    return (
        <button
            type="button"
            onClick={onToggle}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            aria-expanded={open}
            aria-controls="lw-assistant-panel"
            title="AI 비서 (어느 탭에서든)"
            style={{
                ...(docked ? { position: 'relative' as const } : { position: 'fixed' as const, top: ASSIST_FAB_TOP, right: 16, zIndex: 10060 }),
                display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 16px 0 8px',
                border: `1px solid ${hover ? 'var(--lw-line-strong)' : 'var(--lw-line)'}`, borderRadius: 999,
                background: 'var(--lw-surface)',
                color: 'var(--lw-text)', font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                boxShadow: hover ? 'var(--lw-shadow-float)' : 'var(--lw-shadow-sm)',
                transition: 'box-shadow 160ms ease, border-color 160ms ease',
            }}
        >
            <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: 'var(--lw-accent)', color: 'var(--lw-on-accent)', fontSize: 13 }}>✦</span>
            <span>{label}</span>
        </button>
    );
}
