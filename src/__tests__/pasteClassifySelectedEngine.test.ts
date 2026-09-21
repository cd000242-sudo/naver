import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * [2026-09-22 사장님] "왜 자꾸 제미나이 키에 의존하냐. GPT 면 GPT, 에이전트면 에이전트 —
 * 선택한 api 나 에이전트에 의존해야지."
 *
 * 반자동 붙여넣기 분류(paste:classify)가 Gemini 로 직행했고 키가 없으면 그냥 실패라
 * 제목이 소제목으로 남았다. 보조 호출은 선택 엔진으로 간다.
 */
const mocks = vi.hoisted(() => ({
  route: null as null | { engine: string; callText: ReturnType<typeof vi.fn> },
  config: {} as Record<string, unknown>,
  geminiGenerate: vi.fn(),
}));

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock('../main/ipc/selectedEngineTextCaller.js', () => ({
  resolveSelectedEngineTextCaller: vi.fn(async () => mocks.route),
}));
vi.mock('../configManager.js', () => ({
  loadConfig: vi.fn(async () => mocks.config),
}));
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: mocks.geminiGenerate };
    }
  },
}));

import { classifyPastedText, parsePasteClassifyResponse } from '../main/ipc/pasteClassifyHandlers';

const ARTICLE = [
  '2026 셀토스 하이브리드 모의견적, 프레스티지에 두 옵션 넣으니 시그니처와 106만원 차이',
  '',
  '2026 셀토스 하이브리드 가격표를 처음 보면 2,940만원부터라는 숫자가 먼저 들어옵니다.',
  '',
  '## 니처와 106만원 차이',
  '',
  '차이가 106만원밖에 남지 않습니다.',
].join('\n');

const REPLY = JSON.stringify({
  title: '2026 셀토스 하이브리드 모의견적, 프레스티지에 두 옵션 넣으니 시그니처와 106만원 차이',
  body: '2026 셀토스 하이브리드 가격표를 처음 보면 2,940만원부터라는 숫자가 먼저 들어옵니다.\n\n## 니처와 106만원 차이\n\n차이가 106만원밖에 남지 않습니다.',
  hashtags: '#셀토스 #하이브리드',
  headings: ['니처와 106만원 차이'],
});

beforeEach(() => {
  mocks.route = null;
  mocks.config = {};
  mocks.geminiGenerate.mockReset();
});

describe('paste:classify — 선택 엔진 우선', () => {
  it('GPT/Claude/에이전트를 골랐으면 Gemini 키가 있어도 그 엔진으로 분류한다', async () => {
    const callText = vi.fn().mockResolvedValue(REPLY);
    mocks.route = { engine: 'openai:gpt-4.1-mini', callText };
    mocks.config = { geminiApiKey: 'gemini-key-must-not-be-used', defaultAiProvider: 'openai' };

    const result = await classifyPastedText(ARTICLE);

    expect(callText).toHaveBeenCalledTimes(1);
    expect(mocks.geminiGenerate).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.engine).toBe('openai:gpt-4.1-mini');
    expect(result.title).toContain('셀토스 하이브리드 모의견적');
    expect(result.headings).toEqual(['니처와 106만원 차이']);
  });

  it('선택 엔진이 Gemini 면 기존 Gemini 경로를 그대로 탄다', async () => {
    mocks.config = { geminiApiKey: 'gemini-key', defaultAiProvider: 'gemini' };
    mocks.geminiGenerate.mockResolvedValue({ response: { text: () => REPLY } });

    const result = await classifyPastedText(ARTICLE);

    expect(mocks.geminiGenerate).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.engine).toMatch(/^gemini:/);
  });

  it('GPT 를 골랐는데 키가 없으면 Gemini 로 몰래 넘어가지 않고 그 엔진 이름으로 실패를 알린다', async () => {
    mocks.route = null; // 키가 없어 경로를 못 만든 상태
    mocks.config = { defaultAiProvider: 'openai' };

    const result = await classifyPastedText(ARTICLE);

    expect(result.success).toBe(false);
    expect(result.error).toContain('openai');
    expect(result.error).not.toContain('Gemini API 키');
    expect(mocks.geminiGenerate).not.toHaveBeenCalled();
  });

  it('코드펜스로 감싼 응답도 읽는다 (구독 CLI 는 JSON 모드가 없다)', () => {
    const parsed = parsePasteClassifyResponse('```json\n' + REPLY + '\n```', ARTICLE);
    expect(parsed.title).toContain('셀토스');
    expect(parsed.hashtags).toBe('#셀토스 #하이브리드');
  });

  it('앞뒤 설명이 섞인 응답에서도 첫 JSON 블록을 꺼낸다', () => {
    const parsed = parsePasteClassifyResponse('분류 결과입니다.\n' + REPLY + '\n이상입니다.', ARTICLE);
    expect(parsed.headings).toEqual(['니처와 106만원 차이']);
  });
});
