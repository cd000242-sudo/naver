# Admin Panel 연동 가이드

## 개요

이 프로젝트는 `C:\Users\박성현\Desktop\admin-panel`의 Google Apps Script 기반 라이선스 관리 시스템과 연동됩니다.

## Admin Panel 구조

- **백엔드**: Google Apps Script
- **데이터베이스**: SQLite (`licenses.db`)
- **기능**: 라이선스 코드 발급, 검증, 무효화

## 연동 방법

### 1. 환경 변수 설정

`.env` 파일에 Google Apps Script URL을 추가합니다:

```env
LICENSE_SERVER_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
```

### 2. API 호출 형식

Admin Panel의 Apps Script는 다음 형식으로 호출됩니다:

#### 라이선스 검증 요청
```json
{
  "action": "verify",
  "code": "XXXX-XXXX-XXXX-XXXX",
  "deviceId": "device-unique-id",
  "appVersion": "1.0.0"
}
```

#### 응답 형식
```json
{
  "ok": true,
  "type": "TRIAL7" | "PAID30" | "LIFE",
  "expiresAt": "2025-12-31T23:59:59Z",
  "error": "에러 메시지 (실패 시)"
}
```

### 3. 라이선스 타입 매핑

Admin Panel의 라이선스 타입이 다음과 같이 매핑됩니다:

- `TRIAL7` → `trial` (7일 만료)
- `PAID30` → `standard` (30일 만료)
- `LIFE` → `premium` (영구)

### 4. 사용 방법

#### 앱 시작 시 자동 검증

앱이 시작되면 자동으로 라이선스를 확인합니다:

1. 저장된 라이선스가 있으면 재검증
2. 없으면 라이선스 입력 창 표시
3. Apps Script 서버로 검증 요청
4. 성공 시 라이선스 정보 저장

#### 환경 변수 설정 예시

```bash
# .env 파일
LICENSE_SERVER_URL=https://script.google.com/macros/s/ABC123XYZ/exec
```

또는 빌드 시 설정:

```json
{
  "scripts": {
    "build": "cross-env LICENSE_SERVER_URL=https://script.google.com/macros/s/ABC123XYZ/exec npm run build"
  }
}
```

## Admin Panel에서 라이선스 발급

1. Admin Panel 실행
2. Apps Script URL과 Admin Token 설정
3. 라이선스 타입 선택:
   - **TRIAL7**: 체험 7일
   - **PAID30**: 유료 30일
   - **LIFE**: 무기한
4. 개수와 프리픽스 입력
5. "코드 발급" 버튼 클릭
6. 발급된 코드를 사용자에게 제공

## Apps Script 백엔드 요구사항

Apps Script는 다음 액션을 지원해야 합니다:

### 1. `verify` 액션

라이선스 코드 검증:

```javascript
// Apps Script 예시
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  
  if (data.action === 'verify') {
    const code = data.code;
    const deviceId = data.deviceId;
    
    // 데이터베이스에서 라이선스 조회
    const license = getLicenseFromDB(code);
    
    if (!license) {
      return ContentService.createTextOutput(JSON.stringify({
        ok: false,
        error: '라이선스 코드를 찾을 수 없습니다.'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // 사용 여부 확인
    if (license.used) {
      return ContentService.createTextOutput(JSON.stringify({
        ok: false,
        error: '이미 사용된 라이선스 코드입니다.'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // 만료 확인
    if (license.expiresAt && new Date() > new Date(license.expiresAt)) {
      return ContentService.createTextOutput(JSON.stringify({
        ok: false,
        error: '라이선스가 만료되었습니다.'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // 기기 등록 및 사용 처리
    markLicenseAsUsed(code, deviceId);
    
    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      type: license.type,
      expiresAt: license.expiresAt
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
```

## 테스트

### 1. 로컬 테스트

개발 모드에서는 라이선스 체크가 건너뜀:

```bash
npm run dev
```

### 2. 빌드 후 테스트

```bash
npm run build
npm start
```

### 3. Admin Panel에서 발급한 코드로 테스트

1. Admin Panel에서 라이선스 코드 발급
2. 앱 실행 시 라이선스 입력 창에 코드 입력
3. Apps Script 서버로 검증 요청
4. 성공 시 앱 사용 가능

## 문제 해결

### 서버 연결 실패

- Apps Script URL이 올바른지 확인
- 인터넷 연결 확인
- Apps Script 배포 설정 확인 (웹 앱으로 배포 필요)

### 라이선스 검증 실패

- 라이선스 코드 형식 확인 (XXXX-XXXX-XXXX-XXXX)
- Apps Script 로그 확인
- Admin Panel에서 라이선스 상태 확인

### 만료된 라이선스

- Admin Panel에서 새로운 라이선스 발급
- 기존 라이선스 삭제 후 재입력

## 보안 고려사항

1. **HTTPS 사용**: Apps Script는 기본적으로 HTTPS 사용
2. **토큰 인증**: Admin Panel에서 Admin Token으로 관리
3. **기기 제한**: 라이선스당 최대 기기 수 제한 가능
4. **만료 관리**: Apps Script에서 만료일 자동 관리

## 참고

- Admin Panel 위치: `C:\Users\박성현\Desktop\admin-panel`
- 라이선스 데이터베이스: `admin-panel/licenses.db`
- Apps Script 배포: 웹 앱으로 배포하고 "실행 권한: 모든 사용자"로 설정









