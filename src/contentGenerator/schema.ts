// JSON 스키마 설명 (구조화 콘텐츠 생성용)
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
