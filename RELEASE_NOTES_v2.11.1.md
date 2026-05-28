# v2.11.1 — CRITICAL renderer 핫픽스 + 강한 소제목 10조 (SECTION SH) + Phase 6 비용 최적화

## 🚨 CRITICAL — v2.11.0 사용자는 즉시 업데이트하세요

v2.11.0 .exe는 신규 **이미지 추론 글 모드** 진입 시 다음 에러로 동작 불가:

```
Uncaught SyntaxError: Identifier '_images' has already been declared
```

원인: Phase 3 4개 모듈이 동일 module-level 변수명을 사용해 esbuild minify 충돌. renderer 번들 전체 minify가 실패하면서 원본이 브라우저에 그대로 전달.

v2.11.1에서 module별 prefix rename(`_reviewImages`/`_uploadImages`/`_modeState`/`_quickState`)으로 격리 → esbuild minify 정상 (3143KB → 2237KB -28.8%).

기존 5개 모드(SEO/홈판/쇼핑/사용자정의/업체홍보)는 v2.11.0에서도 정상 동작했지만, 이미지 추론 모드를 시도한 모든 사용자가 영향 받음.

---

## 🎣 강한 소제목 10조 (SECTION SH) — 4 모드 통합 적용

**4-agent 종합 비평** (SEO/EEAT/카피라이팅/네이버 D.I.A.+ 알고리즘)을 거쳐 도출한 "강한 소제목 10조"를 모든 모드에 적용. 점수 추정:
- automation 모드 **2/5 → 4/5**
- SEO 모드 **4/5 → 4.5/5**
- 홈판 모드 **3/5 → 4/5**
- 쇼핑 모드 **2/5 → 4/5**

### 10조 핵심
| 조 | 룰 |
|----|----|
| SH-1 | 검색 의도 5종 매핑 (What/Why/How·Compare/FAQ/My Experience) |
| SH-2 | 글자수 16~22자 (모바일 1줄 wrap 한계) + 단·중·장 리듬 |
| SH-3 | 종결 비율 3:1:1 (명사:절:질문) + AI 티 3종 금지 ("달라진 X"/"꼭 챙겨야 할 X"/"실제로 체감한 X") |
| SH-4 | 마이크로 타겟 — 모든 H2에 숫자·실명·날짜·기간·금액·위치 중 1개 의무 |
| SH-5 | 정보 갭 — 답 70% 공개 + 30% 결손. "숨은 N가지" 류 클릭베이트 차단 |
| SH-6 | 감정축 5종 명시 (의외/대조/후회/안도/획득) |
| SH-7 | 1인칭 경험 흔적 5개 중 2개 의무 |
| SH-8 | 60%/70% 위치 배치 (비교/리스트 + 체크리스트) |
| SH-9 | 다음 H2 갈고리 — 마지막 1문장 자유 작문 (기존 6개 고정 어구는 자기모순으로 폐기) |
| SH-10 | H2-본문 첫 문장 단어겹침 ≤60%, 첫 문장 30~55자 정의문 (네이버 AI 탭 발췌 평균 47자 fit) |

### 모드별 주요 변경
- **automation**: 5+ → 정확히 5개 + 검색 의도 매핑 + FAQ 1~2 → 2 + 1번 문장 정의문
- **SEO**: H2 본문 250~380자 → **180~250자** (모바일 1.5스크롤), FAQ 1~2 → **2개 직답 페어 강제**, P-C 갈고리 6고정어구 → 자유 작문 (자기모순 해소), 1인칭 흔적 5개 중 2개 신규
- **홈판**: G2 "달라진 수면 패턴" 같은 만능 라벨 명시 차단 → "새벽 4시에 깨던 습관, 사라진 첫 주" 같은 마이크로 타겟으로 교체. G2-1 1인칭 흔적 7개 중 3개, G2-2 마이크로 타겟 강제
- **쇼핑**: "결과 보장형"/"긴급 한정형"/"숨은 N가지" 3종 패턴 명시 삭제 (SEO R0-1 추천형 금지와 정합). FAQ 2개 + 직답 페어 신규. 글자수 15~25자 → 16~22자

신규 단일 진실 파일: `src/prompts/shared/strong-headings.prompt`

---

## 💰 Phase 6 비용 최적화 (SPEC-IMAGE-NARRATIVE-2026)

이미지 추론 모드의 Vision API 비용 절감을 위한 3 모듈 + visionRouter 통합:

| 모듈 | LOC | 동작 |
|------|-----|------|
| `imageHashCache.ts` | 153 | SHA-256(base64 + provider + mode) 키 LRU + TTL 24h. 동일 이미지 2회 호출 시 캐시 hit → API 호출 0 |
| `imageResizer.ts` | 145 | sharp 기반 longest-edge ≤ 1024px 리사이즈. JPEG/PNG/WebP 포맷 보존, HEIC → JPEG |
| `budgetGuard.ts` | 161 | 일 200 / 월 5000 디폴트 + lazy day/month rollover. 한도 도달 시 BUDGET_EXCEEDED throw (silent fallback 금지) |

apiUsageTracker에 `trackImageNarrativeUsage` wrapper 추가 (cacheHit=true 시 cost=0).

**목표**: 동일 이미지 2회 호출 시 비용 50% 절감. 실측은 사용자 베타에서.

---

## 🔧 부수 fix

- **IMAGEFX_AUTH_EXPIRED / FORBIDDEN throw 격상** (`src/image/imageFxGenerator.ts`): 기존 `continue`/`return null` 흐름에서 모호한 "Google 로그인 상태를 확인해주세요" fallback 메시지만 노출되던 문제 → 명확한 한국어 메시지("Google 세션이 만료되었습니다. 환경설정 → ImageFX → 'Google 계정 변경'으로 다시 로그인해주세요.") 사용자 UI에 직접 전달.
- **OpenAI Image 카드 Tier1 자동 안내 모달 제거** (`src/renderer/components/HeadingImageSettings.ts`): 본문 LLM 영역과 이미지 OpenAI 영역의 운영 맥락이 달라 카드 클릭 시 강제 모달이 오히려 혼란을 키운다는 사용자 피드백 반영.

---

## 📊 검증 메트릭

| 항목 | 결과 |
|------|------|
| **vitest** | ✅ 2413/2413 PASS (baseline 2398/2399에서 +15) |
| **lint** | ✅ 0 errors / 1022 warnings (baseline 동일) |
| **build (tsc)** | ✅ TS 0 errors |
| **esbuild minify** | ✅ 3143KB → 2237KB (-28.8%) — v2.11.0에서 실패하던 minify 복구 |
| **god file hunk 룰** | ✅ contentGenerator 0 / main 0 / renderer 0 hunks |
| **신규 파일 크기** | ✅ 모두 ≤300줄 (cost 모듈 145~161줄, shared prompt 6.5KB) |

---

## 🎯 사용자 권장 검증

v2.11.1 .exe 더블클릭 후:

1. **5개 기존 모드 풀오토 1회씩** (회귀 0 확인)
   - SEO 모드 — 키워드 입력 → 발행
   - 홈판 모드 — 동상
   - 쇼핑커넥트 — 동상
   - 사용자정의 — 동상
   - 업체홍보 — 동상
2. **신규 이미지 추론 모드** 시도 (v2.11.0에서 차단됐던 모드 — 본 릴리즈에서 동작 복구)
   - 메인 화면 "글 소스" 토글 → "사진 시작" 클릭
   - 이미지 5~10장 업로드
   - Vision provider 선택 (Gemini Flash 디폴트)
   - 추론 결과 검토 → 글 생성 → 발행
3. **소제목 품질 비교** — v2.11.0 출력과 v2.11.1 출력 비교. 차이 보고:
   - 만능 라벨("달라진 X") 빈도
   - FAQ 직답 페어 출현
   - 1인칭 경험 흔적 빈도
   - 마이크로 타겟(숫자·실명·기간) 빈도

---

## 📦 누적 commits (v2.11.0 → v2.11.1)

```
e6968e09 chore(release): v2.11.1 — CRITICAL renderer fix + 소제목 강화 + Phase 6 비용 최적화
418605be feat(prompts): 쇼핑 모드 — 보장형/긴급형/비밀N가지 제거 + FAQ 2개 + 마이크로 타겟 + AI 티 금지
6bee9520 feat(prompts): SEO/홈판 모드 — FAQ 2개 정합 + 1인칭 흔적 + 갈고리 자기모순 해소 + 모바일 1.5스크롤
d2d9dc50 feat(prompts): SECTION SH 강한 소제목 10조 통합 — automation 모드 + 공통 단일 진실
dd3a9204 fix(renderer): imageNarrative 4 모듈 module-level 변수 rename — esbuild minify 충돌 해소 (CRITICAL)
7a4b6931 feat(imageNarrative): Phase 6 — Vision 캐시 + 리사이저 + 예산 가드 (비용 최적화)
7ac956c4 fix(image): IMAGEFX_AUTH/FORBIDDEN throw 명시화 + OpenAI Tier 자동 모달 제거
5814353b test(verifyPreviousWork): prompt 글자수 baseline 276K → 290K 재상향
```

8 commits / 13 파일 / 약 850 LOC 증가 (대부분 prompt + 테스트).

🐙
