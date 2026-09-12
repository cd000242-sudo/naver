/**
 * 이 판이 언제 새로 만들어지는가 — 방문자에게 그대로 말한다.
 *
 * 사장님 2026-09-12: "그럼 사이트에도 설명해줘 업데이트안됫다고 사람들이물어보자나".
 *
 * 지금까지 화면은 "09-12 08:40 발행" 만 보여 줬다. 그래서 오후 회차가 늦으면
 * 방문자는 **고장인지 원래 그런 건지를 알 길이 없다.** 실제로 늦는다:
 *   2026-09-12 실측 — 06:23 예약이 08:18 · 07:23 이 09:23 · 08:23 이 10:13 에 떴다.
 *   깃허브 예약이 1~2시간 늦게 도는 것은 이 레포에 오래 기록된 버릇이고,
 *   아예 안 뜨는 날도 있다(09-11 금요일 선점 회차가 그랬다).
 *
 * 숨기지 않고 적는다: 주기 · 마지막 갱신 · 늦고 있으면 얼마나 늦었고 왜 그런지.
 * 없는 것은 지어내지 않는다 — 시각을 못 읽으면 그 말만 하고 끝낸다.
 *
 * 늦었는지 가르는 계산은 lib/boardFreshness 에 있다(테스트가 잠근다).
 * "늦었다"를 잘못 말하면 멀쩡한 판을 고장난 것처럼 보이게 만든다.
 */
import {
    judgeFreshness,
    formatKst,
    formatMinutes,
    type BoardRoundTime,
} from '../../lib/boardFreshness';

export interface BoardFreshnessProps {
    /** 이 판이 언제 만들어지는지 한 문장. 예: "매일 아침·낮·저녁 세 번". */
    cadence: string;
    /** 하루 회차 예정 시각(한국). */
    rounds: BoardRoundTime[];
    /** 요일 제한(한국 요일, 0=일). 비우면 매일. */
    days?: number[];
    /** 발행본이 말하는 마지막 갱신 시각(ISO). 못 읽었으면 비운다. */
    lastBuiltAt?: string | null;
    /** 시험용. 비우면 지금. */
    nowMs?: number;
}

export function BoardFreshness({ cadence, rounds, days, lastBuiltAt, nowMs }: BoardFreshnessProps) {
    const now = nowMs ?? Date.now();
    const f = judgeFreshness(rounds, lastBuiltAt, now, days);

    return (
        <div className={`lw-note lw-note-plain${f.isLate ? ' lw-note-limit' : ''}`} style={{ marginBottom: 14 }}>
            <strong>언제 새로 올라오나요</strong>
            <p>
                {cadence} 만듭니다
                {f.dueAt !== null
                    ? ` — 이번 회차 예정은 ${formatKst(f.dueAt)}${f.dueLabel ? ` (${f.dueLabel})` : ''} 입니다.`
                    : '.'}
                {f.builtAt !== null
                    ? ` 마지막으로 올라온 것은 ${formatKst(f.builtAt)} 판입니다.`
                    : ' 마지막 갱신 시각을 읽지 못했습니다.'}
            </p>
            {f.isLate && (
                <p style={{ margin: '7px 0 0', color: 'rgba(245,197,24,.9)', fontSize: 13, lineHeight: 1.7 }}>
                    예정보다 {formatMinutes(f.lateMinutes)} 늦고 있습니다.
                    {/*
                      * 많이 늦었는데 "보통 1~2시간 늦습니다" 라고 하면 숫자와 설명이 서로를 부정한다.
                      * 실측에서 30시간 늦은 판에 그 문구가 붙어 있었다 — 그러면 둘 다 안 믿는다.
                      */}
                    {f.isVeryLate
                        ? ' 이번 회차가 아직 시작되지 않았습니다. 예약이 통째로 빠지는 날이 있어, 자동으로 다시 돌리고 있습니다. 그동안은 바로 위에 적힌 판이 가장 최근 것입니다.'
                        : ' 회차는 예약으로 도는데 몰리는 시간대에는 1~2시간 늦게 시작되는 일이 잦습니다. 빠진 채로 두지는 않습니다 — 예정 시각이 40분 넘게 지나면 자동으로 다시 돌립니다. 조금 뒤에 새로고침해 주세요.'}
                </p>
            )}
        </div>
    );
}
