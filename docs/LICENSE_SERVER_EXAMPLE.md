# 라이선스 검증 서버 구현 예시

이 문서는 라이선스 검증 서버를 구축하는 방법을 설명합니다.

## 옵션 1: Node.js/Express 서버

### 1. 서버 구조

```javascript
// server.js
const express = require('express');
const app = express();
app.use(express.json());

// 라이선스 데이터베이스 (실제로는 MongoDB, PostgreSQL 등 사용)
const licenses = {
  'DEMO-1234-5678-ABCD': {
    type: 'trial',
    expiresAt: '2025-12-31T23:59:59Z',
    maxDevices: 1,
    activeDevices: [],
  },
  'PROD-ABCD-EFGH-IJKL': {
    type: 'premium',
    expiresAt: null, // 영구
    maxDevices: 3,
    activeDevices: [],
  },
};

// 라이선스 검증 API
app.post('/api/verify-license', async (req, res) => {
  const { licenseCode, deviceId, appVersion } = req.body;

  const license = licenses[licenseCode];
  
  if (!license) {
    return res.json({
      valid: false,
      message: '라이선스 코드를 찾을 수 없습니다.',
    });
  }

  // 만료 확인
  if (license.expiresAt && new Date() > new Date(license.expiresAt)) {
    return res.json({
      valid: false,
      message: '라이선스가 만료되었습니다.',
    });
  }

  // 기기 수 제한 확인
  if (license.activeDevices.length >= license.maxDevices) {
    if (!license.activeDevices.includes(deviceId)) {
      return res.json({
        valid: false,
        message: `최대 ${license.maxDevices}개의 기기에서만 사용할 수 있습니다.`,
      });
    }
  }

  // 새 기기 등록
  if (!license.activeDevices.includes(deviceId)) {
    license.activeDevices.push(deviceId);
  }

  res.json({
    valid: true,
    licenseType: license.type,
    expiresAt: license.expiresAt,
    maxDevices: license.maxDevices,
  });
});

// 라이선스 재검증 API
app.post('/api/revalidate-license', async (req, res) => {
  const { licenseCode, deviceId } = req.body;

  const license = licenses[licenseCode];
  
  if (!license) {
    return res.json({ valid: false });
  }

  // 기기 등록 확인
  if (!license.activeDevices.includes(deviceId)) {
    return res.json({ valid: false });
  }

  // 만료 확인
  if (license.expiresAt && new Date() > new Date(license.expiresAt)) {
    return res.json({ valid: false });
  }

  res.json({
    valid: true,
    expiresAt: license.expiresAt,
  });
});

app.listen(3000, () => {
  console.log('License server running on port 3000');
});
```

## 옵션 2: Firebase Functions

```javascript
// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.verifyLicense = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { licenseCode, deviceId } = req.body;
  
  const licenseRef = admin.firestore().collection('licenses').doc(licenseCode);
  const licenseDoc = await licenseRef.get();

  if (!licenseDoc.exists) {
    return res.json({ valid: false, message: '라이선스 코드를 찾을 수 없습니다.' });
  }

  const license = licenseDoc.data();
  
  // 만료 확인
  if (license.expiresAt && new Date() > license.expiresAt.toDate()) {
    return res.json({ valid: false, message: '라이선스가 만료되었습니다.' });
  }

  // 기기 등록
  const devices = license.devices || [];
  if (!devices.includes(deviceId)) {
    if (devices.length >= license.maxDevices) {
      return res.json({ valid: false, message: '최대 기기 수를 초과했습니다.' });
    }
    devices.push(deviceId);
    await licenseRef.update({ devices });
  }

  res.json({
    valid: true,
    licenseType: license.type,
    expiresAt: license.expiresAt?.toISOString(),
    maxDevices: license.maxDevices,
  });
});
```

## 옵션 3: Google Cloud Functions

```javascript
// index.js
const functions = require('@google-cloud/functions-framework');

functions.http('verifyLicense', async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { licenseCode, deviceId } = req.body;
  
  // Firestore에서 라이선스 조회
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp();
  }

  const db = admin.firestore();
  const licenseRef = db.collection('licenses').doc(licenseCode);
  const licenseDoc = await licenseRef.get();

  if (!licenseDoc.exists) {
    return res.json({ valid: false, message: '라이선스 코드를 찾을 수 없습니다.' });
  }

  const license = licenseDoc.data();
  
  // 검증 로직...
  
  res.json({ valid: true, licenseType: license.type });
});
```

## 환경 변수 설정

`.env` 파일에 라이선스 서버 URL 추가:

```env
LICENSE_SERVER_URL=https://your-license-server.com
```

또는 `package.json`의 빌드 스크립트에서 설정:

```json
{
  "scripts": {
    "build": "cross-env LICENSE_SERVER_URL=https://your-server.com npm run build"
  }
}
```

## 보안 고려사항

1. **HTTPS 사용**: 모든 통신은 HTTPS로 암호화
2. **API 키**: 서버에 API 키 인증 추가
3. **Rate Limiting**: 무차별 대입 공격 방지
4. **암호화**: 라이선스 코드를 암호화하여 저장
5. **서명 검증**: 라이선스 코드에 디지털 서명 추가

## 라이선스 코드 생성 예시

```javascript
const crypto = require('crypto');

function generateLicenseCode(type = 'standard') {
  const prefix = type === 'trial' ? 'TRIAL' : type === 'premium' ? 'PROD' : 'DEMO';
  const random = crypto.randomBytes(12).toString('hex').toUpperCase();
  const code = `${prefix}-${random.substring(0,4)}-${random.substring(4,8)}-${random.substring(8,12)}`;
  return code;
}

// 사용 예시
const licenseCode = generateLicenseCode('premium');
console.log(licenseCode); // PROD-A1B2-C3D4-E5F6
```









