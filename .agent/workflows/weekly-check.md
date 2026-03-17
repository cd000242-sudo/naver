---
description: 주간 코드 안정성 점검 - 배포 전 필수 체크리스트
---

# 🔍 Weekly Code Health Check

> **목적**: 배포 전 코드 안정성 검증 및 잠재적 버그 사전 탐지
> **주기**: 배포 전 또는 주 1회 실행 권장
> **예상 소요**: 15-30분

---

## 📋 Phase 1: 구조적 무결성 검사 (Structural Integrity)

### 1.1 IPC 핸들러 등록 검증
// turbo
```
모든 preload.ts의 IPC 채널이 main.ts 또는 ipc/*.ts에서 handle 되는지 확인
```

**검증 방법:**
1. `src/preload.ts`에서 `ipcRenderer.invoke('채널명'` 패턴 모두 추출
2. `src/main.ts` 및 `src/main/ipc/*.ts`에서 `ipcMain.handle('채널명'` 패턴 모두 추출
3. preload에 있는데 main에 없는 채널 = **🔴 치명적 버그** (예약발행 안됨 같은 문제)
4. 발견 시 즉시 핸들러 구현

### 1.2 Export/Import 일관성 검증
// turbo
```
모듈에서 export된 함수가 실제로 import되어 사용되는지 확인
```

**검증 방법:**
1. 핵심 모듈(`contentGenerator.ts`, `imageGenerator.ts`, `naverBlogAutomation.ts`) 분석
2. export된 함수 목록 추출
3. 해당 함수가 다른 파일에서 import되어 호출되는지 확인
4. Dead code(사용되지 않는 export) 식별 및 보고

### 1.3 타입 안전성 검사
// turbo
```
any 타입 남용 및 타입 캐스팅 위험 지점 식별
```

**검증 방법:**
1. `(window as any)` 사용 횟수 카운트 → 500개 초과 시 경고
2. `: any` 사용 횟수 카운트 → 1000개 초과 시 경고
3. 신규 추가된 `any` 사용 식별 (git diff 기반)

---

## 📋 Phase 2: 설정 동기화 검증 (Configuration Sync)

### 2.1 localStorage 키 일관성
// turbo
```
동일한 설정이 여러 키로 저장되거나 읽히는지 확인
```

**검증 방법:**
1. 모든 `localStorage.setItem('키명'` 추출
2. 모든 `localStorage.getItem('키명'` 추출
3. 같은 개념의 설정이 다른 키명으로 접근되는지 확인
   - 예: `globalImageSource` vs `imageSource` vs `selectedImageEngine`
4. 불일치 발견 시 통일 방안 제시

### 2.2 config.json ↔ localStorage 동기화
// turbo
```
main process의 config.json과 renderer의 localStorage가 동기화되는지 확인
```

**검증 방법:**
1. `loadConfig()` 호출 지점 확인
2. `saveConfig()` 호출 지점 확인
3. localStorage에서 같은 키 접근하는 곳 확인
4. 동기화 로직 누락 여부 보고

### 2.3 기본값 일관성
// turbo
```
설정의 기본값(fallback)이 모든 곳에서 동일한지 확인
```

**검증 방법:**
1. `|| 'nano-banana-pro'` 같은 fallback 패턴 추출
2. 같은 설정에 대해 다른 기본값이 사용되는 곳 식별
3. 불일치 시 통일

---

## 📋 Phase 3: 핵심 기능 경로 검증 (Critical Path Analysis)

### 3.1 풀오토 발행 경로
// turbo
```
스마트스토어/쿠팡/브랜드스토어 URL → 콘텐츠 생성 → 발행 전체 경로 추적
```

**검증 방법:**
1. `crawlFromAffiliateLink()` 함수 시작점 확인
2. 각 Provider (SmartStoreProvider, CoupangProvider, BrandStoreProvider) 정상 등록 확인
3. `generateStructuredContent()` 호출 경로 확인
4. `naverBlogAutomation.run()` 최종 도달 확인
5. 중간에 throw되거나 early return되는 조건 식별

### 3.2 이미지 생성 경로
// turbo
```
이미지 설정 → 생성 엔진 선택 → 실제 API 호출 경로 추적
```

**검증 방법:**
1. `getGlobalImageSource()` 함수가 반환하는 값 추적
2. `imageHandlers.ts`의 `generate-test-image` 핸들러에서 engine 파라미터 사용 확인
3. 각 엔진별 API 호출 함수 존재 및 정상 동작 확인
   - `generateStabilityImage()`
   - `generateFalImage()`
   - `generateDeepInfraImage()`
   - `generatePollinationsImage()`
   - `generateNanoBananaImage()`

### 3.3 예약 발행 경로
// turbo
```
예약 설정 → 스케줄러 등록 → 실행 경로 추적
```

**검증 방법:**
1. `scheduler:schedulePost` IPC 핸들러 존재 확인
2. `SmartScheduler` 클래스의 `schedulePost()` 메서드 확인
3. 타이머 설정 및 `executePublish()` 호출 경로 확인
4. 발행 완료 후 상태 업데이트 로직 확인

---

## 📋 Phase 4: 최근 변경 영향도 분석 (Change Impact Analysis)

### 4.1 최근 수정 파일 목록
// turbo
```
최근 7일간 수정된 파일 목록 및 변경 규모 확인
```

**검증 방법:**
1. git log 또는 파일 수정 시간 기반으로 최근 변경 파일 추출
2. 변경된 줄 수 확인
3. 핵심 파일(renderer.ts, main.ts, contentGenerator.ts) 변경 시 영향도 상세 분석

### 4.2 의존성 영향 분석
// turbo
```
변경된 함수/모듈을 사용하는 다른 코드 식별
```

**검증 방법:**
1. 변경된 함수 시그니처 확인
2. 해당 함수를 호출하는 모든 곳 grep
3. 호출 시 인자 타입/개수 일치 확인
4. 불일치 시 즉시 수정

---

## 📋 Phase 5: 빌드 및 런타임 검증 (Build & Runtime)

### 5.1 TypeScript 빌드
// turbo
```bash
npm run build
```

**성공 기준:**
- 에러 0개
- 경고는 허용하되 새로운 경고 없어야 함

### 5.2 ESLint 검사 (선택)
// turbo
```bash
npm run lint 2>&1 | head -50
```

**성공 기준:**
- 치명적 에러 0개

### 5.3 핵심 import 검증
// turbo
```
빌드된 JS 파일에서 undefined import 없는지 확인
```

---

## 📋 Phase 6: 결과 보고서 생성

### 6.1 보고서 형식
```markdown
# 주간 코드 점검 보고서
> 점검일: YYYY-MM-DD

## 🔴 치명적 이슈 (즉시 수정 필요)
- [목록]

## 🟠 주의 필요 (배포 전 검토)
- [목록]

## 🟢 정상
- [목록]

## 📊 코드 품질 지표
- (window as any) 사용: N회
- any 타입 사용: N회
- localStorage 키: N개
- 미등록 IPC 핸들러: N개

## ✅ 배포 권장 여부
[권장 / 주의 / 보류]
```

---

## 📋 Phase 7: 런타임 기능 테스트 (Live Testing) 🆕

> **이 Phase는 앱을 실제 실행하여 핵심 기능을 테스트합니다**

### 7.1 앱 실행 테스트
```
1. npm run start로 앱 실행
2. 정상 로드 확인 (에러 없이 메인 화면 표시)
3. 개발자 도구 콘솔에서 에러 없는지 확인
```

### 7.2 핵심 기능 실제 테스트 (브라우저 subagent 사용)
```
1. 스마트스토어 URL 입력 → 크롤링 성공 확인
2. 쿠팡 URL 입력 → 크롤링 성공 확인  
3. 이미지 설정 변경 → 저장 → 앱 재시작 → 유지 확인
4. 테스트 이미지 생성 버튼 클릭 → 이미지 생성 확인
5. 예약 발행 설정 → 목록에 표시 확인
```

### 7.3 테스트 URL 목록 (고정)
```
- 스마트스토어: https://smartstore.naver.com/tosooda/products/10306273518
- 쿠팡: https://www.coupang.com/vp/products/7335597976
- 브랜드스토어: https://brand.naver.com/laneige/products/10000000001
```

**검증 기준:**
- 제품명 추출 성공
- 가격 추출 성공
- 이미지 최소 1개 수집

---

## 📋 Phase 8: 외부 API 헬스체크 🆕

> **외부 서비스 API가 정상 동작하는지 확인**

### 8.1 이미지 생성 API 테스트
```typescript
// 각 엔진별 1회 테스트 호출
- Stability AI: 테스트 이미지 생성 시도
- Fal.ai: 테스트 이미지 생성 시도
- DeepInfra: 테스트 이미지 생성 시도
- Pollinations: 테스트 이미지 생성 시도
```

**검증 방법:**
1. 앱 내 "테스트 이미지 생성" 버튼으로 각 엔진 테스트
2. 실패 시 API 키 만료, 서비스 변경, 요금제 문제 등 원인 분석
3. 실패한 엔진은 fallback 목록에서 우선순위 조정 권장

### 8.2 네이버 로그인 테스트
```
1. 테스트 계정으로 로그인 시도
2. 블로그 에디터 접근 가능 확인
3. CAPTCHA 발생 여부 확인
```

### 8.3 크롤러 API 테스트
```
1. 스마트스토어 모바일 API 호출 테스트
2. 쿠팡 페이지 크롤링 테스트
3. 브랜드스토어 OG 태그 파싱 테스트
```

**실패 시 조치:**
- CSS 선택자 변경 필요 여부 확인
- API 엔드포인트 변경 여부 확인
- Rate limit 정책 변경 여부 확인

---

## 📋 Phase 9: 자동 복구 시스템 검증 🆕

> **Fallback 로직이 정상 동작하는지 확인**

### 9.1 이미지 생성 Fallback 테스트
```
1. 의도적으로 Primary 엔진 실패 유발 (잘못된 API 키)
2. Fallback 엔진으로 자동 전환되는지 확인
3. 최종 이미지 생성 성공 확인
```

### 9.2 크롤러 Fallback 테스트
```
1. 스마트스토어 API 실패 시 → HTML 파싱 fallback 동작 확인
2. 쿠팡 동적 로딩 실패 시 → 정적 HTML fallback 동작 확인
```

### 9.3 에러 핸들링 테스트
```
1. 잘못된 URL 입력 시 적절한 에러 메시지 표시
2. 네트워크 오류 시 재시도 로직 동작
3. API 한도 초과 시 사용자 알림
```

---

## 📋 Phase 10: 사용자 시나리오 종합 테스트 🆕

> **실제 사용자 관점에서 전체 워크플로우 테스트**

### 10.1 풀오토 발행 시나리오 (E2E)
```
1. 스마트스토어 URL 입력
2. "콘텐츠 생성" 클릭
3. 콘텐츠 생성 완료 대기
4. 생성된 제목/본문/이미지 확인
5. "발행하기" 클릭 (draft 모드)
6. 네이버 블로그 에디터 로드 확인
```

### 10.2 연속 발행 시나리오
```
1. 3개 URL 입력
2. 연속 발행 시작
3. 1번째 완료 후 2번째 자동 시작 확인
4. 중간에 "중지" 버튼 동작 확인
```

### 10.3 다중계정 시나리오
```
1. 2개 계정 등록
2. 다중계정 발행 시작
3. 계정 전환 정상 동작 확인
4. 각 계정별 발행 성공 확인
```

---

1. **이 대화에서**: `"weekly-check 실행해줘"` 또는 `"/weekly-check"`
2. **결과**: 위 6개 Phase 순차 실행 후 보고서 생성
3. **조치**: 🔴 이슈 발견 시 즉시 수정, 🟠은 검토 후 판단

---

## 📌 참고: 자주 발생하는 문제 패턴

| 증상 | 원인 | 점검 Phase |
|------|------|-----------|
| "이미지 엔진이 안 바뀜" | 설정 동기화 불일치 | Phase 2 |
| "예약 발행 안 됨" | IPC 핸들러 미등록 | Phase 1.1 |
| "특정 쇼핑몰 안 됨" | Provider 누락/에러 | Phase 3.1 |
| "갑자기 에러" | 최근 변경 영향 | Phase 4 |
| "빌드는 되는데 안 됨" | undefined import | Phase 5.3 |
