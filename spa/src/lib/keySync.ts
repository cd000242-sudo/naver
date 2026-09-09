/**
 * 계정별 API 키 동기화 — "로그인한 계정마다 api 값을 기억 못 하네요? 모바일은 또 따로 입력해야 되나요?"(사장님 2026-09-09).
 *
 * 키는 여전히 이 브라우저(localStorage)에 산다. 여기에 더해 **로그인 비밀번호로 잠근 암호문**을 워커 KV 에 두어
 * 다른 기기에서 같은 계정으로 로그인하면 풀어서 채운다. 서버는 비밀번호도 평문 키도 모른다:
 *   유도 키 = PBKDF2-SHA256(비밀번호, 소금 = 아이디, 150,000회) → 256비트
 *   slot(주소) = SHA-256(유도 키 ‖ "slot") 의 16진수 — 비밀번호를 모르면 주소도 못 만든다
 *   blob = base64(IV ‖ AES-GCM(유도 키, JSON(keys)))
 * 유도 키는 이 브라우저 localStorage 에 남는다(비밀번호가 아니라 그 파생값). 로그아웃하면 지운다.
 * 정책: 로그인 시 원격 blob 이 있고 로컬이 비었으면 채운다. 로컬에 키가 있으면 로컬을 올린다(마지막 저장 기기가 이긴다).
 * 이후 '내 API 키'에서 저장할 때마다 다시 올린다(userKeys.saveUserKeys 가 쏘는 이벤트).
 */
import { hasAnyUserKey, loadUserKeys, saveUserKeys, type UserKeys } from './userKeys';
import { callWorkerRaw } from './keywordApi';

const SYNC_KEY = 'leaderspro.keysync.v1';
const PBKDF2_ITERATIONS = 150_000;

interface SyncRecord { slot: string; key: string; userId: string }

const enc = new TextEncoder();
const dec = new TextDecoder();
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const toHex = (bytes: Uint8Array) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

function cryptoOk(): boolean {
    return typeof crypto !== 'undefined' && !!crypto.subtle;
}

function loadRecord(): SyncRecord | null {
    try {
        const parsed = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null');
        return parsed && typeof parsed.slot === 'string' && typeof parsed.key === 'string' ? parsed : null;
    } catch { return null; }
}

export function clearKeySync(): void {
    try { localStorage.removeItem(SYNC_KEY); } catch { /* 계속 */ }
}

export function keySyncEnabled(): boolean {
    return loadRecord() !== null;
}

async function deriveRecord(userId: string, password: string): Promise<SyncRecord> {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`leaderspro:${userId.trim().toLowerCase()}`), iterations: PBKDF2_ITERATIONS },
        base,
        256,
    );
    const key = new Uint8Array(bits);
    const slotBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array([...key, ...enc.encode('slot')])));
    return { slot: toHex(slotBytes), key: toB64(key), userId: userId.trim() };
}

async function aesKey(record: SyncRecord, usage: KeyUsage[]): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', fromB64(record.key), { name: 'AES-GCM' }, false, usage);
}

async function encryptKeys(record: SyncRecord, keys: UserKeys): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(record, ['encrypt']), enc.encode(JSON.stringify(keys))));
    return toB64(new Uint8Array([...iv, ...ct]));
}

async function decryptKeys(record: SyncRecord, blob: string): Promise<UserKeys | null> {
    try {
        const bytes = fromB64(blob);
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await aesKey(record, ['decrypt']), bytes.slice(12));
        const parsed = JSON.parse(dec.decode(pt));
        return parsed && typeof parsed === 'object' ? parsed as UserKeys : null;
    } catch { return null; }
}

/** 지금 저장된 키를 올린다. 동기화가 켜져 있지 않으면 아무것도 안 한다. 실패는 조용히(다음 저장 때 다시). */
export async function pushUserKeys(keys: UserKeys = loadUserKeys()): Promise<boolean> {
    const record = loadRecord();
    if (!record || !cryptoOk()) return false;
    try {
        const blob = hasAnyUserKey(keys) ? await encryptKeys(record, keys) : '';
        const res = await callWorkerRaw('user-keys-put', { slot: record.slot, blob });
        return Boolean(res && res.ok);
    } catch { return false; }
}

export type KeySyncOutcome = 'pulled' | 'pushed' | 'nothing' | 'unavailable';

/**
 * 로그인 직후 — 비밀번호로 유도 키를 만들고 기억한 뒤, 원격과 로컬을 맞춘다.
 * 로컬이 비었고 원격이 있으면 채운다(pulled). 로컬에 키가 있으면 올린다(pushed).
 */
export async function enableKeySync(userId: string, password: string): Promise<KeySyncOutcome> {
    if (!cryptoOk() || !userId.trim() || !password) return 'unavailable';
    const record = await deriveRecord(userId, password);
    try { localStorage.setItem(SYNC_KEY, JSON.stringify(record)); } catch { /* 기억 못 해도 이번 동기화는 한다 */ }
    // 로컬과 원격을 합친다(로컬 칸 우선, 빈 칸만 원격으로) → 합친 결과를 올린다. 어느 기기가 먼저였든 잃는 칸이 없다.
    const pulled = await pullUserKeys();
    if (pulled.status === 'merged') return pulled.filled > 0 ? 'pulled' : 'pushed';
    const local = loadUserKeys();
    if (hasAnyUserKey(local)) return (await pushUserKeys(local)) ? 'pushed' : 'nothing';
    return 'nothing';
}

/** 동기화 상태 — 화면(내 API 키)의 안내용. */
export function keySyncInfo(): { enabled: boolean; userId: string | null } {
    const record = loadRecord();
    return { enabled: record !== null, userId: record ? record.userId : null };
}

/**
 * 원격을 끌어와 로컬과 합친다 — 로컬에 있는 칸은 로컬이 이기고, 빈 칸만 원격으로 채운다.
 * 로그인 없이도 '내 API 키'의 [다른 기기 키 가져오기]가 부른다. 합친 결과는 다시 올린다.
 */
export async function pullUserKeys(): Promise<{ status: 'merged' | 'none' | 'unavailable'; filled: number }> {
    const record = loadRecord();
    if (!record || !cryptoOk()) return { status: 'unavailable', filled: 0 };
    try {
        const res = await callWorkerRaw('user-keys-get', { slot: record.slot });
        const blob = res && res.ok && typeof res.blob === 'string' ? res.blob : '';
        if (!blob) return { status: 'none', filled: 0 };
        const remote = await decryptKeys(record, blob);
        if (!remote || !hasAnyUserKey(remote)) return { status: 'none', filled: 0 };
        const local = loadUserKeys();
        let filled = 0;
        const merged: UserKeys = { ...remote, ...local };
        for (const [field, value] of Object.entries(remote)) {
            if (!local[field as keyof UserKeys] && value) filled += 1;
        }
        saveUserKeys(merged); // 저장 이벤트 → 합친 결과가 다시 올라간다
        return { status: 'merged', filled };
    } catch { return { status: 'unavailable', filled: 0 }; }
}

/** userKeys.saveUserKeys 가 쏘는 이벤트를 받아 올린다 — 앱 어디서 저장하든 한 곳에서. */
export function installKeySyncListener(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('leword:keys-saved', () => { void pushUserKeys(); });
}
