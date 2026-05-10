# security-auditor 요약 — 보안 감사 (v2.7.27)

**감사일:** 2026-04-28 / **기준:** OWASP Top 10 + Electron 보안 모범사례

## 결함 분류

| 심각도 | ID | 결함 | 위치 | 즉시 조치 |
|---|---|---|---|---|
| 🔴 **CRITICAL** | SEC-001 | `.env` 평문 OPENAI 키가 `extraResources`로 인스톨러에 패키지됨 → 모든 사용자에게 키 평문 배포 | `package.json` L186-192 | ✅ 패치 완료 (이번 세션) |
| 🔴 **CRITICAL** | SEC-002 | `.env`가 `.gitignore`에 없어 git 추적 중 + 초기 커밋에 빈 파일로 등록되어 있음 | `.gitignore` / git index | ✅ 패치 완료 (gitignore 추가 + git rm --cached) |
| 🔴 **CRITICAL** | SEC-003 | 사용자가 채팅에 노출한 OPENAI 키 `sk-proj-...xbkA`(이전), `sk-proj-...uROl25wA`(현재) 회수 안 함 | OpenAI dashboard | ⚠️ **사용자 행동 필요** |
| 🟠 HIGH | SEC-004 | (security-auditor가 종료되어 IPC 검증 패턴 확인 미완) — IPC 핸들러 입력 검증 추가 점검 필요 | `src/main/ipc/*` | Phase 2 reviewer로 이관 |

## 즉시 조치 사항 (사용자)

1. **OpenAI 키 2개 모두 즉시 회수**
   - https://platform.openai.com/api-keys
   - 회수 대상: `sk-proj-...xbkA` (이전 키), `sk-proj-...25wA` (방금 .env에 저장된 키)
   - 새 키 발급 → `.env`에 교체 (이제 git 추적 안 됨, 빌드 포함 안 됨)

2. **이전 빌드 회수 여부 점검**
   - 이미 사용자에게 배포된 v2.7.x 인스톨러가 있다면 **그 안에 `.env`가 포함되어 있을 가능성**
   - 직전 5개 빌드 (`release_final/`)를 확인해 `.env` 포함 여부 검증
   - 포함된 빌드가 있었다면 → 해당 키는 모두 노출된 것으로 간주, GitHub releases에서 즉시 제거

## 이번 세션 패치 내역

| 변경 | 파일 | 효과 |
|---|---|---|
| `extraResources`에서 `.env` 항목 제거 | `package.json` | 다음 빌드부터 인스톨러에 .env 비포함 |
| `.env` / `.env.local` 추가 | `.gitignore` | git 추적 차단 |
| `git rm --cached .env` | git index | 추적 해제 (디스크 파일은 유지) |

## 미진단 영역 (security-auditor 종료로 미완)

- BrowserWindow `contextIsolation` / `nodeIntegration` / `sandbox` 설정 점검
- IPC 핸들러별 입력 검증 (path traversal, command injection)
- 원격 셀렉터 업데이트 서명 검증
- 로그 파일 (`bln-*.log`)의 민감정보 포함 여부

→ Phase 2 reviewer 또는 별도 보강 라운드로 이관 권고.
