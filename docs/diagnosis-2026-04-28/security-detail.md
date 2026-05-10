# security-auditor 상세 보고서

**감사일:** 2026-04-28 / **앱:** Better Life Naver v2.7.27 / **기준:** OWASP Top 10 + Electron 보안

## 결함 카드

### 🔴 SEC-001 — `.env` 평문 키 인스톨러 패키지

**심각도:** CRITICAL  
**위치:** `package.json` L186-192 (수정 전)

```json
{ "from": ".env", "to": ".env", "filter": ["**/*"] }
```

**영향:**
- electron-builder가 `extraResources`를 `app.getPath('appData')` 또는 `process.resourcesPath` 아래에 평문 복사
- 배포된 .exe 인스톨러 = 사용자 PC의 `resources/.env`에 OPENAI_API_KEY가 평문으로 추출됨
- 개발자 노트북에 저장된 키가 그대로 모든 사용자에게 배포되는 구조

**패치 (이번 세션 적용 완료):**
```diff
- { "from": ".env", "to": ".env", "filter": ["**/*"] },
```

**검증 절차:**
1. `npm run build`로 dist 생성
2. `npm run pack` (electron-builder --dir) 실행
3. `release_final/win-unpacked/resources/`에 `.env`가 없어야 함

---

### 🔴 SEC-002 — `.env` git 추적 + .gitignore 누락

**심각도:** CRITICAL  
**위치:** `.gitignore`(수정 전 — `.env.release`만 있음), git index

**확인 결과:**
- `git ls-files .env` → `.env` 추적 중
- `git log --all --oneline -- .env` → c03b2233 Initial commit에만 등록
- `git show c03b2233:.env` → 빈 파일 (✅ 과거 커밋엔 키 노출 없음)
- 현재 워킹 트리 .env에는 OPENAI 키 평문 존재 (커밋 전)

**패치 (이번 세션 적용 완료):**
```diff
+ # 🚨 [v2.7.27 SECURITY] API 키 평문 저장. 빌드/git 둘 다 절대 포함 금지.
+ .env
+ .env.local
.env.release
```
+ `git rm --cached .env` 실행 → 추적 해제, 디스크 파일은 유지

**과거 빌드 위험성:**
- 만약 직전 빌드(v2.7.20-v2.7.24 등) 시점에 `.env`에 다른 사용자 키가 있었다면 그 빌드는 모두 노출 상태
- `release_final/` 또는 GitHub releases에 업로드된 산출물 점검 필요

---

### 🔴 SEC-003 — 채팅에 노출된 OpenAI 키 미회수

**심각도:** CRITICAL (사용자 행동 필요)  
**노출 키 2개:**
- 이전 키: `sk-proj-...xbkA` (v2.7.21 이전부터 사용)
- 현재 키: `sk-proj-6GFvKgatRUu...wA` (이번 세션에서 .env에 저장)

**조치:**
1. https://platform.openai.com/api-keys 접속
2. 위 두 키 모두 **Revoke** 버튼 클릭
3. 새 시크릿 키 발급
4. `.env`에 새 키 작성 (이제 git/빌드 둘 다 격리됨)
5. 진단 재실행: `node scripts/test-openai-image.mjs`로 새 키 정상 작동 확인

---

### 🟠 SEC-004 — IPC 검증 패턴 미점검 (감사 미완)

**심각도:** HIGH (점검 필요)  
**범위:** `src/main/ipc/*` (10+ 핸들러 파일)

`security-auditor` 에이전트가 종료되어 다음 항목 미점검:
- `ipcMain.handle` 입력 검증 (path traversal: `../../../`)
- `ipcMain.on` 신뢰할 수 없는 입력의 직접 fs/exec
- BrowserWindow 옵션:
  - `contextIsolation: true` 적용 여부
  - `nodeIntegration: false` 적용 여부
  - `sandbox: true` 적용 여부
  - `webSecurity: true` 적용 여부
- preload.ts contextBridge 노출 API 개수 / 위험성

→ Phase 2 reviewer에 위임 권고.

---

### ⚪ 미점검 영역 (보강 라운드 필요)

| 영역 | 점검 포인트 |
|---|---|
| 로그 누출 | `bln-startup-debug.log`, `bln-watchdog.log`, `bln-runtime-stats.json`에 키/세션/쿠키 포함 여부 |
| 자동 업데이트 | electron-updater HTTPS, signature 검증 |
| 원격 셀렉터 | `src/automation/selectors/remoteUpdate.ts` 서명 검증 |
| Prompt injection | 사용자 텍스트 → LLM 프롬프트 직접 주입 위치 |
| 외부 HTML | 네이버 페이지 HTML이 evaluation에 들어가는 경로 |

## 즉시 조치 요약

| 항목 | 상태 |
|---|---|
| package.json `.env` extraResources 제거 | ✅ 완료 |
| .gitignore에 .env 추가 | ✅ 완료 |
| `git rm --cached .env` | ✅ 완료 |
| OpenAI 키 2개 회수 | ⚠️ 사용자 행동 필요 |
| 새 키 발급 및 .env 교체 | ⚠️ 사용자 행동 필요 |
| 직전 빌드 .env 포함 여부 검증 | ⚠️ 사용자 검증 필요 |
| IPC 검증 패턴 점검 | 🔄 Phase 2 reviewer 위임 |
