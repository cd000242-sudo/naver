# Phase 7.1 — PipelineConfig 설계안 (v1, 2026-06-13)

> 목표: 각 발행 플로우(풀오토/연속/다중계정) 진입점에서 설정을 **1회 해석**해
> 명시적 config 객체로 하위 전체에 전달. 하위/공유 코어의 localStorage 직독
> 전면 금지 — R13 명시 입력화(1~3차)의 완성형.

## 1. 현황 조사 (2026-06-13 실측)

발행 파이프라인 6개 모듈의 `localStorage.getItem` 직독 99건, 키 ~30종.

| 클러스터 | 키 | 직독 분포 | 조치 |
|---|---|---|---|
| **이미지 모드** | headingImageMode(17) · thumbnailTextInclude(15) · textOnlyPublish(8) | 6개 모듈 전체에 산재 — 최다 중복 | config 이관 (1순위) |
| **이미지 포맷** | imageStyle(5) · imageRatio(7) · subheadingImageRatio(6) · thumbnailImageRatio(4) | 5개 모듈 | config 이관 |
| **프로바이더** | fullAutoImageSource(5) · globalImageSource(5) · imageFallbackPolicy(2) | 4개 모듈 | R13 2차에서 부분 완료(resolveImageProviderFallback) — config로 흡수 |
| **쇼핑커넥트** | scAIImageEngine · scSubImageSource(2) · scSubImageMode(2) · scAutoThumbnailSetting(2) | 연속/다중/풀오토 | config 이관 (별도 단계) |
| **공시/안전** | ftcDisclosureEnabled(2) · ftcDisclosureText(2) · adbIpChange*(3) | 다중/풀오토 | config 이관 |
| **플로우 고유** | continuous_fillGapAi · continuous_urlAutoCollect · ma_fillGapAi(2) · ma_urlAutoCollect(2) · multiAccount.lastSettings(2) | 각 플로우 안에만 존재 | **조치 불요** (이미 플로우-로컬) |

## 2. 설계

### 2.1 타입 (신규 모듈 `src/renderer/modules/pipelineConfig.ts`, 300줄 한도 준수)

```ts
interface ImagePipelineConfig {
  headingImageMode: string;        // 'all' 기본
  thumbnailTextInclude: boolean;
  textOnlyPublish: boolean;
  imageStyle: string;
  imageRatio: string;
  subheadingImageRatio: string;
  thumbnailImageRatio: string;
  fallbackProvider: string;        // resolveImageProviderFallback() 흡수
  imageFallbackPolicy: 'engine-only';
}
interface DisclosureConfig { enabled: boolean; text: string }
interface PipelineConfig {
  flow: 'full-auto' | 'continuous' | 'multi-account';
  resolvedAt: number;              // 해석 시각 (진단용)
  image: ImagePipelineConfig;
  disclosure: DisclosureConfig;
}
function resolvePipelineConfig(flow: PipelineConfig['flow']): PipelineConfig
```

- 키 이름·기본값의 **단일 정의처**. 모든 플로우가 같은 키를 같은 기본값으로 해석.
- 쇼핑커넥트(sc*) 클러스터는 후속 단계에서 `shopping?: ScImageConfig`로 추가.

### 2.2 해석 시점 — 발행 아이템 시작 시 1회

- 연속발행/다중계정은 **아이템(글) 시작 시점마다 1회** 해석. 세션 1회가 아님.
  - 이유: 현재 직독 동작(사용 시점 최신값)과 가장 가깝고, 글 중간 설정 변경으로
    인한 글 내 비일관(썸네일은 옛 설정·본문은 새 설정)을 구조적으로 차단.
  - 관찰 가능한 동작 변화: "글 생성 도중 설정 변경 시 해당 글에 부분 반영되던 것"이
    "다음 글부터 반영"으로 — 이것은 의도된 개선 (사용자 영향 미미, 릴리즈 노트 명기).
- 풀오토 단일 발행은 발행 시작 시 1회.

### 2.3 전달 경로

R13 1~3차에서 만든 options 통로를 그대로 사용. `aiOptions`/`options`에 흩어 넣던
개별 키를 `config.image` 객체 통째 전달로 점진 교체. 기존 키는 전환기 동안
유지(이중 전달) → 코어가 config 우선/개별 키 폴백/직독 경고 3단 처리.

### 2.4 가드 (purity 테스트 확장)

- 직독 카운트 래칫: 클러스터 이관 시마다 해당 키의 모듈별 직독 수를 0으로 잠금
  (현행 phase72CorePurity 패턴 — 늘어나면 FAIL).
- resolvePipelineConfig 정의는 1곳만 (식별자 중복 스캔은 빌드 게이트가 커버).

## 3. 단계 분할 (1단계 = 1커밋 = 1revert, 커밋마다 full 게이트)

| 단계 | 내용 | 위험 |
|---|---|---|
| 7.1-a | ✅ (02def1cd) pipelineConfig.ts 신설 + 풀오토 진입점 이미지 모드+포맷 클러스터 배선 | local |
| 7.1-b | ✅ (09a204ea) 연속발행 배선 — V2 per-item + Enhanced per-publish | local |
| 7.1-c | ✅ (f2be7386) 다중계정 배선 — 큐 루프 per-item | local |
| 7.1-d | 공유 헬퍼(headingImageGen/costAndAutoGen)의 직독 → config 수신 전환 (경고 폴백) | module |
| 7.1-e | 이미지 포맷 클러스터 (imageStyle/Ratio 4종) 동일 절차 | module |
| 7.1-f | 프로바이더 클러스터 흡수 (resolveImageProviderFallback → config) | local |
| 7.1-g | 쇼핑커넥트 sc* 클러스터 | module |
| 7.1-h | 공시/안전(ftc/adb) 클러스터 + 직독 0 래칫 마감 | local |

각 단계 라이브 회귀 시 즉시 단독 revert 가능. 7.1-d 이후부터 "한 플로우 수정이
다른 플로우를 건드릴 수 없는" 목표 상태에 실질 진입.

## 4. 리스크

- **번들 식별자**: 신규 top-level 식별자(resolvePipelineConfig 등)는 6.1 스캔
  게이트가 커버. 신규 모듈의 인라인 번들 포함 여부를 7.1-a에서 확인.
- **스냅샷 동작 변화**: §2.2 명기 — 의도된 개선이나 릴리즈 노트에 기록.
- **이중 전달 기간**: config + 개별 키 공존으로 전환기 코드가 일시적으로 늘어남
  — 7.1-h에서 개별 키 전달 제거로 정리.

## 5. 진행 기록

- 6/13 7.1-a~c 완료 (02def1cd·09a204ea·f2be7386). 게이트: vitest 3,072 GREEN ·
  lint 0 errors · build PASS(식별자 충돌 0·번들 인라인 확인) — 커밋별 실측.
- 멀티에이전트 회귀 리뷰(5차원 리뷰어 + 발견별 적대 검증 2인, 에이전트 7):
  **확정 결함 0건**. 기각 1건 — "mam 래칫 7키 전체 잠금" 제안은 결함 아닌
  하드닝으로 판정 → 7.1-h에서 3개 모듈 × 7키 전체 toBe(0) 래칫으로 흡수 예정.
- 6/13 7.1-f 완료: provider/동기화 보조 경로의 fullAutoImageSource/globalImageSource/
  imageFallbackPolicy 직독을 readRawPipelineSettings() 경유로 통일. 가드: phase71/phase72
  직독 래칫 확장. 게이트: vitest 3,077/3,077 GREEN · build PASS · lint 0 errors ·
  lint:ipc PASS.
- 남은 단계: 7.1-g(쇼핑커넥트 sc* 클러스터) → 7.1-h(공시/안전 클러스터 + 직독 0 래칫 마감).
- 라이브 일괄 검증(3플로우)은 7.1-d 이후 또는 다음 릴리즈 전 1회.
