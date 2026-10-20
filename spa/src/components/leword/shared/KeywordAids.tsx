/**
 * 검색어 덧붙이기 카드 칸(2026-10-20 사장님 "시즌키워드도 오늘의 글감도 마찬가지" · "실검 틈새키워드도") — 애드센스 카드와 같은 부품을 그대로 쓴다:
 * 지금 쓰면 트래픽(판정 · 26주 선) · 이 글이 해결할 문제 · 행동 키워드 제목 · 지식인에서 실제로 묻는 것 · 벤치마킹할 곳.
 * variant 'issue'(실검 틈새 카드): 카드에 이미 30일 추세 그래프 · 지식인 질문이 있어 판정 문장만 두고 지식인 칸은 뺀다.
 */
import type { AdsenseCard } from '../../../lib/adsenseBenchmarkModel.mjs';
import type { KeywordEnrich } from '../../../lib/keywordEnrich.mjs';
import { DemandBlock, DemandChip } from '../adsense/AdsenseDemand';
import { SolveBlock, KinBlock, BenchmarkBlock } from '../adsense/AdsenseWriteAids';

export default function KeywordAids({ query, enrich, variant = 'full' }: { query: string; enrich?: KeywordEnrich; variant?: 'full' | 'issue' }) {
    // 애드센스 부품이 읽는 칸만 채운 카드 꼴 — 대표 검색어 · 판정 · 안내 칸
    const card = {
        id: query, keyword: query, metrics: { query, searchVolume: null, documentCount: null, bid: null },
        demand: enrich?.demand, solves: enrich?.solves, actionTitles: enrich?.actionTitles, kinQuestions: enrich?.kinQuestions,
    } as unknown as AdsenseCard;
    const demand = enrich?.demand;
    return (
        <div>
            {variant === 'issue'
                ? demand && <p style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, margin: '8px 0 0', fontSize: 13, color: '#e2e8f0' }}><span style={{ fontSize: 12, color: '#a8b6cb' }}>지금 쓰면 트래픽</span><DemandChip demand={demand} />{demand.fact}</p>
                : demand
                    ? <DemandBlock c={card} />
                    : <p style={{ margin: '2px 0 6px', fontSize: 12, color: '#8d9db4' }}>검색 추이 그래프 준비 중 — 하루 세 번 도는 회차가 데이터랩으로 재서 붙입니다.</p>}
            <SolveBlock c={card} />
            {variant !== 'issue' && <KinBlock c={card} />}
            <BenchmarkBlock c={card} />
        </div>
    );
}
