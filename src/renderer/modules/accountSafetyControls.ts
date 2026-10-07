type SafetyState = { paused: boolean; busy: boolean; version: number; code?: string; label: string; pendingToken?: string };
type Response = { success: boolean; state?: SafetyState; message?: string };
type SafetyApi = { accountSafety(id: string, action: string, version?: number, outcome?: string, token?: string): Promise<Response> };

/** Local status only; rendering cards never contacts Naver. */
export function installAccountSafetyControls(root: Document = document): () => void {
  const mount = () => {
    for (const card of Array.from(root.querySelectorAll<HTMLElement>('.account-item[data-account-id], .ma-account-card[data-account-id]'))) {
      if (card.querySelector('[data-account-safety]')) continue;
      const id = card.dataset.accountId;
      if (!id) continue;
      const panel = root.createElement('div'); panel.dataset.accountSafety = '1';
      panel.style.cssText = 'background:#eff6ff;color:#17365d;padding:10px;border-radius:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;max-width:360px;';
      const label = root.createElement('span'); label.setAttribute('role', 'status'); label.style.width = '100%'; label.textContent = '계정 상태 확인 중'; panel.append(label);
      let state: SafetyState | undefined; let request = 0;
      const buttons: HTMLButtonElement[] = [];
      const api = () => (window as unknown as { api?: SafetyApi }).api;
      const update = async (action: string, outcome?: string) => {
        const serial = ++request; buttons.forEach(b => { b.disabled = true; });
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          if (!api()?.accountSafety) throw Error('앱 업데이트 후 계정 상태를 확인해주세요.');
          const reply = await Promise.race([api()!.accountSafety(id, action, state?.version, outcome, state?.pendingToken), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('응답이 지연됩니다. 상태 확인을 다시 눌러주세요.')), 45000); })]);
          if (!panel.isConnected || serial !== request) return;
          if (reply.state && (!state || reply.state.version >= state.version)) state = reply.state;
          label.textContent = reply.message || state?.label || '상태를 확인하지 못했습니다.';
        } catch (error) { if (serial === request) label.textContent = error instanceof Error ? error.message : '상태 확인 실패'; }
        finally {
          if (timer) clearTimeout(timer);
          if (serial === request) buttons.forEach(b => { b.disabled = Boolean(state?.busy) && b.dataset.action !== 'status'; });
          for (const b of buttons) if (b.dataset.action === 'confirm') { b.hidden = !state?.pendingToken; b.style.setProperty('display', b.hidden ? 'none' : 'inline-flex', 'important'); }
        }
      };
      const add = (text: string, action: string, outcome?: string) => {
        const button = root.createElement('button'); button.type = 'button'; button.textContent = text; button.dataset.action = action;
        button.style.cssText = 'background:#16834a;color:white;border:0;border-radius:6px;padding:7px;cursor:pointer;';
        button.addEventListener('click', () => {
          if (action === 'confirm' && !window.confirm(outcome === 'published' ? '네이버 글 목록에서 게시 또는 예약 완료를 확인했나요? 이 작업은 재발행하지 않습니다.' : '네이버 글 목록과 예약 목록 모두에서 해당 글이 없는 것을 확인했나요? 불확실하면 취소해주세요.')) return;
          void update(action, outcome);
        });
        if (action === 'confirm') { button.hidden = true; button.style.setProperty('display', 'none', 'important'); }
        buttons.push(button); panel.append(button);
      };
      add('네이버에서 확인하기', 'open'); add('확인 후 재개', 'resume'); add('상태 확인', 'status');
      add('발행됨 확인', 'confirm', 'published'); add('발행 안 됨 확인', 'confirm', 'not-published');
      card.append(panel); void update('status');
    }
  };
  const observer = new MutationObserver(mount); observer.observe(root.body, { childList: true, subtree: true }); mount();
  return () => observer.disconnect();
}
