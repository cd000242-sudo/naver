/** LEWORD 첫 화면 비교 재료를 받아 온다 — 고르는 규칙은 vsSample.mjs(테스트로 잠금). */
import { useEffect, useState } from 'react';
import { pickVsSample, VS_SNAPSHOT, type VsSample } from './vsSample.mjs';

export type { VsSample };

export function useAdsenseVs(): VsSample {
    const [sample, setSample] = useState<VsSample>(VS_SNAPSHOT);
    useEffect(() => {
        let alive = true;
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 8000);
        fetch('/data/adsense-benchmarks.json', { cache: 'no-store', signal: controller.signal })
            .then((r) => (r.ok ? r.json() : null))
            .then((board) => {
                if (!alive || !board || !Array.isArray(board.candidates)) return;
                const picked = pickVsSample(board.candidates, String(board.generatedAt || '').slice(0, 10) || VS_SNAPSHOT.asOf);
                if (picked) setSample(picked);
            })
            .catch(() => { /* 사본 그대로 */ })
            .finally(() => window.clearTimeout(timer));
        return () => { alive = false; controller.abort(); window.clearTimeout(timer); };
    }, []);
    return sample;
}
