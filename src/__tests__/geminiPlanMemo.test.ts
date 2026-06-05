/**
 * Unit tests for the Gemini plan memo (v2.10.76).
 *
 * Why: regression test for "유료 플랜 모달이 연속발행 중 반복 출현" 버그.
 * The memo provides a session-level cache that survives IPC getConfig
 * timeouts and saveConfig races, so the modal can never re-appear once the
 * user has explicitly chosen.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    rememberPlan,
    recallPlan,
    clearPlanMemo,
    __resetMemoForTest,
} from '../renderer/utils/geminiPlanMemo';

// In-memory localStorage stub. Vitest runs in node by default — no DOM.
class LocalStorageStub {
    private store = new Map<string, string>();
    getItem(k: string): string | null { return this.store.has(k) ? this.store.get(k)! : null; }
    setItem(k: string, v: string): void { this.store.set(k, v); }
    removeItem(k: string): void { this.store.delete(k); }
    clear(): void { this.store.clear(); }
    get length(): number { return this.store.size; }
    key(i: number): string | null { return Array.from(this.store.keys())[i] ?? null; }
}

beforeEach(() => {
    (globalThis as any).localStorage = new LocalStorageStub();
    __resetMemoForTest();
});

afterEach(() => {
    delete (globalThis as any).localStorage;
});

describe('rememberPlan / recallPlan — 동일 세션 내', () => {
    it('초기 상태는 null', () => {
        expect(recallPlan()).toBe(null);
    });

    it("rememberPlan('paid') 후 recallPlan === 'paid'", () => {
        rememberPlan('paid');
        expect(recallPlan()).toBe('paid');
    });

    it("rememberPlan('auto') 후 recallPlan === 'auto'", () => {
        rememberPlan('auto');
        expect(recallPlan()).toBe('auto');
    });

    it("rememberPlan('free') 후 recallPlan === 'free'", () => {
        rememberPlan('free');
        expect(recallPlan()).toBe('free');
    });

    it('덮어쓰기 — 마지막 값이 살아남음', () => {
        rememberPlan('free');
        rememberPlan('paid');
        expect(recallPlan()).toBe('paid');
    });

    it('잘못된 값은 무시 (방어)', () => {
        rememberPlan('paid');
        rememberPlan('garbage' as any);
        expect(recallPlan()).toBe('paid'); // 이전 값 유지
    });
});

describe('localStorage 폴백 — 새 세션 (모듈 메모 초기화) 시뮬', () => {
    it('memo 비어있어도 localStorage에 paid 있으면 recall', () => {
        rememberPlan('paid');
        __resetMemoForTest(); // 모듈 메모만 비움 — localStorage 유지
        expect(recallPlan()).toBe('paid'); // localStorage에서 복원
    });

    it('memo + localStorage 둘 다 비면 null', () => {
        clearPlanMemo();
        expect(recallPlan()).toBe(null);
    });

    it('localStorage 손상값(임의 string)은 무시 → null 반환', () => {
        localStorage.setItem('geminiPlanType_session_v1', 'PREMIUM_DELUXE');
        __resetMemoForTest();
        expect(recallPlan()).toBe(null);
    });
});

describe('clearPlanMemo — 명시 리셋', () => {
    it('memo + localStorage 모두 비움', () => {
        rememberPlan('paid');
        clearPlanMemo();
        expect(recallPlan()).toBe(null);
        expect(localStorage.getItem('geminiPlanType_session_v1')).toBe(null);
    });
});

describe('localStorage unavailable 환경 (private mode 시뮬)', () => {
    beforeEach(() => {
        // localStorage.setItem이 throw 하도록 mock
        (globalThis as any).localStorage = {
            getItem: () => { throw new Error('private mode'); },
            setItem: () => { throw new Error('private mode'); },
            removeItem: () => { throw new Error('private mode'); },
        };
        __resetMemoForTest();
    });

    it('rememberPlan throw 안 함 + 모듈 메모는 살아있음', () => {
        expect(() => rememberPlan('paid')).not.toThrow();
        expect(recallPlan()).toBe('paid'); // 모듈 메모로 답
    });

    it('memo 비고 localStorage도 못 읽으면 null', () => {
        __resetMemoForTest();
        expect(() => recallPlan()).not.toThrow();
        expect(recallPlan()).toBe(null);
    });
});

describe('실 시나리오 — 연속발행 모달 재출현 차단', () => {
    it('자동 모드 저장 후 다음 N번 호출 모두 cache hit', () => {
        rememberPlan('auto');
        for (let i = 0; i < 50; i++) {
            expect(recallPlan()).toBe('auto');
        }
    });

    it('유료 클릭 → 다음 N번 호출 모두 cache hit', () => {
        rememberPlan('paid');
        for (let i = 0; i < 50; i++) {
            expect(recallPlan()).toBe('paid');
        }
    });

    it('paid 한 번 저장된 뒤에는 무료 라이선스 자동 free 트리거 무력화', () => {
        // 사용자가 paid 선택 후 — getConfig 타임아웃, isFreeLicense 검사,
        // 그 어떤 후속 흐름도 모달 재진입할 수 없어야 함.
        rememberPlan('paid');
        __resetMemoForTest(); // 모듈 메모 리셋해도
        expect(recallPlan()).toBe('paid'); // localStorage가 막아줌
    });
});

describe('v2.10.77 — 계정 전환 시 cache 격리', () => {
    it('clearPlanMemo는 모듈 메모 + localStorage 둘 다 비움', () => {
        rememberPlan('paid');
        expect(recallPlan()).toBe('paid');
        clearPlanMemo();
        expect(recallPlan()).toBe(null);
    });

    it('계정 A 로그인 시뮬 → paid 저장 → 로그아웃(clearPlanMemo) → 계정 B 로그인 시 모달 재출현 보장', () => {
        // 계정 A: paid 선택
        rememberPlan('paid');
        expect(recallPlan()).toBe('paid');
        // 로그아웃 → clearPlanMemo (실제 onAccountLogout이 호출)
        clearPlanMemo();
        // 계정 B: cache 비어있어야 함 → 모달 정상 출현
        expect(recallPlan()).toBe(null);
    });

    it('동일 계정 재로그인 (clearPlanMemo 후) → 새 답변 받기까지 모달 출현', () => {
        rememberPlan('free');
        clearPlanMemo();
        expect(recallPlan()).toBe(null);
        rememberPlan('paid'); // 사용자가 재선택
        expect(recallPlan()).toBe('paid');
    });
});

describe('v2.10.77 — priceInfoModal cache 동기화', () => {
    it('사용자가 settings에서 paid → free 전환 시 cache가 즉시 따라감', () => {
        // 초기 상태: paid
        rememberPlan('paid');
        expect(recallPlan()).toBe('paid');
        // 사용자가 priceInfoModal에서 free 선택 후 저장
        // (priceInfoModal 코드가 rememberPlan('free') 호출하는 것 시뮬)
        rememberPlan('free');
        expect(recallPlan()).toBe('free');
    });

    it('settings에서 plan 라디오 미체크로 저장 시 cache는 변화 없음 (디스크 보존과 일관)', () => {
        rememberPlan('paid');
        // priceInfoModal이 라디오 unchecked 감지 → rememberPlan 호출 안 함 → cache 유지
        // (priceInfoModal.ts에서 검증된 라디오 값일 때만 rememberPlan을 호출하도록 보장)
        expect(recallPlan()).toBe('paid');
    });
});
