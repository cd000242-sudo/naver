/**
 * 이번 실행에만 쓸 글감(2026-10-21) — 다중계정 실행에서 계정마다 키워드 · URL 하나를 지정한다.
 * 계정 설정의 키워드 목록 · 순번은 건드리지 않는다. 형식이 이상하면 추측하지 않고 실패한다.
 */
export interface RunContentSource { readonly type: 'keyword' | 'url'; readonly value: string }

export function resolveRunContentSource(options: unknown, accountId: string): RunContentSource | undefined {
  const map = (options as { contentSources?: Record<string, unknown> } | undefined)?.contentSources;
  if (!map || typeof map !== 'object' || !Object.prototype.hasOwnProperty.call(map, accountId)) return undefined;
  const raw = map[accountId] as { type?: unknown; value?: unknown } | undefined;
  const invalid = (): never => { throw new Error('RUN_CONTENT_SOURCE_INVALID: 이번 실행 글감은 200자 이하 키워드나 https 주소여야 합니다.'); };
  const value = typeof raw?.value === 'string' ? raw.value.replace(/\s+/g, ' ').trim() : '';
  if (raw?.type === 'keyword') return value && value.length <= 200 ? { type: 'keyword', value } : invalid();
  if (raw?.type === 'url') {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || value.length > 2000) invalid();
      return { type: 'url', value: url.toString() };
    } catch { return invalid(); }
  }
  return invalid();
}
