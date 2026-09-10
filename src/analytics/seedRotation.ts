// src/analytics/seedRotation.ts
// [2026-09-10] 씨앗 목록에서 오늘 쓸 몇 개를 고른다. 순수 함수.
//
// 왜 바꿨나: keywordAnalyzer 가 `seeds.sort(() => Math.random() - 0.5).slice(0, 3)` 을 썼다.
//   1. sort 에 랜덤 비교자를 주는 것은 **편향된 셔플**이다. 균등한 순열이 안 나와
//      어떤 씨앗은 거의 안 뽑히고 어떤 것은 자주 뽑힌다.
//   2. sort 는 **원본 배열을 제자리에서 바꾼다.** 상수 배열을 돌려주는 함수와 만나면
//      호출할 때마다 그 상수가 뒤섞인다(이 저장소의 불변성 원칙 위반).
//   3. 랜덤이라 재현이 안 된다 — "어제는 됐는데" 를 추적할 수 없다.
//
// 날짜로 도는 순환은 셋을 한꺼번에 푼다: 균등하게 돌고, 원본을 안 건드리고, 재현된다.

/** UTC 기준 며칠째인가. 로컬 시간대를 쓰면 자정 근처에서 같은 날이 두 번 돈다. */
function todayIndex(): number {
  return Math.floor(Date.now() / 86_400_000);
}

/**
 * 오늘 몫의 조각을 돌려준다. 끝에 닿으면 앞으로 돌아와 이어 붙인다 —
 * 마지막 날에 한두 개만 주고 끝내면 그날 수집이 얇아진다.
 */
export function rotateDailySlice<T>(
  items: readonly T[],
  count: number,
  dayIndex: number = todayIndex(),
): T[] {
  const total = items.length;
  const size = Math.min(Math.max(0, Math.floor(count)), total);
  if (total === 0 || size === 0) return [];

  const groups = Math.ceil(total / size);
  const start = ((Math.floor(dayIndex) % groups) + groups) % groups * size;

  const out: T[] = [];
  for (let i = 0; i < size; i += 1) out.push(items[(start + i) % total]!);
  return out;
}
