(function attachKeywordBriefingTools(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.KeywordBriefingTools = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createKeywordBriefingTools() {
    'use strict';

    const MAX_ROWS = 240;
    const MAX_SEARCH_VOLUME = 1_000_000_000;
    const MAX_DOCUMENT_COUNT = 10_000_000_000;

    function cleanText(value, maxLength) {
        return String(value == null ? '' : value)
            .replace(/<[^>]*>/g, ' ')
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, maxLength || 140);
    }

    function parseNumber(value) {
        const raw = String(value == null ? '' : value).trim();
        if (!raw || !/^[0-9OoIl|,，.]+$/.test(raw)) return null;
        const normalized = raw
            .replace(/[,，]/g, '')
            .replace(/[Oo]/g, '0')
            .replace(/[Il|]/g, '1');
        if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function opportunityFrom(searchVolume, documentCount) {
        return Math.round((searchVolume / (documentCount + 1)) * 100) / 100;
    }

    function isValidSearchVolume(value) {
        return Number.isSafeInteger(value) && value >= 1 && value <= MAX_SEARCH_VOLUME;
    }

    function isValidDocumentCount(value) {
        return Number.isSafeInteger(value) && value >= 0 && value <= MAX_DOCUMENT_COUNT;
    }

    function normalizeKeywordRow(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const keyword = cleanText(value.keyword, 120);
        const searchVolumeRaw = parseNumber(value.searchVolume);
        const documentCountRaw = parseNumber(value.documentCount);
        if (!keyword || !isValidSearchVolume(searchVolumeRaw) || !isValidDocumentCount(documentCountRaw)) return null;
        const searchVolume = searchVolumeRaw;
        const documentCount = documentCountRaw;
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

    function prepareKeywordDraftRows(values) {
        return (Array.isArray(values) ? values : []).slice(0, MAX_ROWS).map((value, index) => {
            const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
            const keyword = cleanText(source.keyword, 120);
            const searchVolumeRaw = parseNumber(source.searchVolume);
            const documentCountRaw = parseNumber(source.documentCount);
            const searchVolumeText = String(source.searchVolume == null ? '' : source.searchVolume).trim();
            const documentCountText = String(source.documentCount == null ? '' : source.documentCount).trim();
            const issues = [];
            if (!keyword) issues.push('키워드를 입력하세요.');
            if (!searchVolumeText) issues.push('검색량을 입력하세요.');
            else if (!isValidSearchVolume(searchVolumeRaw)) issues.push('검색량은 1~1,000,000,000 사이의 정수로 입력하세요.');
            if (!documentCountText) issues.push('블로그 문서수를 입력하세요.');
            else if (!isValidDocumentCount(documentCountRaw)) issues.push('블로그 문서수는 0~10,000,000,000 사이의 정수로 입력하세요.');
            const searchVolume = isValidSearchVolume(searchVolumeRaw) ? searchVolumeRaw : searchVolumeText;
            const documentCount = isValidDocumentCount(documentCountRaw) ? documentCountRaw : documentCountText;
            const opportunity = issues.length === 0 ? opportunityFrom(searchVolume, documentCount) : null;
            return {
                id: cleanText(source.id, 80) || 'keyword-row-' + (index + 1),
                keyword,
                searchVolume,
                documentCount,
                opportunity,
                issues,
                ...(Number.isFinite(Number(source.ocrConfidence))
                    ? { ocrConfidence: Math.max(0, Math.min(100, Number(source.ocrConfidence))) }
                    : {}),
            };
        });
    }

    function collectPublishableKeywordRows(values) {
        const drafts = prepareKeywordDraftRows(values);
        const invalidCount = drafts.filter((row) => row.issues.length > 0).length;
        return {
            rows: drafts.filter((row) => row.issues.length === 0).map((row) => ({
                keyword: row.keyword,
                searchVolume: row.searchVolume,
                documentCount: row.documentCount,
                opportunity: row.opportunity,
                ...(Number.isFinite(Number(row.ocrConfidence)) ? { ocrConfidence: row.ocrConfidence } : {}),
            })),
            invalidCount,
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
        return [keywordKey(row.keyword), String(row.searchVolume || '').trim(), String(row.documentCount || '').trim()].join('\u0000');
    }

    function mergeKeywordRowGroups(groups) {
        const merged = [];
        (Array.isArray(groups) ? groups : []).forEach((values) => {
            const rows = prepareKeywordDraftRows(Array.isArray(values) ? values : []);
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

    function isKeywordTableHeaderText(value) {
        const text = cleanText(value, 240).replace(/\s+/g, ' ');
        if (!text || /[0-9]/.test(text)) return false;
        return /키워드/i.test(text) && /검색량/i.test(text) && /문서수/i.test(text);
    }

    function parseKeywordTableText(text) {
        const rows = [];
        String(text || '').split(/\r?\n/).forEach((rawLine) => {
            const line = rawLine.replace(/[│]/g, '\t').trim();
            if (!line || isKeywordTableHeaderText(line)) return;
            let keyword = '';
            let searchVolume;
            let documentCount;
            if (line.includes('\t')) {
                const columns = line.split(/\t/).map((part) => part.trim());
                if (columns.length >= 4) {
                    keyword = columns.slice(0, -3).join(' ').trim();
                    searchVolume = columns[columns.length - 3];
                    documentCount = columns[columns.length - 2];
                } else if (columns.length === 3) {
                    [keyword, searchVolume, documentCount] = columns;
                } else {
                    return;
                }
            } else {
                const match = line.match(/^(.*?)\s+([0-9OoIl|,，.]+)\s+([0-9OoIl|,，.]+)\s+([0-9OoIl|,，.]+)\s*$/);
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

    const FALLBACK_TESSERACT_BOUNDARIES = Object.freeze([0.625, 0.785, 0.915]);

    function tesseractWordCenter(word, imageWidth) {
        const box = word && word.bbox ? word.bbox : {};
        const x0 = Number(box.x0);
        const x1 = Number(box.x1);
        if (!Number.isFinite(x0) || !Number.isFinite(x1)) return null;
        return ((x0 + x1) / 2) / imageWidth;
    }

    function boundariesFromNumericCenters(centers) {
        if (!Array.isArray(centers) || centers.length !== 3 || !centers.every(Number.isFinite)) return null;
        const [searchCenter, documentCenter, opportunityCenter] = centers;
        const searchGap = documentCenter - searchCenter;
        const documentGap = opportunityCenter - documentCenter;
        if (
            searchCenter < 0.3
            || opportunityCenter > 1.1
            || searchGap < 0.035
            || documentGap < 0.035
            || searchGap > 0.35
            || documentGap > 0.35
        ) return null;
        const gapRatio = searchGap / documentGap;
        if (gapRatio < 0.25 || gapRatio > 4) return null;
        return [
            searchCenter - (searchGap / 2),
            (searchCenter + documentCenter) / 2,
            (documentCenter + opportunityCenter) / 2,
        ];
    }

    function headerPhraseCenter(words, pattern, imageWidth) {
        for (let start = 0; start < words.length; start += 1) {
            for (let length = 1; length <= 3 && start + length <= words.length; length += 1) {
                const phraseWords = words.slice(start, start + length);
                const phrase = phraseWords.map((word) => cleanText(word.text, 40).replace(/\s+/g, '')).join('');
                if (!pattern.test(phrase)) continue;
                const centers = phraseWords.map((word) => tesseractWordCenter(word, imageWidth)).filter(Number.isFinite);
                if (centers.length === phraseWords.length) {
                    return centers.reduce((sum, value) => sum + value, 0) / centers.length;
                }
            }
        }
        return null;
    }

    function inferHeaderBoundaries(lines, imageWidth) {
        for (const line of lines) {
            const words = (line.words || []).filter((word) => cleanText(word.text, 80));
            const lineText = cleanText(words.map((word) => word.text).join(' '), 240);
            if (!isKeywordTableHeaderText(lineText)) continue;
            const searchCenter = headerPhraseCenter(words, /^검색량$/i, imageWidth);
            const documentCenter = headerPhraseCenter(words, /^(?:블로그)?문서수$/i, imageWidth);
            const opportunityCenter = headerPhraseCenter(words, /^기회지수$/i, imageWidth);
            const boundaries = boundariesFromNumericCenters([searchCenter, documentCenter, opportunityCenter]);
            if (boundaries) return boundaries;
        }
        return null;
    }

    function numericClusterCost(values, start, end) {
        const segment = values.slice(start, end);
        const center = segment.reduce((sum, value) => sum + value, 0) / segment.length;
        return {
            center,
            cost: segment.reduce((sum, value) => sum + ((value - center) ** 2), 0),
        };
    }

    function inferNumericClusterBoundaries(lines, imageWidth) {
        const centers = [];
        lines.forEach((line) => {
            const words = (line.words || []).filter((word) => cleanText(word.text, 80));
            const lineText = cleanText(words.map((word) => word.text).join(' '), 240);
            if (isKeywordTableHeaderText(lineText)) return;
            const lineCenters = words.map((word) => {
                const text = cleanText(word.text, 80).replace(/\s+/g, '');
                if (!text || !/^[0-9OoIl|,，.]+$/.test(text) || parseNumber(text) == null) return null;
                const center = tesseractWordCenter(word, imageWidth);
                return Number.isFinite(center) && center >= 0.35 && center <= 1.1 ? center : null;
            }).filter(Number.isFinite).sort((left, right) => left - right);
            centers.push(...lineCenters.slice(-3));
        });
        centers.sort((left, right) => left - right);
        if (centers.length < 3) return null;

        let best = null;
        for (let firstEnd = 1; firstEnd <= centers.length - 2; firstEnd += 1) {
            for (let secondEnd = firstEnd + 1; secondEnd <= centers.length - 1; secondEnd += 1) {
                const first = numericClusterCost(centers, 0, firstEnd);
                const second = numericClusterCost(centers, firstEnd, secondEnd);
                const third = numericClusterCost(centers, secondEnd, centers.length);
                const boundaries = boundariesFromNumericCenters([first.center, second.center, third.center]);
                if (!boundaries) continue;
                const cost = first.cost + second.cost + third.cost;
                if (!best || cost < best.cost) best = { boundaries, cost };
            }
        }
        return best ? best.boundaries : null;
    }

    function inferTesseractColumnBoundaries(lines, imageWidth) {
        return inferHeaderBoundaries(lines, imageWidth)
            || inferNumericClusterBoundaries(lines, imageWidth)
            || FALLBACK_TESSERACT_BOUNDARIES;
    }

    function parseTesseractResult(result, imageWidth) {
        const data = result && result.data ? result.data : result || {};
        const width = Math.max(1, Number(imageWidth) || 1);
        const rows = [];
        const lines = tesseractLines(data.blocks);
        const boundaries = inferTesseractColumnBoundaries(lines, width);
        lines.forEach((line) => {
            const words = (line.words || []).filter((word) => cleanText(word.text, 80));
            const columns = [[], [], [], []];
            words.forEach((word) => {
                const center = tesseractWordCenter(word, width);
                const safeCenter = Number.isFinite(center) ? center : 0;
                const column = safeCenter < boundaries[0] ? 0 : safeCenter < boundaries[1] ? 1 : safeCenter < boundaries[2] ? 2 : 3;
                columns[column].push(word);
            });
            const lineText = cleanText(words.map((word) => word.text).join(' '), 240);
            if (isKeywordTableHeaderText(lineText)) return;
            const keyword = columns[0].map((word) => word.text).join(' ');
            const searchVolume = columns[1].map((word) => word.text).join('');
            const documentCount = columns[2].map((word) => word.text).join('');
            const confidences = words.map((word) => Number(word.confidence)).filter(Number.isFinite);
            const ocrConfidence = confidences.length
                ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
                : undefined;
            if (keyword || searchVolume || documentCount) {
                rows.push({ keyword, searchVolume, documentCount, ocrConfidence });
            }
        });
        if (rows.length > 0) return prepareKeywordDraftRows(rows);
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
        collectPublishableKeywordRows,
        mergeKeywordRowGroups,
        mergeKeywordRows,
        normalizeKeywordRow,
        opportunityFrom,
        parseKeywordTableText,
        parseTesseractResult,
        prepareKeywordDraftRows,
        rowsToTsv,
    });
});
