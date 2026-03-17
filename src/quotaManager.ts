import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export type QuotaType = 'publish' | 'content' | 'media' | 'imageApi';

export type QuotaLimits = {
  publish: number;
  content: number;
  media: number;
  imageApi: number;  // ✅ [2026-03-02] 일일 이미지 API 호출 한도 (RPD)
};

export type QuotaUsage = {
  publish: number;
  content: number;
  media: number;
  imageApi: number;       // ✅ [2026-03-02] 일일 이미지 API 호출 횟수
  imageApiCost: number;   // ✅ [2026-03-02] 일일 이미지 API 추정 비용 (원)
};

export type QuotaStatus = {
  date: string;
  limits: QuotaLimits;
  usage: QuotaUsage;
  isPaywalled: boolean;
};

interface QuotaState {
  date: string;
  publish: number;
  content: number;
  media: number;
  imageApi: number;
  imageApiCost: number;
}

// ✅ [2026-03-05] 위변조 방지용 내부 상태 (파일에 저장)
interface SecureQuotaState extends QuotaState {
  lastSeenDate: string;      // 날짜 롤백 감지용
  _sig: string;              // HMAC 시그니처
}

// ✅ [2026-03-05] 위변조 감지용 내부 솔트 (난독화)
const _INTERNAL_SALT = Buffer.from('TGV3b3JkUXVvdGFTYWx0MjAyNg==', 'base64').toString('utf-8');

// ✅ [2026-03-05] HMAC 시그니처 생성
function computeSignature(state: QuotaState & { lastSeenDate?: string }): string {
  const payload = JSON.stringify({
    d: state.date,
    p: state.publish,
    c: state.content,
    m: state.media,
    i: state.imageApi,
    ic: state.imageApiCost,
    l: state.lastSeenDate || state.date,
  });
  return crypto.createHmac('sha256', _INTERNAL_SALT).update(payload).digest('hex').substring(0, 16);
}

// ✅ [2026-03-05] 시그니처 검증
function verifySignature(state: SecureQuotaState): boolean {
  const expected = computeSignature(state);
  return state._sig === expected;
}

function getLocalDateKey(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getStorageFile(): string {
  try {
    return path.join(app.getPath('userData'), 'quota-state.json');
  } catch {
    return path.join(process.cwd(), 'quota-state.json');
  }
}

// ✅ [2026-03-05] 백업 파일 경로
function getBackupFile(): string {
  const main = getStorageFile();
  return main.replace('.json', '.backup.json');
}

// ✅ [2026-03-05] 위변조/삭제 감지 시 강제 소진 상태
const TAMPERED_STATE = (date: string): QuotaState => ({
  date,
  publish: 999,  // 한도 초과 → 무조건 차단
  content: 999,
  media: 0,
  imageApi: 0,
  imageApiCost: 0,
});

const EMPTY_STATE = (date: string): QuotaState => ({ date, publish: 0, content: 0, media: 0, imageApi: 0, imageApiCost: 0 });

async function readState(): Promise<QuotaState> {
  const today = getLocalDateKey();
  const storageFile = getStorageFile();
  const backupFile = getBackupFile();

  // ✅ [2026-03-05] 메인 파일 → 백업 파일 순서로 시도
  let raw: string | null = null;
  let source = 'main';

  try {
    raw = await fs.readFile(storageFile, 'utf-8');
  } catch {
    // 메인 파일 없음 → 백업 시도
    try {
      raw = await fs.readFile(backupFile, 'utf-8');
      source = 'backup';
      console.log('[QuotaManager] ⚠️ 메인 파일 없음 → 백업에서 복구');
    } catch {
      // 둘 다 없음 → 최초 실행
      return EMPTY_STATE(today);
    }
  }

  try {
    const parsed = JSON.parse(raw!) as SecureQuotaState;

    if (!parsed || typeof parsed.date !== 'string') {
      throw new Error('Invalid state');
    }

    // ✅ [2026-03-05] 시그니처 검증
    if (parsed._sig) {
      if (!verifySignature(parsed)) {
        console.error('[QuotaManager] 🚨 위변조 감지! 시그니처 불일치 → 강제 차단');
        return TAMPERED_STATE(today);
      }
    }

    // ✅ [2026-03-05] 날짜 롤백 감지
    const lastSeen = parsed.lastSeenDate || parsed.date;
    if (today < lastSeen) {
      // 시스템 날짜가 과거로 변경됨 → 마지막으로 본 날짜의 사용량 유지
      console.warn(`[QuotaManager] 🚨 날짜 롤백 감지! today=${today}, lastSeen=${lastSeen} → 기존 사용량 유지`);
      return {
        date: today,
        publish: Number(parsed.publish) || 0,
        content: Number(parsed.content) || 0,
        media: Number(parsed.media) || 0,
        imageApi: Number(parsed.imageApi) || 0,
        imageApiCost: Number(parsed.imageApiCost) || 0,
      };
    }

    // 정상: 날짜가 오늘보다 이전이면 리셋
    if (parsed.date !== today) {
      return EMPTY_STATE(today);
    }

    return {
      date: parsed.date,
      publish: Number(parsed.publish) || 0,
      content: Number(parsed.content) || 0,
      media: Number(parsed.media) || 0,
      imageApi: Number(parsed.imageApi) || 0,
      imageApiCost: Number(parsed.imageApiCost) || 0,
    };
  } catch {
    // JSON 파싱 실패 → 위변조 시도로 간주
    if (source === 'main') {
      // 백업 시도
      try {
        const backupRaw = await fs.readFile(backupFile, 'utf-8');
        const backupParsed = JSON.parse(backupRaw) as SecureQuotaState;
        if (backupParsed._sig && verifySignature(backupParsed)) {
          console.log('[QuotaManager] ⚠️ 메인 파일 손상 → 백업에서 복구 성공');
          if (backupParsed.date !== today && today >= (backupParsed.lastSeenDate || backupParsed.date)) {
            return EMPTY_STATE(today);
          }
          return {
            date: backupParsed.date,
            publish: Number(backupParsed.publish) || 0,
            content: Number(backupParsed.content) || 0,
            media: Number(backupParsed.media) || 0,
            imageApi: Number(backupParsed.imageApi) || 0,
            imageApiCost: Number(backupParsed.imageApiCost) || 0,
          };
        }
      } catch { /* 백업도 실패 */ }
    }
    console.error('[QuotaManager] 🚨 파일 손상 + 백업 실패 → 강제 차단');
    return TAMPERED_STATE(today);
  }
}

async function writeState(state: QuotaState): Promise<void> {
  const storageFile = getStorageFile();
  const backupFile = getBackupFile();

  // ✅ [2026-03-05] 시그니처 포함한 보안 상태 생성
  const today = getLocalDateKey();
  const secureState: SecureQuotaState = {
    ...state,
    lastSeenDate: today >= state.date ? today : state.date,
    _sig: '',
  };
  secureState._sig = computeSignature(secureState);

  const json = JSON.stringify(secureState, null, 2);

  await fs.mkdir(path.dirname(storageFile), { recursive: true });

  // ✅ [2026-03-05] 메인 + 백업 동시 저장
  await Promise.all([
    fs.writeFile(storageFile, json, 'utf-8'),
    fs.writeFile(backupFile, json, 'utf-8'),
  ]);
}

export async function getUsageToday(type: QuotaType): Promise<number> {
  const state = await readState();
  return state[type];
}

export async function getStatus(limits: QuotaLimits): Promise<QuotaStatus> {
  const state = await readState();
  return {
    date: state.date,
    limits,
    usage: {
      publish: state.publish,
      content: state.content,
      media: state.media,
      imageApi: state.imageApi,
      imageApiCost: state.imageApiCost,
    },
    // ✅ 발행 쿼터만 체크 (글생성+발행 = 1세트)
    isPaywalled: state.publish >= limits.publish,
  };
}

export async function canConsume(type: QuotaType, limits: QuotaLimits, amount: number = 1): Promise<boolean> {
  const state = await readState();
  const next = state[type] + amount;
  return next <= limits[type];
}

export async function consume(type: QuotaType, amount: number = 1): Promise<QuotaState> {
  const today = getLocalDateKey();
  const state = await readState();
  const base: QuotaState = state.date === today ? state : EMPTY_STATE(today);

  const next: QuotaState = {
    ...base,
    [type]: ((base as any)[type] || 0) + amount,
  };

  await writeState(next);
  return next;
}

/**
 * ✅ [2026-03-02] 이미지 API 호출 + 비용 동시 기록
 * @param costKrw 추정 비용 (원화)
 */
export async function consumeImageApi(costKrw: number = 0): Promise<QuotaState> {
  const today = getLocalDateKey();
  const state = await readState();
  const base: QuotaState = state.date === today ? state : EMPTY_STATE(today);

  const next: QuotaState = {
    ...base,
    imageApi: (base.imageApi || 0) + 1,
    imageApiCost: (base.imageApiCost || 0) + costKrw,
  };

  await writeState(next);
  return next;
}

/**
 * ✅ [2026-03-02] 이미지 API 일일 사용 현황 (대시보드용)
 */
export async function getImageApiStatus(): Promise<{
  todayCalls: number;
  todayCostKrw: number;
  date: string;
}> {
  const state = await readState();
  return {
    todayCalls: state.imageApi || 0,
    todayCostKrw: state.imageApiCost || 0,
    date: state.date,
  };
}

/**
 * 쿼터 환불 (선차감 후 실패 시 되돌리기용)
 * amount만큼 차감하되, 0 아래로는 내려가지 않음
 */
export async function refund(type: QuotaType, amount: number = 1): Promise<QuotaState> {
  const today = getLocalDateKey();
  const state = await readState();
  const base: QuotaState = state.date === today ? state : EMPTY_STATE(today);

  const next: QuotaState = {
    ...base,
    [type]: Math.max(0, ((base as any)[type] || 0) - amount),
  };

  await writeState(next);
  return next;
}

export async function resetAll(): Promise<void> {
  const today = getLocalDateKey();
  await writeState(EMPTY_STATE(today));
}
