(function attachKeywordBriefingTools(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.KeywordBriefingTools = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createKeywordBriefingTools() {
    'use strict';

    const MAX_ROWS = 240;

    function cleanText(value, maxLength) {
        return String(value == null ? '' : value)
            .replace(/<[^>]*>/g, ' ')
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, maxLength || 140);
    }

    function parseNumber(value) {
        const normalized = String(value == null ? '' : value)
            .replace(/[,，\s]/g, '')
            .replace(/[Oo]/g, '0')
            .replace(/[Il|]/g, '1')
            .replace(/[^0-9.+-]/g, '');
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function opportunityFrom(searchVolume, documentCount) {
        return Math.round((searchVolume / (documentCount + 1)) * 100) / 100;
    }

    function normalizeKeywordRow(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const keyword = cleanText(value.keyword, 120);
        const searchVolumeRaw = parseNumber(value.searchVolume);
        const documentCountRaw = parseNumber(value.documentCount);
        if (!keyword || searchVolumeRaw == null || searchVolumeRaw <= 0 || documentCountRaw == null || documentCountRaw < 0) return null;
        const searchVolume = Math.round(searchVolumeRaw);
        const documentCount = Math.round(documentCountRaw);
        return {
            keyword,
            searchVolume,
            documentCount,
            opportunity: opportunityFrom(searchVolume, documentCount),
            ...(Number.isFinite(Number(value.ocrConfidence))
                ? { ocrConfidence: Math.max(0, Math.min(100, Number(value.ocrConfidence))) }
                : {}),
        };
    }

    function keywordKey(keyword) {
        return cleanText(keyword, 120).toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
    }

    function mergeKeywordRows(values) {
        const byKeyword = new Map();
        (Array.isArray(values) ? values : []).forEach((value) => {
            const row = normalizeKeywordRow(value);
            if (!row) return;
            const key = keywordKey(row.keyword);
            const previous = byKeyword.get(key);
            if (!previous || row.opportunity > previous.opportunity) byKeyword.set(key, row);
        });
        return Array.from(byKeyword.values()).slice(0, MAX_ROWS);
    }

    function rowIdentity(row) {
        return [keywordKey(row.keyword), row.searchVolume, row.documentCount].join('\u0000');
    }

    function mergeKeywordRowGroups(groups) {
        const merged = [];
        (Array.isArray(groups) ? groups : []).forEach((values) => {
            const rows = (Array.isArray(values) ? values : [])
                .map(normalizeKeywordRow)
                .filter(Boolean);
            if (!rows.length || merged.length >= MAX_ROWS) return;

            const maxOverlap = Math.min(merged.length, rows.length);
            let overlap = 0;
            for (let size = maxOverlap; size > 0; size -= 1) {
                let matches = true;
                for (let index = 0; index < size; index += 1) {
                    if (rowIdentity(merged[merged.length - size + index]) !== rowIdentity(rows[index])) {
                        matches = false;
                        break;
                    }
                }
                if (matches) {
                    overlap = size;
                    break;
                }
            }
            merged.push(...rows.slice(overlap, overlap + (MAX_ROWS - merged.length)));
        });
        return merged;
    }

    function parseKeywordTableText(text) {
        const rows = [];
        String(text || '').split(/\r?\n/).forEach((rawLine) => {
            const line = rawLine.replace(/[│]/g, '\t').trim();
            if (!line || /키워드.*검색량|검색량.*문서수/i.test(line)) return;
            const columns = line.includes('\t')
                ? line.split(/\t+/).map((part) => part.trim()).filter(Boolean)
                : line.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
            let keyword = '';
            let searchVolume;
            let documentCount;
            if (columns.length >= 4) {
                keyword = columns.slice(0, -3).join(' ');
                searchVolume = columns[columns.length - 3];
                documentCount = columns[columns.length - 2];
            } else if (columns.length === 3) {
                [keyword, searchVolume, documentCount] = columns;
            } else {
                const match = line.match(/^(.*?)\s+([\dOoIl|,，]+)\s+([\dOoIl|,，]+)\s+([^\s]+)\s*$/);
                if (!match) return;
                [, keyword, searchVolume, documentCount] = match;
            }
            const row = normalizeKeywordRow({ keyword, searchVolume, documentCount });
            if (row) rows.push(row);
        });
        return rows.slice(0, MAX_ROWS);
    }

    function tesseractLines(blocks) {
        const lines = [];
        (Array.isArray(blocks) ? blocks : []).forEach((block) => {
            (block.paragraphs || []).forEach((paragraph) => {
                (paragraph.lines || []).forEach((line) => lines.push(line));
            });
        });
        return lines;
    }

    function parseTesseractResult(result, imageWidth) {
        const data = result && result.data ? result.data : result || {};
        const width = Math.max(1, Number(imageWidth) || 1);
        const rows = [];
        tesseractLines(data.blocks).forEach((line) => {
            const words = (line.words || []).filter((word) => cleanText(word.text, 80));
            const columns = [[], [], [], []];
            words.forEach((word) => {
                const box = word.bbox || {};
                const center = ((Number(box.x0) || 0) + (Number(box.x1) || 0)) / 2 / width;
                const column = center < 0.625 ? 0 : center < 0.785 ? 1 : center < 0.915 ? 2 : 3;
                columns[column].push(word);
            });
            const keyword = columns[0].map((word) => word.text).join(' ');
            const searchVolume = columns[1].map((word) => word.text).join('');
            const documentCount = columns[2].map((word) => word.text).join('');
            const confidences = words.map((word) => Number(word.confidence)).filter(Number.isFinite);
            const ocrConfidence = confidences.length
                ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
                : undefined;
            const row = normalizeKeywordRow({ keyword, searchVolume, documentCount, ocrConfidence });
            if (row) rows.push(row);
        });
        if (rows.length > 0) return rows.slice(0, MAX_ROWS);
        return parseKeywordTableText(data.text || '');
    }

    function rowsToTsv(values) {
        const header = '키워드\t검색량\t블로그 문서수\t기회지수';
        const rows = (Array.isArray(values) ? values : []).map(normalizeKeywordRow).filter(Boolean).slice(0, MAX_ROWS);
        return [header].concat(rows.map((row) => (
            [row.keyword, row.searchVolume, row.documentCount, row.opportunity].join('\t')
        ))).join('\n');
    }

    return Object.freeze({
        cleanText,
        mergeKeywordRowGroups,
        mergeKeywordRows,
        normalizeKeywordRow,
        opportunityFrom,
        parseKeywordTableText,
        parseTesseractResult,
        rowsToTsv,
    });
});
