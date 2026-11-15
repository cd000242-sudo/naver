// src/renderer/modules/photoCheckChoice.ts
// Choice window shown when the photo-check engine cannot run (subscription limit / login) on the two
// photo-collection paths: the "관련 사진 찾기" engine and the image tab "AI 자동수집".
// Inline bundle = single scope: every top-level identifier here starts with photoCheck / PHOTO_CHECK.

export type PhotoCheckPick = 'agent-claude' | 'agent-codex' | 'caption' | 'manual';
export type PhotoCheckMode = Exclude<PhotoCheckPick, 'manual'>;
export type PhotoCheckConnectionState = 'connected' | 'disconnected' | 'unknown';
export interface PhotoCheckConnection { claude: PhotoCheckConnectionState; codex: PhotoCheckConnectionState }
export interface PhotoCheckFailure { reason: 'rate_limit' | 'login'; vendor: string; message?: string }
/** One row of the window. `note` is the status line (agents) or the one-line explanation (free / manual). */
export interface PhotoCheckOption { pick: PhotoCheckPick; label: string; note: string; disabled: boolean }
interface PhotoCheckResultLike {
    success?: boolean;
    code?: string;
    message?: string;
    visionUnavailable?: { reason?: string; vendor?: string };
}

const PHOTO_CHECK_CODE = 'VISION_ENGINE_UNAVAILABLE';
const PHOTO_CHECK_MAX_WINDOWS = 3;
const PHOTO_CHECK_STATUS_TIMEOUT_MS = 3000;
const PHOTO_CHECK_OVERLAY_ID = 'photo-check-choice-overlay';

function photoCheckAgentOption(mode: 'agent-codex' | 'agent-claude', state: PhotoCheckConnectionState, tried: readonly PhotoCheckPick[]): PhotoCheckOption {
    const label = mode === 'agent-codex' ? 'Codex 구독으로 이어서' : 'Claude 구독으로 이어서';
    if (tried.includes(mode)) return { pick: mode, label, note: '방금 안 됐어요', disabled: true };
    if (state === 'disconnected') return { pick: mode, label, note: '연결 안 됨', disabled: true };
    return { pick: mode, label, note: state === 'connected' ? '연결됨' : '연결 확인 못 함', disabled: false };
}

/** The rows to show: the other subscription(s), then the free check, then "stop and pick by hand". */
export function buildPhotoCheckOptions(input: { vendor: string; connection: PhotoCheckConnection; tried: readonly PhotoCheckPick[] }): PhotoCheckOption[] {
    const { vendor, connection, tried } = input;
    const agents: Array<'agent-codex' | 'agent-claude'> = vendor === 'agent-claude'
        ? ['agent-codex']
        : vendor === 'agent-codex' ? ['agent-claude'] : ['agent-codex', 'agent-claude'];
    return [
        ...agents.map((mode) => photoCheckAgentOption(mode, mode === 'agent-codex' ? connection.codex : connection.claude, tried)),
        { pick: 'caption', label: '무료 판정으로 계속', note: '사진 설명 글만 보고 고릅니다. 정확도가 떨어져요.', disabled: false },
        { pick: 'manual', label: '직접 고를게요', note: '지금은 멈춥니다.', disabled: false },
    ];
}

function photoCheckEngineName(vendor: string): string {
    return vendor === 'agent-codex' ? 'Codex' : vendor === 'agent-claude' ? 'Claude' : '';
}

/** One reason line: subscription engines get a fixed sentence, API engines show the first sentence of the message. */
export function buildPhotoCheckReason(failure: PhotoCheckFailure): string {
    const engine = photoCheckEngineName(failure.vendor);
    if (engine) return failure.reason === 'login' ? `${engine} 구독 로그인이 풀렸어요.` : `${engine} 구독 사용 한도가 소진됐어요.`;
    const first = String(failure.message || '').trim().match(/^[^.!?。]*[.!?。]?/)?.[0]?.trim();
    return first || '사진 검사 엔진을 쓸 수 없어요.';
}

export function photoCheckModeLabel(mode: PhotoCheckMode): string {
    return mode === 'agent-codex' ? 'Codex 구독' : mode === 'agent-claude' ? 'Claude 구독' : '무료 판정';
}

function photoCheckStateOf(result: any): PhotoCheckConnectionState {
    if (!result || result.success !== true || !result.status) return 'unknown';
    return result.status.available === true ? 'connected' : 'disconnected';
}

function photoCheckLookup(agent: 'claude' | 'codex'): Promise<PhotoCheckConnectionState> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve('unknown'), PHOTO_CHECK_STATUS_TIMEOUT_MS);
        const done = (state: PhotoCheckConnectionState) => { clearTimeout(timer); resolve(state); };
        try {
            Promise.resolve((window as any).api.agentStatus(agent)).then((r) => done(photoCheckStateOf(r)), () => done('unknown'));
        } catch {
            done('unknown');
        }
    });
}

/** A lookup that fails or takes over 3 seconds counts as "unknown" (the button stays clickable). */
export async function photoCheckReadConnection(): Promise<PhotoCheckConnection> {
    const [claude, codex] = await Promise.all([photoCheckLookup('claude'), photoCheckLookup('codex')]);
    return { claude, codex };
}

function photoCheckEl<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    el.className = className;
    if (text) el.textContent = text;
    return el;
}

function photoCheckBuildRow(option: PhotoCheckOption, primary: boolean, onPick: (pick: PhotoCheckPick) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.style.marginTop = '8px';
    const button = photoCheckEl('button', `nv-btn nv-btn--block${primary ? ' nv-btn--primary' : ''}`, option.label);
    button.disabled = option.disabled;
    button.addEventListener('click', () => onPick(option.pick));
    row.append(button, photoCheckEl('div', 'nv-modal__text', option.note));
    return row;
}

function photoCheckBuildOverlay(failure: PhotoCheckFailure, options: PhotoCheckOption[], onPick: (pick: PhotoCheckPick) => void): HTMLDivElement {
    // Colors live in the theme classes (theme-naver-components.css section 2); only the stacking order stays inline.
    const overlay = photoCheckEl('div', 'nv-scrim');
    overlay.id = PHOTO_CHECK_OVERLAY_ID;
    overlay.style.zIndex = '100000';
    const card = photoCheckEl('div', 'nv-modal nv-modal--warn');
    card.append(
        photoCheckEl('div', 'nv-modal__title', '사진 검사를 못 했어요'),
        photoCheckEl('div', 'nv-modal__text', buildPhotoCheckReason(failure)),
        photoCheckEl('div', 'nv-modal__text', '어떻게 할까요?'),
    );
    const firstEnabled = options.findIndex((o) => !o.disabled);
    options.forEach((option, i) => card.append(photoCheckBuildRow(option, i === firstEnabled, onPick)));
    overlay.append(card);
    return overlay;
}

/** Blocking window. Outside click and Esc count as "직접 고를게요" (stop and pick by hand). */
export async function askPhotoCheckChoice(failure: PhotoCheckFailure, tried: readonly PhotoCheckPick[]): Promise<PhotoCheckPick> {
    const connection = await photoCheckReadConnection();
    if (document.getElementById(PHOTO_CHECK_OVERLAY_ID)) return 'manual';
    return new Promise<PhotoCheckPick>((resolve) => {
        const options = buildPhotoCheckOptions({ vendor: failure.vendor, connection, tried });
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish('manual'); };
        const finish = (pick: PhotoCheckPick) => {
            document.removeEventListener('keydown', onKey);
            overlay.remove();
            resolve(pick);
        };
        const overlay = photoCheckBuildOverlay(failure, options, finish);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) finish('manual'); });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(overlay);
    });
}

function photoCheckIsBlocked(result: PhotoCheckResultLike | null | undefined): boolean {
    return !!result && result.success === false && result.code === PHOTO_CHECK_CODE;
}

function photoCheckFailureOf(result: PhotoCheckResultLike): PhotoCheckFailure {
    return {
        reason: result.visionUnavailable?.reason === 'login' ? 'login' : 'rate_limit',
        vendor: String(result.visionUnavailable?.vendor || ''),
        message: String(result.message || ''),
    };
}

/**
 * Takes the first result of a photo-collection call. While it is the "check engine unavailable" failure, asks the
 * user and calls again with the chosen photoCheckMode (at most 3 windows). "manual" or any other result is handed
 * back unchanged, so the caller keeps its existing stop / error handling.
 */
export async function photoCheckRetryLoop<T extends PhotoCheckResultLike | null | undefined>(
    first: T,
    rerun: (mode: PhotoCheckMode) => Promise<T>,
    log: (message: string) => void,
    ask: typeof askPhotoCheckChoice = askPhotoCheckChoice,
): Promise<T> {
    let result = first;
    const tried: PhotoCheckPick[] = [];
    for (let windows = 0; windows < PHOTO_CHECK_MAX_WINDOWS; windows++) {
        if (!result || !photoCheckIsBlocked(result)) return result;
        const failure = photoCheckFailureOf(result);
        const failedAgent = failure.vendor === 'agent-claude' || failure.vendor === 'agent-codex' ? failure.vendor : null;
        if (failedAgent && !tried.includes(failedAgent)) tried.push(failedAgent);
        const pick = await ask(failure, [...tried]);
        if (pick === 'manual') return result;
        log(`🔁 ${photoCheckModeLabel(pick)}으로 처음부터 다시 찾습니다 (1~3분)`);
        result = await rerun(pick);
    }
    return result;
}
