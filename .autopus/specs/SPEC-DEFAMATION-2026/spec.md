<!-- status: draft-revised | 2026-07-02 설계(울트라플랜 12 agents) + 심층 법률리서치(legal-research.md)로 §8 확정 -->

> ## ⚠️ 법률 리서치 반영 개정 (2026-07-02, `legal-research.md` 근거) — 핵심 접근 변경
>
> 심층 리서치(판례 인용 + 적대적 검증)가 **"완화(hedge)" 접근을 무효 판정**했다. §8 확정:
> - **완화→차단 전환**: "의혹/미확인 병기·attribution 프리픽스"는 판례상 면책 효과 **없음**(대법원 2007도5312 '카더라' 법리, 2026-01-29 탈덕수용소 확정, 94다33828 재유포 독립책임). B의 sanitizer를 '완화'가 아니라 **생성·발행 차단**으로 재정의.
> - **§8-3 확정**: P0 범위 = 실존인물 **범죄·비위 의혹 + 순수 사생활(열애·이혼·질병·재산) 둘 다**. 사생활이 공익성 방어막이 더 약해 더 위험.
> - **§8-1 확정**: 위험 사안 = **하드 차단(block)** 기본. 오버라이드는 '발행 전 사람 검토 강제 + 이용자 책임 동의' 동반 시만.
> - **이미지 확정**: 초상권/퍼블리시티권(부경법 (타)목)은 텍스트 가드로 커버 불가 → **별도 SPEC**(이미지 초상 식별 게이트).
> - **신규 필수(리서치 발견)**: (1) **AI기본법(2026-01-22 이미 시행)** 생성물 라벨+"AI생성·부정확 가능" 상시 고지 의무(과태료). (2) **개발사 방조 리스크** — homefeedExposurePattern의 미확인 단정 조장 구조가 '단순 도구 제공자' 지위를 잃게 함(Q8) → 이 골격 수정은 사용자뿐 아니라 **개발사 방어**. (3) 로그는 '실제 차단'과 연결될 때만 알리바이, 감지만 하고 방치하면 '고의 증거'로 역이용(Q5).
> - **잔존(정식자문 유효)**: 약관 대외효·개발사 책임구조·5배 가중배상 규모요건. AI 자동생성 명예훼손 확립 판례 없음(unsettled).

# SPEC-DEFAMATION-2026: 연예/실존인물 글 허위조작정보법(7·7) 안전 가드

## 1. 목적/배경

**결론: 2026-07-07 시행 「정보통신망법 개정안(허위조작정보 근절법, 법률 제21305호)」의 핵심 처벌 트리거는 "확인 안 된 것을 거짓 사실로 단정"이다. 이 앱은 연예/이슈픽 글을 AI로 대량 자동생성·발행하므로 이 트리거에 정면 노출된다. 본 SPEC은 "단정 어투 완화"가 아니라 "근거 없는 실존인물 부정 주장의 생성 억제 + 사후 안전망 + 발행 전 인지"로 리스크를 낮춘다.**

### 1.1 법 요약 (검증된 사실만)
- 시행 2026-07-07. 허위조작정보 개념 신설.
- 고의·중과실로 허위/조작 정보 유포해 피해 시 손해액 **최대 5배 징벌적 손배**.
- 명예훼손 불법정보를 '거짓 사실'로 한정 → 핵심 트리거 = '거짓(허위) 단정'.
- 신고 주체 당사자→'누구든지' 확대. 신고 대상 대폭 확대(경쟁 블로거/안티 누구나).
- 플랫폼(네이버) 조치 7종: 삭제/접근차단/노출제한/계정정지·해지/**수익화 제한**/금전지급 중지 등.
- 실제 처벌 사례: 박보검 악플러 벌금형, 김규리 모욕글 게시자 징역 1년.
- 별개 리스크: AI 대량생성 글은 2026 DIA+ 로직에서 누락/저품질.

### 1.2 이 앱이 특히 위험한 이유
1. 연예/홈판 프롬프트 골격(`homefeedExposurePattern.ts:25,29`)이 "정체 숨긴 제목→본문 즉시 공개" + "확인된 사실은 바로 단정"을 **적극 유도** → 미확인 인물 사실을 지어내 단정하도록 구조적으로 압박.
2. 크롤링 텍스트(익명 커뮤니티/가십)가 `hasGroundingSource`에서 rawText≥50자면 "근거 있음"으로 오인정 → 가십을 사실로 재포장.
3. AI가 존재하지 않는 매체·기사를 지어내는 것이 알려진 실패모드(`sanitizeContentFakeSources` 존재 이유).
4. 예약/연속발행은 사용자가 안 보는 시점에 무인 발행 → "중과실" 해석 리스크.

### 1.3 설계 근본 원칙 (적대적 검토 반영)
- **완화보다 억제**: 검토(legal-sufficiency HIGH)대로 "거짓을 의혹처럼" 세탁하면 오히려 '중과실 인지 후 형식 회피' 정황이 된다. 따라서 **근거 없는 실존인물 부정 주장은 프롬프트로 생성 억제(1차)**, sanitizer는 2차 안전망. 자동 변환은 근거 있는 사안의 톤 조정 또는 명백한 위험 어휘 제거로 한정.
- **본 가드는 리스크 저감이지 면책 보증이 아니다** (§8 법률 자문 필요).

---

## 2. 범위

### 2.1 발동 신호 (genpath 분석 근거)
| 신호 | 소스 | 판정 |
|---|---|---|
| celebrity 카테고리 | `inferHallucinationCategory({contentMode,toneStyle,categoryHint})` (`hallucinationCheck.ts:126`) === `'celebrity'` | 1차 게이트 |
| contentMode==='homefeed' | `source.contentMode` | 홈판 강제 트리거(카테고리 무관, 실존인물 홈판 우회 차단) |
| 실존인물 2차 휴리스틱 | 본문/제목에 **위험명사(사생활/범죄) + 단정어미 AND 동시 출현** | categoryHint 오선택 보완 (검토 circumvention HIGH 반영) |

**중요 — grounded 게이트 반전 (검토 circumvention HIGH "게이트 자멸" 반영):** celebrity 컨텍스트에서는 `hasGroundingSource`를 스캔 스킵 조건으로 쓰지 **않는다**. rawText 존재 ≠ 사실 검증. celebrity면 rawText 유무와 무관하게 스캔하되, rawText에 **검증 가능한 출처명(언론사/판결/공식발표)이 실제 매칭될 때만** attribution 프리픽스로 보존한다.

### 2.2 스포츠 범위
`inferHallucinationCategory`는 현재 '스포츠'를 celebrity로 안 잡는다. **정규식에 `스포츠|선수|감독|구단|이적`을 추가**해 실제 가드 범위와 배너 범위를 일치시킨다(검토 false-positive LOW "false assurance" 반영). 미추가 시 D 배너가 잘못된 안전감을 준다.

### 2.3 범위 밖 (명시적 잔존 리스크)
- **이미지 초상권/딥페이크** — 텍스트만 다룸. §8에 잔존 명시.
- **네이버 플랫폼 조치·'누구든지 신고'** — 법적 유죄와 무관하게 선제 발동. 코드로 방어 불가, D 배너 카피로만 고지.
- **허위성(내용이 거짓인지) 판정** — 정규식/휴리스틱으로 불가. 억제·경고까지만.

---

## 3. 가드 컴포넌트 최종안

### A — 위험표현 완화 sanitizer → **B에 병합, 단독 채택 취소**
**취소 사유 (검토 false-positive HIGH + feature-bloat HIGH):** A의 판정규칙은 `위험렉시콘 A **OR** B`라 단정어미 단독(예: "티켓 예매가 확정됐다", "재판에서 무죄가 확정됐다")을 100% 오완화한다. 무죄 확정 판결을 "확인 안 됨"으로 뒤집는 것은 새 허위조작이다. 또 A와 B는 같은 문제·같은 렉시콘·같은 게이트의 중복 파이프라인. **A는 폐기하고 B의 AND 조건만 채택한다.**

### B — 실존인물 단정 가드 (프롬프트 억제 + 사후 sanitizer) → **채택 (수정)**
**채택하되 다음 수정:**
1. **AND 조건 확정**: `위험명사(사생활/범죄) AND 단정어미`가 **같은 문장**에 동시 출현할 때만 발동. OR 금지.
2. **1차 = 프롬프트 억제, 2차 = sanitizer**: 근거 없는 부정 주장은 애초에 생성 안 되도록 프롬프트 계층을 주 방어선으로. sanitizer는 억제 실패분만 처리.
3. **bodyHtml 문장분할 제거** (검토 false-positive HIGH): HTML/URL이 `[.!?…\n]` 분할로 파괴된다(`<img src="x.jpg">` → 조각). **sanitizer는 bodyPlain·introduction·conclusion·headings 텍스트 필드만 처리, bodyHtml은 스캔 대상에서 제외.**
4. **극중/픽션 선행 필터 필수화**: 위험명사+단정어미 매칭 전에 `드라마|영화|예능|극중|배역|역할|연기|작품` 인접어 검사 → 매칭 시 무조건 skip("극중 살인을 저질렀다" 보존).
5. **홈판 스켈레톤 충돌 해소 (검토 circumvention HIGH)**: celebrity 컨텍스트에서 `homefeedExposurePattern.ts:29`의 "확인된 사실은 바로 단정" 문구를 조건부로 "**확인된 사실만 단정, 미확인은 의혹/출처 병기**"로 교체하고, celebrity fact guard 블록을 스켈레톤보다 **뒤에** 주입(recency 우위) + `[HARD_CONSTRAINT]` 표기.
6. **fake attribution 교차검증 (검토 legal HIGH)**: "매체명+전달동사" attribution은 rawText에 그 매체/URL이 실제 존재할 때만 유효. 미존재 인용은 화이트리스트 제외 + `sanitizeContentFakeSources` 제거 대상으로 위임.
7. **여론/의견 화이트리스트 조건부 (검토 circumvention MEDIUM)**: "~라는 반응", "~로 보인다", "~설, 진실은?"이라도 같은 문장에 **범죄/사생활 명사가 있으면 화이트리스트 제외** + "(확인되지 않음)" 병기 강제. 날조 여론 세탁구 차단.

### C — 발행 경계 read-only 스캔 → **채택 (P1, 경고 전용)**
**채택 사유 (검토 circumvention HIGH "저장 후 재발행 사각지대"):** sanitizer는 `finalizeStructuredContent`(생성 시점)에서만 돈다. 저장본 재발행·붙여넣기·수동입력 발행은 finalize를 재실행하지 않아 방어 전무. 발행 경계에 **비차단 read-only 스캔**을 추가해 최소 경고를 띄운다. **하드 차단 아님**(라이브 발행 신뢰 원칙).

### D — 연예/실존인물 법 안내 → **축소 채택 (P2, 신규 UI 없음)**
**축소 사유 (검토 feature-bloat HIGH):** 별도 9초 토스트 + settingsModal 체크박스는 기능 비대. **신규 토스트/설정 UI를 만들지 않고**, B가 이미 세팅하는 `legalRisk` 뱃지(`renderer.ts:1572`)의 기존 hover/tooltip 텍스트에 "7·7 허위조작정보법 — 발행 전 출처 확인" 한 줄을 얹는 저침습 방식으로 대체. 배너 카피는 "네이버가 법적 유죄와 무관하게 신고만으로 노출제한/수익화 차단을 선제 발동할 수 있다"를 포함(검토 legal HIGH 반영), "100% 안전" 단정 금지(권고형).

---

## 4. 위험표현 렉시콘 (한국어)

> safetyEval은 점수용, 본 렉시콘은 legalRisk/억제용으로 **역할 분리**(검토 circumvention LOW: safetyEval 재사용 부정확 반영). 법 문서 직접 예시어를 빠짐없이 포함.

### 4.1 위험명사 (사생활/범죄) — AND 조건의 한 축
`열애 · 결별 · 이혼 · 재혼 · 임신 · 불륜 · 학폭 · 마약 · 탈세 · 음주운전 · 사기 · 폭행 · 도박 · 성추문 · 갑질`

### 4.2 단정어미 — AND 조건의 다른 축
`드러났다 · 드러나 · 밝혀졌다 · 밝혀진 · 확정됐다 · 사실로 확인됐다 · 한 것으로 나타났다 · 들통났다 · 판명됐다 · 저질렀다 · 했다(범죄동사 결합)`

### 4.3 낚시성 확정어 (제목/소제목, 법 문서 직접 예시) — 위험명사 동반 시에만 제거
`사실상 확정 · 충격 · 경악 · 폭로 · 이미 밝혀졌다 · ~로 드러나 · 단독: · 민낯 · 실체 · 정체 · 이중생활 · 들통`

### 4.4 전언 세탁 (출처 미특정 시) 
`~라고 한다 · ~라는 소식이 들려왔다 · ~로 알려졌다 · 관계자에 따르면 · ~카더라`

### 4.5 오탐 제외 규칙 (렉시콘 자체에 내장)
- **`단독`은 `단독:`(콜론) 형태로만** 매칭 → "단독 활동(solo)" 보존.
- **`충격/경악/폭로`는 위험명사(§4.1) 동반 시에만** 제거 → "충격의 반전 드라마" 보존.
- **§4.2 단정어미는 반드시 §4.1 위험명사와 동일 문장**일 때만 → "일정이 확정됐다" 보존.
- **극중 인접어(§3.4)** 있으면 전체 skip.

### 4.6 암시형 단정 (P1 확장, 경고만)
`~일 수밖에 없는 정황 · 누가 봐도 · ~라는 게 정설 · 이 정도면 확실 · 아니라고 보기 어렵다` — 정규식 한계로 변환 대신 legalRisk 경고(검토 circumvention MEDIUM 반영, gap 명시).

---

## 5. 통합 지점 (file:line — 검증 완료)

| 계층 | 위치 | 동작 |
|---|---|---|
| 프롬프트 억제 (일반) | `contentGenerator.ts:2012-2015` (buildGeneralContentGuardBlock 주입 옆) | `isCelebrityContext && enabled` → `buildCelebrityFactGuardBlock()` append |
| 프롬프트 억제 (홈판) | `promptLoader.ts:1208-1209` (스켈레톤 append **직후**) | celebrity면 스켈레톤 line 29 문구 교체 + fact guard를 뒤에 주입 |
| 렉시콘/프롬프트 블록 | `generalContentGuard.ts` **내부 함수 추가** (신규 파일 없음) | `buildCelebrityFactGuardBlock()`, `isCelebrityFactGuardEnabled()` |
| sanitizer 단일 진입 | `finalizeStructuredContent` (`contentGenerator.ts:894`) 내부, hallucination 블록(948-966) 뒤 | `require('./content/celebrityAssertionSanitizer')` lazy-load, category 판정 후 **조건부 1회 호출** |
| sanitizer 모듈 | `src/content/celebrityAssertionSanitizer.ts` (**신규 1개**, ~180줄) | 문장 순회 치환 + 변환 카운트 반환 |
| legalRisk 배선 | finalize 반환 직전 **단일 지점** | 변환>0 시 `quality.legalRisk = max(기존, 'caution')` (§6.4) |
| 발행 경계 스캔 (C) | `prePublishAssertion.ts` read-only check 추가 | 비차단 경고, BLOCKING_CHECKS 미추가 |
| 배너 (D) | `renderer.ts:1572` legalRisk 뱃지 tooltip | 기존 UI 텍스트에 1줄 추가 |

**신규 파일: sanitizer 1개만.** 나머지는 기존 파일 소량 추가(300줄 제한 준수). `sanitizeStructuredContentClaims` **시그니처는 무변경**(검토 feature-bloat MEDIUM 반영) — finalize에서 별도 조건부 호출로 배선해 4개 기존 호출부 하위호환 유지.

---

## 6. 오탐 방지책

1. **이중 게이트**: `category==='celebrity'`(또는 homefeed/스포츠) 아니면 sanitizer·프롬프트 전체 스킵. IT/맛집/금융/일반 글 진입 0.
2. **AND 조건**: 위험명사 AND 단정어미 동일 문장. 단독 매칭 무발동.
3. **극중/픽션 선행 필터**: 필수. 작품 리뷰 보존.
4. **bodyHtml 제외**: 텍스트 필드만. HTML/URL 파괴 0.
5. **화이트리스트 조건부**: 여론/의견/의문형도 범죄·사생활 명사 동반 시 제외.
6. **멱등성 보장**: 이미 "(확인되지 않았다)/의혹이 제기됐다" 표지 있으면 재변환 skip. `f(f(x))===f(x)` 단위테스트 필수(검토 circumvention MEDIUM). finalize 다회 호출 대비.
7. **legalRisk 보수**: 변환 0건이면 절대 'caution' 이상 금지. 단일 지점 배선 + `max()` 병합으로 하드코딩 'safe' 14곳 override 검증(검토 legal MEDIUM + false-positive MEDIUM).

---

## 7. 단계별 구현계획 (1릴리즈 1~3 fix 준수)

### P0 — 프롬프트 억제 + sanitizer 최소셋 (릴리즈 1개, 2~3 fix)
1. `generalContentGuard.ts`에 `buildCelebrityFactGuardBlock()` + `isCelebrityFactGuardEnabled()`(env `CELEBRITY_FACT_GUARD_V1` 기본 ON) + `inferHallucinationCategory` 스포츠 정규식 확장.
2. `contentGenerator.ts:2012`, `promptLoader.ts:1208`에 celebrity 프롬프트 억제 주입 + 홈판 스켈레톤 line 29 조건부 교체.
3. `src/content/celebrityAssertionSanitizer.ts` 신규 + finalize 조건부 1회 호출 + legalRisk 단일 배선.

**P0 범위 확정: 고위험(범죄/유죄 단정 = §4.1 범죄명사 + §4.2)만 자동 변환. 사생활/전언(열애/전언 세탁)은 경고만**(검토 feature-bloat LOW: 라이브 신뢰 vs 자동변환 충돌 반영). 실측 오탐율 확인 후 P0.5에서 자동변환 범위 확대.

### P1 — 발행 경계 게이트(C) + AI기본법 고지(D) ✅ 구현 완료(2026-07-03, 적대적 리뷰 2회)
- **발행 경계 게이트(C)**: `evaluateCelebrityPublishRisk`(main, celebrityAssertionSanitizer.ts) — legalRisk='danger'(AI생성) OR 신선 텍스트 스캔(붙여넣기/저장본). IPC `defamation:checkPublishRisk` → renderer `celebrityPublishGate`가 **실제 공통 진입점 `executeUnifiedAutomation`** 진입부에서 1회 확인(window.confirm, 취소 가능). 사용자 결정=1회 확인 게이트(하드차단 아님). 연속발행(무인)은 isContinuousMode 분기로 confirm 억제·로그만.
- **AI기본법 고지(D)**: 앱 내부 상시 배너(index.html `ai-basic-law-notice`, **블로그 본문 미주입**=사용자 결정) + legalRisk 뱃지 tooltip(허위조작정보법 안내).
- **적대적 리뷰가 잡은 must-fix(반영)**: (1) 게이트가 존재하지 않는 버튼에 바인딩된 죽은 runAutomation에 있던 것 → executeUnifiedAutomation로 이동. (2) 암시형 정규식(§4.6)이 "누가 봐도 과장됐다"(부정)/"이 정도면 강력하다"(정책) 등 일반 글 오탐 → **미도입**(명시 ASSERTION_RE만, 오탐 케이스 .toBe(false) 잠금). (3) 취소를 '발행 실패'로 오인 → `_publishGateCancelled` 마커 + 오버레이 정리.
- **§4.6 암시형**: 정규식으로는 헤지어의 서술 대상을 못 가려 컨텍스트 무관 오탐 blast. **실데이터 정밀도 측정 선행 후** 재도입(P0.5/후속).

**P1 잔여(후속, 회귀 아님·커버리지 확장)**: executeUnifiedAutomation을 우회하는 일부 라이브 발행 경로(사진모드 `imageNarrativeMode.ts`, quick-mode `imageNarrativeQuickMode.ts`, `titleGeneration.ts`, `formUtilities.ts`)에 게이트 미배선 — 별도 후속으로 배선. 풀오토는 콘텐츠가 executeUnifiedAutomation 전 세팅되면 게이트가 봄(반자동·풀오토·배치·연속 커버 확인).

### P2 — 배너(D) 축소판 (릴리즈 1개, 1 fix)
- legalRisk 뱃지 tooltip 카피 추가(플랫폼 조치 고지 포함, 신규 UI 없음).

**보류: legalRisk 15곳 하드코딩 전면 재배선.** god-file(6455줄) 다중 수정 = 회귀 cascade 위험. finalize 단일 지점 override로 P0 마감, 전면 재배선은 별도 SPEC.

---

## 8. 미결정 / 사용자 결정 필요

1. **C 차단 vs 경고**: 본 SPEC은 **경고(비차단)** 기본. 라이브 발행 신뢰 원칙상 하드 차단은 본문누락/마커누출급만. → **차단 원하면 명시 필요.** (권고: 경고 유지. 저장본 발행은 사용자가 "안전하다 믿고" 클릭하므로 인지 기회 제공이 핵심.)
2. **D 기본 ON/OFF**: legalRisk 뱃지 tooltip은 celebrity 뱃지 노출 시 자동. **별도 배너/설정 UI는 만들지 않음**(feature-bloat 회피). → 명시적 배너를 원하면 추가 결정.
3. **P0 자동변환 범위**: 범죄/유죄만 자동변환 vs 사생활도 포함. → **권고: 범죄만 시작**, 실측 후 확대.
4. **법률 자문 (필수 gap)**: '고의·중과실' 요건에서 AI 대량 자동발행 구조 자체의 해석, attribution 면책 한계, 원보도 오보 시 재유포 책임 — **코드로 확정 불가**. 릴리즈 전 법률 검토 권장. **본 가드는 리스크 저감이며 면책 보증이 아님**을 사용자·배너에 명시.
5. **예약/연속발행 무인 경로**: 사용자가 안 보는 시점 발행 시 legalRisk 경고 무시됨. → celebrity+danger 글은 예약 큐 진입 시 별도 확인 요구할지 결정 필요(본 SPEC 범위 밖).

---

## 9. 테스트 전략

### 9.1 정적 가드 테스트 (`__tests__/celebrity-assertion-sanitizer.test.ts`)
- **보존 케이스 `.not.toMatch` 잠금** (틀린 단언이 버그 박제 방지 — MEMORY feedback_test_forcing_regression): 
  - 단정어미 단독 10종("티켓 예매가 확정됐다", "무죄가 확정됐다", "일정이 밝혀졌다"…) → **불변**.
  - 극중 문맥 10종("드라마에서 불륜 연기가 화제로 나타났다"…) → **불변**.
  - 정당 attribution 10종("연합뉴스 보도에 따르면 ~라고 전했다"[rawText에 매체 존재]) → **불변**.
  - 여론/의견/의문형(범죄명사 미포함) → **불변**.
- **변환 케이스 `.toMatch`**: 범죄명사+단정어미 10종("학폭을 저질렀다는 것으로 드러났다") → "(확인되지 않았다)" 병기 확인.
- **멱등성**: `sanitize(sanitize(x)) === sanitize(x)` — 이중 병기 0.
- **bodyHtml 무손상**: `<img src="x.jpg">`, `http://n.com/a.b.html` 포함 텍스트 → 태그/URL 불변.

### 9.2 Red-Green (legalRisk 배선)
1. 범죄단정 글 → sanitize → `quality.legalRisk === 'caution'` PASS.
2. celebrity 게이트 조건 revert → legalRisk 하드코딩 'safe' 유지 FAIL(게이트 미발동 확인).
3. 복원 → PASS.

### 9.3 회귀 (god-file 영역)
- `npx vitest run` — **현 3,002 GREEN 유지 필수**.
- 일반/맛집/금융/IT 글 샘플 → sanitizer 무발동(오탐 0) 검증.
- `npm run test:full-flow` — finalize 핫패스 4회 호출 정상.

### 9.4 실측 계획 (검토 false-positive/feature-bloat "실측 부재" 반영)
- 합성 10종이 아니라 **실제 크롤링-홈판 celebrity 산출물 샘플**로 precision/recall 측정. P0 릴리즈 전 오탐율 수치 확보(부업러 영향 규모 파악).

---

**핵심 요약**: A 취소(오탐·중복), B 채택하되 완화→억제 재정의·AND 조건·bodyHtml 제외·홈판 충돌 해소·fake attribution 교차검증으로 수정, C 경고 전용 P1, D 신규 UI 없이 tooltip P2. 신규 파일 1개. 법률 자문·플랫폼 조치·이미지 리스크는 잔존 gap 명시.

파일 근거: `src/content/generalContentGuard.ts:44,58` · `src/content/hallucinationCheck.ts:126,139` · `src/contentClaimSanitizer.ts:16` · `src/contentGenerator.ts:894`(finalize, legalRisk 'safe' 14곳) · `src/content/homefeedExposurePattern.ts:25,29` · `src/promptLoader.ts:1208`