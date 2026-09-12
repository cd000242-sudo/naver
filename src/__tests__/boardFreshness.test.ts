import { describe, expect, it } from 'vitest';
import {
    judgeFreshness,
    lastDueAt,
    formatKst,
    formatMinutes,
    LATE_AFTER_MIN,
    VERY_LATE_AFTER_MIN,
} from '../../spa/src/lib/boardFreshness';

/**
 * "업데이트 안 됐다"에 답하는 문구 (2026-09-12).
 *
 * 사장님: "그럼 사이트에도 설명해줘 업데이트안됫다고 사람들이물어보자나".
 *
 * 화면은 지금까지 발행 시각만 보여 줬다. 회차가 늦으면 방문자는 고장인지 아닌지 모른다.
 * 실제로 늦는다 — 2026-09-12 실측: 06:23 예약이 08:18 · 07:23 이 09:23 · 08:23 이 10:13.
 *
 * 여기서 잠그는 것은 **거짓말을 안 하는 것**이다. 두 방향 다 나쁘다:
 *   늦지 않았는데 "늦었다"  → 멀쩡한 판이 고장난 것처럼 보인다
 *   늦었는데 아무 말 없음    → 방문자가 또 묻는다(사장님이 겪고 계신 일)
 */
/** 한국 시각을 UTC ms 로. */
const kst = (month: number, day: number, hour: number, minute = 0) =>
    Date.UTC(2026, month - 1, day, hour, minute) - 9 * 60 * 60 * 1000;

const THRICE = [
    { hour: 6, minute: 23, label: '아침' },
    { hour: 12, minute: 23, label: '오후' },
    { hour: 18, minute: 23, label: '저녁' },
];
const DAILY_ONCE = [{ hour: 6, minute: 30 }];
/** 선점 보드 — 한국 월·금 06:23. */
const MON_FRI = { rounds: [{ hour: 6, minute: 23 }], days: [1, 5] };

describe('이번 회차가 언제였나', () => {
    it('하루 세 번이면 지난 회차를 가리킨다', () => {
        expect(lastDueAt(THRICE, kst(9, 12, 9, 0))!.label).toBe('아침');
        expect(lastDueAt(THRICE, kst(9, 12, 14, 0))!.label).toBe('오후');
        expect(lastDueAt(THRICE, kst(9, 12, 20, 0))!.label).toBe('저녁');
    });

    it('한국 새벽에는 어제 저녁 회차를 본다 — 아직 올 때가 안 된 것을 늦었다고 하면 안 된다', () => {
        const due = lastDueAt(THRICE, kst(9, 12, 2, 0))!;
        expect(due.label).toBe('저녁');
        expect(formatKst(due.at)).toBe('9월 11일 18:23');
    });

    it('주 2회 보드는 그 요일만 센다 — 토요일에는 직전 금요일 회차다', () => {
        // 2026-09-12 는 토요일
        const due = lastDueAt(MON_FRI.rounds, kst(9, 12, 8, 0), MON_FRI.days)!;
        expect(formatKst(due.at)).toBe('9월 11일 06:23');
    });

    it('수요일에는 직전 월요일 회차다 — 없는 요일을 만들지 않는다', () => {
        const due = lastDueAt(MON_FRI.rounds, kst(9, 9, 15, 0), MON_FRI.days)!;
        expect(formatKst(due.at)).toBe('9월 7일 06:23');
    });
});

describe('늦었다고 말해도 되는 경우', () => {
    it('예정이 지났고 마지막 갱신이 그보다 앞서면 늦은 것이다 — 사장님이 12:55 에 보신 그 상태', () => {
        // 오후 예정 12:23, 마지막 갱신은 아침 08:40
        const f = judgeFreshness(THRICE, new Date(kst(9, 12, 8, 40)).toISOString(), kst(9, 12, 12, 55));
        expect(f.dueLabel).toBe('오후');
        expect(f.lateMinutes).toBe(32);
        expect(f.isLate).toBe(false);   // 32분은 아직 넉넉한 창 안이다
    });

    it('40분을 넘기면 그때 말한다', () => {
        const f = judgeFreshness(THRICE, new Date(kst(9, 12, 8, 40)).toISOString(), kst(9, 12, 13, 5));
        expect(f.lateMinutes).toBe(42);
        expect(f.isLate).toBe(true);
        expect(LATE_AFTER_MIN).toBe(40);
    });

    it('실측대로 2시간 늦으면 그 숫자가 그대로 나온다', () => {
        const f = judgeFreshness(THRICE, new Date(kst(9, 12, 8, 40)).toISOString(), kst(9, 12, 14, 23));
        expect(formatMinutes(f.lateMinutes)).toBe('2시간');
    });
});

describe('멀쩡한 판을 고장났다고 하지 않는다', () => {
    it('이번 회차가 이미 실렸으면 늦은 것이 아니다', () => {
        const f = judgeFreshness(THRICE, new Date(kst(9, 12, 12, 40)).toISOString(), kst(9, 12, 17, 0));
        expect(f.lateMinutes).toBe(0);
        expect(f.isLate).toBe(false);
    });

    it('마지막 갱신을 못 읽으면 아무 말도 안 한다 — 모르는 것을 고장이라 하지 않는다', () => {
        for (const value of [null, undefined, '', '언젠가']) {
            const f = judgeFreshness(THRICE, value, kst(9, 12, 17, 0));
            expect(f.builtAt).toBe(null);
            expect(f.isLate).toBe(false);
        }
    });

    it('회차 예정이 없으면(첫 회차 전) 늦을 수가 없다', () => {
        const f = judgeFreshness([], new Date(kst(9, 12, 8, 40)).toISOString(), kst(9, 12, 17, 0));
        expect(f.dueAt).toBe(null);
        expect(f.isLate).toBe(false);
    });

    it('주 2회 보드는 안 도는 요일에 늦었다고 하지 않는다 — 화요일은 원래 안 돈다', () => {
        // 월요일 회차가 제때 실렸고, 지금은 화요일 오후
        const f = judgeFreshness(
            MON_FRI.rounds,
            new Date(kst(9, 7, 10, 24)).toISOString(),
            kst(9, 8, 15, 0),
            MON_FRI.days,
        );
        expect(f.isLate).toBe(false);
    });
});

describe('사람이 읽는 숫자', () => {
    it('한국 시각으로 적는다 — UTC 로 적으면 아홉 시간이 틀린다', () => {
        expect(formatKst(kst(9, 12, 8, 40))).toBe('9월 12일 08:40');
        expect(formatKst(kst(9, 12, 0, 5))).toBe('9월 12일 00:05');
    });

    it('한 시간이 넘으면 시간으로 말한다', () => {
        expect(formatMinutes(42)).toBe('42분');
        expect(formatMinutes(60)).toBe('1시간');
        expect(formatMinutes(125)).toBe('2시간 5분');
    });

    it('하루 한 번인 보드는 회차 이름을 안 붙인다', () => {
        expect(judgeFreshness(DAILY_ONCE, null, kst(9, 12, 9, 0)).dueLabel).toBe('');
    });
});

describe('많이 늦은 것을 흔한 일처럼 말하지 않는다', () => {
    /*
     * 실측에서 드러난 문제(2026-09-12): 선점 보드가 30시간 42분 늦은 상태였는데 화면이
     * "몰리는 시간대에는 1~2시간 늦게 시작되는 일이 잦습니다" 라고 적고 있었다.
     * 숫자와 설명이 서로를 부정하면 방문자는 둘 다 안 믿는다.
     */
    it('네 시간을 넘으면 흔한 지연이라고 안 한다', () => {
        const f = judgeFreshness(THRICE, new Date(kst(9, 12, 8, 40)).toISOString(), kst(9, 12, 17, 0));
        expect(f.isLate).toBe(true);
        expect(f.isVeryLate).toBe(true);
        expect(VERY_LATE_AFTER_MIN).toBe(240);
    });

    it('두 시간쯤은 흔한 지연이다 — 실측이 그렇다', () => {
        const f = judgeFreshness(THRICE, new Date(kst(9, 12, 8, 40)).toISOString(), kst(9, 12, 14, 23));
        expect(f.isLate).toBe(true);
        expect(f.isVeryLate).toBe(false);
    });

    it('주 2회 보드가 한 회차를 통째로 빠뜨린 경우 — 30시간 넘게 늦는다', () => {
        const f = judgeFreshness(
            MON_FRI.rounds,
            new Date(kst(9, 9, 10, 24)).toISOString(),
            kst(9, 12, 13, 5),
            MON_FRI.days,
        );
        expect(formatMinutes(f.lateMinutes)).toBe('30시간 42분');
        expect(f.isVeryLate).toBe(true);
    });
});
