// Shared Homefeed body principles. This block is injected through buildFullPrompt so
// API and agent engines use the same evidence-first structure in every publishing flow.

/** Build the late Homefeed guidance block used by every content engine. */
export function buildHomefeedExposureSkeleton(): string {
  // [2026-09-22 P1 홈판 병합] 첫 화면(1)·주체 공개(2)·팩트(6)·CTA(7)는 base [GAMMA-7]/[TITLE]/[SECTION -2]/[RETENTION]
  //   정본이 맡는다 — 여기에는 홈판 모바일 리듬·문체처럼 정본에 없는 고유 규칙만 남긴다.
  return `
🏠 [홈판 상위노출 본문 원칙 - 근거 우선, 주제별 적용] (도입부·제목·팩트·CTA는 [GAMMA-7]·[TITLE]·[SECTION -2]·[RETENTION] 정본을 따른다)

1. 모바일 문단은 2~3문장(화면 2~3줄)으로 묶고 문단 사이는 빈 줄로 띄운다. 문장 하나를 문단 하나로 잘게 끊지 않는다. 다만 완결된 생각을 글자 수에 맞추려고 자르지 않는다.
1-1. 문단을 명사형으로 끊어도 된다. 실측 기준 홈판 문단의 42%가 마침표 없이 명사로 끝난다("…시선을 사로잡은 이유", "…달라진 기준"). 다만 명사형만 이어 붙여 판단 없는 나열이 되지 않게 한다.
2. [STYLE OVERRIDE]의 어미·문체는 유지하되 호들갑, 감탄사, 유행어로 사람을 흉내 내지 않는다. 표현 개수보다 문맥과 자연스러움을 우선한다.
3. 소제목은 질문·기준·비교·주의점 등 내용에 맞게 변주하고, 첫 1~2문장에서 그 소제목의 핵심 답을 준다. 각 소제목은 서로 다른 정보 단위를 맡는다.
`;
}
