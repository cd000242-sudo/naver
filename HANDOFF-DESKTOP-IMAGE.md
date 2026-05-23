# HANDOFF — Better Life Naver 데스크탑 앱 이미지 경로 이슈

> 새 세션 인수인계. 작성 2026-05-23. better-life-naver Electron 앱 측 작업.
> 웹사이트(payment-page/)와는 별개. 같은 repo 안 `src/` 데스크탑 앱.

## 증상 (사용자 보고)

콘솔 로그:
```
renderer.js:6506 [Init] 생성된 글 목록 강제 재로드 완료 (v2.10.94)
%ED%95%B8%EB%93%9C%E…202604271705.jpeg:1  Failed to load resource: net::ERR_FILE_NOT_FOUND
/C:/Users/SAMSUNG/Do…84%2005_22_34.png:1  Failed to load resource: net::ERR_FILE_NOT_FOUND
[ERROR] window.error 3회 → CrashRecovery 자동 저장 → "오류 감지 (1/3 → 2/3 → 3/3)"
```

핵심: 글 데이터에 박힌 이미지 경로가 **다른 PC의 절대경로(`C:\Users\SAMSUNG\...`)**라 본 PC에서 ENOENT.

## 정찰 결과 (이전 세션 explorer agent 작업)

### 1. 글 데이터 저장 모델 — 절대경로 그대로 박힘
`src/renderer/modules/postListUI.ts:88-93`
```typescript
for (const img of (post.images || []) as any[]) {
  const fp = img?.filePath || img?.savedToLocal;  // ← 절대경로
  if (fp && (String(fp).startsWith('file:') || /^[A-Z]:[/\\]/i.test(String(fp))))
```
- `generatedImages[]` 배열 안에 `filePath` / `savedToLocal` 절대경로 + 선택적 `previewDataUrl` (Base64) + `url` (외부)

### 2. 이미 있는 3단계 방어 (v2.10.108 / v2.10.135)
- **렌더 전 검증** (`postListUI.ts:73-115`): `checkFileExistsBatch()` IPC → 없으면 메모리에서 경로 제거
- **brokenImageRegistry** (`src/renderer/utils/brokenImageRegistry.ts`): 같은 경로 ERR 최대 1회 → 그 뒤 `<img>` 자체 안 만듦
- **fallback chain** (`postListUI.ts:213-215, 277-278`): `previewDataUrl` > `filePath` > `url`

→ **v2.10.337 사용 중이라면 사용자 ERR 거의 안 보일 것**.

### 3. 버전 표시 hardcoded — 동기화 안 됨
| 위치 | 박힌 값 |
|---|---|
| `package.json` | `2.10.337` (실제) |
| `src/renderer/renderer.ts:1` | `v2.10.214` |
| `src/renderer/renderer.ts:2786` | `v2.10.94` |

→ 콘솔에 `(v2.10.94)`로 나오는 이유. 실제 빌드 버전과 무관.

### 4. "생성된 글 목록 강제 재로드" 위치
`src/renderer/renderer.ts:2778-2790`
```typescript
runWhenIdle(() => {
  refreshGeneratedPostsList();
  console.warn('[Init] 생성된 글 목록 강제 재로드 완료 (v2.10.94)');
}, { name: 'refresh-posts-list', timeoutMs: 3000 });
```

## 작업 옵션 (사용자에게 확인 필요)

### A. 사용자 앱 업데이트만 (1분)
- 사용자가 v2.10.337 미만이면 GitHub Releases에서 받음
- 보호 코드 활성화 → ERR 거의 안 보임
- **근본 픽스 아님**

### B. 버전 문자열 자동 동기화 (15~30분, 1커밋)
- `renderer.ts:1` + `renderer.ts:2786`의 하드코딩 버전 → 빌드 시 package.json에서 주입
- electron-builder / esbuild의 define 옵션 사용
- 이후 release마다 자동 갱신
- 회귀 위험 낮음 (빌드 설정만 변경)

### C. 근본 픽스 — 이미지 저장 모델 변경 (큰 작업, 새 세션 권장)
- 신규 이미지 저장 시 `previewDataUrl`(Base64) 필수화
- 또는 blob id + userData 기반 lookup으로 변경
- 레거시 절대경로 → 마이그레이션 스크립트
- god-file `renderer.ts` 13,000줄 건드려야 → 회귀 위험 큼
- planner 먼저 권장

## 권장 순서

1. **B 먼저** (15~30분): 사용자 혼란 즉시 제거 + 향후 자동
2. 사용자에게 A 안내 (앱 업데이트)
3. C는 별도 세션 + planner 거쳐 진행

## 회귀 위험 가드

- god-file `renderer.ts` 직접 수정 시 [[feedback_no_cascade_fix]] 룰 적용 — 1릴리즈 1~3 fix
- 변경 후 `npx vitest run` 통과 확인 (현재 1991~1994 통과 메모리 기록)
- 빌드 후 패키징 exe 직접 더블클릭 테스트 ([[feedback_release_pipeline]])

## 관련 파일

- `src/renderer/renderer.ts` (god-file 13,000줄+)
- `src/renderer/modules/postListUI.ts` (글 목록 + 이미지 검증)
- `src/renderer/utils/brokenImageRegistry.ts` (broken image 캐시)
- `package.json` (실제 버전)
- `electron-builder.json` 또는 `vite.config.ts` (빌드 설정 — define 추가 후보)

## 다음 세션 시작 방법

```
HANDOFF-DESKTOP-IMAGE.md 읽고 옵션 B(버전 자동 동기화)부터 진행
```

또는 옵션 C로 직행:
```
HANDOFF-DESKTOP-IMAGE.md 읽고 옵션 C — 이미지 저장 모델 마이그레이션 — planner부터
```
