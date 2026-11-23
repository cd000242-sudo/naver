import type { AgentProvider } from './types.js';

export interface OfficialQuotaWindow {
  label: string;
  remainingPercent: number;
  resetsAt?: number;
}
export interface AgentOfficialQuota {
  provider: AgentProvider;
  state: 'ready' | 'unavailable' | 'not_logged_in' | 'unsupported' | 'account_changed';
  account?: string;
  plan?: string;
  windows: OfficialQuotaWindow[];
  checkedAt: number;
  message?: string;
}
export function quotaRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
}
export function cleanAccountLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text || text.length > 254 || /[\x00-\x1f\x7f]|bearer\s|sk-|eyJ[A-Za-z0-9_-]{12}/i.test(text)) return undefined;
  return text;
}
function remaining(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? Math.round((100-value)*10)/10 : undefined;
}
function resetTime(value: unknown, seconds = false): number | undefined {
  const time = typeof value === 'number' ? value * (seconds ? 1000 : 1) : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) && time > 0 && time < 8.64e15 ? time : undefined;
}
export function parseCodexQuota(value: unknown): OfficialQuotaWindow[] {
  const payload = quotaRecord(value);
  const buckets = quotaRecord(payload.rateLimitsByLimitId);
  const entries = Object.keys(buckets).length ? Object.entries(buckets) : [['Codex',payload.rateLimits]];
  return entries.slice(0,20).flatMap(([id, raw]) => {
    const bucket = quotaRecord(raw);
    return ['primary','secondary'].flatMap(key => {
      const window = quotaRecord(bucket[key]); const left = remaining(window.usedPercent);
      if (left === undefined) return [];
      const mins = typeof window.windowDurationMins === 'number' ? window.windowDurationMins : 0;
      const period = mins === 10080 ? '주간' : mins > 0 && mins % 60 === 0 ? `${mins/60}시간` : mins > 0 ? `${mins}분` : key === 'primary' ? '기본 한도' : '추가 한도';
      return [{ label: `${cleanAccountLabel(bucket.limitName) || cleanAccountLabel(id) || 'Codex'} · ${period}`, remainingPercent:left, resetsAt:resetTime(window.resetsAt,true) }];
    });
  });
}
export function parseClaudeQuota(value: unknown): OfficialQuotaWindow[] {
  const raw = quotaRecord(value);
  const labels: Record<string,string> = {five_hour:'5시간',seven_day:'주간',seven_day_opus:'Opus 주간',seven_day_sonnet:'Sonnet 주간',seven_day_fable:'Fable 주간',seven_day_oauth_apps:'연결 앱 주간'};
  return Object.entries(labels).flatMap(([key,label]) => {
    const window = quotaRecord(raw[key]);const left = remaining(window.utilization);
    return left === undefined ? [] : [{label,remainingPercent:left,resetsAt:resetTime(window.resets_at)}];
  });
}
