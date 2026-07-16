export type HomeKeywordRow = {
    keyword: string;
    searchVolume: number;
    documentCount: number;
    opportunity: number;
    ocrConfidence?: number;
};

export type HomeKeywordSourceImage = {
    name: string;
    sha256: string;
    width: number;
    height: number;
};

export type HomeKeywordBriefing = {
    snapshotId: string;
    title: string;
    author: string;
    publishedAt: string;
    revision: number;
    sourceImages: HomeKeywordSourceImage[];
    rows: HomeKeywordRow[];
};

export type HomeKeywordBriefingInput = Omit<HomeKeywordBriefing, 'snapshotId'> & {
    snapshotId?: string;
};

const MAX_ROWS = 240;

function cleanText(value: unknown, maxLength: number): string {
    return String(value ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function finiteNumber(value: unknown): number | null {
    const normalized = typeof value === 'string'
        ? value.replace(/[,，\s]/g, '').replace(/[^0-9.+-]/g, '')
        : value;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function positiveInteger(value: unknown): number | null {
    const parsed = finiteNumber(value);
    return parsed !== null && parsed > 0 ? Math.round(parsed) : null;
}

function nonNegativeInteger(value: unknown): number | null {
    const parsed = finiteNumber(value);
    return parsed !== null && parsed >= 0 ? Math.round(parsed) : null;
}

function normalizeRow(value: unknown): HomeKeywordRow | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    const keyword = cleanText(raw.keyword, 120);
    const searchVolume = positiveInteger(raw.searchVolume);
    const documentCount = nonNegativeInteger(raw.documentCount);
    if (!keyword || searchVolume === null || documentCount === null) return null;
    const opportunity = Math.round((searchVolume / (documentCount + 1)) * 100) / 100;
    const confidence = finiteNumber(raw.ocrConfidence);
    return {
        keyword,
        searchVolume,
        documentCount,
        opportunity,
        ...(confidence !== null ? { ocrConfidence: Math.max(0, Math.min(100, confidence)) } : {}),
    };
}

function normalizeRows(value: unknown): HomeKeywordRow[] {
    if (!Array.isArray(value)) return [];
    const rows: HomeKeywordRow[] = [];
    for (const candidate of value) {
        const row = normalizeRow(candidate);
        if (!row) continue;
        rows.push(row);
        if (rows.length >= MAX_ROWS) break;
    }
    return rows;
}

function normalizeSourceImages(value: unknown): HomeKeywordSourceImage[] {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 12).flatMap((candidate) => {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
        const raw = candidate as Record<string, unknown>;
        const name = cleanText(raw.name, 160);
        const sha256 = cleanText(raw.sha256, 128).replace(/[^a-zA-Z0-9:_-]/g, '');
        const width = positiveInteger(raw.width);
        const height = positiveInteger(raw.height);
        if (!name || !sha256 || width === null || height === null) return [];
        return [{ name, sha256, width, height }];
    });
}

function stableHash(value: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function isoOrEpoch(value: unknown): string {
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(0).toISOString();
}

function freezeSnapshot(snapshot: HomeKeywordBriefing): HomeKeywordBriefing {
    snapshot.rows.forEach(Object.freeze);
    snapshot.sourceImages.forEach(Object.freeze);
    Object.freeze(snapshot.rows);
    Object.freeze(snapshot.sourceImages);
    return Object.freeze(snapshot);
}

export function buildKeywordBriefingSnapshot(input: HomeKeywordBriefingInput): HomeKeywordBriefing {
    const title = cleanText(input.title, 120) || '부방장 키워드 브리핑';
    const author = cleanText(input.author, 60) || '부방장';
    const publishedAt = isoOrEpoch(input.publishedAt);
    const revision = Math.max(1, Math.floor(finiteNumber(input.revision) || 1));
    const sourceImages = normalizeSourceImages(input.sourceImages);
    const rows = normalizeRows(input.rows);
    const fingerprintSource = JSON.stringify({ title, author, publishedAt, revision, sourceImages, rows });
    return freezeSnapshot({
        snapshotId: `kb-${stableHash(fingerprintSource)}`,
        title,
        author,
        publishedAt,
        revision,
        sourceImages,
        rows,
    });
}

export function normalizeKeywordBriefing(value: unknown): HomeKeywordBriefing | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const snapshot = buildKeywordBriefingSnapshot(value as HomeKeywordBriefingInput);
    return snapshot.rows.length > 0 ? snapshot : null;
}

export function selectKeywordChartRows(
    briefing: HomeKeywordBriefing,
    limit = 12,
): HomeKeywordRow[] {
    const uniqueRows = new Map<string, HomeKeywordRow>();
    briefing.rows.forEach((row) => {
        const key = row.keyword.toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
        const previous = uniqueRows.get(key);
        if (!previous || row.opportunity > previous.opportunity) uniqueRows.set(key, { ...row });
    });
    return [...uniqueRows.values()]
        .sort((left, right) => (
            right.opportunity - left.opportunity
            || right.searchVolume - left.searchVolume
            || left.keyword.localeCompare(right.keyword, 'ko-KR')
        ))
        .slice(0, Math.max(1, Math.min(30, Math.floor(limit) || 12)));
}

export function parseKeywordTableText(text: string): HomeKeywordRow[] {
    const candidates = String(text || '').split(/\r?\n/);
    const rows: HomeKeywordRow[] = [];
    for (const rawLine of candidates) {
        const line = rawLine.replace(/[|│]/g, '\t').trim();
        if (!line || /키워드.*검색량|검색량.*문서수/i.test(line)) continue;
        const columns = line.includes('\t')
            ? line.split(/\t+/).map((part) => part.trim()).filter(Boolean)
            : line.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
        let keyword = '';
        let searchVolume: unknown;
        let documentCount: unknown;
        let opportunity: unknown;
        if (columns.length >= 4) {
            keyword = columns.slice(0, -3).join(' ');
            [searchVolume, documentCount, opportunity] = columns.slice(-3);
        } else {
            const match = line.match(/^(.*?)\s+([\d,，]+)\s+([\d,，]+)\s+([\d,.]+)\s*$/);
            if (!match) continue;
            [, keyword, searchVolume, documentCount, opportunity] = match;
        }
        const row = normalizeRow({ keyword, searchVolume, documentCount, opportunity });
        if (row) rows.push(row);
    }
    return normalizeRows(rows);
}
