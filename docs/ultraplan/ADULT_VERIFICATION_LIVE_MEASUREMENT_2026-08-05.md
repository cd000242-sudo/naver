# 성인인증 라이브 실측 (2026-08-05)

사용자 제공 링크로 Playwright 직접 실측. ULTRA 플랜 D3(선행 조건) 해소.

## 대상

- 단축 링크: `https://naver.me/GT42MEXe`
- 리다이렉트: `brandconnect.naver.com/affiliates/980899282397440?channelProductNo=8464207616`
- 최종 상품: `smartstore.naver.com/makkaejoo_market/products/8464207616`
- 상품명: `오디와인 13도 750ml 선물세트 동진부안참뽕와인 스위트 레드 (케이스, 쇼핑백 포함)`
- 스토어: 마깨주 전통주 — **주류(성인인증 대상) 확인됨**

## 상태 A — 인증 미완료 (성인 게이트)

```
URL    : https://nid.naver.com/nidlogin.login?a_version=2&svctype=128
         &url=https%3A%2F%2Fsmartstore.naver.com%2Fmakkaejoo_market%2Fproducts%2F8464207616...
         &surl=...&realname=Y
title  : NAVER 로그인
body   : 134자
본문   : "본문 바로가기 / 네이버 / 서비스 이용을 위해 연령확인이 필요해요 /
          아이디 또는 전화번호 / 비밀번호 / 로그인 상태 유지 / IP 보안 / ON / 로그인 /
          QR 코드 로그인 / 아이디 찾기 / 비밀번호 찾기 / 회원가입 / 스마트봇 상담 /
          고객센터 / 한국어 / © NAVER Corp."
```

**결정적 신호 (실측 확인 순):**

| 우선 | 신호 | 값 | 오탐 위험 |
|---|---|---|---|
| 1 | URL 쿼리 `realname=Y` | 있음 | 없음 — 실명/연령 확인 요구 전용 파라미터 |
| 2 | 호스트 + 경로 `nid.naver.com/nidlogin.login` | 있음 | 낮음 (일반 로그인도 해당 → 3번과 조합) |
| 3 | 본문 `연령확인` / `연령 확인` | "연령확인이 필요해요" | 낮음 |
| 4 | `document.title === 'NAVER 로그인'` | 일치 | 로그인 일반과 공유 |

**본문 길이 134자** — `crawlerBrowser.ts`의 `bodyText < 1500` 길이 게이트(v2.11.134 오탐 방벽)를 그대로 통과한다. 기존 계약 승계 가능.

**기존 계획의 정규식 후보 대조** — 실측에 존재하지 않는 것:
`성인\s*인증`(없음), `19세`(없음), `미성년자`(없음), `청소년\s*유해`(없음), `본인\s*확인`(없음).
→ 실측 없이 이 패턴들만 넣었다면 **감지 실패**했다. D3를 선행 조건으로 둔 판단이 옳았다.

## 상태 B — 인증 완료 (로그인 세션 보유)

```
URL    : https://smartstore.naver.com/makkaejoo_market/products/8464207616
title  : 오디와인 13도 750ml 선물세트 동진부안참뽕와인 스위트 레드 (케이스, 쇼핑백 포함) : 마깨주 전통주
body   : 6,966자
쿠키   : NID_SES 등 네이버 세션 쿠키 보유
```

세션이 있으면 성인 상품도 **정상 크롤링 가능**하다. 사용자 요구("로그인·인증 완료 후 제품창이 뜨면 크롤링 진행")가 기술적으로 성립함을 확인.

## 상태 C — 세션 없이 직접 요청

```
fetch(productUrl, { credentials: 'omit' })
→ HTTP 429
→ <title>[에러] 에러페이지 - 시스템오류</title>  (22,586자)
```

세션 없는 직접 요청은 성인 게이트가 아니라 **봇 차단(429)** 으로 떨어진다.
`ERROR_PAGE_INDICATORS`(types.ts:100-113)가 잡는 기존 에러 페이지 계통이며,
성인인증과는 **다른 상태**다. 두 상태를 같은 분기로 묶으면 안 된다.

## 상태 A-2 — 로그인 후 성인인증 절차 (2차 실측에서 발견)

사용자 지적: *"성인인증을 해서 2차인증하니까 풀리는 것 같은데, 2차인증이 안 되어
있는 사람들은 인증을 제대로 해야 할 것"* → 세션을 잃은 뒤 재접근해 캡처.

```
URL   : https://nid.naver.com/user2/help/realNameCheck?m=viewAdultUserAuth&token_help=...
title : 회원정보 : 실명확인
body  : 322자
본문  : "1년에 한 번, 나이 확인이 필요합니다."
        "이 정보내용은 청소년유해매체물로서 정보통신망 이용촉진 및 정보보호 등에 관한
         법률 및 청소년 보호법에 따라 19세 미만의 청소년이 이용할 수 없습니다."
        "19세 이상입니다. 생일이 2007.12.31. 이전"
        "휴대폰으로 문자 인증하기 / 아이핀으로 인증"
동반탭 : https://nid.naver.com/user2/rncheck/authMobile?m=viewBeginIpin&isIpin=Y
```

**초판 정책이 이 화면을 완전히 놓쳤다.** 세 신호가 전부 빗나갔다:

| 초판 신호 | 이 화면 | 결과 |
|---|---|---|
| `realname=Y` | 없음 (URL이 다름) | ✗ |
| `nidlogin.login` | 아님 (`user2/help/realNameCheck`) | ✗ |
| 본문 "연령확인" | 없음 ("**나이** 확인") | ✗ |

→ `detectAccessGate` = `'none'` → 인증 화면을 **상품 페이지로 오인**하는 상태.

역설적으로, 1차 실측에서 "실제 화면에 없다"며 제외했던 `청소년 유해`·`19세`·
`실명확인` 패턴이 **이 화면에는 있었다**. 1차 실측이 1단계(로그인 인터스티셜)만
본 탓이다.

## 설계 전환 — 변종 열거를 포기한다

게이트는 최소 3단계이고 각 단계 화면이 다르다. 네이버가 단계를 추가하면 열거
방식은 또 뚫린다. 그래서 판정 축을 바꿨다:

1. **위치 기반 1차 판정** — `nid.naver.com` 도메인에 있으면 단계와 무관하게
   "아직 상품 페이지가 아니다". 세부 종류(성인/로그인)는 안내 문구 선택에만 쓴다.
2. **완료는 긍정 판정** — `isProductPageReady()`: 인증 도메인이 아니고, 게이트
   신호가 없고, 본문이 1,500자 이상일 때만 진행한다.
   "게이트가 안 보인다"로 끝내면 미지의 중간 화면에서 성급히 진행한다.

## 판정 규칙 결론

```
nid.naver.com 도메인 (단계 무관)         → 게이트 확정
  ├ URL 마커: realname=Y | viewAdultUserAuth
  │           | realNameCheck | /rncheck/ | viewBeginIpin  → 'adult-verification'
  ├ 문구: 연령확인 | 나이확인 | 청소년유해
  │       | 실명확인 | 19세미만 | 성인인증                    → 'adult-verification'
  └ 그 외                                                   → 'login-required'

인증 도메인 밖 + 위 URL 마커/문구                            → 'adult-verification'
429 / 에러페이지                                             → 기존 에러 경로 (성인 아님)
그 외                                                        → 'none'

완료 판정 isProductPageReady():
  인증 도메인 아님 AND 게이트 없음 AND 본문 ≥ 1,500자
```

본문 키워드 판정은 `bodyText.trim().length < 1500`일 때만 신뢰한다
(상품 상세에 "19세 미만 구매 불가" 같은 안내문이 들어갈 수 있으므로).

## 4단계 전 구간 판정 실측 (dist 빌드 후 실행)

| 단계 | detectAccessGate | isProductPageReady |
|---|---|---|
| 1 비로그인 | `adult-verification` | false |
| 2 성인인증 절차 | `adult-verification` | false |
| 3 본인인증 팝업 | `adult-verification` | false |
| 완료 상품페이지 | `none` | **true** |
