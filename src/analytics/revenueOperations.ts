export const REVENUE_CHANNELS = [
  'adpost',
  'shopping-connect',
  'affiliate',
  'sponsorship',
  'service',
  'other',
] as const;

export type RevenueChannel = typeof REVENUE_CHANNELS[number];

export interface RevenueEntryInput {
  readonly occurredOn: unknown;
  readonly channel: unknown;
  readonly grossRevenue: unknown;
  readonly cost: unknown;
  readonly clicks?: unknown;
  readonly conversions?: unknown;
  readonly title?: unknown;
  readonly postUrl?: unknown;
  readonly category?: unknown;
  readonly accountId?: unknown;
  readonly note?: unknown;
}

export interface NormalizedRevenueEntryInput {
  readonly occurredOn: string;
  readonly channel: RevenueChannel;
  readonly grossRevenue: number;
  readonly cost: number;
  readonly clicks: number;
  readonly conversions: number;
  readonly title: string;
  readonly postUrl: string;
  readonly category: string;
  readonly accountId: string;
  readonly note: string;
}

export interface RevenueEntry extends NormalizedRevenueEntryInput {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RevenueSettings {
  readonly monthlyNetTarget: number;
  readonly currency: 'KRW';
}

export interface RevenuePeriodSummary {
  readonly grossRevenue: number;
  readonly cost: number;
  readonly netProfit: number;
  readonly marginPct: number;
  readonly clicks: number;
  readonly conversions: number;
  readonly entryCount: number;
}

export interface CurrentMonthRevenueSummary extends RevenuePeriodSummary {
  readonly targetAttainmentPct: number;
  readonly forecastNetProfit: number;
  readonly forecastConfidence: 'none' | 'low' | 'medium' | 'high';
  readonly remainingTargetGap: number;
}

export interface RevenueChannelSummary extends RevenuePeriodSummary {
  readonly channel: RevenueChannel;
  readonly revenueSharePct: number;
  readonly conversionRatePct: number;
  readonly roiPct: number | null;
}

export interface RevenueContentSummary {
  readonly key: string;
  readonly title: string;
  readonly postUrl: string;
  readonly category: string;
  readonly grossRevenue: number;
  readonly cost: number;
  readonly netProfit: number;
  readonly conversions: number;
}

export interface RevenueMonthEvidence extends RevenuePeriodSummary {
  readonly month: string;
  readonly targetMet: boolean;
  readonly hasData: boolean;
}

export interface FullTimeProof {
  readonly status: 'no_data' | 'collecting' | 'scaling' | 'validated';
  readonly label: string;
  readonly reason: string;
  readonly consecutiveTargetMonths: number;
  readonly completedMonthsWithData: number;
  readonly highestChannelSharePct: number;
  readonly evidenceMonths: readonly RevenueMonthEvidence[];
}

export interface RevenueDashboard {
  readonly settings: RevenueSettings;
  readonly currentMonth: CurrentMonthRevenueSummary;
  readonly trailing90Days: RevenuePeriodSummary;
  readonly channels: readonly RevenueChannelSummary[];
  readonly topContents: readonly RevenueContentSummary[];
  readonly proof: FullTimeProof;
  readonly actions: readonly string[];
  readonly entries: readonly RevenueEntry[];
  readonly warnings: readonly string[];
}

export const DEFAULT_REVENUE_SETTINGS: RevenueSettings = {
  monthlyNetTarget: 0,
  currency: 'KRW',
};

const MAX_MONEY = 1_000_000_000_000;
const MAX_COUNT = 1_000_000_000;

export class RevenueValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RevenueValidationError';
  }
}

function finiteNumber(value: unknown, label: string, max: number): number {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > max) {
    throw new RevenueValidationError(`${label} 값이 올바르지 않습니다.`);
  }
  return Math.round(number);
}

function optionalFiniteNumber(value: unknown, label: string, max: number): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string' && value.trim() === '') return 0;
  return finiteNumber(value, label, max);
}

function text(value: unknown, maxLength: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function validDate(value: unknown): string {
  const date = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new RevenueValidationError('정산일은 YYYY-MM-DD 형식이어야 합니다.');
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new RevenueValidationError('존재하지 않는 정산일입니다.');
  }
  return date;
}

function validUrl(value: unknown): string {
  const url = text(value, 500);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('protocol');
    return parsed.toString();
  } catch {
    throw new RevenueValidationError('글 URL은 http 또는 https 주소여야 합니다.');
  }
}

export function validateRevenueEntryInput(input: RevenueEntryInput): NormalizedRevenueEntryInput {
  const channel = String(input.channel || '') as RevenueChannel;
  if (!REVENUE_CHANNELS.includes(channel)) {
    throw new RevenueValidationError('지원하지 않는 수익 채널입니다.');
  }
  return {
    occurredOn: validDate(input.occurredOn),
    channel,
    grossRevenue: finiteNumber(input.grossRevenue, '매출', MAX_MONEY),
    cost: finiteNumber(input.cost, '비용', MAX_MONEY),
    clicks: optionalFiniteNumber(input.clicks, '클릭', MAX_COUNT),
    conversions: optionalFiniteNumber(input.conversions, '전환', MAX_COUNT),
    title: text(input.title, 200),
    postUrl: validUrl(input.postUrl),
    category: text(input.category, 80),
    accountId: text(input.accountId, 120),
    note: text(input.note, 500),
  };
}

export function validateRevenueSettings(input: Partial<RevenueSettings>): RevenueSettings {
  return {
    monthlyNetTarget: finiteNumber(input.monthlyNetTarget ?? 0, '월 순이익 목표', MAX_MONEY),
    currency: 'KRW',
  };
}

function dateAtNoon(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(now: Date, offset: number): Date {
  return new Date(now.getFullYear(), now.getMonth() + offset, 1, 12, 0, 0, 0);
}

function summarize(entries: readonly RevenueEntry[]): RevenuePeriodSummary {
  const grossRevenue = entries.reduce((sum, item) => sum + item.grossRevenue, 0);
  const cost = entries.reduce((sum, item) => sum + item.cost, 0);
  const netProfit = grossRevenue - cost;
  return {
    grossRevenue,
    cost,
    netProfit,
    marginPct: grossRevenue > 0 ? Math.round((netProfit / grossRevenue) * 1000) / 10 : 0,
    clicks: entries.reduce((sum, item) => sum + item.clicks, 0),
    conversions: entries.reduce((sum, item) => sum + item.conversions, 0),
    entryCount: entries.length,
  };
}

function buildChannelSummaries(entries: readonly RevenueEntry[]): RevenueChannelSummary[] {
  const grossTotal = entries.reduce((sum, item) => sum + item.grossRevenue, 0);
  return REVENUE_CHANNELS
    .map((channel) => {
      const items = entries.filter((entry) => entry.channel === channel);
      const summary = summarize(items);
      return {
        channel,
        ...summary,
        revenueSharePct: grossTotal > 0 ? Math.round((summary.grossRevenue / grossTotal) * 1000) / 10 : 0,
        conversionRatePct: summary.clicks > 0 ? Math.round((summary.conversions / summary.clicks) * 1000) / 10 : 0,
        roiPct: summary.cost > 0 ? Math.round((summary.netProfit / summary.cost) * 1000) / 10 : null,
      };
    })
    .filter((summary) => summary.entryCount > 0)
    .sort((left, right) => right.netProfit - left.netProfit);
}

function buildTopContents(entries: readonly RevenueEntry[]): RevenueContentSummary[] {
  const keys = [...new Set(entries.filter((entry) => entry.postUrl || entry.title).map((entry) => entry.postUrl || entry.title))];
  return keys
    .map((key) => {
      const items = entries.filter((entry) => (entry.postUrl || entry.title) === key);
      const summary = summarize(items);
      const first = items[0];
      return {
        key,
        title: first?.title || first?.postUrl || '제목 없음',
        postUrl: first?.postUrl || '',
        category: first?.category || '',
        grossRevenue: summary.grossRevenue,
        cost: summary.cost,
        netProfit: summary.netProfit,
        conversions: summary.conversions,
      };
    })
    .sort((left, right) => right.netProfit - left.netProfit)
    .slice(0, 10);
}

function completedMonthEvidence(
  entries: readonly RevenueEntry[],
  settings: RevenueSettings,
  now: Date,
): RevenueMonthEvidence[] {
  return [-3, -2, -1].map((offset) => {
    const month = monthKey(shiftMonth(now, offset));
    const items = entries.filter((entry) => entry.occurredOn.startsWith(month));
    const summary = summarize(items);
    return {
      month,
      ...summary,
      targetMet: settings.monthlyNetTarget > 0 && summary.netProfit >= settings.monthlyNetTarget,
      hasData: items.length > 0,
    };
  });
}

function buildProof(
  entries: readonly RevenueEntry[],
  settings: RevenueSettings,
  now: Date,
): FullTimeProof {
  const evidenceMonths = completedMonthEvidence(entries, settings, now);
  const completedMonthsWithData = evidenceMonths.filter((month) => month.hasData).length;
  let consecutiveTargetMonths = 0;
  for (const month of [...evidenceMonths].reverse()) {
    if (!month.targetMet) break;
    consecutiveTargetMonths += 1;
  }

  const evidenceMonthKeys = new Set(evidenceMonths.map((month) => month.month));
  const evidenceEntries = entries.filter((entry) => evidenceMonthKeys.has(entry.occurredOn.slice(0, 7)));
  const channelSummaries = buildChannelSummaries(evidenceEntries);
  const highestChannelSharePct = channelSummaries[0]
    ? Math.max(...channelSummaries.map((channel) => channel.revenueSharePct))
    : 0;

  if (entries.length === 0) {
    return {
      status: 'no_data', label: '실적 없음', reason: '실제 정산 데이터가 없어 본업화 가능성을 판정하지 않습니다.',
      consecutiveTargetMonths, completedMonthsWithData, highestChannelSharePct, evidenceMonths,
    };
  }
  if (settings.monthlyNetTarget <= 0) {
    return {
      status: 'collecting', label: '목표 설정 필요', reason: '월 순이익 목표를 설정해야 지속 달성 여부를 검증할 수 있습니다.',
      consecutiveTargetMonths, completedMonthsWithData, highestChannelSharePct, evidenceMonths,
    };
  }
  if (completedMonthsWithData < 3) {
    return {
      status: 'collecting', label: '실적 수집 중', reason: `완료 월 실적 ${completedMonthsWithData}/3개월입니다.`,
      consecutiveTargetMonths, completedMonthsWithData, highestChannelSharePct, evidenceMonths,
    };
  }
  if (consecutiveTargetMonths === 3 && highestChannelSharePct <= 80) {
    return {
      status: 'validated', label: '본업화 기준 달성', reason: '입력된 실제 정산 기준으로 최근 완료 3개월이 순이익 목표를 연속 달성했고 채널 편중 기준도 통과했습니다.',
      consecutiveTargetMonths, completedMonthsWithData, highestChannelSharePct, evidenceMonths,
    };
  }
  return {
    status: 'scaling',
    label: '확장 검증 중',
    reason: consecutiveTargetMonths < 3
      ? `최근 목표 연속 달성 ${consecutiveTargetMonths}/3개월입니다.`
      : `단일 채널 매출 비중이 ${highestChannelSharePct}%로 높아 지속성 검증이 더 필요합니다.`,
    consecutiveTargetMonths,
    completedMonthsWithData,
    highestChannelSharePct,
    evidenceMonths,
  };
}

function buildActions(
  entries: readonly RevenueEntry[],
  settings: RevenueSettings,
  current: CurrentMonthRevenueSummary,
  proof: FullTimeProof,
  channels: readonly RevenueChannelSummary[],
  now: Date,
): string[] {
  if (entries.length === 0) return ['실제 정산 내역을 입력해 수익 증명을 시작하세요.'];
  const actions: string[] = [];
  if (settings.monthlyNetTarget <= 0) actions.push('월 순이익 목표를 먼저 설정하세요.');
  if (settings.monthlyNetTarget > 0 && current.forecastNetProfit < settings.monthlyNetTarget) {
    const daysLeft = Math.max(1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate());
    actions.push(`현재 속도 기준 목표까지 하루 순이익 ${Math.ceil(current.remainingTargetGap / daysLeft).toLocaleString('ko-KR')}원이 더 필요합니다.`);
  }
  if (proof.highestChannelSharePct > 80) {
    actions.push(`단일 수익 채널 편중 ${proof.highestChannelSharePct}%입니다. 두 번째 검증 채널을 확보하세요.`);
  }
  if (channels[0]?.netProfit > 0) {
    actions.push(`${channels[0].channel} 채널이 이번 달 순이익 1위입니다. 같은 조건의 글을 추가하되 실제 전환을 계속 확인하세요.`);
  }
  if (entries.filter((entry) => entry.postUrl).length < entries.length / 2) {
    actions.push('수익 내역에 글 URL을 연결해 어떤 콘텐츠가 돈을 만들었는지 확인하세요.');
  }
  return actions.slice(0, 4);
}

export function buildRevenueDashboard(
  entries: readonly RevenueEntry[],
  settingsInput: RevenueSettings = DEFAULT_REVENUE_SETTINGS,
  now: Date = new Date(),
  warnings: readonly string[] = [],
): RevenueDashboard {
  const settings = validateRevenueSettings(settingsInput);
  const currentKey = monthKey(now);
  const currentEntries = entries.filter((entry) => entry.occurredOn.startsWith(currentKey));
  const currentBase = summarize(currentEntries);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const elapsedDays = Math.max(1, now.getDate());
  const forecastNetProfit = currentEntries.length > 0
    ? Math.round((currentBase.netProfit / elapsedDays) * daysInMonth)
    : 0;
  const historicalMonths = new Set(
    entries
      .filter((entry) => !entry.occurredOn.startsWith(currentKey))
      .map((entry) => entry.occurredOn.slice(0, 7)),
  ).size;
  const forecastConfidence: CurrentMonthRevenueSummary['forecastConfidence'] = currentEntries.length === 0
    ? 'none'
    : historicalMonths >= 3 && elapsedDays >= 21 && currentEntries.length >= 5
      ? 'high'
      : historicalMonths >= 1 && elapsedDays >= 10 && currentEntries.length >= 2
        ? 'medium'
        : 'low';
  const currentMonth: CurrentMonthRevenueSummary = {
    ...currentBase,
    targetAttainmentPct: settings.monthlyNetTarget > 0
      ? Math.round((currentBase.netProfit / settings.monthlyNetTarget) * 1000) / 10
      : 0,
    forecastNetProfit,
    forecastConfidence,
    remainingTargetGap: Math.max(0, settings.monthlyNetTarget - currentBase.netProfit),
  };

  const trailingStart = new Date(now);
  trailingStart.setDate(trailingStart.getDate() - 89);
  trailingStart.setHours(0, 0, 0, 0);
  const trailingEnd = new Date(now);
  trailingEnd.setHours(23, 59, 59, 999);
  const trailingEntries = entries.filter((entry) => {
    const date = dateAtNoon(entry.occurredOn);
    return date >= trailingStart && date <= trailingEnd;
  });
  const channels = buildChannelSummaries(currentEntries);
  const proof = buildProof(entries, settings, now);
  const sortedEntries = [...entries].sort((left, right) => {
    const byDate = right.occurredOn.localeCompare(left.occurredOn);
    return byDate !== 0 ? byDate : right.createdAt.localeCompare(left.createdAt);
  });

  return {
    settings,
    currentMonth,
    trailing90Days: summarize(trailingEntries),
    channels,
    topContents: buildTopContents(trailingEntries),
    proof,
    actions: buildActions(entries, settings, currentMonth, proof, channels, now),
    entries: sortedEntries,
    warnings: [...warnings],
  };
}
