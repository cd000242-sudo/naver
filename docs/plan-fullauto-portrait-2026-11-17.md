# 홈판 풀오토 · 매일 예약발행 본문 사진 3:4 확대 계획 (2026-11-17)

상태: **조사 끝, 구현 전.** 사장님 결정(11/17): 두 흐름의 본문 사진도 세로 3:4 로 넓힌다. 대표 사진(썸네일)은 1:1 · 800×800 유지. v2.11.397 다음 릴리즈로 따로 한다.

## 결론

넓힐 수 있다. 본문 사진이 정사각이어야만 하는 장치는 없다 — 두 장 합성·카드 크롭·800×800 검사는 전부 대표 사진용이다. 다만 비율 글자 `'1:1'` 을 `'3:4'` 로 바꾸는 것만으로는 안 되고, 저장 단계의 정사각 강제를 본문에 한해 풀어야 한다.

## 정사각이 강제되는 곳

| 흐름 | 파일:줄 | 하는 일 |
|---|---|---|
| 홈판 풀오토 | `src/image/fullAuto/fullAutoImagePolicy.ts:152` | 본문 비율 `'1:1'` 강제(사용자 설정 무시) |
| 홈판 풀오토 | 같은 파일 `:154`, `fullAutoImageRequest.ts:105-108` | `squareSize: 800` → 모든 호출(대표·본문 구분 없이)에 `targetSquareSize` |
| 홈판 풀오토 | `src/main.ts:4152` → `squareImageTarget.ts` → `imageUtils.ts:97-99` | 저장할 때 800×800 으로 자름 |
| 매일 예약발행 | `src/main/services/dailyPublishingExecutor.ts:224-225` | `subheadingImageRatio: '1:1'` 하드코딩 |
| 매일 예약발행 | `src/main/services/dailyImageRefill.ts:36-39` | 빈칸 채우기가 **비율 하나를 대표·본문 양쪽에** 사용 |
| 공통 | `src/image/imageUtils.ts` | 정사각에 가까우면 800×800 — 세로 3:4 는 v2.11.397 에서 예외로 풀림(f5e9bd977) |

대표 사진만 보는 검사(그대로 둔다): `fullAutoPublishDecision.ts:62-67`, `imageQualityCheck.ts:36`, `dailyPublishingExecutor.ts:270-279`.

## 바꿀 것 (최소안)

"정사각 목표"를 "프레임 목표(가로×세로)"로 넓히고, 본문 호출만 800×1067 로 감싼다. 비율을 무시하는 엔진(Flow·Dropshot) 보정이 그대로 유지된다.

| 파일 | 변경 |
|---|---|
| `src/image/squareImageTarget.ts` | 프레임 목표 `{width,height}` 추가(정사각 함수는 그대로) |
| `src/image/imageUtils.ts` | 프레임 목표가 있으면 그 크기로 `cover` |
| `src/image/fullAuto/fullAutoImagePolicy.ts` | 홈판 전략 본문 비율 `'3:4'` + 본문 프레임, 문구의 "800x800" |
| `src/image/fullAuto/fullAutoImageRequest.ts` | 대표 호출이면 정사각 800 + `'1:1'`, 본문 호출이면 프레임 + `'3:4'` |
| `src/renderer/modules/multiAccountManager.ts:788, 878` | `:878` 은 `item.isThumbnail` 로 분기 |
| `src/main.ts:4152`, `src/image/types.ts` | IPC 가 프레임 옵션도 받게 |
| `src/main/services/dailyPublishingExecutor.ts:225` | `subheadingImageRatio: '3:4'` |
| `src/main.ts:6196-6207, 6274-6279` | 매일 발행 본문 생성 두 곳을 본문 프레임으로 감쌈 |
| `src/main/services/dailyImageRefill.ts:36-39` | 대표 항목은 `'1:1'` 고정, 본문만 전달받은 비율 |
| `src/renderer/components/HeadingImageSettings.ts:826` | 선택지 문구 |
| `.autopus/specs/SPEC-NAVER-FULLAUTO-2026/spec.md` D2 | 결정 문구 갱신 |

## 위험

- **매일 발행 대표 사진 함정**: 빈칸 채우기가 빈 대표 사진도 같은 생성 함수로 만든다. 비율과 프레임을 나누지 않으면 대표 사진이 3:4 로 저장되고 800×800 검사가 발행을 막는다.
- **자르는 양 증가**: 비율을 무시하는 엔진이 16:9 를 내면 1:1 로 자를 때 가로 56% 가 남고 3:4 로 자르면 42% 만 남는다.
- **글자 든 본문 사진**: "가운데 3/4 안에" 안내는 Codex 지시문에만 있다. 다른 엔진 프롬프트는 미확인.

## 같이 바뀔 시험

- 값 단언: `fullAutoImagePolicy.test.ts:48, 62, 138`.
- 소스 문자열 단언: `fullAutoWiring.test.ts:38, 53`, 지문 핀.
- 영향 가능(본문 미확인): `fullAutoScenario.test.ts`, `fullAutoPublishDecision.test.ts`, `naverImagePipelineV1.test.ts:131`, `dailyPublishingExecutor.test.ts`, `pipelineEndgameOrchestration.test.ts`.
- 먼저 쓸 실패 시험: 홈판 정책 본문 `'3:4'`·대표 `'1:1'` / 프레임 목표로 1600×900·1254×1254 가 800×1067 / 대표 호출은 800×800 / 빈칸 채우기의 대표 항목은 `'1:1'` / 매일 발행 옵션의 본문 비율 `'3:4'`.

## 확인 못 한 것

- 실측 없음(코드와 산술). 네이버 에디터에 세로 사진이 들어간 모양, 쇼츠 실제 렌더.
- `src/renderer/modules/fullAutoFlow.ts:1121, 1196, 3112` 가 지금도 타는 경로인지.
- 나노바나나·ImageFX·Flow·Dropshot 의 3:4 실제 처리.
