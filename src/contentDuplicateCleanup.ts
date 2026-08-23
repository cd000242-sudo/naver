import { calculateSimilarity } from './contentDuplicateHeuristics.js';

type HeadingLike = {
  title?: string;
};

export function removeDuplicateHeadings(bodyPlain: string, headings: HeadingLike[]): string {
  if (!bodyPlain || !headings || headings.length === 0) return bodyPlain;

  let cleaned = bodyPlain;

  headings.forEach((heading) => {
    // [2026-08-23] A model can answer with headings that carry no `title` (plain strings, or
    // `heading`/`name` aliases). Reading `.title` off those threw
    // "Cannot read properties of undefined (reading 'replace')" and killed the whole post.
    const headingTitle = typeof heading?.title === 'string' ? heading.title : '';
    if (!headingTitle.trim()) return;
    const regex = new RegExp(headingTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = cleaned.match(regex);

    if (matches && matches.length > 1) {
      console.warn(`[중복 소제목 감지]"${headingTitle}"이(가) ${matches.length}번 반복됨.첫 번째만 유지합니다.`);

      const firstIndex = cleaned.indexOf(headingTitle);
      let firstOccurrenceFound = false;
      cleaned = cleaned.replace(regex, (match, offset) => {
        if (!firstOccurrenceFound && offset === firstIndex) {
          firstOccurrenceFound = true;
          return match;
        }

        return '[[REMOVE_DUPLICATE]]';
      });

      cleaned = cleaned.replace(/\[\[REMOVE_DUPLICATE\]\][^\n]*(?:\n(?!\n)[^\n]*)*\n\n/g, '');
      cleaned = cleaned.replace(/\[\[REMOVE_DUPLICATE\]\][^\n]*(?:\n(?!\n)[^\n]*)*$/g, '');
    }
  });

  const paragraphs = cleaned.split(/\n\n+/);
  const seenParagraphs = new Set<string>();
  const uniqueParagraphs: string[] = [];

  const closingPatterns = [
    /도움이\s*되(었|셧|셨)으면\s*좋겠(습니다|어요|다)/gi,
    /도움이\s*되(었|셧|셨)으면\s*(합니다|해요|한다)/gi,
    /도움이\s*되(었|셧|셨)으면/gi,
    /도움이\s*되(었|셧|셨)기를\s*바랍니다/gi,
    /이\s*정보가\s*도움이\s*되(었|셧|셨)기를\s*바랍니다/gi,
    /도움이\s*되었으면\s*좋겠습니다/gi,
    /참고하시길\s*바랍니다/gi,
    /함께\s*응원해요/gi,
    /화이팅/gi,
    /응원합니다/gi,
    /응원하[며겠해]/gi,
    /앞날에\s*[\s\S]{0,40}바라/gi,
    /좋은\s*일만\s*가득/gi,
    /다음에\s*또\s*만나요/gi,
    /다음에\s*또\s*봬요/gi,
    /글을\s*마무리하겠습니다/gi,
    /글을\s*마칩니다/gi,
    /마무리하겠습니다/gi,
    /마무리합니다/gi,
    /기대하며\s*글을/gi,
    /기대하며\s*마무리/gi,
    /기대하며\s*마칩니다/gi,
    /승리를\s*기대하며/gi,
    /활약을\s*기대하며/gi,
    /앞으로의\s*전개를\s*지켜봐야겠습니다/gi,
    /앞으로\s*어떻게\s*전개될지\s*지켜봐야겠습니다/gi,
    /이\s*정도\s*기대.*괜찮겠죠/gi,
    /사건의\s*진상이\s*명확히\s*밝혀지길\s*기대합니다/gi,
    /이번\s*사건이\s*좋은\s*방향으로\s*해결되길\s*바랍니다/gi,
    /이번\s*사건이\s*좋은\s*방향으로\s*해결되길\s*기대합니다/gi,
    /지켜봐야겠습니다/gi,
    /기대됩니다/gi,
    /기대해봅니다/gi,
    /기대해봐야겠습니다/gi,
    /이번\s*사건의\s*진실이\s*밝혀지길\s*바랍니다/gi,
    /앞으로의\s*전개를\s*주목해야겠습니다/gi,
    /리스크\s*관리를\s*철저히\s*하시길\s*바랍니다/gi,
    /현명한\s*투자\s*결정\s*하시길\s*바랍니다/gi,
    /투자는\s*신중한\s*판단이\s*필요합니다/gi,
    /신중한\s*투자\s*결정에\s*도움이\s*되길\s*바랍니다/gi,
    /재테크에\s*도움이\s*되었으면\s*좋겠습니다/gi,
    /재태크에\s*도움되셧으면\s*좋겠습니다/gi,
    /재태크에\s*도움이\s*되었으면\s*좋겠습니다/gi,
    /재테크에\s*도움되셧으면\s*좋겠습니다/gi,
    /OOO/g,
    /XXX/g,
    /○○○/g,
    /□□□/g,
    /\{키워드\}/g,
    /\{서브키워드\}/g,
    /\{인물명\}/g,
    /\{메인키워드\}/g,
  ];

  const ctaRemovalPatterns = [
    /🔗\s*더\s*알아보기/gi,
    /더\s*알아보기/gi,
    /🔗\s*관련\s*기사\s*보기/gi,
    /관련\s*기사\s*보기/gi,
    /🔗\s*자세히\s*보기/gi,
    /자세히\s*보기/gi,
  ];

  let closingParagraphFound = false;

  for (const paragraph of paragraphs) {
    const normalized = paragraph.trim().toLowerCase().replace(/\s+/g, ' ');
    // [2026-08-05] 비교용은 불릿 마커·문장부호까지 제거한다(문장 dedupe와 동일 규칙).
    //   실측: 같은 내용이 불릿판("- …")과 평문판("….")으로 2벌 발행 — 토큰 끝 문장부호
    //   차이("반복됩니다" vs "반복됩니다.")로 유사도가 0.85 밑으로 떨어져 못 잡았다.
    const comparable = normalized.replace(/[^\w\s가-힣]/g, '').replace(/\s+/g, ' ').trim();
    const isClosingParagraph = closingPatterns.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(paragraph);
    });

    if (isClosingParagraph) {
      if (closingParagraphFound) {
        console.warn('[중복 마무리 감지]마무리 문구 반복 제거');
        continue;
      }
      closingParagraphFound = true;
    }

    let isDuplicate = false;
    for (const seen of seenParagraphs) {
      const similarity = calculateSimilarity(comparable, seen);
      if (similarity > 0.85) {
        isDuplicate = true;
        console.warn(`[중복 내용 감지]유사도 ${(similarity * 100).toFixed(1)}% - 중복 문단 제거`);
        break;
      }
    }

    const words = normalized.split(/\s+/).filter((word) => word.length > 2);
    if (words.length > 10) {
      const uniqueWords = new Set(words);
      const repetitionRatio = uniqueWords.size / words.length;
      if (repetitionRatio < 0.3) {
        isDuplicate = true;
        console.warn(`[단어 반복 감지] 반복률 ${((1 - repetitionRatio) * 100).toFixed(1)}% - 중복 문단 제거`);
      }
    }

    if (!isDuplicate && normalized.length > 20) {
      seenParagraphs.add(comparable);
      uniqueParagraphs.push(paragraph);
    }
  }

  cleaned = uniqueParagraphs.join('\n\n');

  // [2026-08-05] 꼬리 중복 제거를 문단 단위로 재작성.
  //   기존 slice(-1000) 재구성은 (a) 경계를 구분자 없이 이어붙여 "…있습니다.서로를"
  //   이음새를 만들고 (b) 꼬리 1000자 안의 문단 경계·불릿 줄바꿈을 전부 파괴했다(라이브 실측).
  //   경계를 문단 시작점으로 당기고, 중복이 실제로 제거된 문단만 다시 조립한다.
  const TAIL_WINDOW = 1000;
  let tailStart = 0;
  if (cleaned.length > TAIL_WINDOW) {
    const boundary = cleaned.lastIndexOf('\n\n', cleaned.length - TAIL_WINDOW);
    tailStart = boundary === -1 ? 0 : boundary + 2;
  }
  const tailParagraphs = cleaned.slice(tailStart).split(/\n\n+/);
  const seenSentences = new Set<string>();
  const rebuiltParagraphs: string[] = [];
  let totalSentenceCount = 0;
  let removedSentenceCount = 0;

  for (const paragraph of tailParagraphs) {
    const sentences = paragraph.split(/[.!?。！？]\s*/).filter((sentence) => sentence.trim().length > 5);
    totalSentenceCount += sentences.length;
    const uniqueSentences: string[] = [];

    for (const sentence of sentences) {
      const normalized = sentence.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s가-힣]/g, '');
      const hasClosingPattern = closingPatterns.some((pattern) => {
        pattern.lastIndex = 0;
        return pattern.test(sentence);
      });

      if (hasClosingPattern) {
        const patternKey = closingPatterns.find((pattern) => pattern.test(sentence))?.source || '';
        if (seenSentences.has(`closing_${patternKey} `)) continue;
        seenSentences.add(`closing_${patternKey} `);
      }

      let isDuplicate = false;
      for (const seen of seenSentences) {
        if (seen.startsWith('closing_')) continue;
        const similarity = calculateSimilarity(normalized, seen);
        if (similarity > 0.6) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate && normalized.length > 5) {
        seenSentences.add(normalized);
        uniqueSentences.push(sentence);
      }
    }

    if (uniqueSentences.length === sentences.length) {
      // 중복이 없는 문단은 원문 그대로 보존한다(불릿·물음표 등 서식 유지).
      rebuiltParagraphs.push(paragraph);
      continue;
    }

    removedSentenceCount += sentences.length - uniqueSentences.length;
    if (uniqueSentences.length > 0) {
      rebuiltParagraphs.push(`${uniqueSentences.map((sentence) => sentence.trim()).join('. ')}.`);
    }
  }

  if (removedSentenceCount > 0) {
    cleaned = cleaned.slice(0, tailStart) + rebuiltParagraphs.join('\n\n');
    console.warn(`[마무리 반복 제거] ${totalSentenceCount}개 문장 중 ${totalSentenceCount - removedSentenceCount}개만 유지`);
  }

  cleaned = cleaned.replace(/(.{20,}?)(\s*\1){2,}/g, '$1');

  const unwantedPhrases = [
    /리스크\s*관리를\s*철저히\s*하시길\s*바랍니다/gi,
    /현명한\s*투자\s*결정\s*하시길\s*바랍니다/gi,
    /투자는\s*신중한\s*판단이\s*필요합니다/gi,
    /신중한\s*투자\s*결정에\s*도움이\s*되길\s*바랍니다/gi,
    /재테크에\s*도움이\s*되었으면\s*좋겠습니다/gi,
    /재태크에\s*도움되셧으면\s*좋겠습니다/gi,
    /재태크에\s*도움이\s*되었으면\s*좋겠습니다/gi,
    /재테크에\s*도움되셧으면\s*좋겠습니다/gi,
    /도움이\s*되(었|셧|셨)으면\s*좋겠(습니다|어요|다)/gi,
    /도움이\s*되(었|셧|셨)으면\s*(합니다|해요|한다)/gi,
    /도움이\s*되(었|셧|셨)으면/gi,
    /도움이\s*되(었|셧|셨)기를\s*바랍니다/gi,
    /이\s*정보가\s*도움이\s*되(었|셧|셨)기를\s*바랍니다/gi,
    /참고하시길\s*바랍니다/gi,
    /정보가\s*도움이\s*되었으면\s*좋겠습니다/gi,
    /정보가\s*도움이\s*되셧으면\s*좋겠습니다/gi,
    /정보가\s*도움이\s*되셨으면\s*좋겠습니다/gi,
  ];

  for (const pattern of unwantedPhrases) {
    cleaned = cleaned.replace(pattern, '');
  }

  const formalClosingPatterns = [
    /앞으로의\s*전개를\s*지켜봐야겠습니다/gi,
    /앞으로\s*어떻게\s*전개될지\s*지켜봐야겠습니다/gi,
    /이\s*정도\s*기대.*괜찮겠죠/gi,
    /사건의\s*진상이\s*명확히\s*밝혀지길\s*기대합니다/gi,
    /이번\s*사건이\s*좋은\s*방향으로\s*해결되길\s*바랍니다/gi,
    /이번\s*사건이\s*좋은\s*방향으로\s*해결되길\s*기대합니다/gi,
    /지켜봐야겠습니다/gi,
    /기대됩니다/gi,
    /기대해봅니다/gi,
    /기대해봐야겠습니다/gi,
    /이번\s*사건의\s*진실이\s*밝혀지길\s*바랍니다/gi,
    /앞으로의\s*전개를\s*주목해야겠습니다/gi,
    /OOO/g,
    /XXX/g,
    /○○○/g,
    /□□□/g,
  ];

  for (const pattern of formalClosingPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  for (const pattern of ctaRemovalPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}
