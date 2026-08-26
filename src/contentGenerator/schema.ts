// ⚠️ [2026-08-26] 이 상수는 모델에게 전달되지 않는다 — 죽은 스키마다.
//
// 실제로 모델이 보는 출력 형식은 contentJsonPromptFormat.ts 의
// buildContentJsonOutputFormat 이 만든다. 여기 있는 JSON_SCHEMA_DESCRIPTION 은
// contentGenerator.ts 가 import 만 하고 어디에도 쓰지 않는다.
//
// 실측 사고: 요약 표(summaryTable)를 여기에만 추가해 두고 "표가 나온다"고 판단했다.
// 모델은 그 필드를 요구받은 적이 없어 채우지 않았고, 발행된 글에 표가 없었다.
// 스키마 필드를 늘릴 일이 있으면 contentJsonPromptFormat.ts 를 고쳐라.
// 이 파일은 하위 호환 때문에 남겨 두었을 뿐이다.

// JSON 스키마 설명 (구조화 콘텐츠 생성용) — 미사용
export const JSON_SCHEMA_DESCRIPTION = `
JSON 응답 형식 (반드시 이 구조를 따를 것):
{
  "selectedTitle": "선택된 제목 (titleCandidates 중 1개)",
  "titleCandidates": [
    {"text": "제목 후보 1", "score": 95, "reasoning": "선정 이유"},
    {"text": "제목 후보 2", "score": 90, "reasoning": "선정 이유"},
    {"text": "제목 후보 3", "score": 85, "reasoning": "선정 이유"}
  ],
  "headings": [
    {"title": "소제목", "content": "본문 내용 (4~5문장)", "summary": "요약", "keywords": ["키워드"], "imagePrompt": "이미지 생성 프롬프트"}
  ],
  "summaryTable": [
    {"label": "기준일", "value": "자료에 있는 날짜"},
    {"label": "주제에 맞는 축", "value": "확인된 값 (숫자·조건은 숫자로)"},
    {"label": "또 다른 축", "value": "확인된 값"}
  ],
  "introduction": "도입부 (3줄 이내)",
  "conclusion": "마무리 (2줄 이내)",
  "hashtags": ["해시태그1", "해시태그2", "해시태그3", "해시태그4", "해시태그5"],
  "category": "카테고리명",
  "metadata": {
    "wordCount": 2000,
    "estimatedReadTime": "3분",
    "seoScore": 85
  }
}
`;
