/**
 * One-time consent gate for the fixed `better-life-naver://ldb/connect` launch route.
 * Any web page can open that URI, so the bridge is never enabled without a person
 * pressing the confirm button. Electron and config access are injected.
 */
export const LDB_CONNECT_MERGE_MS = 5_000;

export const LDB_CONNECT_PROMPT = {
  type: 'question',
  title: 'LDB 확장 연결',
  message: '크롬의 LDB 확장이 이 앱과 연결하려고 해요. 연결을 켤까요?',
  buttons: ['켜기', '나중에'],
  // A stray Enter or window close must mean "later", never "enable".
  defaultId: 1,
  cancelId: 1,
  noLink: true,
} as const;

export interface LdbConnectPromptOptions {
  type: 'question'; title: string; message: string; buttons: string[];
  defaultId: number; cancelId: number; noLink: boolean;
}

export type LdbConnectOutcome = 'already-enabled' | 'enabled' | 'declined' | 'merged' | 'failed';

export interface LdbConnectConsentDeps {
  /** Reads the saved "확장 연결 사용" setting. */
  isEnabled: () => Promise<boolean>;
  /** Blocking message box; the caller picks the parent window. */
  showMessageBox: (options: LdbConnectPromptOptions) => Promise<{ response: number }>;
  /** Same route as the settings switch: save the setting, then start the bridge and token file. */
  enable: () => Promise<void>;
  now?: () => number;
}

/**
 * Returns a request function. Calls made while the dialog is open, or within
 * LDB_CONNECT_MERGE_MS after it was answered, are merged into the first one.
 */
export function createLdbConnectConsent(deps: LdbConnectConsentDeps): () => Promise<LdbConnectOutcome> {
  const now = deps.now ?? Date.now;
  let busy = false;
  let answeredAt: number | undefined;

  const ask = async (): Promise<LdbConnectOutcome> => {
    try {
      if (await deps.isEnabled()) return 'already-enabled';
      if (answeredAt !== undefined && now() - answeredAt < LDB_CONNECT_MERGE_MS) return 'merged';
      let response: number;
      try { response = (await deps.showMessageBox({ ...LDB_CONNECT_PROMPT, buttons: [...LDB_CONNECT_PROMPT.buttons] })).response; }
      finally { answeredAt = now(); }
      if (response !== 0) return 'declined';
      await deps.enable();
      return 'enabled';
    } catch {
      return 'failed';
    }
  };

  return async () => {
    if (busy) return 'merged';
    busy = true;
    try { return await ask(); }
    finally { busy = false; }
  };
}
