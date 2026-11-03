interface DisclosureConfig {
  aiMarkAllImages?: boolean;
  success?: boolean;
}
interface DisclosureApi {
  getConfig?: () => Promise<DisclosureConfig>;
  saveConfig?: (update: { aiMarkAllImages: boolean }) => Promise<DisclosureConfig>;
}
type SettingNotice = (message: string, kind: 'success' | 'error') => void;
const boundDisclosureInputs = new WeakSet<HTMLInputElement>();

/** Attach synchronously: an in-flight config read must never eat the user's first click. */
export function bindImageAiDisclosureSetting(
  checkbox: HTMLInputElement | null,
  status: HTMLElement | null,
  api: DisclosureApi | undefined,
  notify: SettingNotice,
): void {
  if (!checkbox || boundDisclosureInputs.has(checkbox)) return;
  boundDisclosureInputs.add(checkbox);
  let revision = 0;
  let confirmed = checkbox.checked;
  let hasSuccessfulSave = false;
  let saving = false;
  const show = (message: string, state: 'loading' | 'saving' | 'saved' | 'error'): void => {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  };
  const savedText = (enabled: boolean): string => enabled
    ? '저장됨 · 발행 시 모든 이미지에 AI 활용 표시'
    : '저장됨 · AI 생성 이미지만 자동 판정';

  checkbox.addEventListener('change', () => {
    revision += 1;
    const requested = checkbox.checked;
    checkbox.disabled = true;
    saving = true;
    show('설정을 저장하고 있습니다…', 'saving');
    void (async () => {
      try {
        if (!api?.saveConfig) throw new Error('Config connection unavailable');
        const persisted = await api.saveConfig({ aiMarkAllImages: requested });
        if (persisted?.success === false || persisted?.aiMarkAllImages !== requested) {
          throw new Error('Config save was not acknowledged');
        }
        confirmed = requested;
        hasSuccessfulSave = true;
        show(savedText(requested), 'saved');
        notify(savedText(requested), 'success');
      } catch {
        checkbox.checked = confirmed;
        const message = '설정을 저장하지 못했습니다. 이전 상태를 유지합니다. 다시 눌러 주세요.';
        show(message, 'error');
        notify(message, 'error');
      } finally {
        saving = false;
        checkbox.disabled = false;
      }
    })();
  });

  show('저장된 설정을 확인하고 있습니다…', 'loading');
  void (async () => {
    try {
      if (!api?.getConfig) throw new Error('Config connection unavailable');
      const config = await api.getConfig();
      // A delayed initial read is still the rollback baseline until a save succeeds.
      if (hasSuccessfulSave) return;
      confirmed = config?.aiMarkAllImages === true;
      if (!saving) checkbox.checked = confirmed;
      if (revision === 0) show(savedText(confirmed), 'saved');
    } catch {
      if (revision === 0) show('저장된 설정을 불러오지 못했습니다. 선택하면 다시 저장합니다.', 'error');
    }
  })();
}
