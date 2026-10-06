// 자동 생성 — 앱 레포 src/utils/title-forge/varied.ts 묶음(원본 해시 2d5237212beb3d72). 손으로 고치지 말고 spa/scripts/build-title-forge.mjs 를 다시 돌릴 것.

// ../../../../park/leword-app/src/utils/shopping-purchase-angle.ts
var DOMAIN_ANGLES = [
  {
    id: "baby",
    match: /(출산|육아|기저귀|유아|아기|이유식|분유|젖병|카시트|유모차|아동)/,
    buy: (n) => `\uC6B0\uB9AC \uC544\uC774\uC5D0\uAC8C ${n}, \uC548 \uCC59\uAE30\uBA74 \uB098\uC911\uC5D0 \uB354 \uC2E0\uACBD \uC4F0\uC774\uB294 \uC774\uC720`,
    use: (n) => `\uC774 \uC2DC\uAE30 \uC544\uC774\uC5D0\uAC8C ${n} \uC774\uB807\uAC8C \uC368\uC57C \uC548\uC804\uD558\uACE0 \uD3B8\uD574\uC694`,
    basis: "\uCD9C\uC0B0/\uC721\uC544 \u2014 \uC548\uC804\xB7\uBD88\uC548 \uD574\uC18C \uB3D9\uAE30"
  },
  {
    id: "beauty",
    match: /(화장품|미용|스킨|로션|에센스|세럼|앰플|선크림|클렌징|마스크팩|뷰티|헤어|고데기|드라이어|향수|네일)/,
    buy: (n) => `\uAC70\uC6B8 \uBCFC \uB54C\uB9C8\uB2E4 \uC2E0\uACBD \uC4F0\uC774\uB358 \uADF8 \uBD80\uBD84, ${n} \uD558\uB098\uB85C \uAD00\uB9AC \uC2DC\uC791`,
    use: (n) => `\uC544\uCE68 \uC138\uC548 \uD6C4 30\uCD08, ${n} \uC774\uB807\uAC8C \uC368\uC57C \uD6A8\uACFC\uAC00 \uB2E4\uB985\uB2C8\uB2E4`,
    basis: "\uD654\uC7A5\uD488/\uBBF8\uC6A9 \u2014 \uC678\uBAA8\xB7\uC790\uAE30\uAD00\uB9AC \uB3D9\uAE30"
  },
  {
    id: "health",
    // '생활/건강' 카테고리 라벨이 health 도메인을 가로채지 않도록 bare '건강' 제외.
    match: /(건강식품|건강기능|영양제|비타민|유산균|홍삼|프로틴|보조식품|다이어트|콜라겐|오메가)/,
    buy: (n) => `\uC694\uC998 \uBD80\uCA4D \uD53C\uACE4\uD558\uB2E4\uBA74 \u2014 ${n} \uD558\uB098\uCBE4 \uCC59\uACA8\uC57C \uD560 \uB54C`,
    use: (n) => `${n}, \uACF5\uBCF5\uBCF4\uB2E4 \uC774 \uD0C0\uC774\uBC0D\uC5D0 \uBA39\uC5B4\uC57C \uD761\uC218\uAC00 \uC88B\uC544\uC694`,
    basis: "\uAC74\uAC15\uC2DD\uD488 \u2014 \uAC74\uAC15 \uBD88\uC548\xB7\uAD00\uB9AC \uB3D9\uAE30"
  },
  {
    id: "kitchen",
    match: /(주방|조리|냄비|프라이팬|에어프라이어|믹서|밀폐용기|도마|칼|텀블러|커피|식기)/,
    buy: (n) => `\uB9E4\uBC88 \uBC88\uAC70\uB86D\uB358 \uADF8 \uC21C\uAC04, ${n} \uD558\uB098\uBA74 \uC815\uB9AC\uB429\uB2C8\uB2E4`,
    use: (n) => `${n} \uC774\uB807\uAC8C \uC4F0\uBA74 \uC694\uB9AC \uC2DC\uAC04\uC774 \uD655 \uC904\uC5B4\uC694`,
    basis: "\uC8FC\uBC29 \u2014 \uC2DC\uAC04 \uC808\uC57D\xB7\uD3B8\uC758 \uB3D9\uAE30"
  },
  {
    id: "clean",
    match: /(청소|세제|물티슈|정리|수납|욕실|주방세제|청소기|걸레|먼지|살균|탈취)/,
    buy: (n) => `\uADC0\uCC2E\uC544\uC11C \uBBF8\uB904\uB454 \uCCAD\uC18C, ${n} \uD558\uB098\uBA74 5\uBD84\uC774\uBA74 \uB05D`,
    use: (n) => `${n}, \uC774 \uBD80\uBD84\uBD80\uD130 \uC4F0\uBA74 \uD2F0 \uB098\uAC8C \uAE68\uB057\uD574\uC9D1\uB2C8\uB2E4`,
    basis: "\uC0DD\uD65C/\uCCAD\uC18C \u2014 \uADC0\uCC2E\uC74C \uD574\uC18C \uB3D9\uAE30"
  },
  {
    id: "summer",
    match: /(선풍기|서큐레이터|냉풍기|쿨매트|아이스|제습기|에어컨|쿨링|냉감|휴대용선풍기|넥밴드)/,
    buy: (n) => `\uB354\uC704 \uC624\uAE30 \uC804\uC5D0 ${n} \uBBF8\uB9AC \u2014 \uD55C\uC5EC\uB984\uC5D4 \uD488\uC808\uBD80\uD130 \uAC71\uC815`,
    use: (n) => `${n}, \uC774\uB807\uAC8C \uB450\uACE0 \uC4F0\uBA74 \uCCB4\uAC10 \uC628\uB3C4\uAC00 \uB2E4\uB985\uB2C8\uB2E4`,
    basis: "\uC5EC\uB984 \uACC4\uC808\uAC00\uC804 \u2014 \uC0C1\uD488 \uC790\uCCB4 \uACC4\uC808 \uC2E0\uD638"
  },
  {
    id: "winter",
    match: /(히터|난방|온풍기|전기요|전기장판|손난로|방한|보온|기모|패딩|가습기)/,
    buy: (n) => `\uCD94\uC6CC\uC9C0\uAE30 \uC804\uC5D0 ${n} \u2014 \uD55C\uD30C \uC624\uBA74 \uB2E4\uB4E4 \uCC3E\uC2B5\uB2C8\uB2E4`,
    use: (n) => `${n}, \uC774 \uC704\uCE58\uC5D0 \uB450\uBA74 \uB530\uB73B\uD568\uC774 \uC624\uB798 \uAC11\uB2C8\uB2E4`,
    basis: "\uACA8\uC6B8 \uACC4\uC808\uAC00\uC804 \u2014 \uC0C1\uD488 \uC790\uCCB4 \uACC4\uC808 \uC2E0\uD638"
  },
  {
    id: "pet",
    match: /(반려|강아지|고양이|사료|펫|애견|캣|배변|하네스)/,
    buy: (n) => `\uC6B0\uB9AC \uC544\uC774(\uBC18\uB824\uB3D9\uBB3C)\uD55C\uD14C ${n}, \uBBF8\uB9AC \uCC59\uACA8\uB450\uBA74 \uB9C8\uC74C \uD3B8\uD574\uC694`,
    use: (n) => `${n} \uC774\uB807\uAC8C \uC801\uC751\uC2DC\uD0A4\uBA74 \uAC70\uBD80\uAC10 \uC5C6\uC774 \uC798 \uC501\uB2C8\uB2E4`,
    basis: "\uBC18\uB824\uB3D9\uBB3C \u2014 \uCF00\uC5B4\xB7\uBD88\uC548 \uD574\uC18C \uB3D9\uAE30"
  },
  {
    id: "sports",
    match: /(스포츠|레저|캠핑|등산|낚시|자전거|요가|헬스|골프|러닝|텐트|아웃도어)/,
    buy: (n) => `\uC774\uBC88 \uC2DC\uC98C \uC81C\uB300\uB85C \uC990\uAE30\uB824\uBA74 ${n} \uD558\uB098\uB294 \uCC59\uACA8\uC57C\uC8E0`,
    use: (n) => `${n}, \uC774\uB807\uAC8C \uCC59\uACA8 \uAC00\uBA74 \uD604\uC7A5\uC5D0\uC11C \uD6C4\uD68C \uC5C6\uC2B5\uB2C8\uB2E4`,
    basis: "\uC2A4\uD3EC\uCE20/\uB808\uC800 \u2014 \uACBD\uD5D8\xB7\uC900\uBE44 \uB3D9\uAE30"
  },
  {
    id: "digital",
    match: /(디지털|가전|이어폰|충전기|보조배터리|케이블|블루투스|스마트|노트북|모니터|마우스|키보드)/,
    buy: (n) => `\uB9E4\uBC88 \uC544\uC26C\uC6E0\uB358 \uADF8 \uBD88\uD3B8, ${n} \uD558\uB098\uB85C \uD574\uACB0`,
    use: (n) => `\uC774 \uAE30\uB2A5\uB9CC \uC54C\uBA74 ${n} \uC81C\uB300\uB85C \uD65C\uC6A9\uD569\uB2C8\uB2E4`,
    basis: "\uB514\uC9C0\uD138/\uAC00\uC804 \u2014 \uD3B8\uC758\xB7\uBD88\uD3B8 \uD574\uC18C \uB3D9\uAE30"
  },
  {
    id: "fashion",
    match: /(의류|패션|잡화|가방|신발|셔츠|바지|원피스|모자|양말|악세|주얼리|시계|지갑)/,
    buy: (n) => `${n} \uD558\uB098\uB85C \uCF54\uB514 \uACE0\uBBFC\uC774 \uC904\uC5B4\uB4ED\uB2C8\uB2E4`,
    use: (n) => `${n}, \uC774\uB807\uAC8C \uB9E4\uCE58\uD558\uBA74 \uD3EC\uC778\uD2B8\uAC00 \uC0B4\uC544\uC694`,
    basis: "\uD328\uC158 \u2014 \uC2A4\uD0C0\uC77C\xB7\uC790\uC2E0\uAC10 \uB3D9\uAE30"
  },
  {
    id: "furniture",
    match: /(가구|인테리어|수납장|선반|의자|책상|조명|커튼|러그|매트리스|침대)/,
    buy: (n) => `\uACF5\uAC04\uC774 \uC544\uC26C\uC6E0\uB2E4\uBA74 ${n}\uBD80\uD130 \uBC14\uAFD4\uBCF4\uC138\uC694 \u2014 \uBD84\uC704\uAE30\uAC00 \uB2EC\uB77C\uC9D1\uB2C8\uB2E4`,
    use: (n) => `${n}, \uC774 \uC790\uB9AC\uC5D0 \uB450\uBA74 \uACF5\uAC04\uC774 \uB113\uC5B4 \uBCF4\uC785\uB2C8\uB2E4`,
    basis: "\uAC00\uAD6C/\uC778\uD14C\uB9AC\uC5B4 \u2014 \uACF5\uAC04\xB7\uB9CC\uC871 \uB3D9\uAE30"
  },
  /*
   * 아래 둘은 실사고로 추가됐다. 쿠팡 실시간 보드가 자동차용품·식품 카테고리를
   * 도는데 여기 규칙이 없어 '불스원 워셔액'이 일반 프레임("사놓고 이걸 왜 이제
   * 샀지")으로 떨어졌다 — 상품과 안 맞는 문구는 없느니만 못하다.
   */
  {
    id: "car",
    match: /(자동차|차량|카용품|워셔액|와이퍼|세차|타이어|블랙박스|주차|방향제|카매트|엔진오일)/,
    buy: (n) => `\uC6B4\uC804\uD558\uB2E4 \uD55C \uBC88\uCBE4 \uC544\uC26C\uC6E0\uB358 \uC21C\uAC04, ${n} \uD558\uB098\uB85C \uC815\uB9AC\uB429\uB2C8\uB2E4`,
    use: (n) => `${n}, \uC774 \uC21C\uC11C\uB85C \uC4F0\uBA74 \uD6A8\uACFC\uAC00 \uC624\uB798\uAC11\uB2C8\uB2E4`,
    basis: "\uC790\uB3D9\uCC28\uC6A9\uD488 \u2014 \uC548\uC804\xB7\uAD00\uB9AC \uB3D9\uAE30"
  },
  {
    id: "food",
    match: /(식품|간식|음료|원두|라면|즉석|밀키트|과일|견과|반찬|냉동식품)/,
    buy: (n) => `\uC7A5 \uBCFC \uB54C\uB9C8\uB2E4 \uACE0\uBBFC\uB418\uB358 \uAC83, ${n} \uC7C1\uC5EC\uB450\uBA74 \uB4E0\uB4E0\uD569\uB2C8\uB2E4`,
    use: (n) => `${n}, \uC774\uB807\uAC8C \uBCF4\uAD00\uD558\uBA74 \uB9DB\uC774 \uC624\uB798\uAC11\uB2C8\uB2E4`,
    basis: "\uC2DD\uD488 \u2014 \uC7AC\uAD6C\uB9E4\xB7\uBE44\uCD95 \uB3D9\uAE30"
  }
];
var GENERIC_ANGLE = {
  id: "generic",
  match: /.*/,
  buy: (n) => `\uC0AC\uB193\uACE0 "\uC774\uAC78 \uC65C \uC774\uC81C \uC0C0\uC9C0" \uC2F6\uC740 ${n}`,
  use: (n) => `${n}, \uC774\uB807\uAC8C \uC4F0\uBA74 \uB9CC\uC871\uB3C4\uAC00 \uC62C\uB77C\uAC11\uB2C8\uB2E4`,
  basis: "\uC77C\uBC18 \u2014 \uD6C4\uD68C \uC5C6\uB294 \uAD6C\uB9E4 \uD504\uB808\uC784"
};
function pickDomain(signalText) {
  for (const d of DOMAIN_ANGLES) {
    if (d.match.test(signalText)) return d;
  }
  return GENERIC_ANGLE;
}
function pickProductNoun(input, keyword) {
  const candidates = [
    input.category3,
    input.category2,
    input.simplifiedTitle,
    input.cleanTitle,
    keyword,
    input.title
  ];
  for (const c of candidates) {
    const s = String(c || "").replace(/\s+/g, " ").trim();
    if (s && s.length >= 2 && s.length <= 20) return s;
  }
  const fallback = String(keyword || input.title || "\uC774 \uC0C1\uD488").replace(/\s+/g, " ").trim();
  return fallback.length > 20 ? fallback.slice(0, 20) : fallback || "\uC774 \uC0C1\uD488";
}
function priceFraming(lprice, noun) {
  if (!lprice || lprice <= 0) return null;
  if (lprice < 2e4) {
    return { text: `${lprice.toLocaleString()}\uC6D0\uB300 \u2014 \uBD80\uB2F4 \uC5C6\uC774 \uD558\uB098 \uB4E4\uC5EC \uC2DC\uC791\uD558\uAE30 \uC88B\uC740 \uAC00\uACA9`, basis: `\uAC00\uACA9 ${lprice.toLocaleString()}\uC6D0 (\uC800\uAC00 \uC9C4\uC785\uC7A5\uBCBD \uB0AE\uC74C)` };
  }
  if (lprice <= 8e4) {
    return { text: `${lprice.toLocaleString()}\uC6D0\uB300 \u2014 \uAC00\uC131\uBE44\uB85C \uB9CC\uC871\uB3C4 \uB192\uC740 \uAD6C\uAC04\uC758 ${noun}`, basis: `\uAC00\uACA9 ${lprice.toLocaleString()}\uC6D0 (\uAC00\uC131\uBE44 \uAD6C\uAC04)` };
  }
  return { text: `${lprice.toLocaleString()}\uC6D0 \u2014 \uC81C\uB300\uB85C \uB41C \uAC83 \uD558\uB098\uB85C \uC624\uB798 \uC4F0\uB294 \uC120\uD0DD`, basis: `\uAC00\uACA9 ${lprice.toLocaleString()}\uC6D0 (\uD504\uB9AC\uBBF8\uC5C4 \u2014 \uC624\uB798 \uC4F0\uB294 \uAC00\uCE58 \uAC15\uC870)` };
}
function trustFraming(reviewCount, rating, noun) {
  const rc = Number(reviewCount || 0);
  const rt = Number(rating || 0);
  if (rc >= 1e3) {
    return { text: `\uB9AC\uBDF0 ${rc.toLocaleString()}\uAC1C\uAC00 \uC774\uBBF8 \uAC80\uC99D\uD55C ${noun}`, basis: `\uB9AC\uBDF0 ${rc.toLocaleString()}\uAC1C (\uB300\uB7C9 \uC0AC\uD68C\uC801 \uC99D\uAC70)` };
  }
  if (rc >= 100) {
    return { text: `\uC774\uBBF8 ${rc.toLocaleString()}\uBA85 \uC774\uC0C1\uC774 \uC120\uD0DD\uD55C ${noun}`, basis: `\uB9AC\uBDF0 ${rc.toLocaleString()}\uAC1C (\uC0AC\uD68C\uC801 \uC99D\uAC70)` };
  }
  if (rt >= 4.5 && rc >= 10) {
    return { text: `\uD3C9\uC810 ${rt.toFixed(1)}\uC810, \uC368\uBCF8 \uC0AC\uB78C\uB4E4\uC774 \uB9CC\uC871\uD55C ${noun}`, basis: `\uD3C9\uC810 ${rt.toFixed(1)} \xB7 \uB9AC\uBDF0 ${rc}\uAC1C` };
  }
  return null;
}
function buildPurchaseDesireAngles(input, keyword = "") {
  const noun = pickProductNoun(input, keyword);
  const signalText = [
    input.category1,
    input.category2,
    input.category3,
    input.title,
    input.brand,
    input.maker
  ].filter(Boolean).join(" ");
  const domain = pickDomain(signalText);
  const angles = [
    { text: domain.buy(noun), kind: "\uAD6C\uB9E4\uC695\uAD6C", basis: domain.basis },
    { text: domain.use(noun), kind: "\uC0AC\uC6A9\uC695\uAD6C", basis: domain.basis }
  ];
  const trust = trustFraming(input.reviewCount || 0, input.rating || 0, noun);
  if (trust) {
    angles.push({ text: trust.text, kind: "\uC2E0\uB8B0", basis: trust.basis });
  } else {
    const price = priceFraming(input.lprice || 0, noun);
    if (price) angles.push({ text: price.text, kind: "\uAD6C\uB9E4\uC695\uAD6C", basis: price.basis });
  }
  const seen = /* @__PURE__ */ new Set();
  return angles.filter((a) => {
    const k = a.text.trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 3);
}

// ../../../../park/leword-app/src/utils/title-forge/frame-analysis.ts
var FRAME_PATTERNS = [
  { frame: "recipe", pattern: /레시피/ },
  { frame: "review", pattern: /후기|내돈내산|사용기|리뷰|써보/ },
  { frame: "compare", pattern: /비교|차이|vs\b|대신/i },
  { frame: "price", pattern: /가격|비용|수리비|얼마|최저가|할인/ },
  { frame: "schedule", pattern: /일정|날짜|언제|기간|편성표|시기/ },
  { frame: "mistake", pattern: /실수|실패|주의|안됨|안돼|해결|물러|원인|이유|오류/ },
  { frame: "recommend", pattern: /추천|순위|베스트|BEST|TOP/i },
  { frame: "howto", pattern: /방법|하는법|만드는법|사용법|만들기/ },
  { frame: "checklist", pattern: /총정리|정리|체크리스트|목록/ }
];
function classifyTitleFrame(title) {
  const text = String(title || "");
  for (const { frame, pattern } of FRAME_PATTERNS) {
    if (pattern.test(text)) return frame;
  }
  return "generic";
}
function countFrames(titles) {
  const counts = /* @__PURE__ */ new Map();
  for (const title of titles) {
    const frame = classifyTitleFrame(title);
    counts.set(frame, (counts.get(frame) || 0) + 1);
  }
  return counts;
}
function findEmptyFrames(serpTitles, supportedFrames2) {
  const counts = countFrames(serpTitles);
  return supportedFrames2.filter((frame) => !counts.has(frame));
}

// ../../../../park/leword-app/src/utils/title-forge/forge.ts
var SEO_MAX = 40;
var HOME_MAX = 38;
var SEO_SUFFIX = {
  recipe: "\uB530\uB77C\uD558\uAE30 \uC26C\uC6B4 \uC21C\uC11C",
  review: "\uC9C1\uC811 \uC368\uBCF8 \uAE30\uB85D",
  compare: "\uBB34\uC5C7\uC774 \uC5B4\uB5BB\uAC8C \uB2E4\uB978\uAC00",
  price: "\uC2E4\uC81C \uBE44\uC6A9 \uC815\uB9AC",
  schedule: "\uC5B8\uC81C\uBD80\uD130 \uC5B8\uC81C\uAE4C\uC9C0",
  mistake: "\uC6D0\uC778\uACFC \uD574\uACB0\uBC95",
  recommend: "\uACE0\uB974\uB294 \uAE30\uC900",
  howto: "\uB2E8\uACC4\uBCC4 \uBC29\uBC95",
  checklist: "\uBE60\uB728\uB9AC\uAE30 \uC26C\uC6B4 \uAC83\uB4E4",
  /*
   * 근거가 없을 때 나오는 문구다. 그러니 **아무것도 단정하면 안 된다**.
   * 옛 문구 '기본 정보와 최근 소식' 은 '최근 소식' 이 있다고 단정했다 —
   * 우리는 그런 걸 잰 적이 없다(사장님 지적 2026-08-22).
   */
  generic: "\uC5B4\uB5A4 \uC815\uBCF4\uAC00 \uC788\uB294\uC9C0"
};
var HOME_TEMPLATE = {
  recipe: (kw) => `${kw}, \uC774 \uC21C\uC11C\uB300\uB85C\uB9CC \uD558\uBA74 \uB429\uB2C8\uB2E4`,
  review: (kw) => `${kw} \uC9C1\uC811 \uC368\uBCF4\uACE0 \uC54C\uAC8C \uB41C \uAC83\uB4E4`,
  compare: (kw, extra) => `${kw} ${extra}, \uAE30\uC900\uC740 \uD558\uB098\uBA74 \uB429\uB2C8\uB2E4`,
  price: (kw, extra) => `${kw} ${extra}, \uBBF8\uB9AC \uC54C\uBA74 \uB2E4\uB985\uB2C8\uB2E4`,
  schedule: (kw) => `${kw}, \uC9C0\uAE08\uC774 \uC900\uBE44\uD560 \uB54C\uC785\uB2C8\uB2E4`,
  mistake: (kw, extra) => `${kw} ${extra}, \uC6D0\uC778\uC740 \uB530\uB85C \uC788\uC2B5\uB2C8\uB2E4`,
  recommend: (kw) => `${kw} \uACE0\uB974\uB2E4 \uC9C0\uCCE4\uB2E4\uBA74 \uBCFC \uAC83`,
  howto: (kw) => `${kw}, \uC5B4\uB835\uAC8C \uD560 \uD544\uC694 \uC5C6\uC2B5\uB2C8\uB2E4`,
  checklist: (kw) => `${kw}, \uC774 \uAE00 \uD558\uB098\uB85C \uB05D\uB0C5\uB2C8\uB2E4`,
  /*
   * 옛 문구 `${kw}, 지금 왜 찾는 사람이 많을까` 를 버린다(사장님 지적 2026-08-22
   * '오퍼레이터24hr' 실사고). 두 가지가 동시에 잘못됐다.
   *   ① "찾는 사람이 많다" 를 단정한다 — 급증을 잰 적이 없는 자리인데 그렇다고 쓴다.
   *   ② 왜 뜨는지는 **우리가 알아내야 할 것**인데, 그 질문을 그대로 제목으로 낸다.
   * 근거가 없을 때는 모른다는 사실에 맞는 말을 쓴다 — 단정도 질문 떠넘기기도 없이.
   * 쉼표 이분법도 피한다(홈판 교리 ②).
   */
  generic: (kw) => `${kw} \uC774\uAC8C \uBB54\uC9C0 \uBAB0\uB77C\uC11C \uCC3E\uC544\uBD24\uC2B5\uB2C8\uB2E4`
};
function splitExtra(derived, keyword) {
  const words = keyword.split(/\s+/).filter(Boolean);
  const short = new Set(words.filter((w) => w.length < 2));
  const text = collapse(derived);
  const covered = Array.from({ length: text.length }, () => false);
  for (const word of words) {
    if (word.length < 2) continue;
    for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + word.length)) {
      for (let k = at; k < at + word.length; k += 1) covered[k] = true;
    }
  }
  const runs = [];
  let start = -1;
  for (let i = 0; i <= text.length; i += 1) {
    const cut = i === text.length || covered[i] || text[i] === " ";
    if (cut && start >= 0) {
      runs.push({ text: text.slice(start, i), start, end: i });
      start = -1;
    }
    if (!cut && start < 0) start = i;
  }
  const glued = (r) => r.start > 0 && covered[r.start - 1] || r.end < text.length && covered[r.end];
  const kept = runs.filter((r) => !short.has(r.text) && !(r.text.length === 1 && glued(r)));
  const firstCovered = covered.indexOf(true);
  const isBefore = (r) => firstCovered >= 0 && r.end <= firstCovered;
  return {
    before: kept.filter(isBefore).map((r) => r.text).join(" "),
    after: kept.filter((r) => !isBefore(r)).map((r) => r.text).join(" ")
  };
}
function withoutRepeats(extra, suffix) {
  return extra.split(" ").filter((token) => token && !suffix.includes(token)).join(" ");
}
function collapse(text) {
  return text.replace(/\s+/g, " ").trim();
}
function fitWithin(text, max) {
  let words = collapse(text).split(" ");
  while (words.join(" ").length > max && words.length > 1) {
    words = words.slice(0, -1);
  }
  return words.join(" ");
}
function supportedFrames(input) {
  const ordered = [...input.derivedKeywords].sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0));
  const frames = [];
  for (const derived of ordered) {
    const frame = classifyTitleFrame(derived.keyword);
    if (!frames.includes(frame)) frames.push(frame);
  }
  if (input.timing && !frames.includes("schedule")) frames.push("schedule");
  return frames;
}
function derivedForFrame(input, frame) {
  const matches = input.derivedKeywords.filter((d) => classifyTitleFrame(d.keyword) === frame).sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0));
  return matches[0] || null;
}
function pickFrame(input) {
  const supported = supportedFrames(input);
  if (input.frame && supported.includes(input.frame)) return input.frame;
  if (supported.length === 0) return "generic";
  const empty = findEmptyFrames(input.serpTitles, supported);
  if (empty.length > 0) return empty[0];
  const counts = countFrames(input.serpTitles);
  return [...supported].sort((a, b) => (counts.get(a) || 0) - (counts.get(b) || 0))[0];
}
function basisFor(input, frame, derived) {
  if (derived) {
    const volume = derived.searchVolume === null ? "\uBBF8\uCE21\uC815" : String(derived.searchVolume);
    return `\uD30C\uC0DD \uD0A4\uC6CC\uB4DC \uC2E4\uCE21 '${derived.keyword}' (\uAC80\uC0C9\uB7C9 ${volume}) \u2014 1\uD398\uC774\uC9C0 ${input.serpTitles.length}\uAC1C \uC81C\uBAA9\uC5D0 \uC5C6\uB294 \uD504\uB808\uC784`;
  }
  if (frame === "schedule" && input.timing) return `\uC2DC\uAE30 \uC2E4\uCE21: ${input.timing}`;
  return "\uADFC\uAC70 \uD504\uB808\uC784 \uC5C6\uC74C \u2014 \uC77C\uBC18\uD615";
}
function forgeTitles(input) {
  const keyword = collapse(input.keyword);
  const frame = pickFrame(input);
  const derived = derivedForFrame(input, frame);
  const { before, after } = derived ? splitExtra(derived.keyword, keyword) : { before: "", after: "" };
  const basis = basisFor(input, frame, derived);
  const seo = {
    text: fitWithin(`${keyword} ${withoutRepeats(after, SEO_SUFFIX[frame])} ${SEO_SUFFIX[frame]}`, SEO_MAX),
    frame,
    basis
  };
  if (input.isProduct && input.productName) {
    const angles = buildPurchaseDesireAngles(
      { cleanTitle: input.productName, title: input.productSignal || input.productName },
      keyword
    );
    const angle = angles[0];
    if (angle) {
      return {
        seo,
        home: {
          text: fitWithin(angle.text, HOME_MAX),
          frame,
          basis: `${angle.kind} \xB7 ${angle.basis}`
        }
      };
    }
  }
  const home = {
    text: fitWithin(HOME_TEMPLATE[frame](collapse(`${before} ${keyword}`), after).replace(/\s+,/g, ","), HOME_MAX),
    frame,
    basis
  };
  return { seo, home };
}

// ../../../../park/leword-app/src/utils/title-forge/varied.ts
var FRAME_CAP = 3;
var FRAME_LABEL = {
  recipe: "\uC21C\uC11C",
  review: "\uD6C4\uAE30",
  compare: "\uBE44\uAD50",
  price: "\uBE44\uC6A9",
  schedule: "\uC2DC\uAE30",
  mistake: "\uC2E4\uC218",
  recommend: "\uCD94\uCC9C",
  howto: "\uBC29\uBC95",
  checklist: "\uCCB4\uD06C",
  generic: "\uC77C\uBC18"
};
var norm = (value) => String(value || "").replace(/\s+/g, "");
function forgeVariedTitles(keyword, derived, serpTitles, frameCap = FRAME_CAP) {
  const base = { keyword, derivedKeywords: derived, serpTitles };
  const supported = supportedFrames(base);
  if (supported.length === 0) {
    const forged = forgeTitles(base);
    return [
      { text: forged.seo.text, kind: "\uAC80\uC0C9\uC6A9", frame: forged.seo.frame, frameLabel: FRAME_LABEL[forged.seo.frame], basis: forged.seo.basis },
      { text: forged.home.text, kind: "\uB04C\uB9AC\uB294", frame: forged.home.frame, frameLabel: FRAME_LABEL[forged.home.frame], basis: forged.home.basis }
    ];
  }
  const empty = findEmptyFrames(serpTitles, supported);
  const rest = supported.filter((frame) => !empty.includes(frame));
  const frames = empty.concat(rest).slice(0, Math.max(1, frameCap));
  const titles = [];
  const seen = /* @__PURE__ */ new Set();
  for (const frame of frames) {
    const forged = forgeTitles({ ...base, frame });
    for (const [kind, one] of [["\uB04C\uB9AC\uB294", forged.home], ["\uAC80\uC0C9\uC6A9", forged.seo]]) {
      const key = norm(one.text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      titles.push({ text: one.text, kind, frame: one.frame, frameLabel: FRAME_LABEL[one.frame], basis: one.basis });
    }
  }
  return titles;
}
export {
  FRAME_CAP,
  FRAME_LABEL,
  forgeVariedTitles
};
