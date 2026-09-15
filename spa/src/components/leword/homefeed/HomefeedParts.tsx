import type { ReactNode } from 'react';
import { bridgeFailureNote, type BridgeCallResult } from '../../../lib/bridge';
import { formatTime, PROVIDERS, UNMEASURED } from '../../../lib/homefeedModel.mjs';
import type { HfCheck, HfEvidence } from '../../../lib/homefeedBridge';

/** 홈판 신호 화면이 같이 쓰는 작은 조각 — 같은 말투로 재고, 같은 말투로 실패한다. */

export function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
    return (
        <div className={`lw-hf-metric${value === UNMEASURED ? ' unmeasured' : ''}`}>
            <span>{label}</span>
            <strong>{value}</strong>
            {note && <small>{note}</small>}
        </div>
    );
}

/** 근거 기사 한 줄 — 제목 링크 · 매체 · 발행 시각. 앞에 칩을 붙일 수 있다. */
export function EvidenceItem({ evidence, children }: { evidence: HfEvidence; children?: ReactNode }) {
    const meta = [evidence.press, evidence.publishedAt ? formatTime(evidence.publishedAt) : ''].filter(Boolean).join(' · ');
    return (
        <li>
            {children}
            <a href={evidence.url} target="_blank" rel="noopener noreferrer">{evidence.title}</a>
            {meta && <small>{meta}</small>}
        </li>
    );
}

export function CheckList({ checks, labels }: { checks: HfCheck[]; labels: Readonly<Record<string, string>> }) {
    return (
        <ul className="lw-hf-checks">
            {checks.map((check) => (
                <li key={check.id} className={check.passed ? 'pass' : 'fail'}>
                    <b aria-label={check.passed ? '통과' : '미통과'}>{check.passed ? '✓' : '✕'}</b>
                    <span><strong>{labels[check.id] ?? check.id}</strong> — {check.reason}</span>
                </li>
            ))}
        </ul>
    );
}

export function ProviderSelect({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
    return (
        <select className="lw-hf-select" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} aria-label="AI 엔진">
            {PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
        </select>
    );
}

/** 실패를 화면 문장으로 — 앱 꺼짐 · 구버전은 공통 안내, 나머지는 앞말 + 앱이 준 사유. 성공이면 null. */
export function failureOf<T>(result: BridgeCallResult<T>, label: string): string | null {
    return result.status === 'ok' ? null : bridgeFailureNote(result, label);
}

export function copyToClipboard(text: string): void {
    try {
        void navigator.clipboard?.writeText(text);
    } catch {
        /* 복사를 못 해도 화면은 계속 쓴다 */
    }
}
