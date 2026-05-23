# HANDOFF — SPEC-NAVER-PROTECTION-2026 Phase 0 (Baseline 측정)

> 작업 디렉터리: `c:\Users\박성현\Desktop\리더 네이버 자동화\`
> 본 파일이 P0 시작 인덱스. SPEC 4파일은 `.autopus/specs/SPEC-NAVER-PROTECTION-2026/`
> 이전 핸드오프: HANDOFF-ISSUE-3.md (이슈 3 SPEC 작성 완료)

## 1. 사용자 결정 (2026-05-24)

- ✅ **SPEC 4파일 승인** — spec.md / plan.md / acceptance.md / research.md
- ✅ **60분 발행 인터벌 floor 수용** — 다계정 분산으로 보완 (10계정 × 24건/일 = 4.2일/1000큐)
- ✅ **Bright Data / IPRoyal residential proxy 도입 검토** — P1 진입 전 회선 풀 구매 필요

## 2. P0 — 격차 확정 + Baseline 측정 (2일, docs only)

### 2.1 측정 의무 항목 (사용자 직접 실행)

| # | 항목 | 측정 방법 | 결과 기록 위치 |
|---|------|----------|----------------|
| 1 | 단일계정 6큐 baseline 트리거율 | `npm run start` → 단일계정 6큐 풀오토 1회 → 보호조치 모달 발생 횟수 | acceptance.md §2.2 baseline 컬럼 |
| 2 | 발행 시간 baseline P50 | 동상 측정 후 telemetry publishDurationMs 평균 | acceptance.md §2.8 baseline |
| 3 | 휴먼 타이핑 baseline | 사용자 직접 30+ 세션 키스트로크 기록 (별도 키로거 또는 IsHumanCadence 도구) | `tests/data/human-typing-baseline.json` 신규 |
| 4 | CreepJS 현재 탐지율 | 앱 실행 → puppeteer-stealth 활성 페이지에서 https://abrahamjuliot.github.io/creepjs/ 방문 → 점수 캡처 | acceptance.md §2.3 |
| 5 | WebRTC leak 현황 | 동상 페이지에서 https://browserleaks.com/webrtc 방문 → leak 여부 캡처 | acceptance.md §2.7 |
| 6 | DNS leak 현황 | https://browserleaks.com/dns | acceptance.md §2.7 |

### 2.2 Proxy 인프라 결정 (P1 진입 전)

**Bright Data vs IPRoyal 비교** (research.md §4 인용):

| 항목 | Bright Data | IPRoyal | Oxylabs | Smartproxy |
|------|-------------|---------|---------|-----------|
| 단가 (residential) | $2.50~$4/GB | $1.75/GB | $2.50~$6/GB | $8.5/GB (구독 인하) |
| 한국 회선 trust | 우위 (KR mobile carrier 포함) | KR 회선 다수 | KR mobile carrier | 부분 |
| sticky session | ✓ (계정당 IP 고정) | ✓ | ✓ | ✓ |
| API + dashboard | 강력 | 보통 | 강력 | 보통 |
| 권장 | **대규모(10계정+)** | **소규모(2~5계정) 비용 우위** | 대규모 | 시범 |

**회선 수 산정** (5계정 가정):
- 5 회선 sticky 매핑 × 월 1~3GB = 5~15GB/월
- IPRoyal: $8.75~$26.25/월
- Bright Data: $12.50~$60/월

**선행 작업**:
1. 사용자가 Bright Data 또는 IPRoyal 계정 생성 → API key + 회선 풀 발급
2. `account/proxyMapping.ts` 신규 (P1 Fix 1.4)에서 사용할 회선 ID 목록 확정
3. opt-in 옵션: IPQS/AbuseIPDB API key (Fix 1.5)

### 2.3 P0 완료 조건

- [ ] Baseline 측정 6건 모두 acceptance.md에 수치 기록
- [ ] Proxy 공급자 선택 + 계정 생성 + 회선 풀 발급
- [ ] research.md 격차 매트릭스 (§3) 사용자 최종 확인
- [ ] P1 진입 시 영향 받을 사용자 운영 패턴 검토 (60분 floor 유예 기간 등)

## 3. P0 산출물 위치

| 파일 | 상태 | 비고 |
|------|------|------|
| `.autopus/specs/SPEC-NAVER-PROTECTION-2026/spec.md` | ✅ | 207줄 |
| `.autopus/specs/SPEC-NAVER-PROTECTION-2026/plan.md` | ✅ | 399줄 |
| `.autopus/specs/SPEC-NAVER-PROTECTION-2026/acceptance.md` | ✅ | 186줄 (baseline 컬럼 측정 후 채울 것) |
| `.autopus/specs/SPEC-NAVER-PROTECTION-2026/research.md` | ✅ | 267줄 |

## 4. P1 진입 게이트 (Phase 0 종료 후)

다음 모두 충족 시 P1 진입:

1. P0 baseline 6건 측정 완료
2. Proxy 공급자 + 회선 풀 확정
3. 사용자가 P1 Fix 1.1~1.5 검토 및 진행 승인
4. reviewer agent로 P1 영향 파일 LOC 측정 → E1 cascade gate 검수 (god file 침범 카운터 ≤3)
5. 신규 vitest baseline 5~10건 작성 (selectors 회귀 가드)

## 5. P0~P1 다음 세션 시작 명령어 (제안)

```
HANDOFF-SPEC-NAVER-PROTECTION-2026-P0.md 읽고 P0 baseline 측정 결과 확인.
1) baseline 6건 acceptance.md에 기록
2) proxy 공급자 결정 → 회선 풀 발급 완료 확인
3) 위 둘 통과 시 P1 Fix 1.1 (셀렉터 remoteUpdate 활성화) executor spawn
```

## 6. 30팀 보고서 신뢰도 (P0 진입 전 확인)

다음 보고서는 재검증 필요:

- **B6 explorer-multi-account**: 탐색 도중 종료 (요약만 일부). multiAccountManager.ts 흐름 재spawn 권장 — P2 Fix 2.1 (계정ID 인자 추가) 진입 전
- **E1·E2 reviewer**: 미커밋 SPEC-IMAGE-MODEL-001 diff를 god file context로 잘못 분석. 본 SPEC plan.md §5.1에서 직접 재구성됨. E1 cascade gate 재검증은 매 Phase 진입 전 별도 reviewer spawn

## 7. 관련 파일

- HANDOFF-ISSUE-3.md (이슈 3 SPEC 작성 완료 기록)
- HANDOFF-NEXT-SESSION.md, HANDOFF-DESKTOP-IMAGE*.md (미커밋, 별도 처리)
- [[project_spec_naver_protection_2026]] 메모리
- CLAUDE.md (Key Modules 섹션 — 본 SPEC 영향 파일 매핑)

## 8. 미커밋 정리 (선행 필요)

본 세션에서 생성된 파일:
- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/spec.md` (untracked)
- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/plan.md` (untracked)
- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/acceptance.md` (untracked)
- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/research.md` (untracked)
- `HANDOFF-SPEC-NAVER-PROTECTION-2026-P0.md` (untracked, 본 파일)

기존 미커밋 (이전 세션부터 누적):
- SPEC-IMAGE-MODEL-001 Phase 0~7a 변경 (E2 reviewer가 잘못 분석한 영역)
- HANDOFF*.md 다수 untracked

**사용자 명시 동의 후** Lore 포맷 commit 권장. 본 SPEC 4파일만 단독 commit 가능 (다른 미커밋과 분리).
