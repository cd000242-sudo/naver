/**
 * [2026-07-30] Per-post voice profile — 하드코딩 조합 지문을 깨는 레이어.
 *
 * 사용자 통찰: 고정 사전(어미 맵·추임새 목록)을 모든 글에 같은 확률로 조합하면
 * 그 조합 자체가 글 사이의 통계 지문이 된다. 이 모듈은 글마다 어미 비율,
 * 즐겨 쓰는 구어 종결, 연결어 취향, 문단 리듬, 글쓴이 습관 1개를 다르게 뽑아
 * 생성 프롬프트에 주입한다. 사람은 글마다 목소리가 조금씩 다르다 — 그걸 흉내
 * 내는 게 아니라 구조적으로 만든다.
 */
export interface VoiceProfile {
  /** 이번 글의 구어 종결 비중(%) — 15~35 사이 */
  casualShare: number;
  /** 이번 글이 즐겨 쓸 구어 종결 2~3종 */
  signatureEndings: string[];
  /** 이번 글의 연결어 취향 3종 */
  connectorTaste: string[];
  /** 문단 리듬 지시 */
  rhythm: string;
  /** 글쓴이 습관 1개 */
  quirk: string;
}

const ENDING_POOL = [
  '~잖아요', '~거든요', '~라고 하더라구요(전달)', '~긴 해요', '~죠',
  '~네요', '~는 거예요', '~더라고요(전달)', '~답니다',
] as const;

const CONNECTOR_POOL = [
  '근데', '사실', '그래서 말인데', '아무튼', '그러다 보니',
  '생각해 보면', '문제는', '한 가지 더', '반대로', '막상',
] as const;

const RHYTHM_POOL = [
  '한두 문장짜리 짧은 문단을 사이사이 끼워 호흡을 끊는다. 긴 문단 두 개가 연달아 오지 않게 한다.',
  '핵심 답 문단은 짧게 치고, 배경 설명 문단은 길게 푼다. 짧-길-짧 리듬을 유지한다.',
  '문단 첫 문장을 길게 시작했으면 다음 문단은 짧은 문장으로 시작한다.',
  '결정적인 문장 앞뒤로 한 줄짜리 문단을 둬서 시선을 멈추게 한다.',
] as const;

const QUIRK_POOL = [
  '중간에 스스로 묻고 바로 답하는 자문자답을 1~2회 쓴다.',
  '괄호로 짧은 부연을 (이런 식으로) 1~2회 단다.',
  '아주 짧은 한 문장을 문단으로 독립시켜 1회 쓴다.',
  '숫자나 조건을 말한 직후 "쉽게 말하면"으로 풀어주되 글 전체에서 딱 한 번만 쓴다. 두 번째부터는 "쉽게 말하면" 없이 바로 풀어 쓴다.', // [2026-09-03] 실측 5회 남발 — 같은 여는말 반복은 그 자체가 AI 지문
  '독자에게 직접 말을 거는 문장을 1~2회 쓴다.',
] as const;

function pick<T>(pool: readonly T[], count: number, rng: () => number): T[] {
  const copy = [...pool];
  const out: T[] = [];
  while (out.length < count && copy.length > 0) {
    out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  }
  return out;
}

export function sampleVoiceProfile(rng: () => number = Math.random): VoiceProfile {
  return {
    casualShare: 15 + Math.floor(rng() * 21), // 15~35%
    signatureEndings: pick(ENDING_POOL, 2 + Math.floor(rng() * 2), rng),
    connectorTaste: pick(CONNECTOR_POOL, 3, rng),
    rhythm: pick(RHYTHM_POOL, 1, rng)[0],
    quirk: pick(QUIRK_POOL, 1, rng)[0],
  };
}

export function buildVoiceProfileBlock(profile: VoiceProfile): string {
  return `[VOICE PROFILE — 이 글만의 목소리 (매 글 달라짐)]
이 글의 화자는 아래 습관을 가진 실제 사람이다. 규칙이 아니라 성격이므로 티 내지 말고 배어들게 하라.
- 종결어미 비율: 격식(합니다체) 소량, 해요체가 기본, 구어 종결(잖아요·거든요·더라구요류)을 전체의 약 ${profile.casualShare}% 섞는다. 같은 어미 3연속 금지.
- 이 글이 즐겨 쓰는 구어 종결: ${profile.signatureEndings.join(', ')} — 이 중에서 골라 쓰되 한 문단에 같은 것을 2번 넘게 쓰지 않는다.
- 이 글의 연결어 취향: ${profile.connectorTaste.join(', ')} — 접속사가 필요할 때 이쪽을 우선한다. "또한/그리고/하지만"만 반복하지 않는다.
- 문단 리듬: ${profile.rhythm}
- 이 글쓴이의 습관: ${profile.quirk}
- 다른 글에서 쓰던 습관을 이 글에 복사하지 않는다. 위 프로필이 이 글의 전부다.`;
}
