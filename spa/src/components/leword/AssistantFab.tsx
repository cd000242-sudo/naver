import { useState } from 'react';

/*
 * 떠 있는 AI 비서 버튼(2026-10-06) — 사장님 "고급진 버튼으로, 리워드 켜면 어디서든 볼 수 있도록 우측 상단에 고정해서
 * 접었다 폈다 가능하고 스크롤 따라다니게". 상단 메뉴(높이 72, z 999) 바로 아래 오른쪽에 붙는다.
 * 앱(keyword-master.html #lwAssistFab)과 같은 모양 — 금빛 테두리 · ✦ 원.
 */
export const ASSIST_FAB_TOP = 84;

export default function AssistantFab({ open, busy, onToggle }: { open: boolean; busy: boolean; onToggle: () => void }) {
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
                position: 'fixed', top: ASSIST_FAB_TOP, right: 16, zIndex: 10060,
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 15px 6px 6px',
                border: '1px solid transparent', borderRadius: 999,
                background: 'linear-gradient(#10142a, #10142a) padding-box, linear-gradient(135deg, #fde68a, #f59e0b 45%, #a78bfa) border-box',
                color: '#f8fafc', font: 'inherit', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.02em', cursor: 'pointer',
                boxShadow: hover ? '0 8px 30px rgba(250,204,21,0.28), 0 0 0 1px rgba(250,204,21,0.25)' : '0 6px 22px rgba(124,92,255,0.28)',
                transition: 'box-shadow 160ms ease',
            }}
        >
            <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg, #fde68a, #f59e0b)', color: '#1c1305', fontSize: 13 }}>✦</span>
            <span>{label}</span>
        </button>
    );
}
