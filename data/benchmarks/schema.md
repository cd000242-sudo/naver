# SPEC-CONVERSION-001 L2-4.4 — Benchmark Data Schema

> 상위 블로거 50건 수집·분석 결과를 저장하는 디렉토리. 본 파일은 스키마 정의.

## 디렉토리 구조

```
data/benchmarks/
├── schema.md                              # 본 파일
├── raw/                                   # 원문 (TTL 7일, L2-4.6에서 자동 만료)
│   └── <category>/<hash>.html             # 원문 HTML
├── analyses/                              # analyzeBenchmark 결과
│   └── <category>/<hash>.json             # BenchmarkAnalysis JSON
└── aggregate.json                         # aggregateBenchmarks(전체) 결과 캐시
```

## BenchmarkAnalysis JSON 스키마

```typescript
{
  "url": "https://blog.naver.com/<id>/<post_id>",
  "category": "food",                      // categories.json 10종 중 하나
  "title": "강남 김치찌개 맛집 후기",
  "stats": {
    "charCount": 2453,
    "wordCount": 487,
    "headingCount": 5,
    "avgHeadingDistance": 412,
    "paragraphCount": 14,
    "imageHintCount": 6
  },
  "headings": [
    { "level": 1, "text": "강남 김치찌개 맛집 후기", "position": 0 },
    { "level": 2, "text": "찾아간 계기", "position": 156 }
  ],
  "topKeywords": [
    { "term": "김치찌개", "count": 18, "density": 0.037 }
  ],
  "structureSignature": "1-2-2-2-2-3",
  "analyzedAt": "2026-05-10T12:34:56.789Z",
  "fallbackReason": null
}
```

## aggregate.json 스키마

```typescript
{
  "totalSamples": 50,
  "perCategoryCount": { "food": 5, "tech": 5, ... },
  "avgCharCount": 2300,
  "avgHeadingCount": 4.8,
  "avgImageHintCount": 5.2,
  "topStructureSignatures": [
    { "signature": "1-2-2-2-2-3", "count": 12 },
    { "signature": "1-2-2-2-2", "count": 8 }
  ]
}
```

## 저작권·프라이버시 정책 (L2-4.6)

- `raw/` 폴더의 원문은 **수집 후 7일 후 자동 만료**.
- `analyses/`의 통계·구조 정보만 영구 보관.
- 본문 그대로의 재생산 절대 금지 — 분석은 메타데이터만 사용.
- 블로거 ID·실명 등 식별자는 hash 처리 후 저장.

## 사용 흐름

```
top-blogger-collector → raw/<cat>/<hash>.html (TTL 7일)
                     ↓
analyzeBenchmark    → analyses/<cat>/<hash>.json (영구)
                     ↓
aggregateBenchmarks → aggregate.json (전체 집계)
                     ↓
L3-1 RAG seed (벤치마크 50건 임베딩 적재)
```
