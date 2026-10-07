---
name: Leaders Pro 제품 페이지
description: 기능을 나열하지 않고, 고수(또는 손으로 할 때) 결과 옆에 우리 결과를 세워 비교로 증명하는 검정 바닥의 제품 페이지 체계
colors:
  ground: "#0a0a0f"
  panel: "#12121a"
  inset: "#0d0d14"
  line: "rgba(255,255,255,.09)"
  line-strong: "rgba(255,255,255,.16)"
  ink: "#f4f6fb"
  ink-2: "#aab2c2"
  ink-3: "#7c8597"
  gold: "#ffc61a"
  gold-a: "#ffd700"
  gold-b: "#ffa500"
  on-gold: "#1d1500"
  mint: "#44d7b6"
  mint-ink: "#7be9cf"
typography:
  display:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "clamp(40px, 4.6vw, 66px)"
    fontWeight: 800
    lineHeight: 1.16
    letterSpacing: "-.035em"
  headline:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, sans-serif"
    fontSize: "clamp(30px, 3.2vw, 44px)"
    fontWeight: 800
    lineHeight: 1.22
    letterSpacing: "-.03em"
  title:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, sans-serif"
    fontSize: "clamp(26px, 2.4vw, 34px)"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-.03em"
  lead:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.7
  body:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 600
    lineHeight: 1.45
  caption:
    fontFamily: "'Pretendard Variable', Pretendard, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  focus: "8px"
  control: "12px"
  frame: "16px"
  board: "20px"
  pill: "999px"
  circle: "50%"
spacing:
  gutter: "32px"
  gutter-mobile: "16px"
  grid-gap: "56px"
  band-gap: "64px"
  band: "72px"
  band-mobile: "48px"
  section: "120px"
  section-mobile: "80px"
components:
  button-primary:
    backgroundColor: "{colors.gold-a}"
    textColor: "{colors.on-gold}"
    rounded: "{rounded.control}"
    padding: "0 26px"
    height: "62px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.gold}"
    rounded: "{rounded.control}"
    padding: "0 26px"
    height: "62px"
  vs-board:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.board}"
    padding: "38px 30px 30px"
  vs-row-theirs:
    textColor: "{colors.ink-3}"
    rounded: "{rounded.control}"
    padding: "16px 20px"
  vs-row-ours:
    backgroundColor: "#0f0f17"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "16px 20px"
  chip-measured:
    backgroundColor: "{colors.inset}"
    textColor: "{colors.mint}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "11px 22px"
  tab-pill:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "7px 13px"
  switch-pill-active:
    textColor: "{colors.gold}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "7px 14px"
    height: "40px"
  proof-link:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.frame}"
    padding: "22px 24px"
  shot-frame:
    backgroundColor: "{colors.inset}"
    rounded: "{rounded.frame}"
---

# Design System: Leaders Pro 제품 페이지

## Overview

**Creative North Star: "나란히 세운 증거판"**

이 체계는 Leaders Pro 제품 페이지(/products · /leword-detail · /detail · /orbit) 전용이다. 사이트 전체 메뉴 줄 · 바닥글, 하늘 사진을 깐 나머지 페이지는 이 체계가 아니며 여기서 규칙으로 삼지 않는다.

페이지는 검정 바닥 위에 놓인 증거판이다. 방문자가 처음 보는 것은 기능 목록이 아니라, 왼쪽에 흐리게 깔린 "고수 글" 또는 "직접 할 때"와, 오른쪽에 밝게 선 "우리 결과"가 한 판 안에 나란히 놓인 모습이다. 우리 쪽 줄마다 금색 화살표로 "무엇이 더 나은지"가 한 줄씩 붙고, 판 위에는 민트 칩으로 실제로 잰 숫자가 얹힌다. 설득은 형용사가 아니라 이 나란한 배치와 숫자가 한다.

밀도는 넉넉하다. 큰 굵은 한국어 제목(Pretendard 800), 넓은 띠 간격, 1px 슬레이트 선이 구조를 잡고, 장식은 거의 없다. 색은 세 가지 역할만 한다. 검정은 바닥, 금색은 행동과 "우리 쪽" 표시, 민트는 실측 숫자. 화면 캡처는 전부 실제 제품 화면이고, 같은 크기 카드를 격자로 늘어놓는 대신 글 한쪽 · 화면 한쪽을 번갈아 놓는 띠로 기능을 보여 준다.

**Key Characteristics:**
- 첫 화면은 5:7 두 칸 — 왼쪽 3줄 제목 · 한 줄 설명 · 버튼 둘, 오른쪽 실측 칩을 얹은 VS 비교 판, 아래 증거 바로가기 3칸.
- 검정 바닥(ground) 위 반투명 슬레이트 판, 1px 흰 반투명 선으로 나누는 평평한 층.
- 금색은 하나의 색조(텍스트는 gold, 채움은 gold-a→gold-b 그라디언트)로 행동과 우리 쪽만 칠한다.
- 민트는 재거나 확인할 수 있는 숫자 · 사실에만.
- 한국어 낱말을 쪼개지 않는다(word-break: keep-all), 제목은 text-wrap: balance.
- 아이콘은 1.8 선 굵기로 직접 그린 SVG 한 벌.

## Colors

검정 바닥 위에 금색 하나와 민트 하나만 얹는 절제된 팔레트다. 나머지는 모두 바닥 · 판 · 선 · 글자의 명도 단계다.

### Primary
- **행동 금색 (Action Gold)** (gold): 텍스트와 선에 쓰는 단색 금색. 첫 화면 제목의 마지막 구, 외곽선 버튼의 글자와 테두리, 비교 판의 우리 쪽 열 제목 · VS 원 · 나은 점 줄, "전체 보기" 같은 이어지는 링크, 펼친 질문의 + 아이콘, 포커스 링.
- **금색 채움 시작 · 끝 (Gold Fill)** (gold-a → gold-b, 135deg): 채움 면 전용 그라디언트. 주 버튼 바탕과 가격 막대의 우리 값 막대에만 쓴다. 브랜드 토큰 `gradient.goldBright`와 같은 두 점이다.
- **금색 위 글자 (Ink on Gold)** (on-gold): 금색 채움 버튼 위 글자. 순검정보다 따뜻한 갈색 먹이라 금색과 덜 부딪힌다.

### Secondary
- **실측 민트 (Measured Mint)** (mint): 비교 판 위 칩의 글자, 사용자가 보내 온 통계 화면 캡션의 숫자. "이 숫자는 잰 것"이라는 표시다.
- **민트 강조 (Mint Ink)** (mint-ink): 칩 안 숫자 자체(`<b>`)를 한 단계 밝게 띄울 때.

### Neutral
- **밤 바닥 (Night Ground)** (ground): 페이지 전체 바닥. 사이트 공용 스타일이 바닥을 투명하게 만들어 하늘 사진이 비치므로, 제품 페이지는 `main.pp`에서 이 색을 다시 칠한다.
- **슬레이트 판 (Slate Panel)** (panel): 비교 판 · 증거 바로가기 · 함께 쓰는 제품 안내 판의 바탕. 실제로는 .6~.72 투명도로 깔아 바닥이 살짝 비치게 쓴다.
- **안쪽 판 (Inset)** (inset): 판 안에 한 겹 더 놓이는 것 — 실측 칩, VS 원, 화면 캡처 액자 바탕.
- **가는 선 (Hairline)** (line): 띠 사이 구분선, 목록 줄, 캡션 위 선, 우리 쪽이 아닌 줄의 테두리.
- **또렷한 선 (Strong Line)** (line-strong): 비교 판 · 가격표 · 캡처 액자 · 탭 알약의 테두리처럼 판 하나를 감싸는 선.
- **먹 (Ink)** (ink): 제목과 우리 쪽 본문.
- **보조 먹 (Ink 2)** (ink-2): 설명 문단, 리드, 고수 쪽 열 제목.
- **흐린 먹 (Ink 3)** (ink-3): 고수 · 직접 할 때 쪽 줄 글자, 출처 한 줄, 캡션, 꺾쇠 아이콘.

### Named Rules
**The One Gold Rule.** 금색은 한 색조뿐이다. 텍스트 · 선은 gold, 채움은 gold-a→gold-b. 금색이 칠하는 것은 두 가지 — 누를 수 있는 행동, 그리고 비교에서 "우리 쪽". 금색 장식 · 금색 그라디언트 글자는 없다.

**The Measured Mint Rule.** 민트는 재거나 확인할 수 있는 숫자 · 사실(검색량 · 문서수 · 실측 표시, 받은 통계 화면의 숫자, 무료 체험 기간 같은 확인 가능한 조건)에만 쓴다. 추정치는 민트로도, 어떤 색으로도 화면에 내지 않는다.

**The Dim Theirs Rule.** 비교의 상대편은 흐린 먹(ink-3)과 거의 투명한 바탕(흰색 2.5%)으로 물러서고, 우리 쪽은 먹(ink) 700 굵기와 또렷한 선으로 앞에 선다. 대비는 색이 아니라 명도와 굵기로 만든다.

## Typography

**Display Font:** Pretendard Variable (with Pretendard, system-ui, -apple-system, 'Segoe UI', sans-serif)
**Body Font:** 같은 Pretendard
**Label/Mono Font:** 별도 없음. 숫자는 `font-variant-numeric: tabular-nums`로 자릿수를 맞춘다.

**Character:** 한 서체, 두 굵기 극단. 제목은 800 굵기에 자간을 좁혀(-.03~-.035em) 단단한 덩어리로 서고, 본문은 400 굵기 넓은 행간(1.65~1.7)으로 쉬운 말처럼 읽힌다. Pretendard는 index.html에서 jsDelivr CDN 가변 서체로 불러온다.

### Hierarchy
- **Display** (800, clamp(40px, 4.6vw, 66px), 1.16): 첫 화면 제목 하나. 줄바꿈을 손으로 넣은 3줄(또는 2줄) 제목이고, 마지막 구만 `<em>`으로 금색.
- **Headline** (800, clamp(30px, 3.2vw, 44px), 1.22): 본문 띠의 머리 제목, 끝 행동 띠 제목.
- **Title** (800, clamp(26px, 2.4vw, 34px), 1.25): 기능 띠 하나의 제목. 비교 판 열 제목(21px)과 증거 바로가기 제목(19px)도 같은 800 굵기 계열.
- **Lead** (400, 19px, 1.7): 첫 화면 설명(최대 34ch)과 띠 머리 설명(최대 58ch). 휴대폰에서 17px.
- **Body** (400, 17px, 1.65): 기본 본문. 기능 띠 문단은 최대 46ch, 질문 답은 최대 70ch. 휴대폰에서 16px.
- **Label** (600, 14.5px): 탭 알약, 화면 바꿔 보기 단추, 비교 판의 나은 점 줄.
- **Caption** (400, 13.5px): 비교 판 출처 줄, 캡처 캡션, 가격 막대 출처.

### Named Rules
**The Keep-All Rule.** 한국어 낱말은 절대 중간에서 끊지 않는다(`word-break: keep-all; overflow-wrap: break-word`). 제목과 설명은 `text-wrap: balance`, 따옴표로 묶은 말('서류·준비물')은 통째로 한 줄에 둔다.

**The Heavy Korean Rule.** 제목은 800 하나로 통일한다. 중간 굵기(500~600) 제목을 섞지 않는다. 위계는 크기와 색(ink → ink-2 → ink-3)으로 나눈다.

## Layout

가운데 정렬된 한 줄 그릇(`min(1360px, 100% - 64px)`, 휴대폰은 좌우 16px) 안에서 두 가지 비대칭 격자가 반복된다.

- **첫 화면:** 5:7 두 칸, 칸 사이 56px, 세로 가운데 정렬. 위 여백 168px은 고정 메뉴 줄 아래로 비교 판 칩이 충분히 떨어지게 잡은 값이다. 그 아래 64px 띄워 증거 바로가기 3칸(간격 18px).
- **기능 띠:** 4:7 두 칸(글 · 화면), 칸 사이 64px, 띠마다 위아래 72px과 위쪽 가는 선. `flip`이면 7:4로 뒤집어 글과 화면이 번갈아 좌우를 바꾼다.
- **띠 묶음(section):** 위 120px, 마지막 묶음은 아래도 120px. 휴대폰은 80px.
- **목록형 내용:** 전 기능은 두 단 목록(columns: 2, 단 사이 56px)으로, 가격은 칸을 세로선으로 나눈 한 판으로, 후기는 세로선으로 나눈 인용 열로 둔다. 같은 크기 카드 격자는 쓰지 않는다.

반응형은 두 꺾임점이다. **1080px 이하**에서 첫 화면 · 띠는 한 칸으로 쌓이고(간격 40px) 후기는 한 열이 된다. **720px 이하**에서 그릇 좌우 16px, 비교 판은 두 열을 위아래로 쌓고 가운데 VS 기둥을 숨기며, 칩은 접혀서 항목마다 작은 민트 알약이 된다(첫 화면 세로 간격 72px로 칩이 버튼에 닿지 않게). 증거 바로가기 · 전 기능 목록은 한 줄, 가격 막대는 이름 · 값이 윗줄, 막대가 아랫줄로 간다.

## Elevation & Depth

평평한 층 구조가 기본이다. 깊이는 그림자가 아니라 명도 단계(ground → panel → inset)와 1px 반투명 흰 선으로 만든다. 그림자는 두 곳에만 있다. 금색 주 버튼 아래 금빛 번짐, 그리고 실제 화면 캡처 액자 아래 깊은 검정 그림자(캡처가 바닥 위에 떠 있는 종이처럼 보이게). 판 · 줄 · 칩에는 그림자가 없다.

### Shadow Vocabulary
- **금빛 번짐** (`box-shadow: 0 10px 30px -12px rgba(255,170,0,.55)`, 올렸을 때 `0 16px 36px -14px rgba(255,170,0,.7)`): 금색 채움 주 버튼 전용.
- **화면 액자** (`box-shadow: 0 30px 60px -30px rgba(0,0,0,.8), 0 0 0 1px rgba(255,198,26,.04)`): 실제 제품 화면 캡처 액자 전용.

### Named Rules
**The Slate Line Rule.** 판을 띄우는 방법은 1px 선이다. 새 판을 만들면 그림자 대신 line 또는 line-strong 테두리와 한 단계 다른 바탕을 쓴다.

## Shapes

부드럽지만 둥글둥글하지 않은 모서리. 반경은 크기를 따라 커진다 — 버튼 · 비교 줄 · 칩 12px, 화면 액자 · 증거 바로가기 · 안내 판 16px, 비교 판 · 가격표 · 제품 가격 한 표 20px. 탭 · 단추 · 막대는 완전한 알약(999px), VS 표시와 증거 아이콘 자리는 정원. 포커스 링은 8px 반경으로 감싼다. 테두리는 모두 1px(외곽선 버튼과 VS 원만 1.5px 금색). 화면 캡처는 액자 안에서 `overflow: hidden`으로 모서리를 함께 깎는다.

## Components

### Buttons
단단하고 크다. 첫 화면에서 한 손가락으로 눌리게 높이 62px, 19px 800 굵기.
- **Shape:** 살짝 둥근 사각(12px).
- **Primary:** 금색 채움(gold-a→gold-b 135deg) 위에 금색 위 글자(on-gold), 좌우 26px, 오른쪽에 화살표 아이콘 20px. 금빛 번짐 그림자.
- **Hover / Focus:** 올리면 1px 떠오르고 그림자가 커지며 화살표가 3px 오른쪽으로 민다. 전환은 .18s `cubic-bezier(.2,.8,.2,1)`. 포커스는 2px 금색 외곽선(3px 띄움).
- **Outline:** 투명 바탕에 1.5px 금색 테두리(70% 투명도), 글자 gold. 올리면 테두리가 완전한 금색이 되고 바탕에 금색 7%가 깔린다.
- **배치:** 첫 화면에서는 두 버튼을 최대 420px 폭으로 위아래 쌓고(간격 14px), 끝 행동 띠에서는 가로로 놓는다. 가격 아래 행동 버튼은 56px · 17px로 한 단계 작다.

### Chips
- **실측 칩:** 비교 판 위 테두리 한가운데에 반쯤 걸쳐 놓인 띠. 안쪽 판 바탕, 또렷한 선, 글자 민트 600 · 숫자 mint-ink 800, 항목 사이 3px 점. 휴대폰에서는 테두리를 빼고 항목마다 민트 8% 바탕 알약으로 나눈다.
- **탭 알약:** 기능 띠 아래 "이 띠가 보여 주는 실제 탭 이름" 목록. 또렷한 선, 흰 3% 바탕, 14.5px 600. 누를 수 없다.
- **화면 바꿔 보기 단추:** 같은 알약 모양에 누를 수 있다(최소 40px, 휴대폰 44px). 고른 것은 금색 글자 · 금색 테두리 · 금색 8% 바탕(`aria-pressed`).

### Cards / Containers
- **Corner Style:** 16~20px.
- **Background:** 슬레이트 판(.6~.72 투명도) 또는 안쪽 판.
- **Shadow Strategy:** 없음(Elevation 참고). 화면 액자만 예외.
- **Border:** 1px line 또는 line-strong.
- **Internal Padding:** 22~38px.
- **증거 바로가기:** 첫 화면 아래 3칸 링크 줄(후기 · 수익 인증 · 웹/PC 앱). 58px 원 안 26px 선 아이콘, 19px 800 제목, 15px 설명, 오른쪽 꺾쇠. 올리면 테두리가 금색 45%로 바뀐다. 기능을 소개하는 카드가 아니라 증거로 가는 길이다.

### Navigation
제품 페이지 자체에는 내비게이션이 없다(사이트 공용 메뉴 줄은 이 체계 밖). 페이지 안 이동은 "구매 후기 전체 보기" 같은 금색 텍스트 링크(700 굵기 + 화살표)로 한다.

### VS 비교 판 (Signature Component)
이 체계의 얼굴. 모든 제품 페이지 첫 화면 오른쪽 7칸에 놓인다.
- 20px 반경 판, 또렷한 선, 슬레이트 판 72% 바탕, 위에 실측 칩.
- 세 열(1fr · 64px · 1fr). 왼쪽 "고수 글 · 직접 할 때 · 따로 살 때"는 흐린 줄, 오른쪽 우리 쪽은 밝은 줄(18px 700) 아래에 금색 위쪽 화살표와 "나은 점" 한 줄. 가운데는 52px 금색 테두리 원에 VS, 그 아래로 금색에서 옅어지는 1px 세로선.
- 줄은 최소 108px 높이로 좌우가 짝을 이룬다. 두 열이 1:1로 대응하지 않으면(`paired=false`) 높이 맞춤을 풀어 위에서부터 쌓아 짝처럼 보이지 않게 한다.
- 판 아래 오른쪽 정렬 13.5px 출처 한 줄(무엇을 기준으로 · 언제 기준).
- LEWORD 판은 애드센스 고수 판의 실제 카드를 그대로 싣고, 받지 못하면 실제 카드에서 옮긴 날짜 박힌 사본을 쓴다.

### 기능 띠 (Feature Band)
글 한쪽(제목 · 문단 · 탭 알약) · 실제 화면 한쪽을 4:7로 놓고 띠마다 좌우를 번갈아 바꾼다. 화면은 16px 액자 안 실제 캡처 + 아래 캡션("· 실제 화면"). 휴대폰(≤720px)에서는 `<picture>`의 별도 확대 잘라낸 화면으로 바꿔 글씨가 무늬가 되지 않게 한다. 모든 캡처와 잘라낸 화면 옆에는 출처 기록 파일(`*.webp.json`, 원본 캡처 · 잘라낸 좌표 · 날짜)이 있다.

### 가격 (Price Block · Compare Bars · Price Table)
- **가격 한 판:** 기간별 칸을 세로선으로 나눈 20px 판. 기간 이름 15px 700, 값 40px 800, 단위 18px, 아래 부가세 한 줄. 팔지 않는 기간은 칸을 만들지 않는다.
- **단계 요금 막대:** 경쟁 도구의 낮은~높은 단계를 회색 막대 구간으로, 우리 값은 금색 채움 한 점으로. 아래 출처 한 줄(공식 요금 페이지 · 확인 날짜).
- **제품 가격 한 표:** 네 제품 × 기간을 줄로 나눈 표. 묶음 제품 줄만 금색 4.5% 바탕과 금색 이름. 없는 기간은 "없음".
- 모든 우리 가격은 상점과 같은 출처(`useProduct` — 카탈로그 기본값 위에 관리자 상점 저장값)에서 읽는다.

### 후기 · 자주 묻는 질문 · 끝 행동
- **후기:** 카드가 아니라 세로선으로 나눈 인용 열(최대 3열, 6줄까지). 그 제품 말이 든 실제 후기만, 최신 3건. 맞는 후기가 0건이면 묶음째 사라진다(`:has(> .pp-wrap:empty)`).
- **자주 묻는 질문:** 가는 선으로 나눈 펼침 목록, 질문 19px 700, 오른쪽 + 아이콘이 펼치면 45도 돌아 금색이 된다.
- **끝 행동:** 위쪽 가는 선 아래 제목과 버튼 둘을 양끝으로.

## Do's and Don'ts

### Do:
- **Do** 모든 제품 첫 화면에 VS 비교 판을 둔다 — 상대편(고수 · 직접 할 때 · 따로 살 때)은 흐리게, 우리 쪽은 밝게, 우리 쪽 줄마다 금색 "나은 점" 한 줄.
- **Do** 비교 판 위 칩에는 실측 숫자나 확인 가능한 사실만, 민트(#44d7b6)로 싣고, 판 아래에 기준과 날짜를 적는다.
- **Do** 두 열이 1:1 대응이 아니면 `paired=false`로 높이 맞춤을 푼다.
- **Do** 금색은 행동(주 버튼 채움 · 외곽선 버튼 · 링크)과 우리 쪽 표시(열 제목 · 나은 점 · 우리 값 막대)에만 쓴다.
- **Do** 첫 화면 제목은 800 굵기로 줄을 손으로 나누고, 마지막 구 하나만 `<em>` 금색으로 칠한다.
- **Do** 한국어는 `word-break: keep-all`, 제목은 `text-wrap: balance`.
- **Do** 가격은 언제나 `useProduct`(상점과 같은 값)로 읽고, 팔지 않는 기간은 칸째 뺀다.
- **Do** 기능은 실제 제품 화면 캡처로 보여 주고, 캡처마다 출처 기록 파일을 두며, 휴대폰용 확대 잘라낸 화면을 `<picture>`로 따로 준다(≤720px).
- **Do** 판은 1px 선(line · line-strong)과 명도 한 단계로 띄운다.
- **Do** 아이콘은 1.8 선 굵기 · 둥근 끝의 직접 그린 SVG 한 벌에서 가져온다.
- **Do** 맞는 후기가 없으면 후기 묶음을 통째로 없앤다. 다른 제품 후기를 섞지 않는다.

### Don't:
- **Don't** 같은 크기 아이콘 카드를 격자로 늘어놓아 기능을 소개하지 않는다. 글 · 화면을 번갈아 놓는 띠나 두 단 목록을 쓴다.
- **Don't** 추정치(예상 수익 · 예상 트래픽 · 노출 확률 · 지어낸 점수)나 근거 없는 통계(가입자 수 · 평균 수익)를 화면에 내지 않는다.
- **Don't** 제목 위에 눈썹 라벨 · 영어 소제목을 달지 않는다.
- **Don't** 이모지나 글자 기호(★ ✓ →)를 아이콘 대신 쓰지 않는다.
- **Don't** 그라디언트 글자를 쓰지 않는다. 금색 그라디언트는 채움 면(주 버튼 · 우리 값 막대)에만.
- **Don't** 제품 페이지에 배경 사진을 깔지 않는다. 바닥은 #0a0a0f 하나.
- **Don't** 판 · 줄 · 칩에 그림자를 주지 않는다. 그림자는 주 버튼과 화면 액자 두 곳뿐이다.
- **Don't** 지어낸 화면이나 생성 이미지를 "실제 화면"으로 싣지 않는다.
