# SPEC-DROPSHOT-2026 — 합격 기준 (acceptance)

## A. Phase 0 — 셀렉터 현행 확인
- [ ] A1: 키트 §3 셀렉터 4종(프롬프트/생성버튼/결과img/i2i input) DevTools로 현행 확인.
- [ ] A2: 세션 판정 텍스트 현행 확인. 변경분은 P1b에 반영.

## B. Phase 1 — 엔진 구현
- [ ] B1: `dropshotGenerator.ts` 존재, `generateWithDropshot(...)→Promise<GeneratedImage[]>` export.
- [ ] B2: export된 유틸만 import(`writeImageFile`/`probeDuplicate`/`computeAHash64`/`applyDiversityHint`). private 유틸은 복제(런처).
- [ ] B3: 결과는 GeneratedImage[](filePath/previewDataUrl/provider:'dropshot'). 키트 {ok,dataUrl}는 내부 헬퍼만.
- [ ] B4: 순수 헬퍼(snapshot diff / quota 텍스트 감지 / i2i URL 매핑) 단위테스트 GREEN.
- [ ] B5: 90초 타임아웃 시 셀렉터 갱신 안내(R13), quota 소진 시 명확 메시지(R11) — silent 실패 없음.
- [ ] B6: 파일 <300줄(autopus) 또는 분할.

## C. Phase 2 — 등록 (SSOT)
- [ ] C1: `types.ts` ImageProvider+ALLOWED_PROVIDER에 'dropshot' → `assertProvider('dropshot')` 통과.
- [ ] C2: `imageEngineCatalog.ts` DROPSHOT 스펙(costKrw 0, koreanText true, freeTierNote "구독료별·무제한") + 카탈로그.
- [ ] C3: `imageGenerator.ts` 분기 + isKoreanTextSupportedEngine에 'dropshot' + **auto/폴백 제외**.
- [ ] C4: `HeadingImageSettings.ts` ActiveImageSource+SOURCE_NAMES 라벨(비용 정직: "무료" 금지).
- [ ] C5: `imageEngineRouting.test.ts` 'dropshot' 라우팅 통과.

## D. Phase 3 — i2i 충실도 게이트
- [ ] D1: i2i(referenceImageUrl/Path → setInputFiles) 1장 수동 smoke 성공.
- [ ] D2: 쇼핑 제품 재현 충실도 수동 평가 → 정확 재현일 때만 SC_IMG2IMG_ENGINES 편입. 미달이면 쇼핑커넥트 제외.

## E. 회귀 (모든 단계)
- [ ] E1: `vitest run` → 신규 실패 0(기존 baseline 대비). Flow/ImageFX 라우팅 무손상.
- [ ] E2: `eslint` 0 errors. `tsc --noEmit` exit 0.
- [ ] E3: 신규 의존성 0(patchright/playwright 기설치 사용).

## F. 정직성 / 리스크
- [ ] F1: UI/문서에 "무료" 아닌 "Pro 구독료별·구독자 무제한" 표기.
- [ ] F2: ToS 리스크 + 셀렉터 staleness + 단일계정 원칙 문서화.
- [ ] F3: 수동 smoke(텍스트→이미지 1장 + i2i 1장 + 세션 재사용 2회차) 성공.

## G. 부채(명시)
- [ ] G1: 런처 중복(§1a) → 추후 `uiAutomation/browserLauncher.ts` 추출+3엔진 dedup 별도 증분으로 기록.
