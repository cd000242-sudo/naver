# GAS 쓰기 액션 추가 (사장님 작업)

## 왜 필요한가

배포된 GAS 는 지금 **읽기 전용**입니다. 실측으로 확인했습니다:

| 액션 | 상태 |
|---|---|
| `get-notices` | ✅ 작동 (공지 읽기) |
| `site-content` | ✅ 작동 (요금제·다운로드 읽기) |
| `save-notices` | ❌ `Unknown action` |
| `site-content-save` | ❌ `Unknown action` |

어드민의 저장 버튼은 전부 **폐지된 Vultr API** 로 향합니다. 그래서:

- 올리신 공지가 아무 데도 저장되지 않고 사라졌습니다
- 다운로드 URL 이 빈 값·낡은 버전으로 굳어 고칠 방법이 없었습니다
- 요금제·홈 문구도 마찬가지입니다

**아래 코드를 GAS 에 붙여넣으면 저장 기능이 살아납니다.**

---

## 붙여넣을 코드

GAS 편집기(`script.google.com` → 해당 프로젝트 → `Code.gs`)에서
`doGet` 의 `switch (action)` 안에 case 두 줄을 추가하고,
파일 맨 아래에 함수 두 개를 붙여넣으세요.

### 1) doGet 의 switch 안에 추가

```javascript
    case 'save-notices':
      return handleSaveNotices(e);

    case 'site-content-save':
      return handleSiteContentSave(e);
```

### 2) 파일 맨 아래에 추가

```javascript
// ═══════════════════════════════════════════════════════════
//  쓰기 액션 — Vultr 폐지 후 저장 경로 복구
//  관리자만 호출해야 하므로 ADMIN_WRITE_TOKEN 스크립트 속성으로 보호한다.
// ═══════════════════════════════════════════════════════════

/** 스크립트 속성 ADMIN_WRITE_TOKEN 과 일치해야 쓰기를 허용한다. */
function checkWriteToken_(e) {
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_WRITE_TOKEN');
  if (!expected) return '서버에 ADMIN_WRITE_TOKEN 이 설정되지 않았습니다.';
  var got = (e && e.parameter && e.parameter.token) || '';
  if (got !== expected) return '쓰기 권한이 없습니다.';
  return '';
}

/** 공지 저장. payload 는 JSON 배열 문자열. */
function handleSaveNotices(e) {
  var callback = (e.parameter && e.parameter.callback) || 'callback';
  var denied = checkWriteToken_(e);
  if (denied) return jsonpResponse(callback, { ok: false, error: denied });

  var raw = (e.parameter && e.parameter.payload) || '';
  var notices;
  try {
    notices = JSON.parse(raw);
  } catch (err) {
    return jsonpResponse(callback, { ok: false, error: 'payload 파싱 실패' });
  }
  if (!Array.isArray(notices)) {
    return jsonpResponse(callback, { ok: false, error: 'payload 는 배열이어야 합니다.' });
  }
  // 0건 저장은 실수일 가능성이 크다. 지우려면 명시적으로 allowEmpty=1 을 준다.
  if (notices.length === 0 && (e.parameter.allowEmpty || '') !== '1') {
    return jsonpResponse(callback, { ok: false, error: '공지 0건 저장은 allowEmpty=1 이 필요합니다.' });
  }

  PropertiesService.getScriptProperties()
    .setProperty('HOME_NOTICES_JSON', JSON.stringify(notices));
  return jsonpResponse(callback, { ok: true, success: true, saved: notices.length });
}

/** 사이트 콘텐츠 저장(요금제·다운로드·홈 문구). payload 는 JSON 객체 문자열. */
function handleSiteContentSave(e) {
  var callback = (e.parameter && e.parameter.callback) || 'callback';
  var denied = checkWriteToken_(e);
  if (denied) return jsonpResponse(callback, { ok: false, error: denied });

  var raw = (e.parameter && e.parameter.payload) || '';
  var content;
  try {
    content = JSON.parse(raw);
  } catch (err) {
    return jsonpResponse(callback, { ok: false, error: 'payload 파싱 실패' });
  }
  if (!content || typeof content !== 'object') {
    return jsonpResponse(callback, { ok: false, error: 'payload 는 객체여야 합니다.' });
  }
  content.updatedAt = new Date().toISOString();
  PropertiesService.getScriptProperties()
    .setProperty('SITE_CONTENT_JSON', JSON.stringify(content));
  return jsonpResponse(callback, { ok: true, success: true });
}
```

### 3) 기존 읽기 액션이 저장분을 보게 하기

`get-notices` 와 `site-content` 핸들러 맨 앞에 아래를 넣어, 저장된 값이 있으면
그걸 먼저 돌려주게 합니다. (없으면 기존 동작 그대로)

```javascript
  // 관리자가 저장한 값이 있으면 우선한다.
  var savedNotices = PropertiesService.getScriptProperties().getProperty('HOME_NOTICES_JSON');
  if (savedNotices) {
    try {
      return jsonpResponse(callback, { success: true, notices: JSON.parse(savedNotices) });
    } catch (err) { /* 깨졌으면 무시하고 기존 경로로 */ }
  }
```

`site-content` 쪽은 `HOME_NOTICES_JSON` 을 `SITE_CONTENT_JSON`,
`{ success: true, notices: ... }` 를 `{ ok: true, content: ... }` 로 바꾸면 됩니다.

---

## 4) 쓰기 토큰 설정

GAS 편집기 → 좌측 **⚙️ 프로젝트 설정** → **스크립트 속성** → 속성 추가

| 속성 | 값 |
|---|---|
| `ADMIN_WRITE_TOKEN` | 아무도 모르는 긴 문자열 (예: 32자 랜덤) |

이 토큰이 없으면 저장이 전부 거부됩니다. **채팅·이메일에 붙여넣지 마세요.**

---

## 5) 배포

GAS 편집기 우측 상단 **배포 → 배포 관리 → 편집(연필) → 버전: 새 버전 → 배포**

기존 배포를 **수정**해야 URL 이 그대로 유지됩니다. 새로 만들면 URL 이 바뀌어
사이트·어드민을 전부 고쳐야 합니다.

---

## 왜 토큰으로 막는가

이 GAS 주소는 사이트 소스에 그대로 들어 있어 누구나 볼 수 있습니다.
읽기는 어차피 공개 정보라 괜찮지만, 쓰기가 무방비면 아무나 공지를 바꾸거나
다운로드 주소를 남의 파일로 갈아치울 수 있습니다.

토큰은 브라우저에 저장하지 않고 관리자가 저장할 때마다 입력하는 방식이
가장 안전합니다. 어드민 쪽 연결은 이 문서대로 GAS 를 올리신 뒤 작업합니다.
