// src/crawler/issueHarness/visionJudges.ts
//
// 벤더별 "여러 장 한 번에" 판정 호출. 게이트의 판정 규칙(프롬프트)과 파싱은
// visionGate.ts 가 갖고 있고, 여기는 순수하게 "이 이미지들과 이 프롬프트를 고른 벤더에
// 보내 원문 응답을 받아 온다" 만 한다.
//
// 배치(8장/1회)를 유지하는 이유는 비용이다 — 한 장씩 보내면 호출 수가 8배가 된다.

import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { IssueVisionRoute } from './visionRoute.js';
import { stagedImageName } from '../../agentCli/imageStaging.js';
import { isOpenAiReasoningModel } from '../../runtime/openaiReasoningFamily.js';

const LOG = '[IssueVisionJudge]';
const REQUEST_TIMEOUT_MS = 90_000;
const AGENT_TIMEOUT_MS = 180_000;

export interface VisionJudgeImage {
  /** JPEG base64 (헤더 없음) */
  base64: string;
}

async function judgeWithGemini(
  images: readonly VisionJudgeImage[],
  prompt: string,
  route: IssueVisionRoute,
): Promise<string> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const { trackGeminiUsage } = await import('../../gemini.js');
  const client = new GoogleGenerativeAI(route.apiKey);
  // Thinking 계열은 추론 토큰이 출력 예산을 먹는다 — JSON 모드 + 넉넉한 상한으로
  // 판정 배열이 잘려 배치 전체가 fail-closed 되는 것을 막는다.
  const model = client.getGenerativeModel({
    model: route.model,
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096, responseMimeType: 'application/json' },
  });
  const parts: any[] = images.map((image) => ({
    inlineData: { mimeType: 'image/jpeg', data: image.base64 },
  }));
  parts.push({ text: prompt });

  const result = await model.generateContent(parts);
  const usage = (result.response as any).usageMetadata;
  if (usage) {
    const promptTokens = usage.promptTokenCount || 0;
    const total = usage.totalTokenCount || 0;
    trackGeminiUsage(route.model, promptTokens, total > promptTokens ? total - promptTokens : (usage.candidatesTokenCount || 0));
  }
  return result.response.text().trim();
}

/**
 * [2026-09-17] Request body for the OpenAI judge. Pure so a test can pin it.
 *
 * Live failure (사장님 log, 나나 article): every batch returned 400
 * "'max_tokens' is not supported with this model. Use 'max_completion_tokens'" for
 * gpt-5.6-terra, the gate is fail-closed, so 116 candidates → 0 verified images.
 * The photo-mode adapter (openaiVisionAdapter.ts, v2.11.135) had already learned the
 * same three lessons; this file was written separately and kept the old shape:
 *   1. max_completion_tokens — accepted by old and new models alike.
 *   2. reasoning-family models reject a non-default temperature the same way.
 *   3. reasoning-family models spend the token budget on reasoning first, so a JSON
 *      verdict can come back empty — effort low keeps the budget for the answer.
 */
export function buildOpenAiVisionBody(
  model: string,
  content: readonly unknown[],
): Record<string, unknown> {
  const reasoning = isOpenAiReasoningModel(model);
  return {
    model,
    ...(reasoning ? { reasoning_effort: 'low' } : { temperature: 0.1 }),
    max_completion_tokens: 4096,
    messages: [{ role: 'user', content }],
  };
}

async function judgeWithOpenAI(
  images: readonly VisionJudgeImage[],
  prompt: string,
  route: IssueVisionRoute,
): Promise<string> {
  const content: any[] = images.map((image) => ({
    type: 'image_url',
    // 저해상도 모드 — 워터마크·자막 판정에는 충분하고 토큰이 크게 줄어든다.
    image_url: { url: `data:image/jpeg;base64,${image.base64}`, detail: 'low' },
  }));
  content.push({ type: 'text', text: prompt });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${route.apiKey}` },
    body: JSON.stringify(buildOpenAiVisionBody(route.model, content)),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`OpenAI vision ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return String(data.choices?.[0]?.message?.content || '').trim();
}

async function judgeWithClaude(
  images: readonly VisionJudgeImage[],
  prompt: string,
  route: IssueVisionRoute,
): Promise<string> {
  const content: any[] = images.map((image) => ({
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: image.base64 },
  }));
  content.push({ type: 'text', text: prompt });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': route.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: route.model,
      max_tokens: 4096,
      temperature: 0.1,
      messages: [{ role: 'user', content }],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Claude vision ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const data = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  return String(data.content?.find((part) => part.type === 'text')?.text || '').trim();
}

/** 구독 CLI로 판정 — API 과금 0. 이미지를 임시 파일로 내려 CLI 에 직접 넘긴다. */
async function judgeWithAgent(
  images: readonly VisionJudgeImage[],
  prompt: string,
  route: IssueVisionRoute,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'issue-vision-'));
  try {
    const paths: string[] = [];
    const names: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const name = `image-${i + 1}.jpg`;
      const filePath = join(dir, name);
      await writeFile(filePath, Buffer.from(images[i].base64, 'base64'));
      paths.push(filePath);
      // [2026-09-23] The runner copies these into its own cwd as photo-01.jpg … (imageStaging). Naming
      //   the temp files here ("image-1.jpg") pointed the model at files that do not exist there — the
      //   subscription judge answered "이미지 파일을 찾을 수 없어" and every candidate fell back (live run).
      names.push(stagedImageName(i, filePath));
    }
    const withFiles = `${prompt}\n\n검사할 이미지 파일(순서대로): ${names.join(', ')}`;

    if (route.vendor === 'agent-codex') {
      const { runCodex } = await import('../../agentCli/codexRunner.js');
      return await runCodex(withFiles, { imagePaths: paths, timeoutMs: AGENT_TIMEOUT_MS });
    }
    const { runClaude } = await import('../../agentCli/claudeRunner.js');
    return await runClaude(withFiles, { imagePaths: paths, timeoutMs: AGENT_TIMEOUT_MS });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort */ });
  }
}

/**
 * 고른 벤더로 한 배치를 판정하고 모델 원문 응답을 돌려준다.
 * 파싱·fail-closed 규칙은 호출 측(visionGate.parseVerdicts)이 맡는다.
 */
export async function judgeImagesWithRoute(
  images: readonly VisionJudgeImage[],
  prompt: string,
  route: IssueVisionRoute,
): Promise<string> {
  switch (route.vendor) {
    case 'openai':
      return judgeWithOpenAI(images, prompt, route);
    case 'claude':
      return judgeWithClaude(images, prompt, route);
    case 'agent-claude':
    case 'agent-codex':
      return judgeWithAgent(images, prompt, route);
    case 'gemini':
      return judgeWithGemini(images, prompt, route);
    default: {
      // 새 벤더가 생겨도 조용히 Gemini 로 청구되지 않게 막는다.
      const unknown: never = route.vendor;
      throw new Error(`${LOG} 지원하지 않는 비전 벤더: ${String(unknown)}`);
    }
  }
}
