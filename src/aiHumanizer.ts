/**
 * ✅ AI 글 탐지 회피 모듈 (Humanizer) - 끝판왕 버전
 * 
 * AI가 생성한 콘텐츠를 사람이 작성한 것처럼 자연스럽게 변환
 * - 한국어 맞춤법 교정
 * - 문장 구조 다양화
 * - 동의어 치환으로 다양성 극대화
 * - AI 특유 패턴 완전 제거
 * - 자연스러운 불규칙성 추가
 * - 한국어 특유의 구어체 표현 삽입
 */

// ✅ 한국어 자주 틀리는 맞춤법 교정 사전 (끝판왕)
const SPELLING_CORRECTIONS: Record<string, string> = {
  // 띄어쓰기 오류
  '할수있': '할 수 있',
  '할수없': '할 수 없',
  '할수도': '할 수도',
  '될수있': '될 수 있',
  '않을수': '않을 수',
  '있을수': '있을 수',
  '것같': '것 같',
  '때문에': '때문에',
  '만큼': ' 만큼',
  '처럼은': '처럼은',
  // 자주 틀리는 맞춤법
  '되요': '돼요',
  '됬': '됐',
  '됬어': '됐어',
  '됬습니': '됐습니',
  '안되': '안 돼',
  '안돼요': '안 돼요',
  '몇일': '며칠',
  '몇 일': '며칠',
  '왠지': '왠지', // 정확함
  '웬지': '왠지',
  '웬일': '웬일', // 정확함
  '왠일': '웬일',
  '어의없': '어이없',
  '어의가 없': '어이가 없',
  '금새': '금세',
  '금세말고': '금세 말고',
  '오랫만': '오랜만',
  '오랫동안': '오랫동안', // 정확함
  '설레임': '설렘',
  '어떻게': '어떻게', // 정확함
  '어떻해': '어떡해',
  '어떡게': '어떻게',
  '왠만하': '웬만하',
  '왠만해': '웬만해',
  '낳다': '낳다', // 출산
  '낫다': '낫다', // 치유/비교
  '함부러': '함부로',
  '조금씩': '조금씩', // 정확함
  '조금 식': '조금씩',
  '희안': '희한',
  '의외로': '의외로', // 정확함
  '이외로': '의외로',
  '바램': '바람',
  '알맞는': '알맞은',
  '틀리다': '틀리다', // 오답
  '다르다': '다르다', // 차이
  '다를수': '다를 수',
  '틀릴수': '틀릴 수',
  '곰곰히': '곰곰이',
  '꼼꼼히': '꼼꼼히', // 정확함
  '일일히': '일일이',
  '오랫 동안': '오랫동안',
  '빼곡히': '빼곡이',
  '대게': '대개', // 대부분
  '대계': '대개',
  '갈갈이': '갈갈이', // 정확함
  '구지': '굳이',
  '있슴': '있음',
  '없슴': '없음',
  '했슴': '했음',
  '됬음': '됐음',
  '거예요': '거예요', // 정확함
  '거에요': '거예요',
  '예요': '예요', // 정확함
  '에요': '에요', // 정확함 (받침 없을 때)
};

// ✅ 동의어 치환 사전 (다양성 극대화)
const SYNONYM_MAP: Record<string, string[]> = {
  '매우': ['정말', '굉장히', '무척', '상당히', '엄청', '아주'],
  '정말': ['매우', '진짜', '굉장히', '너무', '참'],
  '많은': ['다양한', '수많은', '여러', '풍부한', '상당한'],
  '중요한': ['핵심적인', '필수적인', '결정적인', '주요한', '큰'],
  '좋은': ['훌륭한', '괜찮은', '멋진', '우수한', '뛰어난'],
  '나쁜': ['좋지 않은', '안 좋은', '불량한', '부정적인'],
  '빠른': ['신속한', '재빠른', '급속한', '민첩한'],
  '느린': ['더딘', '천천한', '완만한'],
  '새로운': ['신선한', '참신한', '획기적인', '혁신적인'],
  '다양한': ['여러 가지', '폭넓은', '각양각색의', '다채로운'],
  '효과적인': ['유효한', '효율적인', '탁월한'],
  '실제로': ['사실', '실상', '현실적으로', '진짜로'],
  '대부분': ['거의', '대다수', '많은 경우', '주로'],
  '가능한': ['할 수 있는', '실현 가능한'],
  '확실히': ['분명히', '명백히', '틀림없이', '확연히'],
  '반드시': ['꼭', '필히', '무조건'],
  '따라서': ['그러므로', '그래서', '때문에', '결과적으로'],
  '하지만': ['그러나', '다만', '반면', '그런데'],
  '그리고': ['또한', '게다가', '더불어', '아울러'],
};

// ✅ AI 특유 패턴 제거 (완전 제거 대상)
const AI_PATTERN_REMOVALS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /물론,?\s*/g, replacement: '' },
  { pattern: /확실히,?\s*/g, replacement: '' },
  { pattern: /당연히,?\s*/g, replacement: '' },
  { pattern: /분명히,?\s*/g, replacement: '' },
  { pattern: /제가 알기로는,?\s*/g, replacement: '' },
  { pattern: /다음과 같습니다[.:]?\s*/g, replacement: '' },
  { pattern: /요약하자면,?\s*/g, replacement: '' },
  { pattern: /결론적으로,?\s*/g, replacement: '결국 ' },
  { pattern: /중요한 점은,?\s*/g, replacement: '' },
  { pattern: /기본적으로,?\s*/g, replacement: '' },
  { pattern: /일반적으로,?\s*/g, replacement: '보통 ' },
  { pattern: /~것입니다\./g, replacement: '거예요.' },
  { pattern: /~입니다\./g, replacement: '예요.' },
  { pattern: /알려드리겠습니다/g, replacement: '알려드릴게요' },
  { pattern: /소개해드리겠습니다/g, replacement: '소개해드릴게요' },
  { pattern: /말씀드리겠습니다/g, replacement: '말씀드릴게요' },
  { pattern: /살펴보겠습니다/g, replacement: '살펴볼게요' },
  { pattern: /도움이 되셨으면 좋겠습니다/g, replacement: '도움이 됐으면 해요' },
];

// ✅ 구어체 전환 매핑 (확장)
const FORMAL_TO_CASUAL: Record<string, string[]> = {
  '입니다': ['이에요', '예요', '이랍니다', '거든요', '이죠'],
  '습니다': ['어요', '아요', '죠', '거든요', '네요'],
  '됩니다': ['돼요', '되죠', '되는 거예요', '되네요'],
  '있습니다': ['있어요', '있죠', '있거든요', '있네요'],
  '없습니다': ['없어요', '없죠', '없거든요', '없네요'],
  '합니다': ['해요', '하죠', '한답니다', '하네요'],
  '였습니다': ['였어요', '이었죠', '였거든요', '였네요'],
  '하겠습니다': ['할게요', '할 거예요', '하려고요', '할래요'],
  '바랍니다': ['바라요', '바랄게요', '바래요'],
  '드립니다': ['드려요', '드릴게요', '드리죠'],
  '같습니다': ['같아요', '같죠', '것 같아요', '같네요'],
  '봅니다': ['봐요', '보죠', '볼게요'],
  '줍니다': ['줘요', '주죠', '줄게요'],
  '됐습니다': ['됐어요', '됐죠', '됐네요'],
  '했습니다': ['했어요', '했죠', '했네요'],
  '겠습니다': ['게요', '거예요', 'ㄹ게요'],
};

// ✅ 감탄사/추임새 (자연스러운 삽입용)
const INTERJECTIONS = [
  '사실', '솔직히', '근데', '아무튼', '어쨌든', '뭐', '글쎄', '그래서',
  '아', '음', '와', '대박', '진짜', '정말', '확실히', '아 근데', '그니까',
];

// ✅ 개인적 표현 (AI가 잘 사용하지 않는 표현)
const PERSONAL_EXPRESSIONS = [
  '제 생각엔', '개인적으로', '솔직히 말하면', '제 경험상', '써본 결과',
  '직접 해보니까', '알고 보니', '나중에 알았는데', '처음엔 몰랐는데',
  '찾아보니까', '주변에서 들었는데', '여러 번 해보니까', '제가 느끼기엔',
];

// ✅ 문장 연결어 다양화
const CONNECTORS: Record<string, string[]> = {
  '그리고': ['또', '게다가', '덧붙여', '더불어', '아울러', '그러면서'],
  '그러나': ['하지만', '근데', '다만', '반면', '그런데', '허나'],
  '그래서': ['따라서', '그러니까', '그러므로', '결국', '그래서인지'],
  '또한': ['더불어', '아울러', '함께', '마찬가지로', '이와 함께'],
  '특히': ['무엇보다', '그중에서도', '특별히', '유독', '더욱이'],
  '예를 들어': ['예컨대', '가령', '이를테면', '한 예로', '말하자면'],
  '즉': ['다시 말해', '바꿔 말하면', '풀어서 말하자면', '이는'],
};

// ✅ 불필요한 반복 패턴 (제거 대상) - 강화
const REPETITIVE_PATTERNS = [
  /(?:입니다\.\s*){2,}/g,
  /(?:합니다\.\s*){2,}/g,
  /(?:있습니다\.\s*){2,}/g,
  /(?:것입니다\.\s*){2,}/g,
  /(?:해요\.\s*){2,}/g,
  /(?:됩니다\.\s*){2,}/g,
  /(?:됐습니다\.\s*){2,}/g,
  /(?:했어요\.\s*){2,}/g,
  /(?:있어요\.\s*){2,}/g,
  /(?:돼요\.\s*){2,}/g,
];

// ✅ 번역투(Translationese) 제거 - 피동→능동 변환
const TRANSLATIONESE_FIXES: { pattern: RegExp; replacement: string }[] = [
  // "~에 의해 ~되다" 패턴 → 능동태
  { pattern: /(.+)에 의해 (.+)되었습니다/g, replacement: '$1이(가) $2했어요' },
  { pattern: /(.+)에 의해 (.+)됩니다/g, replacement: '$1이(가) $2해요' },
  { pattern: /(.+)에 의해 (.+)된/g, replacement: '$1이(가) $2한' },
  { pattern: /(.+)에 의해서/g, replacement: '$1 때문에' },
  // "~되어지다" 이중 피동 제거
  { pattern: /되어지고/g, replacement: '되고' },
  { pattern: /되어집니다/g, replacement: '돼요' },
  { pattern: /되어졌/g, replacement: '됐' },
  { pattern: /되어져/g, replacement: '돼' },
  { pattern: /되어질/g, replacement: '될' },
  // "~해지다" 불필요한 피동
  { pattern: /이루어지다/g, replacement: '이루다' },
  { pattern: /이루어집니다/g, replacement: '이뤄요' },
  { pattern: /이루어졌/g, replacement: '이뤘' },
  // "~가 ~된다" → "~가 ~한다"
  { pattern: /것으로 보여집니다/g, replacement: '것 같아요' },
  { pattern: /것으로 여겨집니다/g, replacement: '것 같아요' },
  { pattern: /것으로 생각됩니다/g, replacement: '것 같아요' },
  { pattern: /것으로 판단됩니다/g, replacement: '것 같아요' },
  // 기타 번역투}
  { pattern: /~라고 할 수 있습니다/g, replacement: '예요' },
  { pattern: /라고 할 수 있어요/g, replacement: '예요' },
  { pattern: /라고 볼 수 있습니다/g, replacement: '이에요' },
  { pattern: /라고 볼 수 있어요/g, replacement: '이에요' },
  { pattern: /하는 것이 가능합니다/g, replacement: '할 수 있어요' },
  { pattern: /하는 것이 필요합니다/g, replacement: '해야 해요' },
  { pattern: /하는 것이 좋습니다/g, replacement: '하면 좋아요' },
  { pattern: /하는 것을 추천합니다/g, replacement: '하는 게 좋아요' },
];

// ✅ 연속 어미 다양화 (로봇 말투 방지)
const ENDING_VARIATIONS: Record<string, string[]> = {
  '했어요': ['했죠', '했거든요', '했네요', '한 거예요'],
  '됐어요': ['됐죠', '됐거든요', '됐네요', '된 거예요'],
  '있어요': ['있죠', '있거든요', '있네요', '있는 거예요'],
  '해요': ['하죠', '하거든요', '하네요', '하는 거예요'],
  '돼요': ['되죠', '되거든요', '되네요', '되는 거예요'],
  '봐요': ['보죠', '보거든요', '보네요', '보는 거예요'],
  '줘요': ['주죠', '주거든요', '주네요', '주는 거예요'],
  '나요': ['나죠', '나거든요', '나네요', '나는 거예요'],
  '가요': ['가죠', '가거든요', '가네요', '가는 거예요'],
};

// ✅ 로그 중복 방지 플래그
let _humanizerLogShown = false;

/**
 * ✅ 메인 AI 회피 함수 (Humanize) - 끝판왕 버전
 */
export function humanizeContent(content: string, intensity: 'light' | 'medium' | 'strong' = 'medium', silent: boolean = false): string {
  if (!content) return content;

  // 로그 한 번만 출력
  if (!silent && !_humanizerLogShown) {
    console.log(`[Humanizer] 🚀 끝판왕 AI 탐지 회피 처리 시작 (강도: ${intensity})`);
    _humanizerLogShown = true;
  }

  let result = content;

  // 0. 한국어 맞춤법 교정
  result = correctSpelling(result);

  // 1. AI 특유 패턴 완전 제거
  result = removeAiPatterns(result);

  // 2. 번역투(피동→능동) 변환 ⭐ NEW
  result = removeTranslationese(result);

  // 3. 반복 패턴 제거
  result = removeRepetitivePatterns(result);

  // 4. 문장 끝 다양화 (formal → casual 혼합)
  if (intensity !== 'light') {
    result = diversifyEndings(result, intensity === 'strong' ? 0.6 : 0.4);
  }

  // 5. 연속 어미 다양화 (로봇 말투 방지) ⭐ NEW
  result = diversifyConsecutiveEndings(result);

  // 6. 연결어 다양화
  result = diversifyConnectors(result);

  // 7. 동의어 치환
  if (intensity !== 'light') {
    result = replaceSynonyms(result, intensity === 'strong' ? 0.3 : 0.15);
  }

  // 8. 개인적 표현 삽입
  if (intensity !== 'light') {
    result = insertPersonalExpressions(result, intensity === 'strong' ? 0.2 : 0.1);
  }

  // 9. 감탄사 삽입 (자연스럽게)
  if (intensity === 'strong') {
    result = insertInterjections(result, 0.08);
  }

  // 10. 문장 길이 불규칙화 (리듬감 부여)
  result = irregularizeSentenceLength(result);

  // 11. 숫자/날짜 자연화
  result = naturalizeNumbers(result);

  return result;
}

/**
 * ✅ Humanizer 로그 플래그 리셋
 */
export function resetHumanizerLog(): void {
  _humanizerLogShown = false;
}

/**
 * ✅ 번역투(Translationese) 제거 - 피동→능동 변환
 */
function removeTranslationese(text: string): string {
  let result = text;
  let fixes = 0;

  for (const { pattern, replacement } of TRANSLATIONESE_FIXES) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) fixes++;
  }

  if (fixes > 0) {
    console.log(`[Humanizer] 번역투 제거: ${fixes}개`);
  }
  return result;
}

/**
 * ✅ 연속 어미 다양화 (로봇 말투 방지)
 * "~해요. ~해요. ~해요." → "~해요. ~하죠. ~하거든요."
 */
function diversifyConsecutiveEndings(text: string): string {
  let result = text;
  let changes = 0;

  // 문장 단위로 분리
  const sentences = result.split(/(?<=[.!?])\s+/);

  // 연속된 같은 어미 감지 및 변환
  for (let i = 1; i < sentences.length; i++) {
    const prevSentence = sentences[i - 1];
    const currSentence = sentences[i];

    for (const [ending, variations] of Object.entries(ENDING_VARIATIONS)) {
      // 이전 문장과 현재 문장이 같은 어미로 끝나면
      if (prevSentence.endsWith(ending + '.') && currSentence.endsWith(ending + '.')) {
        // 현재 문장의 어미를 다른 것으로 변환
        const variation = variations[Math.floor(Math.random() * variations.length)];
        sentences[i] = currSentence.slice(0, -ending.length - 1) + variation + '.';
        changes++;
        break;
      }
    }
  }

  if (changes > 0) {
    console.log(`[Humanizer] 연속 어미 다양화: ${changes}개`);
  }

  return sentences.join(' ');
}

/**
 * ✅ 한국어 맞춤법 교정 (끝판왕)
 */
function correctSpelling(text: string): string {
  let result = text;
  let corrections = 0;

  for (const [wrong, correct] of Object.entries(SPELLING_CORRECTIONS)) {
    if (result.includes(wrong) && wrong !== correct) {
      const before = result;
      result = result.split(wrong).join(correct);
      if (result !== before) corrections++;
    }
  }

  if (corrections > 0) {
    console.log(`[Humanizer] 맞춤법 교정: ${corrections}개`);
  }
  return result;
}

/**
 * ✅ AI 특유 패턴 완전 제거
 */
function removeAiPatterns(text: string): string {
  let result = text;
  let removals = 0;

  for (const { pattern, replacement } of AI_PATTERN_REMOVALS) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) removals++;
  }

  if (removals > 0) {
    console.log(`[Humanizer] AI 패턴 제거: ${removals}개`);
  }
  return result;
}

/**
 * ✅ 동의어 치환 (다양성 극대화)
 */
function replaceSynonyms(text: string, ratio: number): string {
  let result = text;
  let replacements = 0;

  for (const [original, synonyms] of Object.entries(SYNONYM_MAP)) {
    // 원본 단어가 텍스트에 있고 확률에 따라 치환
    if (result.includes(original) && Math.random() < ratio) {
      const synonym = synonyms[Math.floor(Math.random() * synonyms.length)];
      // 첫 번째 등장만 치환 (과도한 변경 방지)
      result = result.replace(original, synonym);
      replacements++;
    }
  }

  if (replacements > 0) {
    console.log(`[Humanizer] 동의어 치환: ${replacements}개`);
  }
  return result;
}

/**
 * 반복 패턴 제거
 */
function removeRepetitivePatterns(text: string): string {
  let result = text;

  for (const pattern of REPETITIVE_PATTERNS) {
    result = result.replace(pattern, (match) => {
      // 첫 번째 것만 남김
      const first = match.split(/\.\s*/)[0];
      return first + '. ';
    });
  }

  return result;
}

/**
 * 문장 끝 다양화 (formal → casual 혼합)
 */
function diversifyEndings(text: string, ratio: number): string {
  let result = text;
  let changeCount = 0;

  const sentences = result.split(/(?<=[.!?])\s+/);
  const totalSentences = sentences.length;
  const targetChanges = Math.floor(totalSentences * ratio);

  // 변환할 문장 인덱스 랜덤 선택
  const indicesToChange = new Set<number>();
  while (indicesToChange.size < targetChanges) {
    indicesToChange.add(Math.floor(Math.random() * totalSentences));
  }

  const modifiedSentences = sentences.map((sentence, index) => {
    if (!indicesToChange.has(index)) return sentence;

    let modified = sentence;
    for (const [formal, casuals] of Object.entries(FORMAL_TO_CASUAL)) {
      if (modified.includes(formal)) {
        const casual = casuals[Math.floor(Math.random() * casuals.length)];
        modified = modified.replace(formal, casual);
        changeCount++;
        break;
      }
    }
    return modified;
  });

  result = modifiedSentences.join(' ');
  console.log(`[Humanizer] 문장 끝 변환: ${changeCount}개`);

  return result;
}

/**
 * 연결어 다양화
 */
function diversifyConnectors(text: string): string {
  let result = text;
  let changeCount = 0;

  for (const [original, alternatives] of Object.entries(CONNECTORS)) {
    const regex = new RegExp(`(^|[.!?]\\s+)${original}`, 'g');
    let isFirst = true;

    result = result.replace(regex, (match, prefix) => {
      // 첫 번째는 유지, 이후는 변환
      if (isFirst) {
        isFirst = false;
        return match;
      }
      const alt = alternatives[Math.floor(Math.random() * alternatives.length)];
      changeCount++;
      return prefix + alt;
    });
  }

  console.log(`[Humanizer] 연결어 변환: ${changeCount}개`);
  return result;
}

/**
 * 개인적 표현 삽입
 */
function insertPersonalExpressions(text: string, ratio: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const insertCount = Math.floor(sentences.length * ratio);

  // 삽입할 위치 랜덤 선택 (문장 시작 부분)
  const indicesToInsert = new Set<number>();
  while (indicesToInsert.size < insertCount && indicesToInsert.size < sentences.length) {
    const idx = Math.floor(Math.random() * sentences.length);
    // 이미 개인적 표현이 있거나 너무 짧은 문장은 제외
    if (!PERSONAL_EXPRESSIONS.some(exp => sentences[idx].includes(exp)) && sentences[idx].length > 20) {
      indicesToInsert.add(idx);
    }
  }

  const modifiedSentences = sentences.map((sentence, index) => {
    if (!indicesToInsert.has(index)) return sentence;

    const expr = PERSONAL_EXPRESSIONS[Math.floor(Math.random() * PERSONAL_EXPRESSIONS.length)];
    // 문장 앞에 삽입
    return expr + ' ' + sentence.charAt(0).toLowerCase() + sentence.slice(1);
  });

  console.log(`[Humanizer] 개인적 표현 삽입: ${indicesToInsert.size}개`);
  return modifiedSentences.join(' ');
}

/**
 * 감탄사 삽입
 */
function insertInterjections(text: string, ratio: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const insertCount = Math.floor(sentences.length * ratio);

  const indicesToInsert = new Set<number>();
  while (indicesToInsert.size < insertCount && indicesToInsert.size < sentences.length) {
    indicesToInsert.add(Math.floor(Math.random() * sentences.length));
  }

  const modifiedSentences = sentences.map((sentence, index) => {
    if (!indicesToInsert.has(index)) return sentence;

    const interjection = INTERJECTIONS[Math.floor(Math.random() * INTERJECTIONS.length)];
    return interjection + ', ' + sentence.charAt(0).toLowerCase() + sentence.slice(1);
  });

  console.log(`[Humanizer] 감탄사 삽입: ${indicesToInsert.size}개`);
  return modifiedSentences.join(' ');
}

/**
 * 문장 길이 불규칙화
 */
function irregularizeSentenceLength(text: string): string {
  // 긴 문장은 가끔 분리, 짧은 문장은 가끔 합치기
  let result = text;

  // 너무 긴 문장 분리 (80자 이상, 쉼표가 있는 경우)
  result = result.replace(/([^.!?]{80,})(,\s*)([^.!?]{20,}[.!?])/g, (match, p1, comma, p2) => {
    // 30% 확률로 분리
    if (Math.random() < 0.3) {
      return p1 + '. ' + p2.charAt(0).toUpperCase() + p2.slice(1);
    }
    return match;
  });

  return result;
}

/**
 * 숫자/날짜 자연화
 */
function naturalizeNumbers(text: string): string {
  let result = text;

  // "100%", "50%" 등을 가끔 "거의 전부", "절반 정도" 등으로
  const percentReplacements: Record<string, string[]> = {
    '100%': ['거의 전부', '대부분', '전체적으로'],
    '90%': ['거의 대부분', '대다수'],
    '80%': ['대부분', '많은 경우'],
    '70%': ['상당수', '꽤 많이'],
    '50%': ['절반 정도', '반 정도'],
    '30%': ['일부', '꽤'],
    '10%': ['일부', '조금'],
  };

  for (const [percent, alts] of Object.entries(percentReplacements)) {
    if (result.includes(percent) && Math.random() < 0.3) {
      const alt = alts[Math.floor(Math.random() * alts.length)];
      result = result.replace(percent, alt);
    }
  }

  return result;
}

/**
 * ✅ HTML 콘텐츠용 AI 회피 처리 (네이버 블로그는 위지윅 에디터라 불필요 - 바로 반환)
 */
export function humanizeHtmlContent(html: string, intensity: 'light' | 'medium' | 'strong' = 'medium'): string {
  // ✅ 네이버 블로그는 HTML이 아닌 위지윅 에디터를 사용하므로 불필요
  // 성능 향상을 위해 즉시 반환
  return html;
}

/**
 * ✅ AI 탐지 위험도 분석
 */
export function analyzeAiDetectionRisk(text: string): {
  score: number;  // 0-100 (높을수록 AI로 탐지될 확률 높음)
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 0;

  // 1. 반복 패턴 체크
  for (const pattern of REPETITIVE_PATTERNS) {
    if (pattern.test(text)) {
      score += 10;
      issues.push('반복적인 문장 패턴 감지');
    }
  }

  // 2. 문장 끝 패턴 분석 (너무 일관적이면 AI 의심)
  const endings = text.match(/[가-힣]+니다\.|[가-힣]+요\.|[가-힣]+죠\./g) || [];
  const formalEndings = endings.filter(e => e.includes('니다')).length;
  const casualEndings = endings.length - formalEndings;

  if (endings.length > 10) {
    const formalRatio = formalEndings / endings.length;
    if (formalRatio > 0.9 || formalRatio < 0.1) {
      score += 15;
      issues.push('문장 끝이 너무 일관적임');
      suggestions.push('formal/casual 혼합 사용 권장');
    }
  }

  // 3. 개인적 표현 부족
  const hasPersonal = PERSONAL_EXPRESSIONS.some(exp => text.includes(exp));
  if (!hasPersonal && text.length > 500) {
    score += 10;
    issues.push('개인적 표현 부족');
    suggestions.push('개인 경험담이나 의견 추가 권장');
  }

  // 4. 문장 길이 균일성 체크
  const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 0);
  if (sentences.length > 5) {
    const lengths = sentences.map(s => s.length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev < avg * 0.2) {
      score += 15;
      issues.push('문장 길이가 너무 균일함');
      suggestions.push('짧은 문장과 긴 문장을 섞어 사용');
    }
  }

  // 5. 특정 AI 패턴 감지
  const aiPatterns = [
    /제가 알기로는/g,
    /다음과 같습니다/g,
    /요약하자면/g,
    /중요한 점은/g,
    /결론적으로/g,
  ];

  let aiPatternCount = 0;
  for (const pattern of aiPatterns) {
    const matches = text.match(pattern);
    if (matches) aiPatternCount += matches.length;
  }

  if (aiPatternCount > 3) {
    score += 20;
    issues.push('AI 특유의 표현 패턴 감지');
    suggestions.push('자연스러운 표현으로 대체 권장');
  }

  // 점수 정규화 (0-100)
  score = Math.min(100, score);

  return {
    score,
    issues,
    suggestions,
  };
}

