type DashboardResponse = {
  success: boolean;
  message?: string;
  dashboard?: any;
};

function setBusy(button: HTMLButtonElement | null, busy: boolean): void {
  if (!button) return;
  button.disabled = busy;
  button.style.opacity = busy ? '0.55' : '1';
}

function makeSummaryItem(label: string, value: string, accent: string): HTMLElement {
  const item = document.createElement('div');
  item.style.cssText = `padding:0.8rem;border:1px solid var(--border-light);border-left:4px solid ${accent};background:var(--bg-secondary);min-height:72px;`;
  const labelElement = document.createElement('div');
  labelElement.textContent = label;
  labelElement.style.cssText = 'color:var(--text-muted);font-size:0.75rem;margin-bottom:0.35rem;';
  const valueElement = document.createElement('strong');
  valueElement.textContent = value;
  valueElement.style.cssText = 'display:block;color:var(--text-strong);font-size:1.05rem;overflow-wrap:anywhere;';
  item.append(labelElement, valueElement);
  return item;
}

function appendCell(row: HTMLTableRowElement, value: string): void {
  const cell = row.insertCell();
  cell.textContent = value;
  cell.style.cssText = 'padding:0.65rem;border-top:1px solid var(--border-light);vertical-align:top;max-width:260px;overflow-wrap:anywhere;';
}

function renderDashboard(dashboard: any): void {
  const state = dashboard?.state || {};
  const badge = document.getElementById('content-policy-state-badge');
  const pauseReason = document.getElementById('content-policy-pause-reason');
  const resumePanel = document.getElementById('content-policy-resume-panel');
  const summary = document.getElementById('content-policy-summary');
  const rows = document.getElementById('content-policy-audit-rows') as HTMLTableSectionElement | null;
  const testStatus = document.getElementById('content-policy-test-status');
  const manualTestCheckbox = document.getElementById('content-policy-manual-test') as HTMLInputElement | null;
  const testKeyword = document.getElementById('content-policy-test-keyword') as HTMLInputElement | null;
  const paused = state.status === 'PAUSED';

  if (badge) {
    badge.textContent = paused ? '중단됨' : '운영 중';
    badge.style.color = paused ? '#ef4444' : '#10b981';
    badge.style.background = paused ? 'rgba(239,68,68,.1)' : 'rgba(16,185,129,.1)';
    badge.style.borderColor = paused ? 'rgba(239,68,68,.45)' : 'rgba(16,185,129,.45)';
  }
  if (pauseReason) {
    pauseReason.style.display = paused ? 'block' : 'none';
    const incident = state.pause_incident;
    const incidentLabel = incident
      ? ` / 검증 대상: ${incident.blog_id || '현재 블로그'} · ${incident.primary_keyword || '현재 키워드'}`
      : '';
    pauseReason.textContent = paused ? `중단 사유: ${state.pause_reason || '기록 없음'}${incidentLabel}` : '';
  }
  if (testKeyword && !testKeyword.value.trim() && state.pause_incident?.primary_keyword) {
    testKeyword.value = state.pause_incident.primary_keyword;
  }
  if (resumePanel) resumePanel.style.display = paused ? 'block' : 'none';
  if (testStatus) {
    testStatus.textContent = state.manual_test_evidence?.passed
      ? `노출 검증 완료: ${state.manual_test_evidence.title || state.manual_test_evidence.url}`
      : '';
    testStatus.style.color = state.manual_test_evidence?.passed ? '#10b981' : 'var(--text-muted)';
  }
  if (manualTestCheckbox) manualTestCheckbox.checked = Boolean(state.manual_test_evidence?.passed);

  if (summary) {
    summary.replaceChildren(
      makeSummaryItem('최근 게시물', `${dashboard.recentPosts?.count || 0} / 최소 ${dashboard.policy?.minimumRecentPosts || 20}`, '#06b6d4'),
      makeSummaryItem('PASS', String(dashboard.summary?.pass || 0), '#10b981'),
      makeSummaryItem('BLOCK', String(dashboard.summary?.block || 0), '#ef4444'),
      makeSummaryItem('노출 확인', String(dashboard.summary?.exposure?.INDEXED || 0), '#3b82f6'),
      makeSummaryItem('미노출 확정', String(dashboard.summary?.exposure?.MISSING_CONFIRMED || 0), '#f59e0b'),
    );
  }

  if (!rows) return;
  rows.replaceChildren();
  const audits = Array.isArray(dashboard.audits) ? dashboard.audits : [];
  if (audits.length === 0) {
    const row = rows.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 7;
    cell.textContent = '감사 기록이 없습니다.';
    cell.style.cssText = 'padding:1.5rem;text-align:center;color:var(--text-muted);';
    return;
  }
  audits.slice(0, 100).forEach((audit: any) => {
    const row = rows.insertRow();
    const date = new Date(audit.created_at);
    appendCell(row, Number.isFinite(date.getTime()) ? date.toLocaleString('ko-KR') : String(audit.created_at || ''));
    appendCell(row, String(audit.article_id || ''));
    appendCell(row, String(audit.decision || ''));
    appendCell(row, String(audit.quality_score ?? ''));
    appendCell(row, String(audit.similarity_scores?.risk || ''));
    appendCell(row, String(audit.exposure_status || 'PENDING_INDEX'));
    appendCell(row, Array.isArray(audit.block_reasons) ? audit.block_reasons.join(', ') : '');
  });
}

async function loadDashboard(): Promise<void> {
  const refreshButton = document.getElementById('content-policy-refresh-btn') as HTMLButtonElement | null;
  setBusy(refreshButton, true);
  try {
    const response: DashboardResponse = await window.api.getContentPolicyDashboard(100);
    if (!response.success || !response.dashboard) throw new Error(response.message || '정책 상태 조회 실패');
    renderDashboard(response.dashboard);
  } catch (error) {
    console.error('[ContentPolicyDashboard] load failed:', error);
    alert(`콘텐츠 정책 상태를 불러오지 못했습니다.\n${(error as Error).message}`);
  } finally {
    setBusy(refreshButton, false);
  }
}

export function initContentPolicyDashboard(): void {
  const tab = document.querySelector('.analytics-subtab[data-subtab="content-policy"]');
  const refreshButton = document.getElementById('content-policy-refresh-btn') as HTMLButtonElement | null;
  const pauseButton = document.getElementById('content-policy-pause-btn') as HTMLButtonElement | null;
  const resumeButton = document.getElementById('content-policy-resume-btn') as HTMLButtonElement | null;
  const verifyButton = document.getElementById('content-policy-verify-test-btn') as HTMLButtonElement | null;
  if (!tab || !refreshButton || !pauseButton || !resumeButton || !verifyButton) return;

  tab.addEventListener('click', () => { void loadDashboard(); });
  refreshButton.addEventListener('click', () => { void loadDashboard(); });
  pauseButton.addEventListener('click', async () => {
    const reason = prompt('자동발행 중단 사유를 입력하세요.');
    if (!reason?.trim()) return;
    setBusy(pauseButton, true);
    try {
      const response = await window.api.pauseContentPolicyPublishing(reason.trim());
      if (!response.success) throw new Error(response.message || '자동발행 중단 실패');
      await loadDashboard();
    } catch (error) {
      alert(`자동발행을 중단하지 못했습니다.\n${(error as Error).message}`);
    } finally {
      setBusy(pauseButton, false);
    }
  });
  verifyButton.addEventListener('click', async () => {
    const url = (document.getElementById('content-policy-test-url') as HTMLInputElement | null)?.value.trim() || '';
    const title = (document.getElementById('content-policy-test-title') as HTMLInputElement | null)?.value.trim() || '';
    const keyword = (document.getElementById('content-policy-test-keyword') as HTMLInputElement | null)?.value.trim() || '';
    const status = document.getElementById('content-policy-test-status');
    setBusy(verifyButton, true);
    if (status) {
      status.textContent = '검증 중...';
      status.style.color = 'var(--text-muted)';
    }
    try {
      const response = await window.api.verifyContentPolicyManualTest({ url, title, keyword });
      if (!response.success) throw new Error(response.message || '수동 테스트 검증 실패');
      if (status) {
        status.textContent = 'URL과 검색 노출 교차검증을 통과했습니다.';
        status.style.color = '#10b981';
      }
      const checkbox = document.getElementById('content-policy-manual-test') as HTMLInputElement | null;
      if (checkbox) checkbox.checked = true;
      await loadDashboard();
    } catch (error) {
      if (status) {
        status.textContent = (error as Error).message;
        status.style.color = '#ef4444';
      }
    } finally {
      setBusy(verifyButton, false);
    }
  });
  resumeButton.addEventListener('click', async () => {
    const approvedBy = (document.getElementById('content-policy-approver') as HTMLInputElement | null)?.value.trim() || '';
    const rootCauseReviewed = Boolean((document.getElementById('content-policy-root-cause') as HTMLInputElement | null)?.checked);
    const manualTestVerified = Boolean((document.getElementById('content-policy-manual-test') as HTMLInputElement | null)?.checked);
    setBusy(resumeButton, true);
    try {
      const response = await window.api.resumeContentPolicyPublishing({ approvedBy, rootCauseReviewed, manualTestVerified });
      if (!response.success) throw new Error(response.message || '자동발행 재개 실패');
      await loadDashboard();
    } catch (error) {
      alert(`자동발행을 재개하지 못했습니다.\n${(error as Error).message}`);
    } finally {
      setBusy(resumeButton, false);
    }
  });
}
