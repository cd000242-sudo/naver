import { useState } from 'react';
import { bridgeMindmap, type BridgeMindmap } from '../../lib/bridge';
import { fetchMindmapAI } from '../../lib/keywordApi';
import { loadUserKeys } from '../../lib/userKeys';
import type { MindmapEntry, PreemptionRow } from './PreemptionCard';

/**
 * 카드의 '마인드맵 확장키워드' 상태 — 황금키워드 탭에서 떼어 냈다(2026-09-03).
 *
 * 실검 틈새 탭이 같은 카드(PreemptionCard)를 쓰게 되면서 이 로직도 같이 써야 했다.
 * 내용은 그대로 옮겼다: 회차가 구운 실측 풀이 1순위, 토큰이 있으면 서버 추론,
 * 없으면 LEWORD 앱 브리지. 확장어를 지어내지 않는다.
 */
export function useMindmap() {
    /*
     * AI 서브 보강(2026-08-17 재설계) — API 키가 아니라 **클로드코드 연동**이다.
     * 같은 PC 의 LEWORD 앱 브리지가 사용자의 클로드코드 구독으로 추론 체인
     * (자동완성 실측→규칙 선별→AI 제안→실존 결재)을 통째로 돌려준다.
     * 그래서 결과는 전부 검증된 실존 검색어다. 앱이 꺼져 있으면 안내만 한다.
     */
    /*
     * [2026-08-18] 'AI 서브 보강' 온디맨드 기능 제거 — 서브키워드가 회차
     * 보강에서 이미 구워져 오므로 같은 일을 두 번 시키는 군더더기였다.
     */
    /*
     * 마인드맵 — 앱으로 보내는 링크였던 것을 실제 기능으로 바꾼다.
     * 브리지가 사용자 PC 의 앱을 통해 본인 구독으로 돌린다. 앱이 꺼져 있으면
     * 'offline' 로 안내할 뿐, 확장어를 지어내지 않는다.
     */
    const [mindmap, setMindmap] = useState<Record<string, MindmapEntry>>({});

    const openMindmap = async (row: PreemptionRow) => {
        const keyword = row.keyword;
        if (mindmap[keyword]?.status === 'done') {
            setMindmap((prev) => { const next = { ...prev }; delete next[keyword]; return next; });
            return;
        }

        /*
         * 회차가 구워 준 실측(키워드 풀 + 수익 판정)이 1순위다 — 폰에서도
         * 즉시 펼쳐진다. 예전엔 브리지(사용자 PC 앱)만 봤는데, 폰에는 브리지가
         * 없으니 "앱이 꺼져 있다"는 안내가 떴다(사장님: "연동 안 돼 있다고
         * 헛소리"). 브리지는 있으면 라이브 분석으로 **더** 얹는 보너스다.
         */
        const baked: BridgeMindmap | null = (row.keywordPool?.length ?? 0) > 0 ? {
            keyword,
            reasons: [],
            expansions: (row.keywordPool || []).map((p) => ({
                keyword: p.keyword,
                searchVolume: p.searchVolume ?? null,
                source: p.source || 'searchad-related',
            })),
            signals: ['검색량', '문서수'],
            monetize: row.monetize || null,
            agent: { available: false, provider: '회차 실측', proposed: 0, verified: 0 },
        } : null;

        if (baked) {
            setMindmap((prev) => ({ ...prev, [keyword]: { status: 'done', data: baked } }));
        } else {
            setMindmap((prev) => ({ ...prev, [keyword]: { status: 'loading' } }));
        }

        try {
            /*
             * 토큰이 있으면 앱 없이 서버 추론(사장님 확정 2026-08-20 — 연동은
             * 하나여야 한다). 없을 때만 LEWORD 앱 브리지를 찾는다.
             */
            const viaToken = loadUserKeys().claudeToken
                ? await fetchMindmapAI(keyword).then((res) => (res.ok ? (res.data?.result as BridgeMindmap | undefined) || null : null)).catch(() => null)
                : null;
            const result = viaToken || await bridgeMindmap(keyword);
            if (!result) {
                if (!baked) setMindmap((prev) => ({ ...prev, [keyword]: { status: 'offline' } }));
                return;
            }
            setMindmap((prev) => ({ ...prev, [keyword]: { status: 'done', data: result } }));

            /*
             * 자동 연쇄(사장님 지시 2026-08-18): "비슷하게 많이 찾는 키워드를
             * 자동으로 분석해줄 순 없을까". 확장어 중 검색량 상위 2개를 경량
             * (AI 1콜)으로 이어서 분석한다 — 순차라 부담이 겹치지 않고,
             * 도착하는 대로 아래에 쌓인다.
             */
            const relatedTargets = (result.expansions || [])
                .filter((e) => typeof e.searchVolume === 'number' && e.searchVolume > 0)
                .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
                .slice(0, 2)
                .map((e) => e.keyword);
            for (const target of relatedTargets) {
                setMindmap((prev) => {
                    const entry = prev[keyword];
                    if (!entry || entry.status !== 'done') return prev;
                    return {
                        ...prev,
                        [keyword]: { ...entry, related: [...(entry.related || []), { keyword: target, status: 'loading' as const }] },
                    };
                });
                // eslint-disable-next-line no-await-in-loop -- 순차 실행이 의도다(구독 부담 분산)
                const sub = await bridgeMindmap(target, true).catch(() => null);
                setMindmap((prev) => {
                    const entry = prev[keyword];
                    if (!entry || entry.status !== 'done') return prev;
                    return {
                        ...prev,
                        [keyword]: {
                            ...entry,
                            related: (entry.related || []).map((r) => (r.keyword === target
                                ? (sub ? { keyword: target, status: 'done' as const, data: sub } : { keyword: target, status: 'error' as const })
                                : r)),
                        },
                    };
                });
            }
        } catch (error) {
            // 구운 데이터가 이미 떠 있으면 라이브 실패는 조용히 넘긴다.
            if (!baked) {
                const message = error instanceof Error ? error.message : String(error);
                setMindmap((prev) => ({ ...prev, [keyword]: { status: 'error', error: message } }));
            }
        }
    };

    return { mindmap, openMindmap };
}
