# SPEC-CAFE-000 — 카페 모드 기술 검증 스파이크

**Status**: draft
**Created**: 2026-04-14
**Target Start**: 2026-04-20 (Mon)
**Target Complete**: 2026-04-26 (Sun)
**Owner**: 박성현
**Depends**: None (이 프로젝트의 첫 SPEC)

## Why

네이버 카페 자동화 모드(v1.5.0)를 v1.5.0 목표(5/31)까지 완성하려면 6주가 빠듯합니다. Phase A~E 대형 개발에 진입하기 전에 **3개 핵심 기술 가정**이 실증되어야 합니다. 가정 하나라도 실패하면 아키텍처 전체를 재설계해야 하므로, 빠른 검증 스파이크가 필요합니다.

## Assumptions to Validate

### A1: 블로그 로그인 세션이 cafe.naver.com에서 재사용 가능하다
**사전 분석 결과 (코드 레벨)**: **가능성 높음**

근거:
- `src/browserSessionManager.ts:65` — `userDataDir` 방식으로 Chrome 프로필 전체 영속화
- `src/browserSessionManager.ts:243` — `--disable-features=ThirdPartyCookieBlocking,SameSiteByDefaultCookies` 플래그로 쿠키 격리 해제
- `src/naverBlogAutomation.ts:2116` — `NID_AUT`/`NID_SES` 쿠키는 `.naver.com` 와일드카드로 발행 → 서브도메인 공유 가능
- `src/naverBlogAutomation.ts:3632` — warmup 시퀀스에 `https://cafe.naver.com` 이미 포함됨 (부분 검증 완료)

리스크:
- `sessionPersistence.ts` restore 경로가 쿠키 domain을 `blog.naver.com`으로 제한 저장했다면 카페에서 무효

### A2: 카페 글쓰기 에디터가 블로그 SmartEditor ONE과 호환 가능한 DOM 구조다
**사전 분석 결과**: **70% 호환 추정**

근거:
- `editorSelectors.ts`의 `.se-*` 프리픽스 셀렉터가 SmartEditor ONE 공개 네이밍 → 네이버 카페도 SmartEditor ONE 기반이면 일부 재사용 가능
- 블로그는 `#mainFrame` 단일 depth iframe. 카페도 동일 ID 사용할 가능성 있으나 미확인

확인 필요 변수:
1. 카페 글쓰기 페이지의 실제 iframe ID (`#mainFrame` vs 별도)
2. 게시판 선택 UI (native `<select>` vs 커스텀 드롭다운)
3. 게시판 유형별(일반/사진/동영상) 에디터 초기 상태 차이

### A3: 게시판 목록 API를 사용자 세션으로 호출 가능하다
**사전 분석 결과**: **중간** — 브라우저 내부 fetch만 가능

근거:
- `apis.naver.com/cafe-web/cafe2/CafeMenuList.json?cafeId=...` 는 CORS로 인해 Node.js `axios` 직접 호출 불가
- 브라우저 내부 `page.evaluate(() => fetch(...))` 방식으로만 접근 가능
- 쿠키: `NID_AUT`, `NID_SES` / 헤더: `Referer: cafe.naver.com/{clubid}` 필요
- 일부 API는 `cafe_token` 또는 `cafeCsrf` 추가 요구

## Acceptance Criteria

스파이크 완료 = 다음 3개 산출물 전부 획득:

1. **A1 실증**: `NID_AUT` 쿠키의 `domain` 필드가 `.naver.com`임을 확인한 스크린샷 또는 로그, + `cafe.naver.com` 진입 후 로그인 상태 유지 확인
2. **A2 실증**: 실제 카페 글쓰기 페이지 DOM 덤프 파일 (`frames.html`), `#mainFrame` 존재 여부 확정, 사용 가능한 셀렉터 최소 5개 목록
3. **A3 실증**: `CafeMenuList.json` API 응답 샘플 JSON + 요청 헤더 + 필요한 토큰 목록

## Implementation Plan (4/20 월요일)

### Step 1: P1 — 세션 재사용 실증 (예상 30분)

```typescript
// scripts/spike/cafe-session-check.ts
import { NaverBlogAutomation } from '../../src/naverBlogAutomation';

async function main() {
  const automation = new NaverBlogAutomation({
    naverId: process.env.NAVER_ID!,
    naverPassword: process.env.NAVER_PASSWORD!,
  });

  await automation.setupBrowser();
  await automation.loginToNaver();

  // 카페 메인 방문
  const page = (automation as any).page;
  await page.goto('https://cafe.naver.com');
  await page.waitForNetworkIdle({ idleTime: 2000 });

  // 1. 로그인 상태 확인
  const loggedIn = await page.evaluate(() => {
    const el = document.querySelector('[class*="gnb_my_name"], [class*="MyView"]');
    return el ? (el as HTMLElement).innerText : null;
  });
  console.log('카페 로그인 상태:', loggedIn);

  // 2. 쿠키 domain 확인
  const cookies = await page.cookies('https://cafe.naver.com');
  const nidAut = cookies.find((c: any) => c.name === 'NID_AUT');
  console.log('NID_AUT domain:', nidAut?.domain);
  console.log('NID_AUT size:', nidAut?.value?.length);

  // 3. 덤프
  const { dumpFailure } = await import('../../src/debug/domDumpManager');
  await dumpFailure(page, { action: 'SPIKE_A1_SESSION_CHECK' });

  await automation.closeBrowser();
}
main();
```

**Success**: `NID_AUT domain: .naver.com` 출력, `loggedIn !== null`, 덤프 파일 생성
**Failure**: domain이 `blog.naver.com`이거나 loggedIn null → **A1 불가 확정, 카페 전용 로그인 플로우 필요**

### Step 2: P2 — 카페 에디터 DOM 덤프 (예상 1시간)

전제: A1 성공

```typescript
// scripts/spike/cafe-editor-dom.ts
// 매니저 권한 있는 테스트 카페 필요
const TEST_CAFE_ID = 'XXXX'; // 사용자가 제공
const TEST_BOARD_ID = 'L';   // 자유게시판 기본값

async function main() {
  // ... setupBrowser + loginToNaver (위와 동일)
  const page = (automation as any).page;

  // 카페 글쓰기 페이지 진입
  await page.goto(`https://cafe.naver.com/${TEST_CAFE_ID}/ArticleWrite.nhn?boardtype=L`);
  await page.waitForNetworkIdle({ idleTime: 3000 });

  // 1. iframe 구조 덤프
  const frames = page.frames();
  console.log('총 프레임 수:', frames.length);
  for (const f of frames) {
    console.log(`  - ${f.name()} | ${f.url()}`);
  }

  // 2. #mainFrame 존재 여부
  const mainFrame = frames.find((f: any) => f.name() === 'mainFrame' || f.url().includes('mainFrame'));
  console.log('#mainFrame 존재:', !!mainFrame);

  // 3. SmartEditor 셀렉터 확인
  if (mainFrame) {
    const selectorCheck = await mainFrame.evaluate(() => {
      const results: Record<string, boolean> = {};
      const selectors = [
        '.se-main-container',
        '.se-section-text',
        '.se-text-paragraph',
        '.se-editing-area',
        '[contenteditable="true"]',
        '.cafe-editor',
      ];
      for (const s of selectors) {
        results[s] = !!document.querySelector(s);
      }
      return results;
    });
    console.log('셀렉터 매칭:', selectorCheck);
  }

  // 4. 덤프 (중요!)
  const { dumpFailure } = await import('../../src/debug/domDumpManager');
  await dumpFailure(page, {
    action: 'SPIKE_A2_EDITOR_DOM',
    context: { cafeId: TEST_CAFE_ID, boardId: TEST_BOARD_ID }
  });

  await automation.closeBrowser();
}
```

**Success**: `frames.html`에 `#mainFrame` 내용 포함, `.se-main-container` 존재 확인
**Partial Success**: `#mainFrame` 존재하지만 셀렉터 일부만 매칭 → 카페 전용 셀렉터 작성 필요 (예상 1~2일)
**Failure**: `#mainFrame` 부재 or 완전히 다른 구조 → 카페 에디터 재설계 (예상 3~5일)

### Step 3: P3 — 게시판 API 확인 (예상 30분)

전제: A1 성공 (A2와 병렬 가능)

```typescript
// scripts/spike/cafe-api-check.ts
// 위의 setup 후...

const apiResponse = await page.evaluate(async (clubid: string) => {
  try {
    const res = await fetch(
      `https://apis.naver.com/cafe-web/cafe2/CafeMenuList.json?cafeId=${clubid}`,
      {
        credentials: 'include',
        headers: {
          'Referer': `https://cafe.naver.com/${clubid}`,
          'Accept': 'application/json',
        },
      }
    );
    return {
      ok: res.ok,
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body: await res.text(),
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}, TEST_CAFE_ID);

console.log('API 응답:', JSON.stringify(apiResponse, null, 2).substring(0, 2000));
```

**Success**: `status: 200`, JSON body에 `menus: [...]` 배열 포함
**Failure**: 401/403 → 추가 토큰 필요. `events.log`에서 실제 전송된 헤더 분석

## Deliverables

스파이크 완료 시 생성되는 파일:
- `.autopus/specs/SPEC-CAFE-000/research.md` — 실증 결과 요약 (A1/A2/A3 binary 결과)
- `.autopus/specs/SPEC-CAFE-000/acceptance.md` — 다음 단계 진행 조건
- `%APPDATA%/BetterLifeNaver/debug-dumps/{timestamp}_spike_*` — 스크린샷 + HTML + events.log
- `scripts/spike/` — 실증 스크립트 3개 (재현 가능하도록)

## Decision Tree (스파이크 완료 후)

```
A1 결과?
├─ 성공 → 블로그 세션 재사용 (로그인 플로우 재구현 0)
└─ 실패 → cafeLoginFlow.ts 신규 작성 (+1~2일)

A2 결과?
├─ 성공 (#mainFrame + .se-*) → editorHelpers 70% 재사용
├─ 부분 (#mainFrame 있으나 셀렉터 일부) → cafeEditorHelpers 작성 (+1~2일)
└─ 완전 실패 → 카페 에디터 재설계 (+3~5일, Phase A 일정 재조정)

A3 결과?
├─ 성공 → 게시판 목록 자동 크롤링 가능
├─ 토큰 필요 → 토큰 추출 단계 추가 (+0.5일)
└─ 실패 → 사용자 수동 게시판 입력 UI (+1일)
```

## Blocker Conditions

다음 중 하나라도 해당하면 스파이크 중단 + 전체 카페 모드 계획 재검토:
- 네이버가 스파이크 기간 중 로직 변경 (운 나쁜 경우)
- 테스트 카페 매니저 권한 부재 (필수 리소스)
- A1 + A2 둘 다 실패 (카페 모드 구현 비용이 6주 플랜 초과)

## Risk Mitigation

1. **테스트 계정 리스크**: 스파이크 전용 네이버 계정 1개 준비. 본 계정으로 실증 금지 (탐지 시 본 계정 피해)
2. **테스트 카페**: 매니저 권한 있는 개인 카페 생성 후 실증 (공개 카페 사용 금지)
3. **네트워크 기록 유출 방지**: `privacyScrubber.ts`가 자동 적용 — `NID_AUT` 값 등 자동 마스킹
4. **실패 증거 보존**: 모든 dump는 `%APPDATA%/BetterLifeNaver/debug-dumps/` 하위에 자동 저장, 5일 보존

## Next SPEC (스파이크 통과 시)

- **SPEC-CAFE-A-001** — Phase A Part 1: 카페 URL 등록 + 게시판 목록 수동 설정
- **SPEC-CAFE-A-002** — Phase A Part 2: 첫 카페 발행 (매니저 권한 게시판)

## References

- `ARCHITECTURE.md` — 현재 블로그 아키텍처
- `src/debug/domDumpManager.ts` — 자동 덤프 시스템 (v1.4.54)
- `src/browserSessionManager.ts` — 브라우저 세션 공유 패턴
- Memory: `project_cafe_mode_roadmap.md` — 6주 전체 로드맵
