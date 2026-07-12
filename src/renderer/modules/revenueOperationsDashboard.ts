import type {
  FullTimeProof,
  RevenueChannel,
  RevenueContentSummary,
  RevenueDashboard,
  RevenueEntry,
  RevenueEntryInput,
  RevenueMonthEvidence,
} from '../../analytics/revenueOperations.js';

const CHANNEL_LABELS: Readonly<Record<RevenueChannel, string>> = {
  adpost: '애드포스트',
  'shopping-connect': '쇼핑커넥트',
  affiliate: '기타 제휴',
  sponsorship: '협찬·광고',
  service: '대행·서비스',
  other: '기타',
};

const FORECAST_LABELS = {
  none: '산출 전',
  low: '낮은 신뢰도',
  medium: '보통 신뢰도',
  high: '높은 신뢰도',
} as const;

const MAX_RENDERED_ENTRIES = 100;
const wonFormatter = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
let initialized = false;
let loading = false;

function element<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function safeNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatWon(value: unknown): string {
  return `${wonFormatter.format(safeNumber(value))}원`;
}

function formatPercent(value: unknown): string {
  return `${wonFormatter.format(safeNumber(value))}%`;
}

function todayLocal(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

function setStatus(message: string, kind: 'normal' | 'success' | 'error' = 'normal'): void {
  const status = element<HTMLElement>('revenue-warning');
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

function setButtonBusy(button: HTMLButtonElement | null, busy: boolean, busyText?: string): void {
  if (!button) return;
  if (busy) {
    button.dataset.idleText = button.textContent || '';
    button.disabled = true;
    if (busyText) button.textContent = busyText;
    return;
  }
  button.disabled = false;
  if (button.dataset.idleText !== undefined) {
    button.textContent = button.dataset.idleText;
    delete button.dataset.idleText;
  }
}

function appendRevenueCell(row: HTMLTableRowElement, value: string, className = ''): HTMLTableCellElement {
  const cell = row.insertCell();
  cell.textContent = value;
  if (className) cell.className = className;
  return cell;
}

function appendEmptyRow(body: HTMLTableSectionElement, columns: number, message: string): void {
  const row = body.insertRow();
  const cell = appendRevenueCell(row, message, 'revenue-table-empty');
  cell.colSpan = columns;
}

function createMetric(label: string, value: string, detail: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'revenue-kpi-card';
  const labelElement = document.createElement('span');
  labelElement.textContent = label;
  const valueElement = document.createElement('strong');
  valueElement.textContent = value;
  const detailElement = document.createElement('small');
  detailElement.textContent = detail;
  card.append(labelElement, valueElement, detailElement);
  return card;
}

function renderMetrics(dashboard: RevenueDashboard): void {
  const grid = element<HTMLElement>('revenue-kpi-grid');
  if (!grid) return;
  grid.replaceChildren(
    createMetric('이번 달 실매출', formatWon(dashboard.currentMonth.grossRevenue), `${dashboard.currentMonth.entryCount}건 정산 기준`),
    createMetric('이번 달 순이익', formatWon(dashboard.currentMonth.netProfit), `비용 ${formatWon(dashboard.currentMonth.cost)}`),
    createMetric(
      '목표 달성률',
      dashboard.settings.monthlyNetTarget > 0 ? formatPercent(dashboard.currentMonth.targetAttainmentPct) : '목표 미설정',
      dashboard.settings.monthlyNetTarget > 0 ? `목표 ${formatWon(dashboard.settings.monthlyNetTarget)}` : '목표를 저장하면 계산됩니다.',
    ),
    createMetric(
      '월말 예상 순이익',
      formatWon(dashboard.currentMonth.forecastNetProfit),
      `예측값 · ${FORECAST_LABELS[dashboard.currentMonth.forecastConfidence]}`,
    ),
    createMetric('최근 90일 순이익', formatWon(dashboard.trailing90Days.netProfit), `실매출 ${formatWon(dashboard.trailing90Days.grossRevenue)}`),
  );
}

function renderProof(proof: FullTimeProof): void {
  const badge = element<HTMLElement>('revenue-proof-badge');
  const reason = element<HTMLElement>('revenue-proof-reason');
  if (badge) {
    badge.textContent = proof.label;
    badge.dataset.status = proof.status;
  }
  if (reason) reason.textContent = proof.reason;
}

function evidenceState(evidence: RevenueMonthEvidence): string {
  if (!evidence.hasData) return '데이터 없음';
  if (evidence.targetMet) return '목표 달성';
  return '목표 미달 또는 미설정';
}

function renderMonthEvidence(items: readonly RevenueMonthEvidence[]): void {
  const container = element<HTMLElement>('revenue-month-evidence');
  if (!container) return;
  const fragments = items.map((item) => {
    const card = document.createElement('div');
    card.className = 'revenue-month-item';
    card.dataset.met = String(item.targetMet);
    const month = document.createElement('strong');
    month.textContent = item.month;
    const profit = document.createElement('div');
    profit.textContent = `순이익 ${formatWon(item.netProfit)}`;
    const state = document.createElement('small');
    state.textContent = evidenceState(item);
    card.append(month, profit, state);
    return card;
  });
  container.replaceChildren(...fragments);
}

function renderActions(actions: readonly string[]): void {
  const list = element<HTMLOListElement>('revenue-actions');
  if (!list) return;
  const items = (actions.length > 0 ? actions : ['현재 입력된 실적에서 추가 실행안이 없습니다.']).map((action) => {
    const item = document.createElement('li');
    item.textContent = action;
    return item;
  });
  list.replaceChildren(...items);
}

function netClass(value: number): string {
  return value < 0 ? 'revenue-net-negative' : 'revenue-net-positive';
}

function renderChannels(dashboard: RevenueDashboard): void {
  const body = element<HTMLTableSectionElement>('revenue-channel-rows');
  if (!body) return;
  body.replaceChildren();
  if (dashboard.channels.length === 0) {
    appendEmptyRow(body, 7, '이번 달 채널 실적이 없습니다.');
    return;
  }
  for (const channel of dashboard.channels) {
    const row = body.insertRow();
    appendRevenueCell(row, CHANNEL_LABELS[channel.channel]);
    appendRevenueCell(row, formatWon(channel.grossRevenue));
    appendRevenueCell(row, formatWon(channel.cost));
    appendRevenueCell(row, formatWon(channel.netProfit), netClass(channel.netProfit));
    appendRevenueCell(row, formatPercent(channel.revenueSharePct));
    appendRevenueCell(row, formatPercent(channel.conversionRatePct));
    appendRevenueCell(row, channel.roiPct === null ? '비용 0원' : formatPercent(channel.roiPct));
  }
}

function appendContentCell(row: HTMLTableRowElement, content: RevenueContentSummary): void {
  const cell = row.insertCell();
  if (!content.postUrl) {
    cell.textContent = content.title;
    return;
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'revenue-post-link';
  button.dataset.revenueUrl = content.postUrl;
  button.textContent = content.title;
  button.title = '게시글 열기';
  cell.append(button);
}

function renderTopContents(contents: readonly RevenueContentSummary[]): void {
  const body = element<HTMLTableSectionElement>('revenue-content-rows');
  if (!body) return;
  body.replaceChildren();
  if (contents.length === 0) {
    appendEmptyRow(body, 5, 'URL 또는 제목이 연결된 90일 수익 실적이 없습니다.');
    return;
  }
  for (const content of contents) {
    const row = body.insertRow();
    appendContentCell(row, content);
    appendRevenueCell(row, content.category || '-');
    appendRevenueCell(row, formatWon(content.grossRevenue));
    appendRevenueCell(row, formatWon(content.netProfit), netClass(content.netProfit));
    appendRevenueCell(row, wonFormatter.format(content.conversions));
  }
}

function appendEntryTitleCell(row: HTMLTableRowElement, entry: RevenueEntry): void {
  const cell = row.insertCell();
  const label = entry.title || entry.postUrl || '-';
  if (!entry.postUrl) {
    cell.textContent = label;
    return;
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'revenue-post-link';
  button.dataset.revenueUrl = entry.postUrl;
  button.textContent = label;
  button.title = '게시글 열기';
  cell.append(button);
}

function renderEntries(entries: readonly RevenueEntry[]): void {
  const body = element<HTMLTableSectionElement>('revenue-entry-rows');
  if (!body) return;
  body.replaceChildren();
  if (entries.length === 0) {
    appendEmptyRow(body, 7, '입력된 실제 정산 내역이 없습니다.');
    return;
  }
  for (const entry of entries.slice(0, MAX_RENDERED_ENTRIES)) {
    const row = body.insertRow();
    appendRevenueCell(row, entry.occurredOn);
    appendRevenueCell(row, CHANNEL_LABELS[entry.channel]);
    appendEntryTitleCell(row, entry);
    appendRevenueCell(row, formatWon(entry.grossRevenue));
    appendRevenueCell(row, formatWon(entry.cost));
    appendRevenueCell(row, formatWon(entry.grossRevenue - entry.cost), netClass(entry.grossRevenue - entry.cost));
    const actionCell = row.insertCell();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'revenue-delete-button';
    button.dataset.revenueEntryId = entry.id;
    button.title = '수익 내역 삭제';
    button.setAttribute('aria-label', `${entry.occurredOn} 수익 내역 삭제`);
    button.textContent = '×';
    actionCell.append(button);
  }
  if (entries.length > MAX_RENDERED_ENTRIES) {
    appendEmptyRow(body, 7, `전체 ${entries.length}건 중 최근 ${MAX_RENDERED_ENTRIES}건을 표시합니다.`);
  }
}

export function renderRevenueOperationsDashboard(dashboard: RevenueDashboard): void {
  renderMetrics(dashboard);
  renderProof(dashboard.proof);
  renderMonthEvidence(dashboard.proof.evidenceMonths);
  renderActions(dashboard.actions);
  renderChannels(dashboard);
  renderTopContents(dashboard.topContents);
  renderEntries(dashboard.entries);
  const target = element<HTMLInputElement>('revenue-monthly-target');
  if (target && document.activeElement !== target) {
    target.value = dashboard.settings.monthlyNetTarget > 0 ? String(dashboard.settings.monthlyNetTarget) : '';
  }
  setStatus(dashboard.warnings.join(' '), dashboard.warnings.length > 0 ? 'error' : 'normal');
}

async function loadRevenueOperationsDashboard(): Promise<void> {
  if (loading) return;
  const refresh = element<HTMLButtonElement>('revenue-refresh-btn');
  loading = true;
  setButtonBusy(refresh, true);
  setStatus('실제 정산 데이터를 불러오는 중입니다.');
  try {
    if (!window.api?.getRevenueDashboard) throw new Error('현재 설치 버전에서 수익 운영실 API를 찾지 못했습니다.');
    const result = await window.api.getRevenueDashboard();
    if (!result.success || !result.dashboard) throw new Error(result.message || '수익 데이터를 불러오지 못했습니다.');
    renderRevenueOperationsDashboard(result.dashboard);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '수익 데이터를 불러오지 못했습니다.', 'error');
  } finally {
    loading = false;
    setButtonBusy(refresh, false);
  }
}

function readEntryInput(form: HTMLFormElement): RevenueEntryInput {
  const value = (name: string): string => {
    const field = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
    return field?.value ?? '';
  };
  return {
    occurredOn: value('occurredOn'),
    channel: value('channel'),
    grossRevenue: value('grossRevenue'),
    cost: value('cost'),
    clicks: value('clicks'),
    conversions: value('conversions'),
    title: value('title'),
    postUrl: value('postUrl'),
    category: value('category'),
    accountId: value('accountId'),
    note: value('note'),
  };
}

async function submitEntry(form: HTMLFormElement): Promise<void> {
  const button = element<HTMLButtonElement>('revenue-add-entry-btn');
  setButtonBusy(button, true, '저장 중');
  setStatus('실제 정산 내역을 저장하는 중입니다.');
  try {
    const result = await window.api.addRevenueEntry(readEntryInput(form));
    if (!result.success || !result.dashboard) throw new Error(result.message || '수익 내역을 저장하지 못했습니다.');
    form.reset();
    const date = element<HTMLInputElement>('revenue-entry-date');
    if (date) date.value = todayLocal();
    renderRevenueOperationsDashboard(result.dashboard);
    setStatus('실제 정산 내역을 저장했습니다.', 'success');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '수익 내역을 저장하지 못했습니다.', 'error');
  } finally {
    setButtonBusy(button, false);
  }
}

async function saveGoal(): Promise<void> {
  const input = element<HTMLInputElement>('revenue-monthly-target');
  const button = element<HTMLButtonElement>('revenue-save-goal-btn');
  if (!input) return;
  setButtonBusy(button, true, '저장 중');
  try {
    const result = await window.api.updateRevenueSettings({ monthlyNetTarget: Number(input.value || 0) });
    if (!result.success || !result.dashboard) throw new Error(result.message || '목표를 저장하지 못했습니다.');
    renderRevenueOperationsDashboard(result.dashboard);
    setStatus('월 순이익 목표를 저장했습니다.', 'success');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '목표를 저장하지 못했습니다.', 'error');
  } finally {
    setButtonBusy(button, false);
  }
}

async function removeEntry(id: string, button: HTMLButtonElement): Promise<void> {
  if (!window.confirm('이 실제 정산 내역을 삭제할까요?')) return;
  setButtonBusy(button, true);
  try {
    const result = await window.api.removeRevenueEntry(id);
    if (!result.success || !result.dashboard) throw new Error(result.message || '수익 내역을 삭제하지 못했습니다.');
    renderRevenueOperationsDashboard(result.dashboard);
    setStatus('수익 내역을 삭제했습니다.', 'success');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '수익 내역을 삭제하지 못했습니다.', 'error');
    setButtonBusy(button, false);
  }
}

async function handleTableAction(event: Event): Promise<void> {
  const target = event.target as Element | null;
  const deleteButton = target?.closest<HTMLButtonElement>('[data-revenue-entry-id]');
  if (deleteButton?.dataset.revenueEntryId) {
    await removeEntry(deleteButton.dataset.revenueEntryId, deleteButton);
    return;
  }
  const linkButton = target?.closest<HTMLButtonElement>('[data-revenue-url]');
  if (linkButton?.dataset.revenueUrl) {
    try {
      const result = await window.api.openExternalUrl(linkButton.dataset.revenueUrl);
      if (!result.success) setStatus(result.message || '게시글을 열지 못했습니다.', 'error');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '게시글을 열지 못했습니다.', 'error');
    }
  }
}

export function initRevenueOperationsDashboard(): void {
  if (initialized) return;
  const panel = element<HTMLElement>('subtab-revenue');
  const form = element<HTMLFormElement>('revenue-entry-form');
  if (!panel || !form) return;
  initialized = true;

  const date = element<HTMLInputElement>('revenue-entry-date');
  if (date && !date.value) date.value = todayLocal();

  document.querySelector('.analytics-subtab[data-subtab="revenue"]')?.addEventListener('click', () => {
    void loadRevenueOperationsDashboard();
  });
  element<HTMLButtonElement>('revenue-refresh-btn')?.addEventListener('click', () => {
    void loadRevenueOperationsDashboard();
  });
  element<HTMLButtonElement>('revenue-save-goal-btn')?.addEventListener('click', () => {
    void saveGoal();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitEntry(form);
  });
  panel.addEventListener('click', (event) => {
    void handleTableAction(event);
  });

  if (panel.style.display !== 'none') void loadRevenueOperationsDashboard();
}
