# 라이선스 연동 구현 가이드

## 개요

이 문서는 Electron 앱에 라이선스 검증 시스템을 구현하는 방법을 설명합니다.

## 구현된 기능

### 1. 라이선스 관리 모듈 (`src/licenseManager.ts`)

- **라이선스 정보 저장/로드**: 로컬 파일 시스템에 라이선스 정보 저장
- **기기 ID 생성**: 각 기기의 고유 ID 생성 및 저장
- **라이선스 검증**: 서버 또는 로컬에서 라이선스 코드 검증
- **만료 확인**: 라이선스 만료일 확인
- **재검증**: 저장된 라이선스 재검증

### 2. 앱 시작 시 라이선스 검증

- 앱 시작 시 자동으로 라이선스 확인
- 라이선스가 없거나 만료된 경우 입력 창 표시
- 개발 모드에서는 라이선스 체크 건너뜀

### 3. 라이선스 입력 UI

- 모달 창으로 라이선스 코드 입력
- 자동 하이픈 추가 (XXXX-XXXX-XXXX-XXXX 형식)
- 형식 검증

## 사용 방법

### 1. 환경 변수 설정

`.env` 파일에 라이선스 서버 URL 추가 (선택사항):

```env
LICENSE_SERVER_URL=https://your-license-server.com
```

서버 URL이 없으면 로컬 검증 모드로 동작합니다.

### 2. 라이선스 코드 형식

라이선스 코드는 다음 형식을 따릅니다:
- `XXXX-XXXX-XXXX-XXXX` (대문자 알파벳 및 숫자)
- 예시: `DEMO-1234-5678-ABCD`

### 3. 로컬 검증 모드

서버 URL이 없을 때 사용되는 로컬 검증:

- **DEMO-**: 데모 라이선스 (7일 만료)
- **TRIAL-**: 트라이얼 라이선스 (30일 만료)
- **PROD-**: 프로덕션 라이선스 (영구)

## 서버 검증 구현

### 옵션 1: Node.js/Express 서버

```javascript
// server.js
const express = require('express');
const app = express();
app.use(express.json());

// 라이선스 검증 엔드포인트
app.post('/api/verify-license', async (req, res) => {
  const { licenseCode, deviceId, appVersion } = req.body;
  
  // 데이터베이스에서 라이선스 조회
  const license = await db.licenses.findOne({ code: licenseCode });
  
  if (!license) {
    return res.json({ valid: false, message: '라이선스 코드를 찾을 수 없습니다.' });
  }
  
  // 만료 확인
  if (license.expiresAt && new Date() > new Date(license.expiresAt)) {
    return res.json({ valid: false, message: '라이선스가 만료되었습니다.' });
  }
  
  // 기기 등록
  if (!license.devices.includes(deviceId)) {
    if (license.devices.length >= license.maxDevices) {
      return res.json({ valid: false, message: '최대 기기 수를 초과했습니다.' });
    }
    license.devices.push(deviceId);
    await db.licenses.updateOne({ code: licenseCode }, { $set: { devices: license.devices } });
  }
  
  res.json({
    valid: true,
    licenseType: license.type,
    expiresAt: license.expiresAt,
    maxDevices: license.maxDevices,
  });
});

app.listen(3000);
```

### 옵션 2: Firebase Functions

Firebase Functions를 사용하여 서버리스 라이선스 검증 서버를 구축할 수 있습니다.

자세한 내용은 `docs/LICENSE_SERVER_EXAMPLE.md`를 참조하세요.

## 라이선스 타입

### 1. Trial (트라이얼)
- 제한된 기간 사용 가능
- 만료일 설정 가능

### 2. Standard (표준)
- 기본 기능 사용 가능
- 만료일 설정 가능

### 3. Premium (프리미엄)
- 모든 기능 사용 가능
- 영구 라이선스 가능

## API 참조

### `verifyLicense(licenseCode, deviceId, serverUrl?)`

라이선스 코드를 검증합니다.

```typescript
const result = await verifyLicense('DEMO-1234-5678-ABCD', deviceId, 'https://server.com');
if (result.valid) {
  console.log('라이선스 검증 성공');
} else {
  console.error(result.message);
}
```

### `loadLicense()`

저장된 라이선스 정보를 로드합니다.

```typescript
const license = await loadLicense();
if (license && license.isValid) {
  console.log('라이선스 유효');
}
```

### `revalidateLicense(serverUrl?)`

저장된 라이선스를 재검증합니다.

```typescript
const isValid = await revalidateLicense('https://server.com');
```

## 보안 고려사항

1. **HTTPS 사용**: 모든 통신은 HTTPS로 암호화
2. **라이선스 코드 암호화**: 데이터베이스에 암호화하여 저장
3. **디지털 서명**: 라이선스 코드에 서명 추가하여 위조 방지
4. **Rate Limiting**: 무차별 대입 공격 방지
5. **기기 제한**: 라이선스당 최대 기기 수 제한

## 테스트

### 로컬 테스트

1. 개발 모드에서는 라이선스 체크가 건너뜀
2. 빌드된 앱에서 테스트:
   ```bash
   npm run build
   npm start
   ```

### 테스트 라이선스 코드

- `DEMO-0000-0000-0000`: 데모 라이선스 (7일)
- `TRIAL-0000-0000-0000`: 트라이얼 라이선스 (30일)
- `PROD-0000-0000-0000`: 프로덕션 라이선스 (영구)

## 문제 해결

### 라이선스 입력 창이 표시되지 않는 경우

- 개발 모드에서는 라이선스 체크가 건너뜀
- `app.isPackaged`가 `true`인지 확인

### 서버 검증 실패

- 네트워크 연결 확인
- 서버 URL이 올바른지 확인
- 서버 로그 확인

### 라이선스 만료

- 새로운 라이선스 코드 입력
- 라이선스 정보 삭제 후 재입력

## 추가 기능 구현

### 라이선스 정보 표시

메인 UI에 현재 라이선스 정보를 표시할 수 있습니다:

```typescript
const license = await loadLicense();
if (license) {
  console.log(`라이선스 타입: ${license.licenseType}`);
  console.log(`만료일: ${license.expiresAt || '영구'}`);
}
```

### 라이선스 변경

사용자가 라이선스를 변경할 수 있는 기능을 추가할 수 있습니다:

```typescript
await clearLicense();
// 새로운 라이선스 입력 창 표시
```

## 참고 자료

- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [License Server Example](./LICENSE_SERVER_EXAMPLE.md)









