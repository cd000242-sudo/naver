# SPEC-REVIEW-001 — 리뷰 기반 콘텐츠 환각 방지

**Status**: draft
**Created**: 2026-04-18
**Target Start**: 2026-04-21 (Mon)
**Target Complete**: 2026-04-28 (Tue)
**Owner**: 박성현
**Depends**: None
**Scope**: cross-module (`src/crawler`, `src/content`, `src/prompts`, `src/engagement`, `src/renderer`, `src/automation/selectors`, `src/monitor`)

## Why

better-life-naver는 네이버 블로그 자동 발행을 위해 LLM으로 본문을 생성합니다. 그러나 현재 콘텐츠 파이프라인은 **입력 데이터 없이도 "사용자 경험담"을 작성하라고 강제**하고 있어, 발행되는 글의 상당수가 존재하지 않는 체험/수치/기간을 포함한 **환각(hallucination)** 문장을 담고 있습니다.

네이버 AuthGR(저자 진위) 방어(`src/authgrDefense.ts`)는 AI 지문의 통계적 마스킹(Perplexity/Burstiness)만 수행하므로, 내용 자체의 거짓 여부는 전혀 검출하지 못합니다. 이미지-텍스트 정합성 검증(`src/image/imageTextConsistencyChecker.ts`)도 텍스트 내부 사실 관계는 다루지 않습니다.

실제 발행물에서 "2주간 써봤는데", "테스트해보니" 같은 허위 경험 진술이 반복적으로 탐지되었고, 이는 블로그 독자의 신뢰 훼손뿐 아니라 네이버 알고리즘의 AI 생성물 탐지 위험을 동시에 증가시킵니다.

이 SPEC은 환각을 **입력 차단 → 입력 확충 → 분량 탄력화 → 출력 검증** 4단계(P0~P3)로 끊어내는 것을 목표로 합니다.

## 문제 정의 (감사 결과 보존)

아래 7개 사실은 감사에서 이미 확인된 것으로, 리서치에서 재탐색하지 않고 그대로 설계 근거로 사용합니다.

1. **쇼핑 모드 리뷰 크롤링은 있으나 방어 없음** — `src/sourceAssembler.ts:3763-3795`가 리뷰 최대 5개 수집. 실패/빈 배열이어도 그대로 다운스트림에 전달.
2. **블로그/일반 모드 리뷰 수집 전무** — `src/naverBlogCrawler.ts:113-512`는 제목/본문/이미지만 수집. 댓글/Q&A 미수집.
3. **생성 파이프 빈 배열 무방어** — `src/contentGenerator.ts:4404-4411`에서 `reviews: source.productReviews`가 빈 배열이어도 프롬프트 슬롯에 주입.
4. **프롬프트 모순** — `src/prompts/affiliate/shopping_review.prompt:41-44`는 "원문에 없는 수치 금지"라면서 `:88-92`에서 "1,800~2,200자 리뷰 작성"을 강제. 데이터 없을 때 분기 없음.
5. **10단계 구조의 경험 의존** — `src/prompts/affiliate/shopping_expert_review.prompt:148-156`의 Step 3(결정적순간), Step 6(디테일킬러) 등이 존재하지 않는 사용자 경험을 요구.
6. **기존 방어 한계** — `src/authgrDefense.ts`는 AI 지문 마스킹만 담당. 내용 거짓 검출 불가.
7. **미활용 자원** — `src/engagement/commentCrawler.ts`가 존재하나 콘텐츠 생성 파이프에 미통합.

**프롬프트 조립 중앙점**: `src/promptLoader.ts:600-620` `buildFullPrompt()`는 2축 분리(노출 목적 × 카테고리) + 톤 스타일만 조립할 뿐 조건부 섹션 로직이 없음.

## Goals

- G1. 입력 데이터(리뷰/댓글)가 없을 때 경험형 문장을 **생성 단계에서 차단**한다.
- G2. 블로그/일반 모드에도 사용자 목소리(댓글/Q&A) 수집 경로를 **신설**한다.
- G3. 생성 분량을 **입력 데이터량에 연동**시켜 과대 작성 압력을 제거한다.
- G4. 생성물의 수치/기간/비교주장을 원문과 **사후 검증**하고 실패 문장을 교정·제거한다.
- G5. 환각 관련 운영 지표(`hallucinationRate`)를 `operationsDashboard`에 노출한다.

## Non-Goals

- NG1. 기존 AuthGR 방어(`authgrDefense.ts`)의 통계적 지문 마스킹 로직은 변경하지 않는다.
- NG2. LLM 제공자(Claude/Gemini/OpenAI/Perplexity) 교체·튜닝은 이 SPEC 범위에서 제외한다.
- NG3. 이미지-텍스트 정합성 검증(`imageTextConsistencyChecker.ts`) 확장은 제외한다.
- NG4. 네이버 카페 모드(SPEC-CAFE-*) 스코프는 건드리지 않는다.
- NG5. 콘텐츠 톤/어휘 다양화는 별도 SPEC에서 다룬다.

## Success Criteria

- **S1 (P0)**: `reviews=[]` 입력 3개 스모크 샘플에서 "써본/2주/테스트해보니" 등 금지 경험 표현 문자열이 **0개**.
- **S2 (P1)**: 네이버 블로그 URL 크롤링 시 댓글 1개 이상 확보율이 **지정 임계(수치는 acceptance.md에서 제시)** 이상.
- **S3 (P2)**: `targetLength = baseLen + perReview × N`이 단위 테스트로 검증되며, 리뷰 0개 + 스펙만 있을 때 상한이 1,200자로 강제됨.
- **S4 (P3)**: `factChecker.ts`가 수치/기간/비교주장 추출 정확도 검증 시나리오 5건 전부 통과, `hallucinationRate`가 대시보드에 노출됨.
- **S5 (공통)**: `npm run build` 통과, 기존 236+ 유닛 테스트(`npx vitest run`) 회귀 0건.

## Scope

### In-Scope

- `src/sourceAssembler.ts` — `reviewAvailable` 플래그 도출, `userVoice` 필드 조립
- `src/contentGenerator.ts` — 빈 배열 가드, 프롬프트 주입 직전 분기
- `src/promptLoader.ts` `buildFullPrompt()` — 조건부 섹션 로직, 동적 `targetLength`
- `src/prompts/affiliate/shopping_review.prompt` / `shopping_expert_review.prompt` — 조건부 규칙 + 분량 플레이스홀더
- `src/naverBlogCrawler.ts` — 댓글 수집 경로 추가(중앙 셀렉터 레지스트리 경유)
- `src/automation/selectors/` — 댓글 영역 셀렉터 엔트리 신설
- `src/engagement/commentCrawler.ts` — "소스 수집용" export 재정비
- `src/content/factChecker.ts` — 신규(250줄 이하), 수치/기간/비교주장 추출 + 원문 매칭
- `src/monitor/operationsDashboard.ts` — `hallucinationRate` 메트릭 추가

### Out-of-Scope

- 카페 모드 관련 수집/생성 경로
- 자체 LLM 재학습
- 블로그 글 재발행(backfill) 자동화 — 본 SPEC은 **신규 발행분부터** 적용

## Constraints

- **언어 정책**: 모든 문서·커밋 메시지는 한국어, 코드 주석은 영어(`.claude/rules/autopus/language-policy.md`).
- **파일 크기**: 모든 신규/수정 파일 300줄 이하, 신규 `factChecker.ts`는 250줄 이하 목표(`.claude/rules/autopus/file-size-limit.md`).
- **셀렉터 관리**: 네이버 DOM 접근은 반드시 `src/automation/selectors/` 중앙 레지스트리를 경유(`CLAUDE.md`).
- **서코지컬 변경**: 각 P단계 외 주변 코드 정리 금지(`.claude/rules/golden-principles.md` #12).
- **테스트 회귀 금지**: `npx vitest run` 기존 236+ 테스트 통과 유지.
- **Lore 커밋 포맷**: `.claude/rules/autopus/lore-commit.md` 규정 적용, `Constraint` 트레일러 필수.

## Stakeholders

| 이해관계자 | 관심사 |
|---|---|
| 운영자(최제우 등) | 발행 신뢰성, 환각 이슈 CS 감소 |
| 블로그 독자 | 거짓 경험담으로 인한 구매 후회 방지 |
| 네이버 AuthGR 탐지 | AI 생성물·허위 경험 기술 리스크 완화 |
| 개발자(박성현) | 파이프라인 안정성, 디버깅 가능성 |

## Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| R1. P0 프롬프트 수정이 기존 발행 톤 붕괴 | High | Medium | Feature 플래그로 점진 적용, 스모크 3건 선 검증 |
| R2. P1 네이버 댓글 DOM 네이버 변경 | High | Medium | 셀렉터 레지스트리 + 원격 패치(`remoteUpdate.ts`) 경유 |
| R3. P2 분량 공식이 SEO(최소 글자수)와 충돌 | Medium | Medium | `baseLen` 하한 800자 유지, SEO 요구치와 비교 테스트 |
| R4. P3 factChecker 오탐(정상 표현을 환각으로 판정) | Medium | High | 1회 재생성 후 2회 실패 시에만 삭제, 임계 운영 튜닝 |
| R5. 댓글 수집으로 크롤링 시간 증가 | Medium | High | 타임아웃 + 상한(예: 댓글 20개) + 병렬화 고려 |
| R6. 개인정보 포함 댓글 그대로 프롬프트 주입 | High | Medium | `privacyScrubber.ts` 파이프 경유 강제 |

## Deliverables

- `src/sourceAssembler.ts` 수정 — `reviewAvailable`, `userVoice` 필드
- `src/contentGenerator.ts` 수정 — 빈 배열 가드
- `src/promptLoader.ts` 수정 — 조건부 블록 + 동적 `targetLength`
- `src/prompts/affiliate/shopping_review.prompt` 수정 — 조건부 규칙
- `src/prompts/affiliate/shopping_expert_review.prompt` 수정 — 조건부 규칙
- `src/naverBlogCrawler.ts` 수정 — 댓글 수집 경로
- `src/automation/selectors/` 수정 — 댓글 셀렉터 엔트리
- `src/engagement/commentCrawler.ts` 수정 — 소스용 export
- `src/content/factChecker.ts` 신규 — 환각 검증 레이어(250줄 이하)
- `src/monitor/operationsDashboard.ts` 수정 — `hallucinationRate` 메트릭
- `.autopus/specs/SPEC-REVIEW-001/{spec.md, plan.md, acceptance.md, research.md}`

## References

- `CLAUDE.md` — 프로젝트 개요, 셀렉터 레지스트리, AuthGR/QUMA-VL 방어
- `src/authgrDefense.ts` — 기존 AI 지문 방어(비교 기준)
- `src/image/imageTextConsistencyChecker.ts` — 다른 정합성 검증 선례
- Memory: `project_stabilization_progress.md` — 안정화 로드맵
- Memory: `project_code_audit_baseline.md` — v1.4.55 코드 기준선
