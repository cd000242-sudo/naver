# 🔍 예약 발행 postId 디버깅 가이드

## 문제 상황
스케줄 미리보기에서 "글을 찾을 수 없음. postId: (비어있음)" 오류 발생

## 확인 방법

### 1️⃣ 개발자 도구 열기 (F12)

### 2️⃣ 글 생성 후 확인
```javascript
// 콘솔에 입력
console.log('currentPostId:', window.currentPostId);
localStorage.getItem('generatedPosts');
```

**예상 결과:**
```
currentPostId: post_1732512345_abc123
[{"id":"post_1732512345_abc123","title":"이이경, 루머 유포자 고소!","content":"..."}]
```

### 3️⃣ 예약 발행 클릭 후 로그 확인

**콘솔에서 다음 로그를 찾으세요:**
```
[Publish] 예약 발행 postId: post_1732512345_abc123
📝 예약 발행 글 ID: post_1732512345_abc123
```

**만약 이 로그가 없다면:**
- `currentPostId`가 `null`이거나
- `executeBlogPublishing` 함수가 호출되지 않았거나
- 빌드가 제대로 안 된 것입니다.

### 4️⃣ Main 프로세스 로그 확인

**터미널/콘솔에서 다음 로그를 찾으세요:**
```
[Schedule Register] payload.postId: post_1732512345_abc123
[Schedule] 예약 등록: 이이경, 루머 유포자 고소!, postId: post_1732512345_abc123
✅ 글 ID: post_1732512345_abc123
```

**만약 이 로그가 없다면:**
- `payload.postId`가 전달되지 않았거나
- Main 프로세스가 업데이트되지 않은 것입니다.

### 5️⃣ scheduled-posts.json 확인

**파일 위치:**
- 개발 모드: 프로젝트 루트 폴더
- 패키지 모드: `%APPDATA%/Better Life Naver/scheduled-posts.json`

**내용 확인:**
```json
[
  {
    "id": "post-1732512345-abc123",
    "postId": "post_1732512345_abc123",  // ✅ 이 값이 있어야 함!
    "title": "이이경, 루머 유포자 고소!",
    "scheduleDate": "2024-11-24 16:30",
    "status": "scheduled"
  }
]
```

**만약 `postId`가 비어있다면:**
- Main 프로세스의 `scheduledPost` 객체 생성 시 `postId`가 누락된 것입니다.

---

## 해결 방법

### ✅ 방법 1: 앱 재시작
1. 앱 완전 종료 (작업 관리자에서도 확인)
2. 새로 설치한 `Better Life Naver Setup 1.0.1.exe` 실행
3. 새 글 생성 → 예약 발행 → 로그 확인

### ✅ 방법 2: 캐시 삭제
1. `%APPDATA%/Better Life Naver` 폴더 삭제
2. 앱 재실행
3. 환경설정 다시 입력
4. 새 글 생성 → 예약 발행

### ✅ 방법 3: 개발 모드에서 테스트
```bash
cd "c:\Users\박성현\Desktop\리더 네이버 자동화"
npm start
```

개발자 도구(F12)를 열고 위의 로그들을 확인하세요.

---

## 예상되는 문제와 해결

### 문제 1: `currentPostId`가 `null`
**원인:** 글 생성 후 `saveGeneratedPost()`가 호출되지 않음
**해결:** 글 생성 → "생성된 글 목록"에 표시되는지 확인

### 문제 2: `payload.postId`가 전달 안 됨
**원인:** Renderer 프로세스가 업데이트 안 됨
**해결:** 
```bash
npm run build
npm run dist
```

### 문제 3: `scheduled-posts.json`에 `postId` 없음
**원인:** Main 프로세스가 업데이트 안 됨
**해결:** 앱 완전 재시작

---

## 최종 확인 체크리스트

- [ ] `currentPostId`가 콘솔에 표시됨
- [ ] `localStorage`에 글이 저장됨
- [ ] 예약 발행 시 "📝 예약 발행 글 ID: ..." 로그 표시됨
- [ ] Main 프로세스에서 "✅ 글 ID: ..." 로그 표시됨
- [ ] `scheduled-posts.json`에 `postId` 필드가 있음
- [ ] 스케줄 관리 탭에서 미리보기 버튼 클릭 시 정상 작동

모든 항목이 체크되면 정상 작동합니다! ✅




