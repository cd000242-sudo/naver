export type AutoTone =
  | 'friendly'
  | 'professional'
  | 'casual'
  | 'formal'
  | 'humorous'
  | 'community_fan'
  | 'mom_cafe'
  | 'storyteller'
  | 'expert_review'
  | 'calm_info'
  | 'sincere_exposure'
  | 'data_verified'
  | 'text_hip'
  | 'mentor'
  | 'self_interview';

export function getAutoToneByCategory(category: string | undefined, mode?: string): AutoTone {
  const m = String(mode || '').toLowerCase();

  if (!category) {
    if (m === 'seo' || m === 'traffic-hunter' || m === 'mate') return 'calm_info';
    if (m === 'homefeed') return 'friendly';
    if (m === 'affiliate') return 'friendly';
    if (m === 'business') return 'professional';
    return 'friendly';
  }

  const cat = category.toLowerCase();

  if (m === 'homefeed') {
    if (/육아|결혼|아이|출산|임신|유아|초등|어린이|가족|웨딩|신혼/.test(cat)) return 'mom_cafe';
    if (/스타|연예인|연예|아이돌|가수|배우|셀럽|만화|애니|웹툰/.test(cat)) return 'community_fan';
    if (/유머|개그|웃긴|짤|밈/.test(cat)) return 'humorous';
    if (/국내|세계|해외|여행|제주|부산|강원|경주|속초|유럽|미국|일본|동남아/.test(cat)) return 'storyteller';
    if (/건강|의학|의료|병원|IT|컴퓨터|노트북|스마트폰|테크|비즈니스|경제|금융|재테크|투자|주식|부동산/.test(cat)) return 'friendly';
    if (/패션|미용|뷰티|화장품|옷|코디|스타일|인테리어|요리|레시피|반려|강아지|고양이|펫/.test(cat)) return 'friendly';
    if (/맛집|카페|음식점|레스토랑|디저트|브런치/.test(cat)) return 'casual';
    return 'friendly';
  }

  if (m === 'seo' || m === 'traffic-hunter' || m === 'mate') {
    if (/건강|다이어트|영양|약|치료|증상|운동|헬스|요가/.test(cat)) return 'mentor';
    if (/교육|학문|학습|공부|시험|자격증|지식|교양/.test(cat)) return 'mentor';
    if (/의학|의료|병원|법률|정책|제도|복지|행정/.test(cat)) return 'calm_info';
    if (/경제|금융|재테크|투자|주식|부동산|환율|세금|회계/.test(cat)) return 'data_verified';
    if (/자동차|차|카|SUV|세단|전기차|IT|컴퓨터|노트북|스마트폰|테크|기술|가전/.test(cat)) return 'data_verified';
    if (/비즈니스|창업|마케팅|사회|정치|시사|뉴스/.test(cat)) return 'professional';
    if (/패션|미용|뷰티|화장품|상품|리뷰|후기|언박싱|구매|리빙|인테리어|가구/.test(cat)) return 'sincere_exposure';
    if (/맛집|카페|음식점|레스토랑|디저트|브런치/.test(cat)) return 'calm_info';
    if (/국내|세계|해외|여행|제주|부산|강원|경주|속초|유럽|미국|일본|동남아/.test(cat)) return 'calm_info';
    if (/요리|레시피|음식|밥|반찬|베이킹|쿠킹/.test(cat)) return 'mentor';
    if (/육아|결혼|아이|출산|임신|반려|강아지|고양이|펫/.test(cat)) return 'calm_info';
    if (/영화|시네마|음악|노래|드라마|넷플릭스/.test(cat)) return 'calm_info';
    return 'calm_info';
  }

  if (m === 'affiliate') {
    if (/IT|컴퓨터|노트북|스마트폰|테크|자동차|가전/.test(cat)) return 'expert_review';
    if (/육아|결혼|아이|출산|임신|유아|초등|어린이|가족/.test(cat)) return 'mom_cafe';
    if (/건강|의학|의료|병원|다이어트|영양|약/.test(cat)) return 'calm_info';
    return 'friendly';
  }

  if (m === 'business') {
    if (/건강|의학|의료|병원|법률|법무|세무|회계/.test(cat)) return 'calm_info';
    if (/IT|컴퓨터|노트북|스마트폰|테크|자동차/.test(cat)) return 'expert_review';
    return 'professional';
  }

  if (/문학|책|독서|소설|시집|에세이|베스트셀러/.test(cat)) return 'friendly';
  if (/영화|시네마|극장|개봉|영화관/.test(cat)) return 'casual';
  if (/미술|디자인|아트|전시회|갤러리|그림/.test(cat)) return 'friendly';
  if (/공연|전시|뮤지컬|콘서트|연극|오페라/.test(cat)) return 'friendly';
  if (/음악|노래|앨범|가요|팝|힙합|발라드/.test(cat)) return 'casual';
  if (/드라마|넷플릭스|티빙|웨이브|디즈니/.test(cat)) return 'casual';
  if (/스타|연예인|연예|아이돌|가수|배우|셀럽|예능|방송/.test(cat)) return 'casual';
  if (/만화|애니|웹툰|애니메이션|코믹스/.test(cat)) return 'casual';
  if (/방송|TV|프로그램|예능|버라이어티/.test(cat)) return 'casual';
  if (/일상|생각|다이어리|하루|나의|오늘/.test(cat)) return 'friendly';
  if (/육아|결혼|아이|출산|임신|유아|초등|어린이|가족|웨딩|신혼/.test(cat)) return 'friendly';
  if (/반려|강아지|고양이|펫|동물|댕댕이|냥이/.test(cat)) return 'friendly';
  if (/좋은글|이미지|명언|감성|힐링|위로/.test(cat)) return 'friendly';
  if (/패션|미용|뷰티|화장품|옷|코디|스타일|메이크업|스킨케어/.test(cat)) return 'friendly';
  if (/인테리어|DIY|홈|데코|가구|리빙|집꾸미기|셀프/.test(cat)) return 'friendly';
  if (/요리|레시피|음식|밥|반찬|베이킹|쿠킹/.test(cat)) return 'friendly';
  if (/상품|리뷰|후기|언박싱|구매/.test(cat)) return 'friendly';
  if (/원예|재배|식물|화분|가드닝|텃밭/.test(cat)) return 'friendly';
  if (/게임|롤|배그|피파|닌텐도|플스|엑스박스|모바일게임/.test(cat)) return 'casual';
  if (/스포츠|축구|야구|농구|배구|테니스|골프|운동/.test(cat)) return 'casual';
  if (/사진|카메라|출사|포토|촬영/.test(cat)) return 'friendly';
  if (/자동차|차|카|SUV|세단|전기차|튜닝/.test(cat)) return 'expert_review';
  if (/취미|DIY|핸드메이드|공예/.test(cat)) return 'casual';
  if (/국내|여행|제주|부산|강원|경주|속초/.test(cat)) return 'storyteller';
  if (/세계|해외|유럽|미국|일본|동남아|여행/.test(cat)) return 'storyteller';
  if (/맛집|카페|음식점|레스토랑|디저트|브런치/.test(cat)) return 'casual';
  if (/IT|컴퓨터|노트북|스마트폰|테크|기술|프로그래밍|개발|코딩/.test(cat)) return 'expert_review';
  if (/사회|정치|시사|뉴스|이슈|정책/.test(cat)) return 'professional';
  if (/건강|의학|의료|병원|다이어트|영양|약|치료|증상/.test(cat)) return 'calm_info';
  if (/비즈니스|경제|금융|재테크|투자|주식|부동산|창업|마케팅/.test(cat)) return 'professional';
  if (/어학|외국어|영어|일본어|중국어|토익|토플|회화/.test(cat)) return 'friendly';
  if (/교육|학문|학습|공부|시험|자격증|대학|수능/.test(cat)) return 'calm_info';
  return 'friendly';
}
