/**
 * 브라우저 → Anthropic 직접 호출로 문제해결형 서브키워드를 제안받는다.
 *
 * 경유 서버가 없다(이 사이트는 서버리스). 키는 사용자의 것이고 localStorage 에만
 * 있으며, 요청은 이 브라우저에서 Anthropic 으로 바로 나간다
 * (anthropic-dangerous-direct-browser-access — Anthropic 이 공식 지원하는 방식).
 *
 * 정직성 규칙: 여기서 받은 제안은 **실존 미검증**이다. 데스크톱·보드 파이프라인처럼
 * 검색광고/자동완성 결재를 브라우저에서 돌릴 수 없으므로(CORS), 화면은 반드시
 * "AI 제안 · 검증 전" 라벨과 네이버 검색 확인 링크를 함께 내보내야 한다.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001'; // 짧은 제안용 — 빠르고 저렴

export interface AiSubSuggestion {
    keyword: string;
}

export async function proposeAiSubKeywords(
    apiKey: string,
    mainKeyword: string,
): Promise<AiSubSuggestion[]> {
    const prompt = [
        '너는 네이버 검색어 데이터 전문가다.',
        `검색 키워드 "${mainKeyword}" 에 대해, 사람들이 실제로 네이버 검색창에 치는 **문제해결형 파생 검색어** 5개를 제안하라.`,
        '',
        '지켜라:',
        `- "${mainKeyword}" 의 핵심 명사를 포함`,
        '- 검색창에 치는 짧은 명사구 형태: 2~4어절, 공백 제외 15자 이내. 질문 문장·조사 금지',
        '- 문제/실수/원인/해결/안됨/비교 각도만 (추천·후기·일반 정보형 금지)',
        '- JSON 문자열 배열로만 출력: ["검색어1", "검색어2", ...]',
    ].join('\n');

    const response = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
            model: MODEL,
            max_tokens: 300,
            messages: [{ role: 'user', content: prompt }],
        }),
    });
    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Anthropic ${response.status} — ${detail.slice(0, 140)}`);
    }
    const data = await response.json();
    const text: string = data?.content?.[0]?.text || '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    let parsed: unknown;
    try { parsed = JSON.parse(match[0]); } catch { return []; }
    if (!Array.isArray(parsed)) return [];
    const mainTokens = new Set(mainKeyword.split(/\s+/).filter((t) => t.length >= 2));
    return parsed
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length >= 4 && item.replace(/\s+/g, '').length <= 15 && item !== mainKeyword)
        .filter((item) => item.split(/\s+/).some((token) => mainTokens.has(token)))
        .slice(0, 5)
        .map((keyword) => ({ keyword }));
}
