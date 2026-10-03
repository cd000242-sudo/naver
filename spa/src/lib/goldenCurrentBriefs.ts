import { normalizeTopicBrief } from './topicBriefsModel';
import type { PreemptionRow } from '../components/leword/PreemptionCard';

export type CurrentGoldenBriefRow = PreemptionRow & {
    editorialReady: boolean;
    editorialMissing: string[];
    acquiredAt: string;
    currentSource: { kind: string; sourceAt: string; sourceUrl: string };
    searchVolumeMeasuredAt: string | null;
    documentCountMeasuredAt: string | null;
};
const DAY = 86400000;
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const fresh = (value: unknown, now: number, days = 7) => {
    const at = typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isFinite(at) && at <= now && now - at <= days * DAY;
};
const key = (value: string) => value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();

/** Daily brief metrics retain their own timestamps; publishing a round is never a new SERP measurement. */
export function currentGoldenBriefRows(payload: unknown, now = Date.now()): CurrentGoldenBriefRow[] {
    const data = record(payload);
    const rounds = [...list(data.rounds).map(record), { builtAt: data.builtAt, briefs: data.briefs }]
        .filter(round => fresh(round.builtAt, now))
        .sort((a, b) => Date.parse(b.builtAt) - Date.parse(a.builtAt));
    const seen = new Set<string>();
    const rows: CurrentGoldenBriefRow[] = [];
    for (const round of rounds) {
        for (const input of list(round.briefs)) {
            const raw = record(input);
            if (typeof raw.coreKeyword !== 'string' || !raw.coreKeyword.trim()) continue;
            const view = normalizeTopicBrief(raw);
            const keyword = view.core.keyword;
            if (!keyword || seen.has(key(keyword))) continue;
            const facts = view.sources.filter(source => fresh(source.publishedAt, now));
            if (!facts.length) continue;
            seen.add(key(keyword));
            const volume = view.core.searchVolumeEvidence;
            const exactVolume = volume?.status === 'exact' && fresh(volume.measuredAt, now);
            const docsFresh = fresh(view.core.documentCountMeasuredAt, now);
            const sampled = Number.isInteger(raw.serpSampled) && raw.serpSampled >= 3 && raw.serpSampled <= 10 ? raw.serpSampled : null;
            const facing = view.core.serpFacing;
            const seatFresh = sampled !== null && facing !== null && facing <= sampled && fresh(raw.serpMeasuredAt, now);
            const issues = [...view.missing];
            if (!exactVolume) issues.push('같은 검색어의 최근 검색량을 정확 값으로 재측정해야 합니다.');
            if (!docsFresh) issues.push('최근 문서량을 다시 확인해야 합니다.');
            if (!seatFresh) issues.push('상위 제목의 경쟁 정도와 확인 시각을 다시 측정해야 합니다.');
            rows.push({
                keyword, topic: view.field, searchVolume: exactVolume ? volume!.totalMin : null,
                documentCount: docsFresh ? view.core.documentCount : null,
                measuredAt: seatFresh ? raw.serpMeasuredAt : null,
                searchVolumeMeasuredAt: exactVolume ? volume!.measuredAt : null,
                documentCountMeasuredAt: docsFresh ? view.core.documentCountMeasuredAt : null,
                evidence: [], editorialReady: view.status === 'supported', editorialMissing: [...new Set(issues)],
                acquiredAt: round.builtAt,
                currentSource: { kind: 'daily-brief', sourceAt: facts[0].publishedAt, sourceUrl: facts[0].link },
                titles: {
                    seo: { text: view.guide.seoTitles[0] || '', frame: 'source-brief', basis: '공개 글감의 작성 가이드 · 개별 근거 검토 필요' },
                    home: { text: view.guide.homeTitles[0] || '', frame: 'source-brief', basis: '공개 글감의 작성 가이드 · 개별 근거 검토 필요' },
                },
                brief: { timing: view.timing, builtAt: round.builtAt, primaryIntent: view.question,
                    value: view.summary, experience: '', differentiation: view.angle,
                    angle: view.guide.direction || view.angle, basis: '오늘의 글감 출처와 측정값 재사용',
                    facts: facts.map(({ id, title, press, link, publishedAt }) => ({ id, title, press, link, publishedAt })),
                },
                ...(seatFresh ? { serp: { sampledTitles: sampled!, exactTitleHits: facing!, measuredAt: raw.serpMeasuredAt } } : {}),
            });
        }
    }
    return rows;
}
