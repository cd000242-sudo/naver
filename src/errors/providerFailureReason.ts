// src/errors/providerFailureReason.ts
// [2026-09-10] AI 벤더 실패를 "사용자가 무엇을 하면 되는지"로 옮기는 순수 변환기.
//
// 사장님 실측: 사진 11장이 전부 실패했는데 화면에는 "비전 엔진/키 상태를 확인해주세요"만
// 떴다. 진짜 원인(`429 You have no credits remaining.`)은 로그를 열어야 보였고, 그래서
// 앱이 고장 난 것으로 읽혔다. 원인을 아는데 안 알려주는 것은 모르는 것보다 나쁘다.
//
// 계약: 확신할 수 있을 때만 단정한다. 못 가르면 unknown 으로 두고 벤더 원문을 그대로
// 남긴다 — 틀린 안내는 사용자를 엉뚱한 곳(결제 페이지)으로 보낸다.

/** 사용자가 취할 행동이 갈리는 단위로만 나눈다. */
export type ProviderFailureKind =
  | 'no-credits'   // 돈을 넣어야 풀린다
  | 'invalid-key'  // 키를 다시 넣어야 한다
  | 'rate-limit'   // 기다리면 풀린다
  | 'network'      // 연결 문제
  | 'unknown';

export interface ProviderFailureSummary {
  readonly kind: ProviderFailureKind;
  /** 화면에 그대로 띄울 문장. */
  readonly message: string;
}

/** 벤더 표시 이름 — 사용자가 결제 페이지에서 보는 이름과 같아야 한다. */
const VENDOR_LABEL: Record<string, string> = {
  openai: 'OpenAI',
  gpt: 'OpenAI',
  claude: 'Claude(Anthropic)',
  anthropic: 'Claude(Anthropic)',
  gemini: 'Google Gemini',
  google: 'Google Gemini',
  perplexity: 'Perplexity',
  deepinfra: 'DeepInfra',
};

/** 충전하러 갈 곳. 모르는 벤더는 안내하지 않는다(엉뚱한 링크가 더 나쁘다). */
const BILLING_URL: Record<string, string> = {
  openai: 'platform.openai.com/settings/organization/billing',
  gpt: 'platform.openai.com/settings/organization/billing',
  claude: 'console.anthropic.com/settings/billing',
  anthropic: 'console.anthropic.com/settings/billing',
  gemini: 'aistudio.google.com/app/apikey',
  google: 'aistudio.google.com/app/apikey',
};

function vendorKey(provider: string): string {
  const raw = String(provider || '').toLowerCase();
  for (const key of Object.keys(VENDOR_LABEL)) {
    if (raw.includes(key)) return key;
  }
  return raw;
}

export function providerLabel(provider: string): string {
  return VENDOR_LABEL[vendorKey(provider)] ?? (String(provider || '').trim() || '선택한 엔진');
}

/*
 * 크레딧 소진은 벤더마다 말이 다르다. 실측 문구를 그대로 담는다.
 *   OpenAI    : "429 You have no credits remaining." / "insufficient_quota"
 *   Anthropic : "Your credit balance is too low to access the API"
 *   Gemini    : "RESOURCE_EXHAUSTED ... enable billing"
 * 주의: 429 라고 다 크레딧은 아니다 — 순수 호출 한도(rate limit)와 반드시 갈라야 한다.
 * 그래서 크레딧 판정을 먼저 하고, 남은 429 만 rate-limit 으로 본다.
 */
const NO_CREDITS = /no credits remaining|insufficient[_ ]quota|credit balance is too low|billing_not_active|enable billing|quota exceeded|exceeded your current quota|payment required|402/i;
const INVALID_KEY = /invalid[_ ]api[_ ]key|incorrect api key|api key not valid|api_key_invalid|unauthorized|permission[_ ]denied|401|403/i;
const RATE_LIMIT = /rate limit|too many requests|overloaded|429|503|resource[_ ]exhausted/i;
const NETWORK = /etimedout|econnreset|econnrefused|enotfound|socket hang up|fetch failed|network error|timeout/i;

export function classifyProviderFailure(raw: unknown): ProviderFailureKind {
  const text = String(raw ?? '').trim();
  if (!text) return 'unknown';
  if (NO_CREDITS.test(text)) return 'no-credits';
  if (INVALID_KEY.test(text)) return 'invalid-key';
  if (RATE_LIMIT.test(text)) return 'rate-limit';
  if (NETWORK.test(text)) return 'network';
  return 'unknown';
}

export function describeProviderFailure(
  kind: ProviderFailureKind,
  provider: string,
  rawSample = '',
): string {
  const label = providerLabel(provider);
  const billing = BILLING_URL[vendorKey(provider)];

  switch (kind) {
    case 'no-credits':
      return (
        `💳 ${label} 크레딧이 없습니다. 결제 잔액을 충전한 뒤 다시 시도해주세요`
        + (billing ? ` (${billing})` : '')
        + '. 지금 바로 쓰시려면 앱을 다시 켜고 글생성 엔진을 잔액이 남은 다른 엔진으로 바꿔주세요.'
      );
    case 'invalid-key':
      return (
        `🔑 ${label} API 키가 거부됐습니다. 설정 > API 키에서 키를 다시 입력해주세요. `
        + '키를 복사할 때 앞뒤 공백이 섞이면 같은 오류가 납니다.'
      );
    case 'rate-limit':
      return (
        `⏳ ${label} 호출 한도에 걸렸습니다(크레딧 문제 아님). 잠시(1~2분) 기다린 뒤 다시 시도해주세요. `
        + '계속 반복되면 사진 장수를 줄이거나 다른 엔진으로 바꿔주세요.'
      );
    case 'network':
      return `🌐 ${label} 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.`;
    default:
      return (
        `${label} 호출이 실패했습니다`
        + (rawSample ? ` — ${rawSample}` : '')
        + '. 같은 오류가 반복되면 이 문구와 함께 문의해주세요.'
      );
  }
}

/**
 * 여러 번 실패했을 때 대표 원인 하나를 고른다.
 *
 * 사진 11장이 같은 이유로 죽었으면 안내도 하나여야 한다. 원인이 섞였으면 가장 많은 것을
 * 대표로 삼되, unknown 은 대표가 되지 않는다 — 아는 원인이 하나라도 있으면 그게 더 쓸모 있다.
 */
export function summarizeProviderFailures(
  rawFailures: readonly unknown[],
  provider: string,
): ProviderFailureSummary {
  const texts = rawFailures.map((f) => String(f ?? '').trim()).filter(Boolean);
  if (texts.length === 0) {
    return { kind: 'unknown', message: describeProviderFailure('unknown', provider) };
  }

  const counts = new Map<ProviderFailureKind, number>();
  for (const text of texts) {
    const kind = classifyProviderFailure(text);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }

  let best: ProviderFailureKind = 'unknown';
  let bestCount = 0;
  for (const [kind, count] of counts) {
    if (kind === 'unknown') continue;
    if (count > bestCount) {
      best = kind;
      bestCount = count;
    }
  }

  return { kind: best, message: describeProviderFailure(best, provider, texts[0]!.substring(0, 200)) };
}
