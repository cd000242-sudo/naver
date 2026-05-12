/**
 * Unit tests for Flow prompt-injection helpers — covers the v2.10.74+ subject
 * prepend defense against the upstream prompt-similarity regression.
 *
 * Regression context: Flow returned 4 visually identical images for posts
 * with similar headings (e.g. all "걸그룹" content) because the LLM-based
 * `generateEnglishPromptForHeading` produced near-identical base prompts.
 * Viewpoint hints alone proved insufficient — the explicit Subject line is
 * what forces per-heading differentiation at the prompt layer.
 */

import { describe, it, expect } from 'vitest';
import {
    injectHeadingVariation,
    injectUniqueSalt,
    sanitizeHeadingForPrompt,
    HEADING_VARIATION_HINT_COUNT,
} from '../image/flowPromptInjection';

describe('sanitizeHeadingForPrompt', () => {
    it('빈 입력은 빈 문자열', () => {
        expect(sanitizeHeadingForPrompt('')).toBe('');
        expect(sanitizeHeadingForPrompt(null as any)).toBe('');
        expect(sanitizeHeadingForPrompt(undefined as any)).toBe('');
    });

    it('마크다운 기호 제거', () => {
        expect(sanitizeHeadingForPrompt('## **걸그룹** 무대')).toBe('걸그룹 무대');
        expect(sanitizeHeadingForPrompt('> 인용문 헤딩')).toBe('인용문 헤딩');
        expect(sanitizeHeadingForPrompt('`code` 헤딩')).toBe('code 헤딩');
    });

    it('대괄호/꺾쇠 제거', () => {
        expect(sanitizeHeadingForPrompt('[속보] 헤딩 <업데이트>')).toBe('속보 헤딩 업데이트');
    });

    it('연속 공백 단일화 + trim', () => {
        expect(sanitizeHeadingForPrompt('  여러   공백   처리  ')).toBe('여러 공백 처리');
    });

    it('120자 초과 시 자름', () => {
        const long = 'a'.repeat(200);
        expect(sanitizeHeadingForPrompt(long).length).toBe(120);
    });

    it('한글 보존 (Flow 한국어 subject 리터럴 처리)', () => {
        expect(sanitizeHeadingForPrompt('걸그룹 신곡 발표 무대')).toBe('걸그룹 신곡 발표 무대');
    });
});

describe('injectUniqueSalt', () => {
    // v2.10.124: '#' 주석 → 자연어 trailing phrase (Flow cache hash strip 회피)
    it('prompt 끝에 자연어 trailing phrase 추가', () => {
        const out = injectUniqueSalt('a base prompt');
        expect(out).toMatch(/^a base prompt\n\nGeneration context tag [a-z0-9]+-[a-z0-9]+: ensure a fresh, distinctive composition\.$/);
    });

    it('호출마다 다른 salt 생성', () => {
        const a = injectUniqueSalt('p');
        const b = injectUniqueSalt('p');
        // Hot loop — 시간 + Math.random 둘 다 사용해 충돌 사실상 불가
        expect(a).not.toBe(b);
    });
});

describe('injectHeadingVariation — viewpoint + Subject prepend', () => {
    it('headingIndex 음수면 prompt 그대로 반환 (no-op)', () => {
        expect(injectHeadingVariation('base', -1, 'x')).toBe('base');
    });

    it('headingIndex 0 — 첫 viewpoint hint prepend', () => {
        const out = injectHeadingVariation('base prompt', 0);
        expect(out).toMatch(/^CRITICAL FRAMING: Use a low-angle close-up/);
        expect(out).toContain('\n\nbase prompt');
    });

    it('headingIndex 8 회전 — % cycle', () => {
        const out0 = injectHeadingVariation('base', 0);
        const out8 = injectHeadingVariation('base', HEADING_VARIATION_HINT_COUNT);
        // 같은 hint 재사용
        expect(out0).toBe(out8);
    });

    it('headingTitle 미제공 시 Subject 라인 없음 (legacy 호환)', () => {
        const out = injectHeadingVariation('base prompt', 0);
        expect(out).not.toContain('# Subject');
    });

    it('headingTitle 제공 시 Subject 라인이 viewpoint hint 위에 prepend', () => {
        const out = injectHeadingVariation('base prompt', 0, '걸그룹 신곡 무대');
        const lines = out.split('\n\n');
        expect(lines[0]).toBe('# Subject (must reflect this heading): 걸그룹 신곡 무대');
        expect(lines[1]).toMatch(/^CRITICAL FRAMING:/);
        expect(lines[2]).toBe('base prompt');
    });

    it('Subject가 viewpoint hint보다 *먼저* 나와야 함 (LLM anchoring 보장)', () => {
        const out = injectHeadingVariation('base', 3, '제주도 카페');
        const subjectIdx = out.indexOf('# Subject');
        const hintIdx = out.indexOf('CRITICAL FRAMING');
        expect(subjectIdx).toBeGreaterThanOrEqual(0);
        expect(hintIdx).toBeGreaterThan(subjectIdx);
    });

    it('headingTitle 빈 문자열은 Subject 라인 생략 (sanitize → empty)', () => {
        const out = injectHeadingVariation('base', 0, '   ');
        expect(out).not.toContain('# Subject');
    });

    it('headingTitle의 마크다운 기호는 정리됨', () => {
        const out = injectHeadingVariation('base', 0, '## **헤딩** [v1]');
        expect(out).toContain('# Subject (must reflect this heading): 헤딩 v1');
        // Subject 라인 안에 raw 마크다운 기호 없어야 함
        const subjectLine = out.split('\n')[0];
        expect(subjectLine).not.toMatch(/\*\*/);
        expect(subjectLine).not.toMatch(/\[/);
    });

    it('상류 회귀 시뮬 — 똑같은 base prompt + 다른 heading title이면 결과가 달라짐', () => {
        // 사용자 신고 케이스: LLM이 비슷한 헤딩에 같은 base prompt 만든 상황
        const sameLLMOutput = 'Korean girl group studio recording session';
        const a = injectHeadingVariation(sameLLMOutput, 0, '신곡 무대 첫 공개');
        const b = injectHeadingVariation(sameLLMOutput, 1, '팬미팅 단독 이벤트');
        const c = injectHeadingVariation(sameLLMOutput, 2, '시상식 수상 소감');
        const d = injectHeadingVariation(sameLLMOutput, 3, '예능 출연 비하인드');
        // 4개 모두 서로 달라야 함 (Subject + viewpoint 모두 다름)
        const all = [a, b, c, d];
        expect(new Set(all).size).toBe(4);
        // 각 prompt는 자기 헤딩 제목을 *명시* 포함
        expect(a).toContain('신곡 무대 첫 공개');
        expect(b).toContain('팬미팅 단독 이벤트');
        expect(c).toContain('시상식 수상 소감');
        expect(d).toContain('예능 출연 비하인드');
    });

    it('헤딩 8개 — 8 viewpoint × 8 subject 모두 고유', () => {
        const titles = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        const prompts = titles.map((t, i) => injectHeadingVariation('base', i, t));
        expect(new Set(prompts).size).toBe(8);
    });
});

describe('HEADING_VARIATION_HINT_COUNT', () => {
    it('8개 viewpoint 회전', () => {
        expect(HEADING_VARIATION_HINT_COUNT).toBe(8);
    });
});
