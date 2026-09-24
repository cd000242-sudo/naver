export type SerpFit = '높음' | '보통' | '낮음' | '미측정';
export type TitleKind = '설명' | '질문' | '수치';
export interface BriefSource { id: string; title: string; link: string; press: string; publishedAt: string; snippet: string; evidenceExcerpts: string[] }
export interface BriefAnswer { question: string; answer: string; factIds: string[]; excerpts: Array<{ factId: string; text: string; source: BriefSource }> }
export interface BriefMetric { keyword: string; searchVolume: number | null; searchVolumeUnder10: boolean; serpFacing: number | null; serpVacancy: number | null; fit: SerpFit }
export interface TopicBriefView {
    id: string; title: string; field: string; timing: 'NOW' | 'NEXT' | 'ALWAYS';
    status: 'supported' | 'needs_research'; legacy: boolean; recommended: boolean;
    summary: string; audience: string; question: string; angle: string; missing: string[]; outline: string[];
    answers: BriefAnswer[]; sources: BriefSource[]; titles: Array<{ text: string; kind: TitleKind }>;
    core: BriefMetric; related: BriefMetric[]; recommendation: { keyword: string; reason: string; metric: BriefMetric } | null;
}
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const strings = (value: unknown): string[] => array(value).map(text).filter(Boolean);
const count = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const facing = (value: unknown): number | null => Number.isInteger(value) && count(value) !== null && (value as number) <= 10 ? value as number : null;
const unique = (items: string[]) => [...new Set(items)];
const normalized = (value: string) => value.replace(/<[^>]*>/g, '').normalize('NFKC').replace(/\s+/g, '');
const safeUrl = (value: unknown): string => { try { const url = new URL(text(value)); return /^(https?:)$/.test(url.protocol) ? url.href : ''; } catch { return ''; } };
const personalClaim = /(?:써\s?보|써봤|직접\s?(?:써|받|가|해)|바꿨|받았|접속했|걸어놨|갔어요|안\s?놓쳤|물어봤|캐물었|알람\s?맞춰|(?:큰일\s?날|놓칠)\s?뻔|제가|나는\s|내가\s)/;

export function strictSerpFit(value: unknown): SerpFit {
    const measured = facing(value);
    return measured === null ? '미측정' : measured <= 2 ? '높음' : measured <= 5 ? '보통' : '낮음';
}
export function searchVolumeLabel(value: unknown, under10 = false): string {
    const measured = count(value);
    return measured !== null ? measured.toLocaleString('ko-KR') : under10 ? '10 미만' : '미측정';
}
export function titleKind(title: string): TitleKind {
    if (/[?？]|(?:인가요|하나요|누구인가|무엇인가|어떻게|왜\s)/.test(title)) return '질문';
    return /\d[\d,.]*\s*(?:%|퍼센트|만원|억원|원|개월|년간|월\s*\d+일|일\b|명\b|개\b)/.test(title) ? '수치' : '설명';
}
function metric(value: unknown, keyword = ''): BriefMetric {
    const item = record(value);
    return { keyword: keyword || text(item.keyword), searchVolume: count(item.searchVolume), searchVolumeUnder10: item.searchVolumeUnder10 === true, serpFacing: facing(item.serpFacing), serpVacancy: count(item.serpVacancy), fit: strictSerpFit(item.serpFacing) };
}
function sourceOf(value: unknown): BriefSource | null {
    const source = record(value); const link = safeUrl(source.link);
    if (!text(source.id) || !link) return null;
    return { id: text(source.id), title: text(source.title) || '원문', link, press: text(source.press), publishedAt: text(source.publishedAt), snippet: text(source.snippet), evidenceExcerpts: strings(source.evidenceExcerpts) };
}
function exactQuote(quote: string, source: BriefSource): boolean {
    if (quote.length < 8 || quote.length > 200) return false;
    const expected = normalized(quote);
    return [source.title, source.snippet, ...source.evidenceExcerpts].some(evidence => {
        if (normalized(evidence) === expected) return true;
        const sentences = evidence.split(/(?<=[.!?。])\s+|[\r\n]+/).map(text).filter(Boolean);
        return sentences.some((_, index) => {
            let joined = '';
            for (let end = index; end < Math.min(index + 3, sentences.length); end++) {
                joined += normalized(sentences[end]);
                if (joined === expected) return true;
                if (joined.length > expected.length) break;
            }
            return false;
        });
    });
}

export function normalizeTopicBrief(value: unknown, index = 0): TopicBriefView {
    const brief = record(value); const editorial = record(brief.editorial); const review = record(editorial.review);
    const legacy = editorial.version !== 2;
    const keyword = text(brief.coreKeyword) || '글감';
    const sources = array(brief.facts).map(sourceOf).filter((item): item is BriefSource => item !== null);
    const sourceMap = new Map(sources.map(source => [source.id, source]));
    const answers: BriefAnswer[] = [];
    if (!legacy) for (const raw of array(editorial.answers)) {
        const answer = record(raw); const factIds = strings(answer.factIds);
        const excerpts = array(answer.excerpts).flatMap(rawExcerpt => {
            const excerpt = record(rawExcerpt); const factId = text(excerpt.factId); const source = sourceMap.get(factId);
            const matchesPublishedEvidence = source && exactQuote(text(excerpt.text), source);
            return source && factIds.includes(factId) && matchesPublishedEvidence ? [{ factId, text: text(excerpt.text), source }] : [];
        });
        const answerText = text(answer.answer);
        const matchesAnswer = normalized(answerText) === excerpts.map(excerpt => normalized(excerpt.text)).join('') || excerpts.some(excerpt => normalized(excerpt.text) === normalized(answerText));
        if (text(answer.question) && answerText && factIds.length && excerpts.length && excerpts.length === array(answer.excerpts).length && factIds.every(id => sourceMap.has(id) && excerpts.some(excerpt => excerpt.factId === id)) && matchesAnswer) answers.push({ question: text(answer.question), answer: answerText, factIds, excerpts });
    }
    const completeAnswers = answers.length > 0 && answers.length === array(editorial.answers).length;
    const clearReview = review.passed === true && Array.isArray(review.issues) && review.issues.length === 0;
    const clearMissing = Array.isArray(editorial.missing) && editorial.missing.length === 0;
    const summaryText = text(editorial.summary);
    const validSummary = !legacy && sources.some(source => exactQuote(summaryText, source));
    const supported = !legacy && editorial.status === 'supported' && clearReview && clearMissing && completeAnswers && validSummary;
    const missing = unique([
        ...(!legacy ? strings(editorial.missing) : ['이전 회차 자료입니다. 원문에서 대상·조건·수치와 날짜를 다시 확인하세요.']),
        ...(!legacy ? strings(review.issues) : []),
        ...(!legacy && !clearReview ? ['내용 검토가 끝나지 않았습니다. 원문 확인 후 작성하세요.'] : []),
        ...(!legacy && !Array.isArray(editorial.missing) ? ['추가 확인 목록을 읽을 수 없습니다. 원문을 다시 확인하세요.'] : []),
        ...(!legacy && !validSummary ? ['요약을 뒷받침할 공개 근거를 추가로 확인해야 합니다.'] : []),
        ...(!legacy && !completeAnswers ? ['공개된 근거만으로 일부 답변을 확인할 수 없습니다. 원문 발췌를 추가로 확인하세요.'] : []),
    ]);
    const candidates = legacy ? [] : array(brief.titles).map(record).map(item => text(item.text)).filter(title => title && !personalClaim.test(title));
    const originalTitle = !legacy && !personalClaim.test(text(brief.title)) ? text(brief.title) : '';
    const title = originalTitle || candidates[0] || `${keyword} · 확인할 내용`;
    const titles = unique(candidates.length ? candidates : [title]).map(candidate => ({ text: candidate, kind: titleKind(candidate) }));
    const core = metric(brief, keyword);
    const related = array(brief.related).map(item => metric(item)).filter(item => item.keyword);
    const alternative = metric(brief.alternative);
    const requested = record(brief.recommendation); const target = text(requested.keyword);
    // A narrower keyword must retain the core phrase; an unrelated broad term never inherits its badge.
    const targetKey = normalized(target).toLowerCase(); const coreKey = normalized(keyword).toLowerCase();
    const narrowed = coreKey.length >= 2 && targetKey.length > coreKey.length && targetKey.includes(coreKey) && target.split(/\s+/).length <= 5;
    const chosen = target === keyword ? core : narrowed && target === alternative.keyword ? alternative : null;
    const recommendation = supported && chosen && chosen.fit === '높음' && chosen.searchVolume !== null && chosen.searchVolume >= 100 && text(requested.reason)
        ? { keyword: target, reason: text(requested.reason), metric: chosen } : null;
    return {
        id: `${index}-${keyword}-${title}`, title, field: text(brief.field) || '기타', timing: brief.timing === 'NEXT' || brief.timing === 'ALWAYS' ? brief.timing : 'NOW',
        status: supported ? 'supported' : 'needs_research', legacy, recommended: recommendation !== null,
        summary: validSummary ? summaryText : answers[0]?.answer || '원문을 읽고 작성할 질문과 필요한 근거를 정리하는 조사 출발점입니다.',
        audience: legacy ? '' : text(editorial.audience), question: text(brief.primaryIntent), angle: legacy ? '' : text(editorial.angle),
        missing, outline: legacy ? [] : strings(editorial.outline), answers, sources, titles, core, related,
        recommendation,
    };
}
export function partitionTopicBriefs(items: TopicBriefView[], limit = 5): { recommended: TopicBriefView[]; remaining: TopicBriefView[] } {
    const recommended = items.filter(item => item.recommended).slice(0, Math.max(0, Math.min(5, limit)));
    const ids = new Set(recommended.map(item => item.id));
    return { recommended, remaining: items.filter(item => !ids.has(item.id)) };
}
export function topicBriefCopy(brief: TopicBriefView, selectedTitle = brief.title): string {
    return [
        `제목: ${selectedTitle}`, `준비 상태: ${brief.status === 'supported' ? '근거 검토 완료' : '추가 확인 필요'}`, `요약: ${brief.summary}`,
        `독자: ${brief.audience || '원문을 확인하며 정하세요.'}`, `조사할 질문: ${brief.question || '원문에서 확인하세요.'}`,
        ...brief.answers.flatMap(answer => [`질문: ${answer.question}`, `답: ${answer.answer}`, ...answer.excerpts.map(excerpt => `근거: “${excerpt.text}”\n${excerpt.source.title}\n${excerpt.source.link}`)]),
        `추가 확인:\n${brief.missing.length ? brief.missing.map(item => `- ${item}`).join('\n') : '- 작성 전 최신 공고·수치·일정을 확인하세요.'}`,
        `목차:\n${brief.outline.length ? brief.outline.map((item, index) => `${index + 1}. ${item}`).join('\n') : '질문과 근거를 확인한 뒤 구성하세요.'}`,
        `접근 각도: ${brief.angle || '독자의 질문을 정한 뒤 구성하세요.'}`,
        `원문:\n${brief.sources.map(source => `${source.title}\n${source.link}`).join('\n')}`,
    ].join('\n\n');
}
