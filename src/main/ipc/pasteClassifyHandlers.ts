// src/main/ipc/pasteClassifyHandlers.ts
// [v2.10.281] paste된 자유 형식 글을 LLM이 분류해서 4개 필드(title/body/headings/hashtags)로 분배
// 사용자가 외부 LLM 결과를 paste할 때 마커([제목]/[본문]/[해시태그])가 없으면
// LLM 으로 분류해서 자동 분배.
//
// [2026-09-22 사장님] "왜 자꾸 제미나이 키에 의존하냐. GPT 면 GPT, 에이전트면 에이전트 —
//   선택한 엔진에 의존해야지." 이 분류는 Gemini 로 직행했고 키가 없으면 그냥 실패였다.
//   보조 호출은 선택 엔진으로 간다(selectedEngineTextCaller). 선택 엔진이 Gemini 일 때만
//   Gemini 경로를 탄다. 다른 벤더로 몰래 넘어가지 않는다.

import { ipcMain } from 'electron';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadConfig } from '../../configManager.js';
import { GEMINI_TEXT_MODELS } from '../../runtime/modelRegistry.js';
import { resolveSelectedEngineTextCaller } from './selectedEngineTextCaller.js';

export interface PasteClassifyResult {
    success: boolean;
    title?: string;
    body?: string;
    hashtags?: string;
    headings?: string[];
    error?: string;
    engine?: string;
}

const CLASSIFY_PROMPT = `다음 한국어 글을 네이버 블로그 형식의 4개 필드로 분류해서 JSON으로만 반환하세요.

[입력 글]
{{INPUT}}

[규칙]
1. title: 글의 제목 한 줄 (35자 이내, 없으면 빈 문자열). 제목이 본문 첫 줄로 들어있으면 그것을 추출.
2. body: 본문 전체 (제목/해시태그 제외). 마크다운 ## 헤더 포함 가능.
3. hashtags: 해시태그 한 줄 (예: "#태그1 #태그2"). 없으면 빈 문자열.
4. headings: 본문 안의 소제목 배열 (## 헤더 또는 단락별 핵심 주제 5~7개 추출).

[출력 형식 — 반드시 이 JSON만, 다른 설명 금지]
{
  "title": "제목 텍스트",
  "body": "본문 전체 텍스트",
  "hashtags": "#태그1 #태그2",
  "headings": ["소제목1", "소제목2"]
}`;

export function buildPasteClassifyPrompt(rawText: string): string {
    return CLASSIFY_PROMPT.replace('{{INPUT}}', rawText.slice(0, 8000)); // 8000자 안전 한도
}

/** 모델 응답(JSON 또는 코드펜스 JSON)을 4개 필드로 정리한다. 타입이 어긋나면 안전값. */
export function parsePasteClassifyResponse(responseText: string, rawText: string): Omit<PasteClassifyResult, 'success' | 'error' | 'engine'> {
    const trimmed = String(responseText || '').trim();
    let parsed: any;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        // 코드 펜스 제거 후 재시도. 그래도 안 되면 첫 {…} 블록만 잘라 본다.
        const cleaned = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
        try {
            parsed = JSON.parse(cleaned);
        } catch {
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            parsed = start >= 0 && end > start ? JSON.parse(cleaned.slice(start, end + 1)) : {};
        }
    }

    const safeTitle = typeof parsed.title === 'string' ? parsed.title.trim() : '';
    const safeBody = typeof parsed.body === 'string' && parsed.body.trim() ? parsed.body.trim() : rawText.trim();
    const safeHashtags = typeof parsed.hashtags === 'string' ? parsed.hashtags.trim() : '';
    const safeHeadings = Array.isArray(parsed.headings)
        ? parsed.headings.filter((h: any) => typeof h === 'string' && h.trim().length > 0).map((h: string) => h.trim())
        : [];
    return { title: safeTitle, body: safeBody, hashtags: safeHashtags, headings: safeHeadings };
}

async function classifyWithGemini(prompt: string): Promise<{ text: string; engine: string } | { error: string }> {
    const config = await loadConfig();
    const apiKey = (config as any).geminiApiKey?.trim();
    if (!apiKey) {
        return { error: 'Gemini API 키가 설정되지 않음' };
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: GEMINI_TEXT_MODELS.FLASH_LITE,
        generationConfig: {
            temperature: 0.1, // 결정적 분류
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
        } as any,
    });
    const result = await model.generateContent(prompt);
    return { text: result.response.text(), engine: `gemini:${GEMINI_TEXT_MODELS.FLASH_LITE}` };
}

export async function classifyPastedText(rawText: string): Promise<PasteClassifyResult> {
    try {
        if (!rawText || rawText.trim().length < 20) {
            return { success: false, error: '입력 텍스트가 너무 짧음 (20자 이상 필요)' };
        }
        const prompt = buildPasteClassifyPrompt(rawText);

        // 선택 엔진(GPT·Claude·에이전트 구독 등)이 있으면 그것으로. Gemini 선택/미해석이면 null.
        const route = await resolveSelectedEngineTextCaller();
        const called = route
            ? { text: await route.callText(prompt, 4096), engine: route.engine }
            : await classifyWithGemini(prompt);
        if ('error' in called) {
            const config = await loadConfig().catch(() => ({} as Record<string, unknown>));
            const generator = String((config as any).defaultAiProvider || '').trim();
            const error = generator && generator !== 'gemini'
                ? `선택한 엔진(${generator})의 키/연동이 없어 분류하지 못했습니다`
                : called.error;
            return { success: false, error };
        }

        console.log(`[paste:classify] 🤖 분류 엔진: ${called.engine}`);
        return { success: true, engine: called.engine, ...parsePasteClassifyResponse(called.text, rawText) };
    } catch (error) {
        console.error('[paste:classify] LLM 분류 실패:', error);
        return {
            success: false,
            error: (error as Error).message || '분류 실패',
        };
    }
}

export function registerPasteClassifyHandlers(): void {
    ipcMain.handle('paste:classify', async (_event, rawText: string): Promise<PasteClassifyResult> => classifyPastedText(rawText));
}
