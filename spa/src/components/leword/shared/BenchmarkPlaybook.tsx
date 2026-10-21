/**
 * 이 카드로 성과 내는 순서(2026-10-22 사장님 "벤치마크로 들고 와도 어떤 식으로 활용해야 성과가 나는지 모르겠네요").
 * 카드에 이미 있는 실측(그래프 판정 · 실제 홈판 노출 · 문서 경쟁)과 안내(해결할 문제 · 제목)를 "지금 쓸지 → 무엇을 → 어떤 제목 → 발행 후"
 * 순서로 다시 묶는다. 예상 유입 · 확률은 말하지 않는다 — 판정 종류에 맞는 행동만 적는다.
 */
import type { ReactNode } from 'react';
import type { AdsenseDemand } from '../../../lib/adsenseBenchmarkModel.mjs';
import { DemandChip } from '../adsense/AdsenseDemand';

/** 판정 종류별로 할 일 — 수치 예측 없이 행동만. */
export const DEMAND_ACTION: Record<AdsenseDemand['verdict'], string> = {
    new: '막 검색되기 시작한 말입니다 — 오늘 안에 발행해 먼저 자리를 잡으세요.',
    rising: '검색 관심이 오르는 중입니다 — 미루지 말고 이번 주 안에 발행하세요.',
    'season-soon': '작년 이맘때 곧 올랐던 말입니다 — 오르기 전에 미리 써 두세요.',
    steady: '꾸준히 찾는 말입니다 — 급하지 않으니 답을 가장 꼼꼼하게 정리한 글로 오래 가져가세요.',
    cooling: '관심이 식는 중입니다 — 새 글보다 후속 · 정리 각도로만 짧게 다루세요.',
    'past-peak': '흐름이 지났습니다 — 이 소재로 새로 쓰기보다 다음 시즌을 노리세요.',
    unknown: '검색 추이가 짧아 판정을 보류했습니다 — 원문 반응(공감 · 댓글이 늘어나는지)을 보고 판단하세요.',
};

export interface PlaybookStep { label: string; body: ReactNode }

export function trackUrl(keyword: string) {
    return `/leword?tab=rank&keyword=${encodeURIComponent(keyword)}`;
}

export function DemandStep({ demand, fallback }: { demand?: AdsenseDemand; fallback: string }) {
    if (!demand) return <>{fallback}</>;
    return <><DemandChip demand={demand} /> {demand.fact}. <b>{DEMAND_ACTION[demand.verdict]}</b></>;
}

export default function BenchmarkPlaybook({ steps }: { steps: PlaybookStep[] }) {
    if (!steps.length) return null;
    return (
        <section aria-label="이 카드로 성과 내는 순서" style={{ marginTop: 14, padding: '12px 14px', border: '1px solid rgba(250,204,21,.35)', borderRadius: 12, background: 'rgba(66,52,10,.22)' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 12.5, color: '#fde68a', fontWeight: 800 }}>이 카드로 성과 내는 순서</h4>
            <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 7, fontSize: 13, color: '#e2e8f0', lineHeight: 1.6 }}>
                {steps.map((s) => <li key={s.label}><b style={{ color: '#fcd34d' }}>{s.label}</b> — {s.body}</li>)}
            </ol>
        </section>
    );
}

/** 판 맨 위 — 벤치마크를 성과로 바꾸는 반복 순서(접어 둠). */
export function BenchmarkHowTo({ kind }: { kind: 'homefeed' | 'adsense' }) {
    const steps = kind === 'homefeed'
        ? [
            ['고르기', '그래프 판정이 "새로 뜬 · 오르는 중"이거나 실제 홈판 노출 증거가 있는 카드를 먼저 고릅니다. 피크가 지난 소재는 넘깁니다.'],
            ['쓰기', '"이렇게 쓰세요"의 방향과 "반드시 들어갈 내용"을 그대로 소제목으로 씁니다. 원문 사실만, 사진은 직접 찍거나 재사용이 허락된 것만.'],
            ['제목', '후킹형 제목 중 내 글 내용과 맞는 하나를 고릅니다. 따옴표 인용은 원문에 실제로 있는 말인지 확인합니다.'],
            ['발행 후', '카드의 [노출 추적에 등록]으로 키워드를 등록하고 24시간 안에 홈판 · 검색 노출을 확인합니다. 안 뜨면 같은 소재를 붙잡지 말고 다음 카드로 넘어갑니다.'],
            ['다음 판단', '노출된 글의 소재 · 제목 모양을 기억해 두고, 같은 분야 카드를 우선 고릅니다 — 내 블로그 탭의 홈판 유입 기록이 쌓일수록 카드에 "내 블로그 홈판 유입" 배지가 붙습니다.'],
        ]
        : [
            ['고르기', '"지금 써야 할 키워드" 칸부터 봅니다 — 지금 뜨는 소재 중 문서 경쟁이 낮은 것만 모아 둔 칸입니다.'],
            ['문제 정하기', '"이 글이 해결할 문제"와 "지식인에서 실제로 묻는 것"을 보고, 글 한 편이 끝까지 풀어 줄 질문 하나를 정합니다.'],
            ['제목', '"행동 키워드를 엮은 제목" 중 하나 — 검색자가 바로 할 행동(조회 · 신청 · 계산)이 제목에 보여야 클릭됩니다.'],
            ['벤치마킹', '"벤치마킹할 곳"에서 상위 글 2~3개를 열어 빠진 답(조건표 · 계산 예시 · 신청 순서)을 찾아 내 글에 채웁니다.'],
            ['발행 후', '[노출 추적에 등록]으로 순위를 지켜보고, 일주일 안에 안 오르면 제목의 행동 키워드를 자동완성 표현으로 바꿔 봅니다.'],
        ];
    return (
        <details style={{ margin: '10px 0 14px', padding: '10px 14px', border: '1px solid rgba(250,204,21,.3)', borderRadius: 12, background: 'rgba(66,52,10,.18)' }}>
            <summary style={{ cursor: 'pointer', color: '#fde68a', fontWeight: 700, fontSize: 13.5 }}>벤치마크를 성과로 바꾸는 순서 보기</summary>
            <ol style={{ margin: '10px 0 0', paddingLeft: 20, display: 'grid', gap: 6, fontSize: 13, color: '#dbe4ef', lineHeight: 1.65 }}>
                {steps.map(([label, text]) => <li key={label}><b style={{ color: '#fcd34d' }}>{label}</b> — {text}</li>)}
            </ol>
        </details>
    );
}
