# src/cafe — 네이버 카페 자동화 (v1.5.0+)

> 🚧 **준비 중** — 2026-04-20(월) Phase 0 기술 검증 스파이크 시작 예정
> 로드맵: `.autopus/project/` (gitignored) 및 memory의 `project_cafe_mode_roadmap.md`

## 구조 (예정)

```
src/cafe/
├── automation/         # cafePublisher, cafeEditorHelpers, cafeLoginFlow
├── selectors/          # cafeEditorSelectors, cafeNavSelectors, cafePublishSelectors
├── ipc/                # cafeHandlers (main 프로세스 IPC)
├── services/           # CafeAutomationService
├── ui/                 # cafePanel (렌더러 모듈)
├── prompts/            # base.prompt, mom.prompt, local.prompt, hobby.prompt, business.prompt
├── cafeLimitManager.ts # 카페별 레이트 리밋 + riskMultiplier
├── cafeRuleExtractor.ts# 공지사항 크롤링 → 카페 규칙 추출
├── cafePostValidator.ts# 발행 전 광고성/외부 링크 검증
└── cafeOrchestrator.ts # 다중 카페 우선순위 큐
```

## Phase 계획
- **Phase 0** (4/20~26): 기술 검증 스파이크
- **Phase A** (5/4~17): 카페 글 작성 (매니저 권한)
- **Phase B** (5/18~24): 댓글 자동화
- **Phase C** (5/25~31): 좋아요/공감 + 안정화 + v1.5.0 정식 출시
- **Phase D** (6월): 회원 등급 자동 관리 (이월)
- **Phase E** (6월+): 다중 카페 리스크 분산 (이월)

## 설계 원칙
1. **블로그 코드와 격리** — `src/automation/`는 절대 건드리지 않음
2. **공통 로직은 `src/shared/`로 추출** — PublishAdapter 인터페이스 기반
3. **차단 방지 최우선** — 카페 강퇴는 영구적. 하드 리미트 필수
4. **사용자 경고 필수** — 최초 실행 시 계정 연쇄 피해 리스크 고지

## 시작 커맨드
```bash
/auto idea "네이버 카페 자동화 통합 전략" --multi --ultrathink
# → BS-001 생성 → /auto plan --from-idea BS-001 → SPEC-CAFE-000
```
