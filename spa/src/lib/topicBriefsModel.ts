export type SerpFit = '높음' | '보통' | '낮음' | '미측정';
export type TitleKind = '설명' | '질문' | '수치';
export interface BriefSource { id: string; title: string; link: string; press: string; publishedAt: string; snippet: string; evidenceExcerpts: string[] }
export interface BriefAnswer { question: string; answer: string; factIds: string[]; excerpts: Array<{ factId: string; text: string; source: BriefSource }> }
export interface SearchVolumeEvidence { source: 'naver-searchad'; keyword: string; measuredAt: string; pc: number | null; mobile: number | null; pcUnder10: boolean; mobileUnder10: boolean; totalMin: number; totalMax: number; status: 'exact' | 'range' }
export interface BriefMetric { keyword: string; searchVolume: number | null; searchVolumeUnder10: boolean; searchVolumeEvidence: SearchVolumeEvidence | null; serpFacing: number | null; serpVacancy: number | null; documentCount: number | null; documentCountMeasuredAt: string; fit: SerpFit }
export interface BriefWritingPackage {
    version: 1; status: 'ready' | 'needs_research'; title: string; intro: string;
    sections: Array<{ heading: string; paragraphs: string[]; factIds: string[] }>;
    table: { caption: string; headers: string[]; rows: string[][]; factIds: string[] } | null;
    faq: Array<{ question: string; answer: string; factIds: string[] }>;
    conclusion: string; nextSteps: string[]; missing: string[]; sourceIds: string[]; reviewedAt: string;
}
export interface BriefWritingGuide {
    direction: string; mustInclude: string[]; avoid: string[]; seoTitles: string[]; homeTitles: string[]; relatedTerms: string[];
    images: Array<{ sourceId: string; url: string; kind: 'reference' | 'capture'; description: string; captureArea: string }>;
}
export interface TopicBriefView {
    id: string; title: string; field: string; timing: 'NOW' | 'NEXT' | 'ALWAYS';
    status: 'supported' | 'needs_research'; legacy: boolean; recommended: boolean;
    summary: string; audience: string; question: string; angle: string; missing: string[]; outline: string[];
    answers: BriefAnswer[]; sources: BriefSource[]; titles: Array<{ text: string; kind: TitleKind }>;
    core: BriefMetric; related: BriefMetric[]; recommendation: { keyword: string; reason: string; metric: BriefMetric } | null;
    writing: BriefWritingPackage | null; guide: BriefWritingGuide; alternative: BriefMetric | null;
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
const safeUrl = (value: unknown): string => { try { const url = new URL(text(value)); return /^(https?:)$/.test(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; } };
const personalClaim = /(?:써\s?보|써봤|직접\s?(?:써|받|가|해)|바꿨|받았|접속했|걸어놨|갔어요|다녀\s?왔|방문했|수령했|사\s?봤|샀어요|안\s?놓쳤|물어봤|캐물었|알람\s?맞춰|(?:큰일\s?날|놓칠)\s?뻔|(?:^|\s)(?:제가|나는|내가)\s)/;

export function strictSerpFit(value: unknown): SerpFit {
    const measured = facing(value);
    return measured === null ? '미측정' : measured <= 2 ? '높음' : measured <= 5 ? '보통' : '낮음';
}
export function searchVolumeLabel(value: unknown, under10 = false): string {
    const measured = count(value);
    return measured !== null ? measured.toLocaleString('ko-KR') : under10 ? '10 미만' : '미측정';
}
function volumeEvidence(value: unknown, keyword: string): SearchVolumeEvidence | null {
    const item = record(value); const at = Date.parse(text(item.measuredAt)); const now = Date.now();
    if (item.source !== 'naver-searchad' || !keyword || normalized(text(item.keyword)).toLowerCase() !== normalized(keyword).toLowerCase() || !Number.isFinite(at) || at > now + 300_000 || now - at > 30 * 86_400_000) return null;
    const deviceValid = (amount: unknown, low: unknown) => typeof low === 'boolean' && (low ? amount === null : Number.isSafeInteger(amount) && count(amount) !== null);
    if (!deviceValid(item.pc, item.pcUnder10) || !deviceValid(item.mobile, item.mobileUnder10)) return null;
    const low = item.pcUnder10 === true || item.mobileUnder10 === true;
    const min = (item.pcUnder10 ? 0 : item.pc as number) + (item.mobileUnder10 ? 0 : item.mobile as number);
    const max = min + (item.pcUnder10 ? 9 : 0) + (item.mobileUnder10 ? 9 : 0);
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || item.totalMin !== min || item.totalMax !== max || item.status !== (low ? 'range' : 'exact')) return null;
    return { source: 'naver-searchad', keyword: text(item.keyword), measuredAt: text(item.measuredAt), pc: item.pc as number | null, mobile: item.mobile as number | null, pcUnder10: item.pcUnder10 as boolean, mobileUnder10: item.mobileUnder10 as boolean, totalMin: min, totalMax: max, status: low ? 'range' : 'exact' };
}
export function briefVolumeLabel(metric: BriefMetric): string {
    const evidence = metric.searchVolumeEvidence;
    return evidence?.status === 'range' ? `${searchVolumeLabel(evidence.totalMin)}~${searchVolumeLabel(evidence.totalMax)}` : searchVolumeLabel(metric.searchVolume);
}
export function briefVolumeDetail(metric: BriefMetric): string {
    const evidence = metric.searchVolumeEvidence;
    if (!evidence) return metric.searchVolume === null ? '검색량 미측정 · 재측정 필요' : '이전 검색량 · 출처와 조회 시각 재확인 필요';
    const at = new Date(evidence.measuredAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `네이버 검색광고 · PC ${searchVolumeLabel(evidence.pc, evidence.pcUnder10)} · 모바일 ${searchVolumeLabel(evidence.mobile, evidence.mobileUnder10)} · ${at} 조회${evidence.status === 'range' ? ' · 기기별 10 미만은 합계 범위로 표시' : ''}`;
}
export function titleKind(title: string): TitleKind {
    if (/[?？]|(?:인가요|하나요|누구인가|무엇인가|어떻게|왜\s)/.test(title)) return '질문';
    return /\d[\d,.]*\s*(?:%|퍼센트|만원|억원|원|개월|년간|월\s*\d+일|일\b|명\b|개\b)/.test(title) ? '수치' : '설명';
}
function metric(value: unknown, keyword = ''): BriefMetric {
    const item = record(value);
    const query = keyword || text(item.keyword); const evidence = volumeEvidence(item.searchVolumeEvidence, query);
    const volume = evidence ? (evidence.status === 'exact' ? evidence.totalMin : null) : (item.searchVolumeEvidence !== undefined && item.searchVolumeEvidence !== null) || item.searchVolumeUnder10 === true ? null : count(item.searchVolume);
    const stamp = Date.parse(text(item.documentCountMeasuredAt));
    const measuredDocuments = Number.isSafeInteger(item.documentCount) && count(item.documentCount) !== null && Number.isFinite(stamp) && stamp <= Date.now() + 300_000;
    return { keyword: query, searchVolume: volume, searchVolumeUnder10: false, searchVolumeEvidence: evidence, serpFacing: facing(item.serpFacing), serpVacancy: count(item.serpVacancy), documentCount: measuredDocuments ? count(item.documentCount) : null, documentCountMeasuredAt: measuredDocuments ? text(item.documentCountMeasuredAt) : '', fit: strictSerpFit(item.serpFacing) };
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

/** Public packages must be complete and reviewed; old quotations are never silently expanded into an article. */
function writingOf(value: unknown, sources: BriefSource[], supported: boolean): BriefWritingPackage | null {
    const draft = record(value); const at = Date.parse(text(draft.reviewedAt));
    if (!supported || draft.version !== 1 || draft.status !== 'ready' || !Array.isArray(draft.missing) || draft.missing.length || !Number.isFinite(at) || at > Date.now() + 300_000) return null;
    const validText = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 2_000 && !personalClaim.test(value) && !/(?:\.{3}|…)\s*$/.test(value);
    const paragraph = (value: unknown) => validText(value) && text(value).length >= 20;
    const ids = strings(draft.sourceIds); const known = new Set(sources.map(source => source.id));
    if (!ids.length || ids.length !== array(draft.sourceIds).length || ids.some(id => !known.has(id))) return null;
    const hasSources = (value: unknown) => Array.isArray(value) && value.length > 0 && value.length <= 20 && value.every(id => typeof id === 'string' && ids.includes(id));
    const sections = array(draft.sections).map(record);
    if (sections.length < 2 || sections.length > 8 || sections.some(section => !validText(section.heading) || !Array.isArray(section.paragraphs) || !section.paragraphs.length || section.paragraphs.length > 5 || !section.paragraphs.every(paragraph) || !hasSources(section.factIds))) return null;
    if (!validText(draft.title) || ![draft.intro, draft.conclusion].every(paragraph)) return null;
    const faq = array(draft.faq).map(record);
    if (!faq.length || faq.length > 6 || faq.some(item => !validText(item.question) || !validText(item.answer) || text(item.answer).length < 15 || !hasSources(item.factIds))) return null;
    const nextSteps = strings(draft.nextSteps);
    if (!nextSteps.length || nextSteps.length !== array(draft.nextSteps).length || !nextSteps.every(validText)) return null;
    let table: BriefWritingPackage['table'] = null;
    if (draft.table !== null) {
        const candidate = record(draft.table); const headers = strings(candidate.headers); const rows = array(candidate.rows);
        if (!validText(candidate.caption) || headers.length < 2 || headers.length > 6 || headers.length !== array(candidate.headers).length || !headers.every(validText) || !rows.length || rows.length > 30 || !hasSources(candidate.factIds)) return null;
        if (rows.some(row => !Array.isArray(row) || row.length !== headers.length || !row.every(validText))) return null;
        table = { caption: text(candidate.caption), headers, rows: rows.map(strings), factIds: strings(candidate.factIds) };
    }
    return { version: 1, status: 'ready', title: text(draft.title), intro: text(draft.intro), sections: sections.map(section => ({heading:text(section.heading),paragraphs:strings(section.paragraphs),factIds:strings(section.factIds)})), table, faq: faq.map(item => ({question:text(item.question),answer:text(item.answer),factIds:strings(item.factIds)})), conclusion:text(draft.conclusion), nextSteps, missing:[], sourceIds:ids, reviewedAt:text(draft.reviewedAt) };
}

function guideOf(value: unknown, sources: BriefSource[]): BriefWritingGuide {
    const guide = record(value); const enabled = guide.version === 1;
    const list = (key: string) => enabled ? unique(strings(guide[key])).slice(0, 12) : [];
    const titles = (key: string) => list(key).filter(title => title.length <= 160 && !personalClaim.test(title));
    const images: BriefWritingGuide['images'] = enabled ? array(guide.images).flatMap(raw => {
        const image = record(raw); const url = safeUrl(image.url);
        const source = sources.find(item => item.id === text(image.sourceId));
        if (!source || url !== source.link || !text(image.description) || (image.kind !== 'reference' && image.kind !== 'capture') || (image.kind === 'capture' && !text(image.captureArea))) return [];
        return [{ sourceId: source.id, url, kind: image.kind as 'reference' | 'capture', description: text(image.description), captureArea: text(image.captureArea) }];
    }).slice(0, 5) : [];
    return {direction: enabled ? text(guide.direction) : '', mustInclude:list('mustInclude'),avoid:list('avoid'),seoTitles:titles('seoTitles'),homeTitles:titles('homeTitles').filter(title => /^(?:"[^"\n]{2,60}"|“[^”\n]{2,60}”)\s*.+/.test(title)),relatedTerms:list('relatedTerms'),images};
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
    const candidates = array(brief.titles).map(record).map(item => text(item.text)).filter(title => title && !personalClaim.test(title));
    const originalTitle = !personalClaim.test(text(brief.title)) ? text(brief.title) : '';
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
        summary: validSummary ? summaryText : answers[0]?.answer || (legacy ? sources[0]?.snippet || sources[0]?.title : '') || '원문을 읽고 작성할 질문과 필요한 근거를 정리하는 조사 출발점입니다.',
        audience: legacy ? '' : text(editorial.audience), question: text(brief.primaryIntent), angle: text(editorial.angle) || text(brief.angle) || text(brief.differentiation),
        missing, outline: legacy ? [] : strings(editorial.outline), answers, sources, titles, core, related,
        recommendation,
        writing: writingOf(brief.writingPackage, sources, supported), guide: guideOf(brief.writingGuide, sources), alternative: alternative.keyword ? alternative : null,
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
        `키워드: ${brief.core.keyword}\n월 검색량: ${briefVolumeLabel(brief.core)}\n${briefVolumeDetail(brief.core)}`,
        `독자: ${brief.audience || '원문을 확인하며 정하세요.'}`, `조사할 질문: ${brief.question || '원문에서 확인하세요.'}`,
        ...brief.answers.flatMap(answer => [`질문: ${answer.question}`, `답: ${answer.answer}`, ...answer.excerpts.map(excerpt => `근거: “${excerpt.text}”\n${excerpt.source.title}\n${excerpt.source.link}`)]),
        `추가 확인:\n${brief.missing.length ? brief.missing.map(item => `- ${item}`).join('\n') : '- 작성 전 최신 공고·수치·일정을 확인하세요.'}`,
        `목차:\n${brief.outline.length ? brief.outline.map((item, index) => `${index + 1}. ${item}`).join('\n') : '질문과 근거를 확인한 뒤 구성하세요.'}`,
        `접근 각도: ${brief.angle || '독자의 질문을 정한 뒤 구성하세요.'}`,
        `작성 방향: ${brief.guide.direction || brief.angle || '원문의 조건을 확인하며 작성하세요.'}`,
        `반드시 넣을 내용:\n${brief.guide.mustInclude.join('\n')}`,
        `넣지 말아야 할 내용:\n${brief.guide.avoid.join('\n')}`,
        `네이버 SEO 제목:\n${brief.guide.seoTitles.join('\n')}`,
        `네이버 홈판 제목:\n${brief.guide.homeTitles.join('\n')}`,
        `같이 넣을 말: ${brief.guide.relatedTerms.join(', ')}`,
        `이미지 · 캡처:\n${brief.guide.images.map(image => `${image.description} · ${image.captureArea}\n${image.url}`).join('\n')}`,
        `원문:\n${brief.sources.map(source => `${source.title}\n${source.link}`).join('\n')}`,
    ].join('\n\n');
}

export function writingPackageBody(brief: TopicBriefView): string {
    const draft = brief.writing;
    if (!draft) return '';
    const cell = (value: string) => value.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
    return [draft.intro, ...draft.sections.map(section => `## ${section.heading}\n\n${section.paragraphs.join('\n\n')}`),
        ...(draft.table ? [`## ${draft.table.caption}\n\n| ${draft.table.headers.map(cell).join(' | ')} |\n| ${draft.table.headers.map(() => '---').join(' | ')} |\n${draft.table.rows.map(row => `| ${row.map(cell).join(' | ')} |`).join('\n')}`] : []),
        `## 자주 묻는 질문\n\n${draft.faq.map(item => `### ${item.question}\n\n${item.answer}`).join('\n\n')}`, draft.conclusion].join('\n\n');
}
export function writingPackageCopy(brief: TopicBriefView, editedTitle?: string, editedBody?: string): string {
    if (!brief.writing) return '';
    const sources = brief.sources.filter(source => brief.writing!.sourceIds.includes(source.id));
    return [`# ${editedTitle ?? brief.writing.title}`, editedBody ?? writingPackageBody(brief), `참고 출처\n${sources.map(source => `- ${source.title}\n  ${source.link}`).join('\n')}`].join('\n\n');
}

