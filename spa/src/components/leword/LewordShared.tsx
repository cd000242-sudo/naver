import type { KeywordUsage } from '../../lib/keywordApi';

/** /leword 탭들이 같이 쓰는 작은 조각들. 각 탭이 같은 말투로 실패하게 만드는 게 목적이다. */

/** 사용량 표시 — 한도에 다가가는 걸 화면에서 보라고 응답에 실어 보낸 값이다. */
export function UsageBar({ usage }: { usage: KeywordUsage | null }) {
    if (!usage) return null;
    // 자기 키로 도는 조회는 사장님 쿼터와 무관하므로 경고를 띄우지 않는다.
    const nearLimit = !usage.ownKeys && (usage.dailyPercent >= 80 || usage.urlFetchPercent >= 80);
    return (
        <div className={`lw-usage${nearLimit ? ' warn' : ''}`}>
            <span>
                {usage.ownKeys
                    ? '내 API 키로 조회 · 횟수 제한 없음'
                    : usage.licensed
                        ? '라이선스 확인됨 · 무제한'
                        : `무료 조회 ${usage.visitorUsed}/${usage.visitorLimit}회 (${usage.visitorWindowHours}시간 기준)`}
            </span>
            {!usage.ownKeys && (
                <>
                    <span>오늘 전체 {usage.dailyCalls.toLocaleString('ko-KR')}/{usage.dailyLimit.toLocaleString('ko-KR')}건 · {usage.dailyPercent}%</span>
                    <span>API 호출 {usage.urlFetchToday.toLocaleString('ko-KR')}/{usage.urlFetchLimit.toLocaleString('ko-KR')} · {usage.urlFetchPercent}%</span>
                </>
            )}
        </div>
    );
}

/**
 * 실패 안내. "왜 안 되는지"와 "무엇을 하면 되는지"를 같이 말한다.
 * 조용히 빈 화면을 보여 주는 것이 이 사이트에서 제일 비싼 실수였다.
 */
export function ErrorNote({
    error,
    message,
    missing,
    onLicense,
}: {
    error?: string;
    message?: string;
    missing?: string[];
    onLicense?: () => void;
}) {
    if (!error) return null;

    if (error === 'needs-setup') {
        return (
            <div className="lw-note lw-note-setup">
                <strong>아직 준비 중인 기능입니다</strong>
                <p>서버에 이 기능의 API 자격증명이 아직 등록되지 않았습니다. 등록되면 바로 동작합니다.</p>
                {missing && missing.length > 0 && (
                    <p className="lw-note-detail">필요한 설정: {missing.join(' · ')}</p>
                )}
            </div>
        );
    }

    if (error === 'visitor-limit') {
        return (
            <div className="lw-note lw-note-limit">
                <strong>무료 조회를 모두 사용했습니다</strong>
                <p>{message || '라이선스 코드를 입력하거나, 내 API 키를 넣으면 제한 없이 이용할 수 있습니다.'}</p>
                {onLicense && (
                    <button type="button" onClick={onLicense}>라이선스 코드 입력</button>
                )}
            </div>
        );
    }

    if (error === 'daily-limit') {
        return (
            <div className="lw-note lw-note-limit">
                <strong>오늘 전체 조회 한도에 도달했습니다</strong>
                <p>{message || '내일 다시 이용해 주세요.'}</p>
            </div>
        );
    }

    return (
        <div className="lw-note lw-note-error">
            <strong>조회하지 못했습니다</strong>
            <p>{message || '잠시 후 다시 시도해 주세요.'}</p>
        </div>
    );
}

/** 실측값 하나를 보여 주는 칸. 값이 없으면 '—' 다 — 0 으로 채우지 않는다. */
export function MetricCell({ label, value, note }: { label: string; value: string; note?: string }) {
    return (
        <div className="lw-metric">
            <span>{label}</span>
            <strong>{value}</strong>
            {note && <small>{note}</small>}
        </div>
    );
}

export function TabIntro({ title, desc, source }: { title: string; desc: string; source: string }) {
    return (
        <header className="lw-intro">
            <h1>{title}</h1>
            <p>{desc}</p>
            <span className="lw-source">출처 · {source}</span>
        </header>
    );
}
