import type { DailyPublishingPlan } from '../../scheduler/dailyPublishingTypes.js';

type Account = { id: string; blogId?: string; name?: string };
type Snapshot = { revision: number; plans: Array<DailyPublishingPlan & { nextAt?: string; nextScheduledFor?: string }>;
  runs: Array<{ accountId: string; status: string; time: string; date: string; ordinal: number; reason?: string; updatedAt?: string }>;
  availability?: { ready: boolean; paid: boolean; label: string };
  scheduling?: { nativeReservationReady?: boolean }; imageCapabilities?: { officialCaptureReady?: boolean; officialCaptureReason?: string };
  imageProviders?: Array<{ id: string; label: string }>; lewordTopics?: string[] };
type LewordCandidate = { keyword: string; topic: string; searchVolume: number; documentCount: number; ratio: number };
export interface DailyPanelApi {
  dailyPublishingRequest(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; body: any }>;
  getAllBlogAccounts(): Promise<{ success: boolean; accounts?: Account[]; message?: string }>;
  fetchBlogCategories(blogId: string): Promise<{ success: boolean; categories?: Array<{ id: string; name: string }>; message?: string }>;
}
const runLabels: Record<string, string> = { pending: '대기', inflight: '작업 중', confirmed: '확인 완료', needs_review: '확인 필요', cancelled: '중지됨' };
const reasons: Record<string, string> = { execution_uncertain: '결과 확인 필요', unavailable: '계정·실행 준비 확인 필요', interrupted: '앱 종료로 중단',
  stopped: '중지 요청', plan_changed: '계획 변경', deadline_missed: '공개 시각 경과',
  keywords_exhausted: '키워드를 모두 씀 — 키워드를 추가해 주세요' };
const timestamp = (value?: string) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '없음';

export function mountDailyPublishingPanel(root: HTMLDialogElement, api: DailyPanelApi, options: { pollIntervalMs?: number } = {}) {
  root.classList.add('daily-publishing-dialog');
  root.innerHTML = `<header class="daily-panel-header"><h2>매일 예약발행</h2><button type="button" data-daily="close" aria-label="닫기">닫기</button></header>
    <div class="daily-panel-status" data-daily="status" role="status" aria-live="polite">실행 상태 확인 전</div>
    <div class="daily-panel-toolbar"><button type="button" data-daily="reload">상태 새로 확인</button><span data-daily="checked"></span></div>
    <form data-daily="form"><fieldset data-daily="fields"><div class="daily-panel-grid">
    <label>블로그 계정<select data-daily="account" aria-label="블로그 계정"></select></label>
    <label>카테고리<select data-daily="category" aria-label="카테고리"></select></label>
    <label>작성 엔진<select data-daily="writer" aria-label="작성 엔진"><option value="app-settings">앱에서 선택한 엔진</option><option value="agent-claude">Claude Code 구독</option><option value="agent-codex">Codex 구독</option><option value="agent-gemini">Gemini CLI</option><option value="claude">Claude API</option><option value="openai">OpenAI API</option><option value="gemini">Gemini API</option><option value="perplexity">Perplexity API</option></select></label>
    <label>글 처리<select data-daily="mode" aria-label="글 처리"><option value="schedule">네이버 예약발행</option><option value="draft">임시저장</option><option value="publish">즉시 발행 (기존 계획)</option></select></label>
    <label>이미지 방식<select data-daily="image-mode" aria-label="이미지 방식"><option value="ai-first">AI 이미지 먼저 → 빈 칸은 실제 사진 수집</option><option value="collect-first">실제 사진 수집 먼저 → 모자라면 AI 이미지</option><option value="ai-generated">AI 이미지만</option><option value="official-capture">공식 자료 캡처</option></select></label>
    <label>이미지 엔진<select data-daily="image-source" aria-label="이미지 엔진"></select></label>
    <label>공식 자료 분야<select data-daily="capture-category" aria-label="공식 자료 분야"><option value="">선택</option><option value="issue">이슈</option><option value="sports">스포츠</option><option value="auto">자동차</option></select></label>
    </div><label class="daily-panel-consent" data-daily="collect-consent-row"><input type="checkbox" data-daily="collect-consent"><span>[실제 사진 수집 저작권 안내] 웹에 공개된 사진을 검색·수집합니다. 워터마크가 없는 사진이라도 저작권이 있을 수 있으며, <b>수집한 사진 사용에 대한 모든 법적 책임은 사용자 본인에게 있습니다.</b> 이 기능은 사용 권한을 주지 않습니다. 위 내용을 확인했고 책임이 본인에게 있음에 동의합니다.</span></label>
    <label>키워드 공급<select data-daily="keyword-source" aria-label="키워드 공급"><option value="manual">직접 입력</option><option value="leword-today-picks">LEWORD 오늘의 추천</option></select></label>
    <fieldset data-daily="leword-box" hidden><legend>추천을 받을 주제 (최대 3개)</legend><div data-daily="leword-topics" class="daily-panel-topics"></div>
    <label>글쓰기 방식<select data-daily="content-mode" aria-label="글쓰기 방식"><option value="seo">검색형 (키워드 그대로)</option><option value="homefeed">홈판형 (최근 뉴스 소재)</option></select></label>
    <button type="button" data-daily="leword-preview">다음 후보 5개 보기</button><p data-daily="leword-note"></p><ol data-daily="leword-list"></ol></fieldset>
    <label class="daily-panel-topic" data-daily="topic-row">주제·키워드 또는 소재 URL<textarea data-daily="topic" aria-label="주제·키워드 또는 소재 URL" rows="3" maxlength="2000"></textarea></label>
    <label>키워드를 다 쓰면 (검색용·메이트 글)<select data-daily="keyword-exhaustion" aria-label="키워드를 다 쓰면"><option value="expand">연관 검색어로 넓혀 계속 쓰기</option><option value="stop">멈추고 알리기</option></select></label>
    <h3 data-daily="slot-heading">공개 시각 · 한국 시간</h3><div data-daily="slots" class="daily-panel-slots"></div>
    <button type="button" data-daily="add-slot">시각 추가</button><p data-daily="timing"></p>
    <label class="daily-panel-consent"><input type="checkbox" data-daily="consent">선택한 계정과 일정으로 반복 실행하는 데 동의합니다.</label>
    </fieldset><p data-daily="block" class="daily-panel-block"></p>
    <div class="daily-panel-actions"><button type="button" data-daily="save">중지 상태로 저장</button><button type="button" data-daily="start" class="daily-panel-primary">저장하고 시작</button><button type="button" data-daily="stop">이 계정 중지</button></div></form>
    <section class="daily-panel-history"><h3>선택 계정 실행 상태</h3><p data-daily="plan-status"></p><p data-daily="next"></p>
    <div class="daily-panel-table-wrap"><table><thead><tr><th>공개 날짜·시각</th><th>번호</th><th>상태</th><th>사유</th><th>기록 시각</th></tr></thead><tbody data-daily="history"></tbody></table></div></section>`;
  const el = <T extends HTMLElement = HTMLInputElement>(name: string) => root.querySelector(`[data-daily="${name}"]`) as T;
  const value = (name: string) => el<HTMLInputElement>(name).value;
  let state: Snapshot | undefined, accounts: Account[] = [], busy = false, refreshing = false, previewing = false, disposed = false, revision = 0, generation = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const message = (text: string, error = false) => { el('status').textContent = text; el('status').dataset.error = String(error); };
  const selectedPlan = () => state?.plans.find(plan => plan.accountId === value('account'));
  function setOptions(name: string, choices: Array<{ id: string; label: string }>, selected = '') {
    const select = el<HTMLSelectElement>(name); select.replaceChildren();
    for (const choice of choices) { const option = document.createElement('option'); option.value = choice.id; option.textContent = choice.label; select.append(option); }
    select.value = choices.some(choice => choice.id === selected) ? selected : choices[0]?.id || '';
  }
  const usesLeword = () => value('keyword-source') === 'leword-today-picks';
  const lewordTopics = () => [...el('leword-topics').querySelectorAll('input:checked')].map(box => (box as HTMLInputElement).value);
  function drawLewordTopics(selected: string[] = []) {
    el('leword-topics').replaceChildren();
    for (const topic of state?.lewordTopics || []) {
      const label = document.createElement('label'), box = document.createElement('input');
      box.type = 'checkbox'; box.value = topic; box.checked = selected.includes(topic); label.append(box, ` ${topic}`); el('leword-topics').append(label);
    }
  }
  const usesAi = () => value('image-mode') !== 'official-capture';
  const collects = () => value('image-mode') === 'ai-first' || value('image-mode') === 'collect-first';
  function blockReason() {
    if (!state) return '앱 실행 상태를 먼저 확인해 주세요.';
    if (!state.availability?.ready) return state.availability?.label || '앱 로그인과 실행 준비를 확인해 주세요.';
    if (!state.availability.paid) return state.availability.label || '유효한 1년 이상 이용권이 필요합니다.';
    if (!value('account')) return '앱 계정 관리에서 블로그 계정을 등록해 주세요.';
    if (value('mode') === 'schedule' && state.scheduling?.nativeReservationReady !== true) return '실제 네이버 예약 목록 확인 연결이 준비되지 않았습니다.';
    if (value('image-mode') === 'official-capture' && state.imageCapabilities?.officialCaptureReady !== true)
      return state.imageCapabilities?.officialCaptureReason || '공식 출처 승인과 캡처 묶음 준비가 필요합니다. 현재 자동 수집 연결은 준비되지 않았습니다.';
    if (!/^[1-9]\d{0,15}$/.test(value('category'))) return '실제 블로그 카테고리를 선택해 주세요.';
    if (usesLeword() ? !lewordTopics().length : !value('topic').trim()) return usesLeword() ? 'LEWORD 추천을 받을 주제를 1~3개 골라 주세요.' : '주제·키워드 또는 소재 URL을 입력해 주세요.';
    if (usesAi() && !value('image-source')) return '이미지 엔진을 직접 선택해 주세요.';
    if (collects() && !el('collect-consent').checked) return '실제 사진 수집 저작권 안내를 읽고 동의해 주세요.';
    if (value('image-mode') === 'official-capture' && !value('capture-category')) return '공식 자료 분야를 선택해 주세요.';
    try { readSlots(); } catch (error) { return (error as Error).message; }
    if (!el('consent').checked) return '반복 실행 동의 후 시작할 수 있습니다.';
    return '';
  }
  function controls() {
    el<HTMLFieldSetElement>('fields').disabled = busy || refreshing || !state;
    const reason = blockReason(); el('block').textContent = reason;
    el('start').disabled = busy || refreshing || Boolean(reason); el('save').disabled = busy || refreshing || !state || !value('account');
    el('stop').disabled = busy || refreshing || !selectedPlan()?.enabled; el('reload').disabled = busy || refreshing;
    el('image-source').disabled = !usesAi(); el('collect-consent-row').hidden = !collects(); el('capture-category').disabled = value('image-mode') !== 'official-capture';
    el('leword-box').hidden = !usesLeword(); el('topic-row').hidden = usesLeword();
    const picked = lewordTopics().length;
    for (const box of el('leword-topics').querySelectorAll('input')) (box as HTMLInputElement).disabled = !(box as HTMLInputElement).checked && picked >= 3;
    el('leword-preview').disabled = busy || refreshing || previewing || !picked || !value('account');
    el('add-slot').disabled = busy || el('slots').children.length >= 20;
    for (const button of el('slots').querySelectorAll('button')) button.disabled = el('slots').children.length === 1;
  }
  function readSlots() {
    const slots = [...el('slots').children].map(row => ({ time: (row.querySelector('[type=time]') as HTMLInputElement).value,
      count: Number((row.querySelector('[type=number]') as HTMLInputElement).value) }));
    if (!slots.length || slots.some(slot => !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot.time) || !Number.isInteger(slot.count) || slot.count < 1 || slot.count > 20)
      || new Set(slots.map(slot => slot.time)).size !== slots.length || slots.reduce((sum, slot) => sum + slot.count, 0) > 20)
      throw Error('중복 없는 시각과 하루 합계 1~20편을 입력해 주세요.');
    return slots;
  }
  function timing() {
    const scheduled = value('mode') === 'schedule'; el('slot-heading').textContent = scheduled ? '공개 시각 · 한국 시간' : '작업 시작 시각 · 한국 시간';
    try { el('timing').textContent = readSlots().map(slot => {
      const [h, m] = slot.time.split(':'); const prep = `${Number(h) === 0 ? '전날 ' : ''}${String((Number(h) + 23) % 24).padStart(2, '0')}:${m}`;
      return scheduled ? `${prep} 준비 → ${slot.time} 공개 · ${slot.count}편` : `${slot.time} 시작 · ${slot.count}편`;
    }).join(' / '); } catch { el('timing').textContent = ''; }
    controls();
  }
  function drawSlots(slots: Array<{ time: string; count: number }>) {
    el('slots').replaceChildren();
    for (const slot of slots) {
      const row = document.createElement('div'); row.className = 'daily-panel-slot';
      const time = document.createElement('input'); time.type = 'time'; time.value = slot.time; time.dataset.daily = 'time'; time.setAttribute('aria-label', '시각');
      const count = document.createElement('input'); count.type = 'number'; count.min = '1'; count.max = '20'; count.step = '1'; count.value = String(slot.count); count.setAttribute('aria-label', '편수');
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '삭제'; remove.disabled = slots.length === 1;
      remove.addEventListener('click', () => { row.remove(); timing(); }); row.append(time, count, remove); el('slots').append(row);
    }
    timing();
  }
  function drawHistory() {
    const plan = selectedPlan();
    const stopping = !plan?.enabled && state?.runs.some(run => run.accountId === value('account') && run.status === 'inflight');
    el('plan-status').textContent = plan?.enabled ? '실행 켜짐 · 앱이 실행 중일 때 처리합니다.'
      : stopping ? '중지 요청 · 진행 작업 종료 확인 중입니다.' : '중지 상태 · 자동 실행하지 않습니다.';
    el('next').textContent = plan?.enabled ? `다음 준비: ${timestamp(plan.nextAt)}${plan.mode === 'schedule' ? ` · 공개 예정: ${timestamp(plan.nextScheduledFor)}` : ''}` : '';
    const body = el<HTMLTableSectionElement>('history'); body.replaceChildren();
    for (const run of (state?.runs || []).filter(run => run.accountId === value('account')).slice(-50).reverse()) {
      const row = document.createElement('tr');
      for (const text of [`${run.date} ${run.time}`, String(run.ordinal), runLabels[run.status] || run.status, reasons[run.reason || ''] || run.reason || '-', timestamp(run.updatedAt)]) {
        const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
      }
      body.append(row);
    }
    if (!body.children.length) { const row = document.createElement('tr'), cell = document.createElement('td'); cell.colSpan = 5; cell.textContent = '앱에 기록된 실행 이력이 없습니다.'; row.append(cell); body.append(row); }
  }
  async function drawAccount() {
    const ticket = ++generation, accountId = value('account'), account = accounts.find(item => item.id === accountId);
    const plan = selectedPlan(); revision = state!.revision;
    el('writer').value = plan?.generator || 'app-settings'; el('mode').value = plan?.mode || 'schedule';
    (el<HTMLSelectElement>('mode').querySelector('[value=publish]') as HTMLOptionElement).disabled = plan?.mode !== 'publish';
    el('image-mode').value = plan?.imageMode || 'ai-first'; el('collect-consent').checked = plan?.imageCollectConsent === true; el('capture-category').value = plan?.captureCategory || '';
    el('keyword-source').value = plan?.keywordSource ? plan.keywordSource.type : 'manual'; drawLewordTopics(plan?.keywordSource?.topics);
    el('content-mode').value = plan?.contentMode || 'seo'; el('leword-list').replaceChildren(); el('leword-note').textContent = '';
    el('topic').value = plan?.topic || ''; el('keyword-exhaustion').value = plan?.keywordExhaustion || 'expand'; el('consent').checked = false;
    setOptions('image-source', [{ id: '', label: '이미지 엔진 선택' }, ...(state?.imageProviders || [])], plan?.imageSource);
    drawSlots(plan?.slots || [{ time: '', count: 1 }]); drawHistory();
    busy = true; controls(); setOptions('category', [{ id: '', label: '카테고리 확인 중' }]);
    try {
      const categories = account?.blogId ? await api.fetchBlogCategories(account.blogId) : { success: false, categories: [] };
      if (disposed || ticket !== generation) return false;
      if (!categories.success) throw Error('계정의 실제 카테고리를 불러오지 못했습니다.');
      setOptions('category', [{ id: '', label: '카테고리 선택' }, ...(categories.categories || []).filter(c => /^[1-9]\d{0,15}$/.test(c.id)).map(c => ({ id: c.id, label: c.name }))], plan?.categoryId);
      return true;
    } catch (error) { if (!disposed && ticket === generation) { setOptions('category', [{ id: '', label: '카테고리 확인 필요' }]); message((error as Error).message, true); } return false; }
    finally { if (ticket === generation) { busy = false; controls(); } }
  }
  async function request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Snapshot> {
    const reply = await api.dailyPublishingRequest(method, path, body);
    if (reply.status >= 400 || reply.body?.ok !== true) throw Error(reply.body?.error || '앱 실행 상태를 확인하지 못했습니다.');
    if (!Number.isSafeInteger(reply.body.revision) || !Array.isArray(reply.body.plans) || !Array.isArray(reply.body.runs)) throw Error('앱의 실행 상태 응답이 올바르지 않습니다.');
    return reply.body;
  }
  async function refresh(reloadForm = false) {
    if (busy || refreshing || disposed) return;
    refreshing = true; controls();
    try {
      state = await request('GET', '/v1/automations/status');
      if (disposed) return;
      el('checked').textContent = `상태 확인 ${new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
      message(state.availability?.label || '앱 기록을 확인했습니다.');
      if (reloadForm) {
        const listed = await api.getAllBlogAccounts();
        if (!listed.success) throw Error(listed.message || '앱 계정 목록을 불러오지 못했습니다.');
        accounts = listed.accounts || []; const selected = value('account');
        setOptions('account', accounts.map(a => ({ id: a.id, label: `${a.name || a.blogId || a.id}${a.blogId ? ` · ${a.blogId}` : ''}` })), selected);
        if (accounts.length) await drawAccount();
      }
      drawHistory(); controls();
    } catch (error) { state = undefined; message((error as Error).message, true); }
    finally { refreshing = false; controls(); }
  }
  async function save(enabled: boolean) {
    if (busy || refreshing || !state || (enabled && blockReason())) return;
    try {
      const plan: DailyPublishingPlan = { accountId: value('account'), categoryId: value('category'), enabled,
        mode: value('mode') as DailyPublishingPlan['mode'], generator: value('writer'), topic: usesLeword() ? '' : value('topic').trim(),
        ...(usesLeword() ? { keywordSource: { type: 'leword-today-picks' as const, topics: lewordTopics() }, contentMode: value('content-mode') as 'seo' | 'homefeed' } : {}),
        imageMode: value('image-mode') as DailyPublishingPlan['imageMode'], slots: readSlots(),
        ...(value('mode') === 'schedule' ? { leadMinutes: 60 as const } : {}),
        ...(usesAi() ? { imageSource: value('image-source') || undefined } : { captureCategory: value('capture-category') as DailyPublishingPlan['captureCategory'] || undefined }),
        ...(collects() && el('collect-consent').checked ? { imageCollectConsent: true as const } : {}),
        keywordExhaustion: value('keyword-exhaustion') === 'stop' ? 'stop' : 'expand' };
      if (!plan.accountId || !/^[1-9]\d{0,15}$/.test(plan.categoryId)) throw Error('계정과 실제 카테고리를 선택해 주세요.');
      busy = true; controls(); state = await request('POST', '/v1/automations/plan', { revision, plan });
      const loaded = await drawAccount();
      if (loaded) message(enabled ? '저장했습니다. 앱의 실행 이력에서 준비·예약 결과를 확인합니다.' : '중지 상태로 저장했습니다.');
    } catch (error) { message((error as Error).message, true); }
    finally { busy = false; controls(); }
  }
  const change = () => timing(); root.addEventListener('change', change); root.addEventListener('input', change);
  el('account').addEventListener('change', () => void drawAccount());
  el('form').addEventListener('submit', event => event.preventDefault());
  el('save').addEventListener('click', () => void save(false)); el('start').addEventListener('click', () => void save(true));
  el('stop').addEventListener('click', async () => {
    if (busy || refreshing || !state || !selectedPlan()?.enabled) return;
    busy = true; controls();
    try {
      state = await request('POST', '/v1/automations/stop', { revision: state.revision, accountId: value('account') });
      const loaded = await drawAccount();
      if (loaded) message('중지를 요청했습니다. 이미 등록된 네이버 예약 글은 취소하지 않습니다.');
    }
    catch (error) { message((error as Error).message, true); }
    finally { busy = false; controls(); }
  });
  el('add-slot').addEventListener('click', () => {
    const slots = [...el('slots').children].map(row => ({ time: (row.querySelector('[type=time]') as HTMLInputElement).value, count: Number((row.querySelector('[type=number]') as HTMLInputElement).value) }));
    if (slots.length < 20) drawSlots([...slots, { time: '', count: 1 }]);
  });
  el('reload').addEventListener('click', () => void refresh(true));
  // Preview only: the app reserves nothing, so these keywords are still free when the real post is prepared.
  el('leword-preview').addEventListener('click', async () => {
    if (previewing || busy || refreshing) return;
    previewing = true; controls(); el('leword-list').replaceChildren(); el('leword-note').textContent = '추천을 불러오는 중입니다.';
    try {
      const reply = await api.dailyPublishingRequest('POST', '/v1/automations/leword-preview', { accountId: value('account'), topics: lewordTopics() });
      if (disposed) return;
      if (reply.status >= 400 || reply.body?.ok !== true || !Array.isArray(reply.body.candidates)) throw Error(reply.body?.error || 'LEWORD 추천을 가져오지 못했습니다.');
      el('leword-note').textContent = reply.body.candidates.length
        ? `LEWORD 기준 ${timestamp(reply.body.builtAt)}${reply.body.stale ? ' · 사이트에 연결하지 못해 마지막 저장본입니다' : ''} · 이 글들은 아직 예약되지 않았습니다.`
        : '이 주제에는 아직 쓰지 않은 추천 키워드가 없습니다.';
      for (const item of reply.body.candidates as LewordCandidate[]) {
        const line = document.createElement('li');
        line.textContent = `${item.keyword} (${item.topic}) · 검색 ${item.searchVolume} · 문서 ${item.documentCount} · 비율 ${item.ratio}`; el('leword-list').append(line);
      }
    } catch (error) { if (!disposed) { el('leword-note').textContent = ''; message((error as Error).message, true); } }
    finally { previewing = false; controls(); }
  });
  const close = () => { if (timer) clearInterval(timer); timer = undefined; root.close?.(); root.removeAttribute('open'); };
  el('close').addEventListener('click', close); root.addEventListener('cancel', close);
  controls();
  return { async open() { if (disposed) return; if (!root.open) root.showModal ? root.showModal() : root.setAttribute('open', ''); await refresh(true);
      if (!disposed && root.open && !timer && (options.pollIntervalMs ?? 10_000) > 0) timer = setInterval(() => void refresh(), options.pollIntervalMs ?? 10_000); },
    close, refresh, destroy() { disposed = true; generation++; close(); root.removeEventListener('change', change); root.removeEventListener('input', change); } };
}

export function initDailyPublishingPanel(): void {
  const button = document.getElementById('open-daily-publishing'), root = document.getElementById('daily-publishing-dialog') as HTMLDialogElement | null;
  if (!button || !root || button.dataset.bound === 'true') return;
  button.dataset.bound = 'true';
  const api = (window as unknown as { api?: DailyPanelApi }).api;
  button.addEventListener('click', () => {
    if (!api?.dailyPublishingRequest) { button.title = '앱 업데이트 후 다시 열어 주세요.'; button.textContent = '매일 예약발행 · 앱 업데이트 필요'; return; }
    instance ??= mountDailyPublishingPanel(root, api); void instance.open();
  });
  let instance: ReturnType<typeof mountDailyPublishingPanel> | undefined;
  window.addEventListener('pagehide', () => instance?.destroy(), { once: true });
}
