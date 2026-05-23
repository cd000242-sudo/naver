# HANDOFF — 옵션 C: 이미지 저장 모델 마이그레이션 플랜

> 작성: 2026-05-23. better-life-naver v2.10.337.
> 본 문서는 사용자 보고 ERR_FILE_NOT_FOUND (다른 PC 절대경로 잔존) 근본 픽스 플랜이다.
> SPEC 본체는 `.autopus/specs/SPEC-IMAGE-MODEL-001/` 에 있으며, 본 문서는 그 인덱스 + 한 줄 요약 역할.

## SPEC 4개 파일

- [`.autopus/specs/SPEC-IMAGE-MODEL-001/spec.md`](.autopus/specs/SPEC-IMAGE-MODEL-001/spec.md) — 요구사항 R-1~R-6 / 비목표 / 성공 기준 G-1~G-5
- [`.autopus/specs/SPEC-IMAGE-MODEL-001/plan.md`](.autopus/specs/SPEC-IMAGE-MODEL-001/plan.md) — Phase 0~7 단계별 변경 / 회귀 가드 / 릴리즈 분할
- [`.autopus/specs/SPEC-IMAGE-MODEL-001/research.md`](.autopus/specs/SPEC-IMAGE-MODEL-001/research.md) — 현 코드 정찰 결과 (file:line 인용) / (a)(b)(c) 트레이드오프 비교 / 미해결 의문 Q1~Q7
- [`.autopus/specs/SPEC-IMAGE-MODEL-001/acceptance.md`](.autopus/specs/SPEC-IMAGE-MODEL-001/acceptance.md) — 검증 케이스 A-1~A-18 / G→A 매핑

## 한 줄 결론

후보 **(a) blob-id + main-process lookup**을 채택. previewDataUrl Base64 강제는 localStorage 용량 한도(5–10 MB)에 의해 자기-파괴이고, per-post 상대경로는 백업/복원 시 디스크 파일이 누락된 경우 동일 문제 재발한다. blob-id 모델은 localStorage 안에 단지 `{ blobId, sha256, ext, mimeType, width, height, byteSize, createdAt }` 메타만 두고, 실제 바이트는 `userData/blobs/<id[0:2]>/<id>.<ext>`에 있으며, 부재 시 main process가 명시적 placeholder로 응답한다 — 다른 PC에서도 localStorage만 옮기면 "이미지 없는 글"로 graceful degrade.

## Phase 줄거리 (plan.md 요약)

| Phase | 릴리즈 | 핵심 | 위험 |
|-------|--------|------|------|
| 0 | v2.10.338 | 옵션 B 흡수 — 빌드 정의 자동 동기화 | 낮음 |
| 1 | v2.10.339 | blob store IPC 신설 (메인 단독) | 0 |
| 2 | v2.10.340 | writeImageFile에 blob-id 발급 (이중 쓰기) | 중간 |
| 3 | v2.10.341 | postManager.ts 3블록 절대경로 전파 차단 | **높음** |
| 4 | v2.10.342 | postListUI batch validate → blob has check | 중간 |
| 5 | v2.10.343 | 자동발행 materializeTempFile 어댑터 | **높음** |
| 6 | v2.10.344 | 마이그레이션 스크립트 (dry-run + 자동 백업 + idempotent) | 중간 |
| 7 | v2.10.345 | legacy 필드 deprecated 제거 | 중간 |

## 진행 방법

1. 사용자가 `.autopus/specs/SPEC-IMAGE-MODEL-001/spec.md` 검토 → 승인 또는 수정 요청
2. 승인 후 Phase 0부터 1릴리즈씩 순차 진행
3. 각 Phase 끝에 acceptance.md의 해당 부분 집합 PASS 확인 후 다음 Phase
4. Phase 5 진입 전 `npm run test:full-flow` baseline 측정 필수 (자동발행 회귀 가드)

## 메모리 룰 준수

- `feedback_no_cascade_fix` — 1 릴리즈당 1-3 파일 fix 한도 (Phase 단위로 강제)
- `feedback_no_speculation` — SPEC/Phase 어디에도 추정 효과 수치 0건
- `feedback_release_pipeline` — 각 Phase 릴리즈마다 빌드→버전업→릴리즈 7단계 + exe 파일명 하이픈 변환 + 패키징 후 더블클릭 테스트
- `project_userdata_split_fix` — Phase 0~7 어디에서도 productName/setName 단독 변경 금지
