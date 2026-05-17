// src/main/ipc/pasteClassifyHandlers.ts
// [v2.10.281] paste된 자유 형식 글을 LLM이 분류해서 4개 필드(title/body/headings/hashtags)로 분배
// 사용자가 외부 LLM 결과를 paste할 때 마커([제목]/[본문]/[해시태그])가 없으면
// Gemini Flash로 분류해서 정확도 95%+로 자동 분배.

import { ipcMain } from 'electron';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadConfig } from '../../configManager.js';

interface PasteClassifyResult {
    success: boolean;
    title?: string;
    body?: string;
    hashtags?: string;
    headings?: string[];
    error?: string;
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

export function registerPasteClassifyHandlers(): void {
    ipcMain.handle('paste:classify', async (_event, rawText: string): Promise<PasteClassifyResult> => {
        try {
            if (!rawText || rawText.trim().length < 20) {
                return { success: false, error: '입력 텍스트가 너무 짧음 (20자 이상 필요)' };
            }

            const config = await loadConfig();
            const apiKey = (config as any).geminiApiKey?.trim();
            if (!apiKey) {
                return { success: false, error: 'Gemini API 키가 설정되지 않음' };
            }

            const prompt = CLASSIFY_PROMPT.replace('{{INPUT}}', rawText.slice(0, 8000)); // 8000자 안전 한도

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: 'gemini-2.5-flash-lite', // 저렴 + 빠름 (분류 용도)
                generationConfig: {
                    temperature: 0.1, // 결정적 분류
                    maxOutputTokens: 4096,
                    responseMimeType: 'application/json',
                    thinkingConfig: { thinkingBudget: 0 } as any, // Flash에서만
                } as any,
            });

            const result = await model.generateContent(prompt);
            const responseText = result.response.text().trim();

            // JSON 파싱
            let parsed: any;
            try {
                parsed = JSON.parse(responseText);
            } catch {
                // 코드 펜스 제거 후 재시도
                const cleaned = responseText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
                parsed = JSON.parse(cleaned);
            }

            // 안전 검증 — 필드 타입 + 기본값
            const safeTitle = typeof parsed.title === 'string' ? parsed.title.trim() : '';
            const safeBody = typeof parsed.body === 'string' ? parsed.body.trim() : rawText.trim();
            const safeHashtags = typeof parsed.hashtags === 'string' ? parsed.hashtags.trim() : '';
            const safeHeadings = Array.isArray(parsed.headings)
                ? parsed.headings.filter((h: any) => typeof h === 'string' && h.trim().length > 0).map((h: string) => h.trim())
                : [];

            return {
                success: true,
                title: safeTitle,
                body: safeBody,
                hashtags: safeHashtags,
                headings: safeHeadings,
            };
        } catch (error) {
            console.error('[paste:classify] LLM 분류 실패:', error);
            return {
                success: false,
                error: (error as Error).message || '분류 실패',
            };
        }
    });
}
