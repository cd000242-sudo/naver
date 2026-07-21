/**
 * [v2.11.135] 무료체험 일일 쿼터 "00시 지나도 초기화 안 됨" 고객 문의 회귀 잠금.
 *
 * 원인: readState가 판정 결과(리셋/변조/미래 lastSeen)를 파일에 되쓰지 않아
 *  - 손상/서명불일치 파일 → 매일 같은 파일 → 매일 999 차단 (영구 잠금)
 *  - 시계가 미래로 갔다 돌아온 PC → lastSeenDate 미래 고착 → 그 날짜까지 리셋 불가
 * 수정: 자기치유 영속화 — 차단은 "오늘 하루"로 한정되고 다음 자정에 정상 리셋.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';
// vitest alias가 electron → mocks/electron.ts 로 먼저 해석되므로 vi.mock 대신
// 공유 모크 객체의 getPath를 이 스위트에서 직접 임시 디렉터리로 패치한다.
import { app as electronAppMock } from 'electron';

import { getStatus, addDaysToDateKey } from '../quotaManager';

const LIMITS = { publish: 3, content: 3, media: 10, imageApi: 100 };

// quotaManager와 동일한 서명 (테스트에서 유효 파일을 제작하기 위함)
const SALT = Buffer.from('TGV3b3JkUXVvdGFTYWx0MjAyNg==', 'base64').toString('utf-8');
function sign(state: Record<string, unknown>): string {
  const payload = JSON.stringify({
    d: state.date, p: state.publish, c: state.content, m: state.media,
    i: state.imageApi, ic: state.imageApiCost, l: state.lastSeenDate || state.date,
  });
  return crypto.createHmac('sha256', SALT).update(payload).digest('hex').substring(0, 16);
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function makeState(date: string, publish: number, lastSeenDate?: string) {
  const base: Record<string, unknown> = {
    date, publish, content: publish, media: 0, imageApi: 0, imageApiCost: 0,
    lastSeenDate: lastSeenDate ?? date, _sig: '',
  };
  base._sig = sign(base);
  return base;
}

const waitForWrite = () => new Promise((resolve) => setTimeout(resolve, 150));

let tempDir = '';
const originalGetPath = electronAppMock.getPath;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'quota-heal-'));
  (electronAppMock as { getPath: (name: string) => string }).getPath = () => tempDir;
});

afterEach(() => {
  (electronAppMock as { getPath: (name: string) => string }).getPath = originalGetPath;
  rmSync(tempDir, { recursive: true, force: true });
});

describe('일일 쿼터 자기치유 (00시 초기화 고착 방지)', () => {
  it('어제 소진(3/3) 파일은 오늘 읽는 즉시 0으로 리셋되고 파일도 오늘자로 재작성된다', async () => {
    const yesterday = addDaysToDateKey(todayKey(), -1);
    writeFileSync(join(tempDir, 'quota-state.json'), JSON.stringify(makeState(yesterday, 3)));

    const status = await getStatus(LIMITS);
    expect(status.usage.publish).toBe(0);
    expect(status.isPaywalled).toBe(false);

    await waitForWrite();
    const persisted = JSON.parse(readFileSync(join(tempDir, 'quota-state.json'), 'utf8'));
    expect(persisted.date).toBe(todayKey());
    expect(persisted.publish).toBe(0);
  });

  it('서명 불일치(손상) 파일은 오늘만 차단되고, 서명된 오늘자 파일로 교체된다', async () => {
    const broken = makeState(todayKey(), 1);
    broken._sig = 'deadbeefdeadbeef';
    writeFileSync(join(tempDir, 'quota-state.json'), JSON.stringify(broken));
    writeFileSync(join(tempDir, 'quota-state.backup.json'), JSON.stringify(broken));

    const status = await getStatus(LIMITS);
    expect(status.isPaywalled).toBe(true); // 오늘은 차단 유지 (위변조 억지)

    await waitForWrite();
    const persisted = JSON.parse(readFileSync(join(tempDir, 'quota-state.json'), 'utf8'));
    // 핵심: 유효 서명 + 오늘 날짜로 교체됨 → 내일 자정 `date !== today` 경로가
    // 정상 리셋한다 (기존에는 같은 깨진 파일이 영원히 999를 반환).
    expect(persisted.date).toBe(todayKey());
    expect(persisted._sig).toBe(sign(persisted));
  });

  it('비정상 미래 lastSeenDate(+10일)는 오늘 사용량은 유지하되 today+1로 교정된다', async () => {
    const farFuture = addDaysToDateKey(todayKey(), 10);
    writeFileSync(join(tempDir, 'quota-state.json'), JSON.stringify(makeState(farFuture, 3, farFuture)));

    const status = await getStatus(LIMITS);
    expect(status.usage.publish).toBe(3); // 시계 조작 악용 방지: 오늘은 소진 유지
    expect(status.isPaywalled).toBe(true);

    await waitForWrite();
    const persisted = JSON.parse(readFileSync(join(tempDir, 'quota-state.json'), 'utf8'));
    expect(persisted.lastSeenDate).toBe(addDaysToDateKey(todayKey(), 1)); // 교정됨
    expect(persisted._sig).toBe(sign(persisted));
  });

  it('정상 롤백 창(+1일)은 기존 보호를 유지한다 — 사용량 보존', async () => {
    const tomorrow = addDaysToDateKey(todayKey(), 1);
    writeFileSync(join(tempDir, 'quota-state.json'), JSON.stringify(makeState(tomorrow, 3, tomorrow)));

    const status = await getStatus(LIMITS);
    expect(status.usage.publish).toBe(3);
    expect(status.isPaywalled).toBe(true); // 내일 자정에 자연 해소
  });

  it('addDaysToDateKey는 월/년 경계를 로컬 달력으로 처리한다', () => {
    expect(addDaysToDateKey('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDaysToDateKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDateKey('2026-03-01', -1)).toBe('2026-02-28');
  });
});
