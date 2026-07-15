# Content Quality V3 Ultra Plan

## 목표

저가 모델로도 더 신뢰할 수 있고 읽기 좋은 한국어 네이버 글을 만들되, 실제 비교 결과가 기준을 통과하기 전에는 기존 운영 결과를 바꾸지 않는다.

핵심은 프롬프트를 계속 길게 만드는 것이 아니다. 근거를 명확히 분리하고, 모델 계약을 짧게 만들고, 구조화 출력과 결정론적 검증으로 실패를 잡고, 실제 비교 데이터가 쌓인 모드만 단계적으로 승격한다.

## 근본 원인

기존 프롬프트 스택에는 서로 중복되거나 충돌하는 지시가 많다. 일부 페르소나는 가족 이야기·직접 경험·전문가 권위·구체 숫자를 요구하지만 다른 규칙은 창작을 금지한다. 동적 리뷰와 상품 자료가 시스템 지시처럼 취급되는 경로도 있어 프롬프트 인젝션 경계와 캐시 효율을 약화시킨다. 저가 모델일수록 이런 충돌에 더 취약하다.

V3는 근거에 없는 사실·경험·가족·권위·가격·현재 수치를 만들지 않고, 시스템 정책·사용자 요구·외부 자료를 서로 다른 신뢰 구역으로 분리한다. 공급자 네이티브 JSON Schema로 완성된 결과를 요구하고, 성공한 초안은 순수 V3 finalizer에서 즉시 반환한다. 오류 시 기존 프롬프트로 조용히 폴백하지 않는다.

## 회귀 방지 불변식

```text
renderer request
    -> trusted main-process options
    -> legacy by default
    -> explicit internal V3 request
    -> exact evaluated-mode intersection
    -> Gemini-only provider policy
    -> gemini-3.1-flash-lite + native schema + grounding OFF
    -> exact one-call transport + model-default sampling
    -> strict post-parse schema + source-bound factual validation
    -> pure V3 finalizer / exact early return
    -> publication-boundary revalidation
    -> fail closed
```

- 기본 V3 허용 목록은 비어 있다.
- 렌더러 입력이나 저장된 설정은 V3를 켤 수 없다.
- 평가 대상은 `seo`, `homefeed`, `affiliate`, `business`, `mate` 다섯 모드뿐이다.
- `custom`, `image-narrative`, `traffic-hunter` 및 알 수 없는 모드는 legacy를 유지한다.
- V3 공급자는 Gemini만 허용하고 모델은 정확히 `gemini-3.1-flash-lite`로 고정한다.
- Flash-Lite는 구조화 출력과 Search grounding을 지원한다. V3 평가는 기능 미지원 때문이 아니라 고정 upstream 근거만으로 결정성·비용·재현성을 유지하기 위해 grounding을 의도적으로 끈다.
- V3 요청은 `temperature`, `topP`, `topK`를 보내지 않고 Gemini 3.1의 모델 기본값을 사용한다. 빈 응답 재시도에서도 샘플링 값을 임의로 높이지 않는다.
- V3는 버튼 한 번당 정확히 한 번만 provider를 호출한다. 설정·환경변수·백업 키·캐시·빈 응답·429/5xx가 추가 호출, 키 회전, 프롬프트 증강, 다른 모델 폴백을 만들 수 없다.
- canonical evidence 객체는 동결 상태로 유지하되, 입력을 내부에서 수정하는 실제 Google SDK에는 호출 직전에 분리한 mutable clone만 전달한다.
- legacy 생성 경로의 호출 횟수, 결과 객체, 오류 객체와 순서를 보존한다.
- 운영 shadow는 부작용 없는 오프라인 러너가 생기기 전까지 두 번째 모델 호출을 하지 않는다.
- 승격 실패 시 허용 목록을 비우는 것만으로 즉시 롤백할 수 있어야 한다.

## 구현 단계

### G0 — 기존 동작 동결

- 기존 프롬프트, 평가기, 모델 레지스트리 아티팩트의 SHA-256 기준선을 저장한다.
- 검토되지 않은 기준선 변경은 테스트에서 실패한다.
- 기본 호출은 정확히 기존 드라이버를 한 번 실행한다.

### G1 — 순수 라우팅 계약

- `legacy | shadow | v3`만 허용하고 잘못된 값은 legacy로 닫는다.
- V3 요청도 평가 완료된 다섯 모드와 주입된 내부 허용 목록의 교집합에서만 동작한다.
- 오프라인용 불변 입력 스냅샷과 동시성 1의 bounded shadow queue를 제공한다.

### G2 — 짧은 근거 계약과 구조화 출력

- 모드별 캐시 안정적인 시스템 계약을 사용한다.
- 외부 자료는 단 하나의 `[원본 텍스트]` 경계 뒤에 제한된 JSON 데이터로 넣는다.
- 사용자 요구와 런타임 제약은 자료를 덮어쓰는 사실 근거로 사용하지 않는다.
- 시스템 계약은 최대 12,000자, 근거 원문은 최대 80,000자로 제한하고 나머지 동적 필드도 항목 수와 길이를 제한한다.
- 다섯 개의 짧은 행동 대비 예시로 가짜 직접 경험·가족·권위, 구매자 리뷰 귀속, 충돌하는 현재 가격, 원문 속 명령, 근거 기반 구체화를 가르친다. 완성 글 예시는 넣지 않는다.
- 예시는 저가 모델의 행동 안정화를 노린 고정 토큰 비용이다. 시스템 영역을 캐시 안정적으로 유지하되, 실제 비용·품질 비교를 통과하지 못하면 축소하거나 제거한다.
- Gemini 3.1 Flash-Lite가 지원하는 네이티브 JSON Schema 하위 집합을 사용한다. 평가는 모든 실행에 같은 고정 upstream 근거를 쓰기 위해 grounding을 끈다.
- Google의 Gemini 3 프롬프팅 지침에 따라 `temperature`, `topP`, `topK`는 모델 기본값에 맡긴다.
- provider 응답은 요청 스키마를 믿고 통과시키지 않는다. 추가 키, 누락 필드, sparse/accessor 배열, 배열 개수, enum, 정수·점수 범위를 같은 strict validator로 다시 검사한다.

### G3 — 사후 변조 차단

- 스키마 검증을 통과한 V3 초안은 순수 finalizer에서 바로 반환한다. 모델의 `bodyHtml`은 버리고 `bodyPlain` 문자열 값은 그대로 보존한다.
- 파생 `bodyHtml`에서만 CRLF를 LF로 정규화한 뒤 `&`, `<`, `>`를 이스케이프하고 줄바꿈을 `<br>`로 바꾼다.
- V3는 기존 LLM 재작성 9종을 실행하지 않는다.
- 가짜 경험·감정·권위·CTA를 넣을 수 있는 viral optimizer, humanizer, Naver optimizer를 실행하지 않는다.
- 제목·소제목 키워드 강제 삽입, 서브키워드 보정, 의미를 바꾸는 legacy validator도 실행하지 않는다.
- legacy 의미 sanitizer, 수동/키워드 제목 사후 덮어쓰기, SERP benchmark, SERP history, generation stats 읽기·쓰기를 실행하지 않는다.
- 수동 제목과 키워드 제목은 동일한 V3 제목 계약에서 정규화하고 최대 120자로 제한한다. 프롬프트와 finalizer가 같은 resolver를 사용한다.
- 제목·JSON·사실성 불일치는 추가 provider 호출 없이 안정적 오류 코드로 즉시 실패한다. V3 품질을 위해 비용과 지연을 몰래 두 배로 만들지 않는다.
- `validatePublishableContent`와 결정론적 평가기로 실패를 판정한다.
- 허위 1인칭 체험, 근거 없는 중요 숫자, 프롬프트 누출, 의료·법률·금융 보장 표현은 bounded source snapshot과 대조한다. 생성 등록 전 한 번, 결론·업체·제휴 후처리와 외부 변조 뒤 실제 publication boundary에서 다시 한 번 같은 shared guard로 검사한다.
- legacy에서는 기존 사후 처리 순서와 동작을 그대로 유지한다.

### G4 — 평가와 승격

- PR smoke는 위험 시나리오별 24개 한국어 케이스다.
- release corpus는 다섯 모드별 24개, 총 120개 한국어 케이스다.
- 승격 입력은 소스에 고정된 case-ID manifest의 정확한 120개와 일치해야 하며, 누락·추가·미등록·모드 불일치는 실패한다.
- 모드별 최소 6개 실제 도메인·주제 씨드로 의사 반복을 막는다.
- 필수 식별자·문자열, 금지 주장, 인젝션 누출, 허위 1인칭, 근거 없는 중요 숫자, 고위험 보장을 기계 판정한다.
- 게이트는 정확한 키만 가진 plain record와 기본 prototype의 dense array만 받는다. accessor, sparse array, 사용자 정의 prototype, 추가 키를 거부하고, Proxy를 포함한 입력은 own data descriptor에서 새 record/array로 복사한 뒤 모든 수치가 유한하고 허용 범위 안인지 다시 검증한다.
- 주관적 품질은 코드가 꾸며내지 않고 200개의 `ko-KR` 사람 블라인드 비교로만 판정한다. 120개 case와 5개 stratum을 모두 덮고 case/stratum별 배정 편차와 후보 A/B 위치 편차는 각각 최대 1이어야 한다.
- 각 판단은 고유 `judgmentId`, `blindAssignmentId`, `raterId`, 단일 `runId`, `blinded: true`, 후보 위치와 소스 고정 assignment/evaluator provenance를 가져야 한다. 중복 배정, 혼합 run, 모델 평가자, 위치 편향은 실패한다.

## 승격 게이트

다음 조건을 모두 실제 기록으로 충족해야 한다.

- 24개 smoke를 동일 모델·스키마 해시로 3회 연속 통과.
- 120개 완료, 모드별 정확히 24개 완료.
- 승격 임계값은 공개된 고정 정책만 사용하며 호출자가 완화하거나 교체할 수 없다.
- schema 100%, publishable 100%.
- 중대 환각 0, 허위 1인칭 0, 근거 없는 현재 수치 0, 제품 실패 0.
- 인프라 실패와 `NOT_RUN`은 성공으로 계산하지 않는다.
- 200개 블라인드 `ko-KR` 사람 비교 완료. 정확한 120 case/5 stratum 전체 커버리지와 균형 배정·표시 순서·provenance를 충족.
- 후보 평균 품질 차이 `>= 0`.
- 후보 승리 또는 동률 비율과 그 95% Wilson 하한 `>= 0.5`.
- legacy 대비 중앙 비용 비율 `< 1.0`.
- legacy 대비 P95 지연 비율 `<= 1.0`.

개별 공급자 케이스 상태는 `PASS`, `PRODUCT_FAIL`, `INFRA_EXTERNAL`, `NOT_RUN`이다. 하나라도 `PRODUCT_FAIL`이면 승격을 차단하고, 외부 장애나 미실행은 성공으로 세지 않는다. 최종 게이트 결정은 `PROMOTE`, `BLOCK`, `INCOMPLETE`로 분리한다. 입력 위조·제품 실패·품질·비용·지연 임계값 실패는 `BLOCK`, 외부 장애·미실행·200개 미완료는 `INCOMPLETE`, 모든 고정 정책을 통과한 경우에만 `PROMOTE`다.

### 신뢰 증거 승인 경계

`evaluateContentQualityV3Rollout`은 호출자가 전달한 지표와 pairwise provenance만으로
승격을 승인하지 않는다. 선택적 evidence attestation은 스키마 버전 `2`,
provider/model `gemini` / `gemini-3.1-flash-lite`, locale `ko-KR`, 단일 판단
`runId`, prompt bundle·output schema·release corpus·legacy baseline·candidate runtime의
소문자 SHA-256을 정확히 고정한다.

이 다섯 pin은 호출자 선언을 신뢰하지 않는다. 게이트는 정확한 120개 case의 prompt 출력과
평가 옵션, 현재 output schema, 전체 release corpus와 manifest, raw legacy baseline에서
현재 아티팩트 tuple을 런타임에 한 번 파생하고, source-controlled runtime fingerprint를
결합해 불변 값으로 캐시한 뒤 attestation과 정확히
비교한다. baseline을 읽을 수 없거나 pin 하나라도 오래되면 `INVALID`로 `BLOCK`한다.
정확한 baseline JSON은 패키지 앱의 동일한 `docs/` 경로에 포함하며, 경로 한정
`.gitattributes` 규칙으로 checkout이 달라도 raw byte의 LF를 유지한다.

각 provider case는 `candidateOutputSha256`, `legacyOutputSha256`, `requestSha256`,
`providerResponseSha256` 네 값을 모두 가져야 한다. 각 사람 판단은 case ID, 네 hash,
후보의 A/B 위치를 길이-prefix 방식으로 결합한 `orderedPairSha256`을 가져야 하며,
게이트가 이를 다시 계산한다. 출력 또는 표시 순서만 바꿔도 기존 판단은 무효다.

assessor의 `machineAssessmentCases`는 승격 증거가 아니다. 반드시
`buildContentQualityV3RecordedRolloutCase(machineAssessment, measuredEvidence)`로
동일 case/stratum의 외부 측정값과 합친다. 이 builder는 hash나 품질·비용·지연 값을
임의 생성하지 않고, `PASS`일 때만 네 성능 지표를 요구하며, machine `PRODUCT_FAIL`을
`PASS`로 올릴 수 없다.

승격용 raw evidence package는 schema version `2`다. 120개 case마다 candidate와
legacy의 순서 있는 call ledger, 각 요청·응답 원문 byte, 시도 사유·결과, 토큰,
latency·backoff, 최종 출력 byte를 함께 보존한다. candidate는 정확히 한 번의
`INITIAL/SUCCESS` 호출만 허용한다. 비용은 source-controlled Flash-Lite 가격 snapshot과
토큰 수로, 비용·지연 비율은 candidate/legacy ledger에서 게이트가 다시 계산한다.

게이트는 각 candidate 요청 byte를 현재 release case에서 만든 canonical Gemini request와
byte-for-byte 비교한다. provider 응답 byte를 strict parse·schema·finalizer·publication guard·
assessor에 다시 통과시켜 canonical candidate 출력과 machine 지표를 재생성하고, 기록된
최종 출력 및 지표와 정확히 비교한다. self-consistent hash만 맞춘 임의 프롬프트·쉬운 출력은
승격 증거가 될 수 없다. 외부 provider가 보고한 토큰·시간과 사람 평가자의 실제 신원은
로컬 hash만으로 증명할 수 없으므로, 승인 allowlist에 digest를 넣기 전 원시 증거 사람 검토가
여전히 필수다.

candidate runtime fingerprint는 생성·publication·평가 정책·provider/cache/parser/retry
closure와 `package-lock.json`의 실제 source byte를 고정한다. 경로를 정렬한 뒤 path/body를
각각 64-bit big-endian 길이-prefix로 hash한다. strict UTF-8만 허용하고 BOM·lone CR·invalid
UTF-8·symlink·root 탈출·누락 파일은 실패한다. CRLF만 LF로 정규화한다. 환경 변수, 설정,
renderer, 호출자가 expected runtime digest를 교체할 수 없으며 release test가 실제 workspace
byte와 source constant의 일치를 검증한다. 승인 artifact 목록과 activation manifest는
self-reference를 막기 위해 fingerprint에서 제외하지만 둘 다 기본 빈 값으로 fail-closed다.

최종 reviewed runtime manifest는 생성부터 저장·복원·발행까지 이어지는 636개 파일을
포함한다. 검토된 SHA-256은
`9a0d7444bae9545ba1c8c91be4ebb195c61850f3e9cfb9b535192ffb55f409cd`다. TypeScript의
정적 import뿐 아니라 `require`, import-equals, literal dynamic import와 Worker entry도
closure 밖으로 나갈 수 없으며, 비리터럴 동적 경로는 실패한다.

## 발행 핸드오프와 저장본 재시작 규칙

- V3 생성 직후 main process가 1회용 opaque handoff를 발급하고 renderer의 WebContents,
  process, frame에서 파생한 owner에 묶는다. renderer가 보낸 owner 값은 신뢰하지 않는다.
- 발행 직전에는 title/body 중복 필드를 하나의 candidate로 합친 뒤 동일 publication guard를
  preview한다. writer가 실제 적용했다고 반환한 제목·서론·소제목·본문·결론·해시태그와
  격리 realm에서 읽은 최종 SmartEditor DOM이 정확히 일치한 뒤 handoff를 1회 소비한다.
  재사용·만료·owner 불일치·
  identity 불일치는 모두 발행을 중단한다.
- V3 발행은 시각 자료의 source digest/OCR attestation이 마련되기 전까지 text-only다.
  이미지·임베드·외부 링크·동적 CTA·사용자 추가 문구는 거부하고, 허용된 기본 FTC 고지문만
  정확한 최상단 문자열로 인정한다.
- `bodyPlain` 전체와 실제 writer prose를 같은 rich-text materializer로 대조한다. 번호·STEP·
  Markdown 소제목 장식만 writer SSOT로 제거하며 문장 누락·대체·중복은 consume 전에 실패한다.
- commit hook 실행 전후로 격리 realm DOM을 두 번 읽어 동일성을 확인한다. 다만 두 번째 읽기와
  Puppeteer의 trusted click은 서로 다른 task이므로 완전한 원자성은 아직 증명되지 않았다.
- 저장본에는 `_contentQualityV3Required`와 제한된 세 문자열 descriptor만 남긴다. 원문 근거,
  publication ticket, provider 응답은 localStorage에 저장하지 않는다.
- 앱 재시작으로 main의 신뢰 상태가 사라진 저장본은 legacy로 강등하지 않는다. descriptor가
  있으면 `untrusted_handoff`, marker만 있으면 `missing_handoff`로 중단하고 V3 재생성을 요구한다.
- 반자동·완전자동·다계정·예약 relay가 marker와 descriptor를 보존한다. 앱 자체 예약 발행은
  V3에서 명시적으로 지원하지 않으며 fail-closed다.
- legacy 저장본은 기존 6개 필드 직렬화와 발행 identity를 그대로 유지한다.

게이트는 정제된 cases, 정제된 judgments, digest 필드를 제외한 metadata를 안정적으로
직렬화한 뒤 Node SHA-256으로 `artifactSha256`을 다시 계산한다. 지표·verdict·run·metadata
변조나 다른 실행 결과의 digest 재사용은 `BLOCK`이다. 잘못된 metadata, accessor,
사용자 정의 prototype, sparse array, 추가 키, 유효하지 않은 hash도 원문 증거를
노출하지 않고 `BLOCK`한다.

승격에는 정확한 artifact digest가 불변 source-controlled 승인 목록에 있어야 한다.
현재 승인 목록은 의도적으로 비어 있으며 환경 변수, 설정, renderer, 호출 인자 우회는
없다.

- attestation 누락: `INCOMPLETE`
- 형식과 digest가 맞지만 아직 승인되지 않은 self-attestation: `INCOMPLETE`
- 잘못된 attestation 또는 digest 불일치: `BLOCK`
- 제품·입력·고정 임계값 실패: attestation과 무관하게 `BLOCK`
- 미래의 사람 검토를 거친 코드 변경으로 정확한 digest를 추가하기 전까지 `PROMOTE` 불가

이 hash는 무결성과 source-control 승인 경계를 제공할 뿐, 전자서명이나 특정 사람이
평가했다는 암호학적 증명이 아니다. 기록된 provider 출력과 한국어 블라인드 판단에 대한
사람 검토는 계속 필수다.

## 로그인 안정화 트랙

- 패키지 Electron 실행 파일로 npm `.cmd` shim을 실행할 때 `ELECTRON_RUN_AS_NODE=1`을 자식 프로세스에만 설정해 앱이 재귀 실행되는 원인을 제거한다.
- CLI 버전 출력에서 공급자별 허용된 한 줄만 추출해 앱 내부 로그가 UI에 노출되지 않게 한다.
- 로그인 완료 뒤 오래된 상태 조회가 `로그인 필요`를 다시 덮어쓰지 못하도록 revision/lease로 경합을 차단한다.
- 공식 OAuth 주소가 준비되면 기본 브라우저를 정확히 한 번 자동으로 열고, 실패하거나 창을 닫은 경우에만 `브라우저 다시 열기` 폴백을 표시한다.
- 허용된 공식 OAuth 주소만 OS 브라우저로 열고 URL 원문은 main process 밖으로 보내지 않는다.
- 잘못된 인증 코드는 같은 세션에서 재입력할 수 있게 하며 stdin backpressure·timeout·종료 상태를 구분한다.
- 창 종료·새로고침·import 경합 시 자식 CLI 프로세스 트리를 정리한다.
- 에러는 URL query/fragment, 토큰, 로컬 경로를 제거한 뒤 길이를 제한한다.
- 배포 앱의 과거 `agent-claude` 모델/provider 저장값과 서로 불일치하는 두 필드는 Claude API 또는 Gemini의 안전한 조합으로 원자적·영구 마이그레이션한다. 저장 실패 시에도 비활성 라디오와 hidden provider는 실행 경로에서 거부한다.

Claude 구독 로그인은 배포 앱에서 제공하지 않는다. Anthropic 공식 제품 지침에 따라 Claude는 API 키 경로만 제공한다. Codex UI도 `무료`나 `API 과금 0`이라고 표현하지 않고 ChatGPT 구독 한도·크레딧 사용이라고 안내한다.

## 출시 순서와 롤백

1. 오프라인 smoke 3회.
2. 120개 legacy/candidate 기록 생성.
3. 200개 사람 블라인드 비교.
4. side-effect-free shadow 러너 검증.
5. 정확한 prompt/model/schema 해시로 내부 canary.
6. 통과한 모드만 작은 허용 목록으로 순차 확대.
7. 이상 징후 시 즉시 허용 목록을 비워 legacy로 복귀.

운영 사고나 사람 평가에서 발견된 실패는 재승격 전에 영구 회귀 케이스로 추가한다.

## 현재 상태

- 운영 기본 경로: `legacy`.
- 기본 V3 허용 목록: 빈 배열. V3 운영 호출: 비활성.
- reviewed runtime manifest: 636개 파일.
- candidate runtime fingerprint: `9a0d7444bae9545ba1c8c91be4ebb195c61850f3e9cfb9b535192ffb55f409cd`.
- 전체 테스트: 575개 파일, 5440/5440 통과.
- Agent 회귀/커버리지: 20개 파일, 201/201 통과. statements 90.16%, branches 80.42%.
- V3 회귀/커버리지: 47개 파일, 743/743 통과. statements 89.26%, branches 84.56%,
  functions 98.40%, lines 93.94%.
- TypeScript·renderer build, IPC 계약, built self-test, Electron E2E 15/15 통과.
- 실제 Codex OAuth: `NOT_RUN`.
- 실제 Flash-Lite 120개 유료 corpus 실행: `NOT_RUN`.
- 실제 200개 `ko-KR` 사람 블라인드 평가: `NOT_RUN`.
- 배포: `NOT_RUN`.

따라서 현재는 품질 우월성을 주장하거나 V3를 운영에 켜면 안 된다. 실제 provider/사람 평가
외에도 다음 활성화 차단점을 먼저 닫아야 한다: 최종 DOM 검증과 trusted click의 완전한 원자화,
renderer reload 뒤 모든 V3 metadata가 제거된 payload의 legacy 강등 방지, 시각 자료의
source-bound attestation. 이 차단점은 현재 빈 activation manifest와 빈 승인 allowlist 때문에
운영 legacy 경로에는 영향을 주지 않는다.

## 공식 근거

- Naver Search Advisor: https://searchadvisor.naver.com/guide/content-basic
- Gemini 3.1 Flash-Lite: https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite
- Gemini 구조화 출력: https://ai.google.dev/gemini-api/docs/structured-output
- Gemini 프롬프팅 전략: https://ai.google.dev/gemini-api/docs/prompting-strategies
- Gemini 가격: https://ai.google.dev/gemini-api/docs/pricing
- Anthropic Legal and Compliance: https://code.claude.com/docs/en/legal-and-compliance
- OpenAI Codex와 ChatGPT 플랜: https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- OpenAI Codex CLI: https://learn.chatgpt.com/docs/codex/cli

## Evidence provenance v2 (implemented)

Promotion evidence is an execution transcript, not a bag of caller-supplied hashes.
Raw evidence schema version `2` stores ordered candidate and legacy call ledgers.
Every call records the exact request and raw provider response bytes, attempt reason
and outcome, input/output token counts, call latency, and preceding backoff. The V3
candidate is constrained to one initial successful call with zero retry and zero
backoff. The legacy ledger retains all attempts so its true cost and wall-clock time
cannot be hidden by reporting only the final call.

The gate recomputes costs from the source-controlled Flash-Lite price snapshot and
the token ledgers. It recomputes elapsed time from call latency plus backoff and then
derives candidate/legacy cost and latency ratios. Declared ratios cannot override
those values.

For each immutable release case, the gate reconstructs the exact canonical V3
request from the reviewed prompt, prompt options, model, safety settings, native JSON
schema, and single-call policy. It strictly parses the recorded raw provider JSON,
rejects unknown schema fields, runs the production finalizer and publication guards,
and canonicalizes the resulting candidate output. Request bytes, derived candidate
bytes, and recomputed machine-assessment fields must all match the recorded case.
Re-hashing fabricated or unrelated request/response/output combinations cannot make
them promotion-eligible.

The candidate runtime fingerprint includes the prompt-to-request-to-parse-to-finalize
closure, rollout/attestation policy, provider and retry helpers, external runtime
helpers actually executed by V3, and lockfiles. A TypeScript-AST architecture test
checks every relative runtime import from every V3 module and rejects unreviewed
dependencies. Only the three unavoidable self-referential approval data edges are
excluded: the evidence allowlist, the runtime fingerprint pin itself, and the release
activation manifest.
