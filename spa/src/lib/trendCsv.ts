/**
 * 크리에이터 어드바이저 트렌드 CSV 읽기.
 *
 * 사장님 2026-09-10: 확장프로그램(Naver Trend Side Panel)이 내보내는 파일을 그대로 받는다.
 * 확장프로그램의 저장소는 브라우저가 가둬 둬서 밖에서 못 읽는다 — 우회하지 않고 CSV 로 받는다.
 *
 * CSV 가 주는 것: 카테고리 · 순위(1~20) · 키워드 · 순위변화.  ← 공급
 * 여기서 재는 것은 없다. 검색량·문서수·정면 글은 화면이 워커에 물어 채운다.  ← 판정
 *
 * 실측(2026-09-10 첨부 파일): 640행 · 32주제 × 20 · 고유 키워드 553.
 */

export interface TrendCsvRow {
    category: string;
    rank: number;
    keyword: string;
    /** 순위 변화. 빈 값이면 null(신규이거나 안 준 것). */
    change: number | null;
}

export interface TrendCsvParsed {
    rows: TrendCsvRow[];
    /** 파일에 있던 전체 행 수(중복 포함). */
    total: number;
    categories: string[];
}

/** 값이 따옴표로 감싸여 있고 안에 쉼표가 들어갈 수 있다. 이 한 모양만 읽으면 되므로 라이브러리를 안 들인다. */
function splitCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (quoted) {
            if (ch === '"') {
                if (line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false;
            } else cur += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ',') { out.push(cur); cur = ''; }
        else cur += ch;
    }
    out.push(cur);
    return out.map((value) => value.trim());
}

const HEADER_ALIASES: Record<string, 'category' | 'rank' | 'keyword' | 'change'> = {
    '카테고리': 'category', '주제': 'category', '분야': 'category',
    '순위': 'rank',
    '키워드': 'keyword', '검색어': 'keyword',
    '순위변화': 'change', '변화': 'change',
};

/**
 * 헤더 이름으로 열을 찾는다 — 열 순서가 바뀌어도 읽힌다.
 * 같은 키워드가 여러 주제에 겹치면 첫 번째(순위가 높은 쪽)만 남긴다: 실측을 두 번 하지 않는다.
 */
export function parseTrendCsv(text: string): TrendCsvParsed {
    const clean = text.replace(/^﻿/, '');
    const lines = clean.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (lines.length < 2) return { rows: [], total: 0, categories: [] };

    const header = splitCsvLine(lines[0]);
    const at: Partial<Record<'category' | 'rank' | 'keyword' | 'change', number>> = {};
    header.forEach((name, index) => {
        const key = HEADER_ALIASES[name.replace(/\s+/g, '')];
        if (key && at[key] === undefined) at[key] = index;
    });
    if (at.keyword === undefined) return { rows: [], total: 0, categories: [] };

    const seen = new Set<string>();
    const categories = new Set<string>();
    const rows: TrendCsvRow[] = [];
    let total = 0;
    for (const line of lines.slice(1)) {
        const cells = splitCsvLine(line);
        const keyword = String(cells[at.keyword] ?? '').trim();
        if (!keyword) continue;
        total += 1;
        const category = at.category !== undefined ? String(cells[at.category] ?? '').trim() : '';
        if (category) categories.add(category);
        const key = keyword.replace(/\s+/g, '');
        if (seen.has(key)) continue;
        seen.add(key);
        const rankRaw = at.rank !== undefined ? Number(cells[at.rank]) : NaN;
        const changeRaw = at.change !== undefined ? String(cells[at.change] ?? '').trim() : '';
        rows.push({
            category,
            rank: Number.isFinite(rankRaw) ? rankRaw : 0,
            keyword,
            change: changeRaw === '' || !Number.isFinite(Number(changeRaw)) ? null : Number(changeRaw),
        });
    }
    return { rows, total, categories: Array.from(categories).sort() };
}

/**
 * 자리 — 정면 글 수로 나눈다. 정면 글 = 상위 10 제목이 그 검색어를 그대로 담은 글.
 * 안 잰 것은 '안 잼'이고 0 이 아니다.
 */
export type TrendSeat = '열림' | '반열림' | '잠김' | '안 잼';

export function seatFromFacing(facing: number | null): TrendSeat {
    if (facing === null) return '안 잼';
    if (facing === 0) return '열림';
    if (facing <= 2) return '반열림';
    return '잠김';
}

/** 제목 목록에서 정면 글 수 세기 — 검색어 어절을 모두 담은 제목. 목록이 비면 null(못 잼). */
export function countFacing(titles: string[] | undefined, keyword: string): number | null {
    if (!Array.isArray(titles) || titles.length === 0) return null;
    const words = keyword.split(/\s+/).map((w) => w.trim()).filter((w) => w.length >= 2);
    if (words.length === 0) return null;
    const norm = (text: string) => text.replace(/\s+/g, '').toLowerCase();
    return titles.filter((title) => {
        const flat = norm(title);
        return words.every((word) => flat.includes(norm(word)));
    }).length;
}
