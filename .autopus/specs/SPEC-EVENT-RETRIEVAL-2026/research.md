# SPEC-EVENT-RETRIEVAL-2026 — 현재 구조 실측

**작성**: 2026-09-10 / **방법**: 코드 전수 조사 + 사장님 실측 사례 1건

## 1. 사장님 실측 사례 (근거)

키워드 `김서현 류현진 평행이론` 으로 글을 만들었더니 서로 다른 세 사건이 한 글에 조립됐다.

| 수집된 자료 | 실제 사건 |
|---|---|
| 류현진 평행이론 기사 | 다른 시점·다른 맥락 |
| 송영진 151km 기사 | **완전히 무관** |
| 김서현 플레이오프 기사 | 중심 사건의 일부 |

사람이 검색했다면: `김서현` + `류현진` + `김영웅` 의 교집합에서
**"이틀 연속 김영웅에게 스리런"** 이라는 중심 사건에 도달한다.
`김영웅` 이 두 사건을 잇는 **다리 인물(bridge entity)** 이다.

## 2. 현재 파이프라인 (파일:줄번호)

```
키워드 → 검색 질의 1개 → 플랫폼 수집 → 주제 게이트 → 몫 제한 → 설계도 → 본문
```

- 재시도는 **같은 키워드로만** 한다 — `renderer/modules/contentGeneration.ts:1149`
  주석 원문: `// ✅ 같은 키워드로 재시도 (관련 없는 결과 방지 - 다른 키워드 사용 금지!)`
  이 결정은 그 자체로 옳다(엉뚱한 키워드로 새는 것을 막는다). 다만 **자료가 마른 경우의
  출구가 없다**.
- 크롤 예산 20초 — `FULLTEXT_COLLECT_BUDGET_MS`

## 3. 주제 게이트 — 4곳, 전부 같은 함수

`isOnTopicForKeyword` (`content/supplementTopicGuard.ts`) 가 4곳에 걸려 있다:

| 위치 | 단계 |
|---|---|
| `sourceAssembler.ts:1611` | 검색 결과 제목·설명 |
| `sourceAssembler.ts:1788` | 기사 본문 |
| `sourceAssembler.ts:7636` | 보충 자료 |
| `sourceAssembler.ts:8120` | 출구 게이트 |

`sourceAssembler.ts:8104-8118` 주석이 이 설계의 선행 기록이다:

> 그동안 들어오는 문을 하나씩 막았다… 막을 때마다 다른 문으로 들어왔다. 실측만 넷이다.
> 입구가 몇 개인지 모르는 채로 하나씩 막는 것은 끝이 없다.
> 어느 문으로 들어왔든 나갈 때 주제어가 없으면 버린다.
> **자료를 넣는 것이 강점인데 그 자료가 주제와 무관하면, 자료를 안 넣는 LLM 보다 못한 글이 나온다.**

`supplementTopicGuard.ts:215-228` 은 이 판정의 한계를 스스로 인정한다:

> isOnTopicForKeyword 는 토큰 2개면 통과시킨다. **그 판정 자체는 옳다** —
> 실외기 화재 기사도 실제로 아파트와 베란다를 말하므로 버릴 근거가 없다.
> 게이트를 조이면 자료가 마른다. 대신 **머리 명사**를 본다 … 곁가지는 몫만 제한한다.

## 4. 구조적 공백 — 두 개

### 공백 A: 판정이 **어휘**뿐이다
게이트 4곳이 전부 토큰 겹침 + 머리 명사다. 그래서 **같은 낱말을 쓰는 다른 사건**은
구조적으로 통과한다. 송영진 기사에도 `류현진`·`151km`·야구 어휘가 들어 있다.

어휘를 더 조여도 못 푼다 — 조이면 자료가 마르고(위 주석이 이미 겪었다),
느슨하면 다른 사건이 들어온다. **축이 다르다: 사건 동일성이 필요하다.**

### 공백 B: 자료가 마를 때의 **출구가 없다**
황금키워드는 정의상 "검색량은 오는데 문서가 아직 적은" 상태다.
지금은 같은 키워드로 재시도할 뿐이고, 재시도해도 없는 문서는 없다.
그 결과 주변 자료로 LLM 이 억지 조립을 한다.

## 5. 이미 있는 재사용 부품

**전부 순수 함수이고 export 되어 있다.** 새로 만들 것이 생각보다 적다.

| 부품 | 위치 | 뽑는 것 |
|---|---|---|
| `extractVerifiableClaims` | `content/fabricationCheck.ts:113` | 날짜·기관·금액·비율·인원 |
| `extractKoreanFactTokens` | `content/koreanFactTokens.ts:94` | 한글 사실 토큰 (실측: `김영웅` 을 실제로 뽑는다) |
| `annotateRelativeDates` | `content/relativeDateResolution.ts:91` | "오는 29일" → 절대 날짜 |
| `splitIssueSentences` 외 6종 | `content/issueDisciplineRules.ts:72~139` | 사건글 주장·사실 규율 |
| `orderFullTextCandidates` | `content/fullTextCandidateOrder.ts:51` | 뉴스 우선 정렬 |
| `scoreTopicMatch` | `content/supplementTopicGuard.ts` | 머리 명사 기반 적합도 |
| `calculateTopicSimilarity` | `sourceAssembler.ts:6299` | 문서 간 유사도 (수집 dedupe 배선은 **확정 불가**) |

**없는 것**: 인물명 전용 추출(NER·성씨 사전 grep 0건). 인물은 `extractKoreanFactTokens` 가
3자 한글 토큰으로 우연히 잡는 것이 전부다 — 이 사고의 `김영웅` 이 바로 그 경우다.

## 6. 확정 불가

| 항목 | 확정에 필요한 것 |
|---|---|
| 수집 단계 문서 간 의미 중복 제거가 실제로 도는가 | `calculateTopicSimilarity` 호출처 추적 |
| 글 1편당 검색 호출 실측 횟수 | `apiUsageTracker` 에 수집 호출 카운터 추가 후 1편 측정 |
| 황금키워드에서 "자료 부족" 이 실제로 몇 %인가 | 키워드 20~30개 배치 측정 (Phase 0) |
