// src/crawler/issueHarness/visionRoute.ts
//
// [2026-09-15 사장님] "API 비용이 최대한 안 들고 이미지를 수집하는 걸 원하는 거지.
// 청구되더라도 지피티면 지피티, 클로드면 클로드, 에이전트면 에이전트로 비전이 돌아가게
// 해줘야 정상이잖아."
//
// 수집기의 Vision 게이트는 벤더가 Gemini 로 박혀 있었다. 사용자가 GPT·Claude·에이전트를
// 골라도 Gemini 키만 있으면 Gemini 로 청구됐다. 여기서 "고른 글생성 엔진 → 같은 벤더의
// 비전" 으로 한 번에 결정한다. 규칙은 사진 모드(main.ts vision:infer-and-write)와 같다.
//
// 비용 우선순위:
//   1) 에이전트 구독(agent-claude / agent-codex) → 추가 과금 0
//   2) 고른 벤더의 API 키 → 그 벤더로만 청구
//   3) 키 없음 → null → 호출 측이 무료 캡션 게이트로 내려간다 (조용한 벤더 전환 금지)

import { routeTextToVision, isAgentTextProvider } from '../../runtime/modelRegistry.js';

export type VisionJudgeVendor = 'gemini' | 'openai' | 'claude' | 'agent-claude' | 'agent-codex';

export interface IssueVisionRoute {
  vendor: VisionJudgeVendor;
  /** API 모드에서 실제로 호출할 모델. 에이전트 모드에서는 라벨 용도. */
  model: string;
  /** 에이전트 모드에서는 비어 있다(구독 CLI). */
  apiKey: string;
  /** 화면·로그에 그대로 보여 줄 이름. */
  label: string;
  /** 구독 CLI라서 API 과금이 0인가. */
  free: boolean;
  /** 고른 엔진이 비전을 못 해서 다른 벤더로 갔는가 — 조용히 넘기지 않고 알린다. */
  fellBack: boolean;
  reason?: string;
}

function firstUsable(...values: unknown[]): string {
  for (const raw of values) {
    if (Array.isArray(raw)) {
      const found = raw.map((k) => String(k ?? '').trim()).find((k) => k.length > 0 && !k.startsWith('enc:'));
      if (found) return found;
      continue;
    }
    const value = typeof raw === 'string' ? raw.trim() : '';
    // 암호화 저장본("enc:…")은 복호화 전이라 인증이 실패한다 — 없는 것으로 본다.
    if (value && !value.startsWith('enc:')) return value;
  }
  return '';
}

/*
 * 키를 한 곳에서만 찾다가 "키가 있는데 없다고" 하는 일을 막는다.
 * 실측(2026-09-12): 활성 계정 설정에 평문 Gemini 키가 있는데도 수집기는 키 없음으로 돌았다.
 * 저장 위치가 여럿이다 — 정규화 필드 / 다중 키 배열 / 하이픈 표기 / 환경변수.
 */
export function resolveIssueVisionKey(config: unknown): string {
  const c = (config ?? {}) as Record<string, unknown>;
  return firstUsable(c.geminiApiKey, c.geminiApiKeys, c['gemini-api-key'], process.env.GEMINI_API_KEY);
}

function resolveVendorKey(config: Record<string, unknown>, vendor: 'gemini' | 'openai' | 'claude'): string {
  if (vendor === 'openai') return firstUsable(config.openaiApiKey, config['openai-api-key'], process.env.OPENAI_API_KEY);
  if (vendor === 'claude') {
    return firstUsable(
      config.claudeApiKey,
      config.anthropicApiKey,
      config['claude-api-key'],
      process.env.ANTHROPIC_API_KEY,
      process.env.CLAUDE_API_KEY,
    );
  }
  return resolveIssueVisionKey(config);
}

/**
 * 고른 글생성 엔진으로 수집기 Vision 경로를 정한다.
 * 쓸 수 없으면 null — 호출 측은 무료 캡션 게이트로 내려간다.
 */
export function resolveIssueVisionRoute(config: unknown): IssueVisionRoute | null {
  const c = (config ?? {}) as Record<string, unknown>;
  const textEngine = String(c.primaryGeminiTextModel ?? '').trim();

  if (isAgentTextProvider(textEngine)) {
    if (textEngine === 'agent-gemini') {
      /*
       * agy(Gemini CLI)는 헤드리스에서 파일 열람이 권한 게이트에 막혀 비전을 못 한다
       * (사진 모드에서 이미 확인된 제약). 몰래 다른 벤더로 청구하지 않는다.
       */
      return null;
    }
    const vendor = textEngine === 'agent-codex' ? 'agent-codex' : 'agent-claude';
    return {
      vendor,
      model: vendor,
      apiKey: '',
      label: vendor === 'agent-codex' ? 'Codex 구독' : 'Claude 구독',
      free: true,
      fellBack: false,
    };
  }

  const routed = routeTextToVision(textEngine);
  const vendor = routed.vendor;
  const apiKey = resolveVendorKey(c, vendor);
  if (!apiKey) return null;

  return {
    vendor,
    model: routed.model,
    apiKey,
    label: `${vendor} · ${routed.model}`,
    free: false,
    fellBack: routed.fellBack,
    reason: routed.reason,
  };
}
