/**
 * [Phase 3-1/v2.10.139] contentGenerator god file 분해 — pure string helper 추출.
 *
 * 배경: contentGenerator.ts가 10.8K줄 god file. 매우 안전한 pure helper부터
 * 1 commit = 1 함수 단위로 점진 추출 (회귀 cascade 차단).
 *
 * 이 파일의 함수는 *모두* 외부 state 의존 없는 pure string transform:
 *   - 입력: string
 *   - 출력: string
 *   - side effect: 없음
 *   - 의존성: 없음 (regex 리터럴만)
 */

/**
 * AI가 생성한 이모지를 본문/제목에서 제거.
 *
 * 유니코드 이모지 범위 + 별도 보조 문자 패턴을 처리하고, 제거 후 남은 다중 공백을
 * 단일 공백으로 압축한 뒤 trim.
 *
 * @param text - 이모지 제거 대상 문자열
 * @returns 이모지가 제거된 문자열. 입력이 falsy면 원본 반환.
 */
export function removeEmojis(text: string): string {
  if (!text) return text;

  // 이모지 패턴 (유니코드 이모지 범위)
  const emojiPattern = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F17E}-\u{1F17F}]|[\u{1F18E}]|[\u{1F191}-\u{1F19A}]|[\u{1F201}-\u{1F202}]|[\u{1F21A}]|[\u{1F22F}]|[\u{1F232}-\u{1F23A}]|[\u{1F250}-\u{1F251}]/gu;

  return text.replace(emojiPattern, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * 마크다운/HTML 포맷팅 완전 제거 — 제목/소제목/본문 어디서든 사용 가능한 범용 함수.
 *
 * 처리 대상:
 *   - 마크다운: **bold**, __underline__, *italic* (중첩 3회까지)
 *   - HTML 태그: <u>, <b>, <i>, <strong>, <em>, <mark>, <span>, <font>, <s>, <strike>, <del>, <ins>
 *   - AI 인용 번호: [1], [2, 3] 등
 *   - <style> 블록 + CSS 덤프 텍스트 (v1.4.82 — 네이버 에디터 CSS 본문 누출 차단)
 *
 * @param text - 포맷팅 제거 대상 문자열
 * @returns 포맷팅이 제거되고 trim된 문자열. 입력이 falsy면 원본 반환.
 */
export function stripAllFormatting(text: string): string {
  if (!text) return text;
  let cleaned = String(text);

  // 1. **bold** 마크다운 제거 (3회 반복으로 중첩 케이스도 처리)
  for (let i = 0; i < 3; i++) {
    cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
  }
  cleaned = cleaned.replace(/\*\*/g, ''); // 남은 ** 완전 제거

  // 2. __언더스코어__ 마크다운 제거
  for (let i = 0; i < 3; i++) {
    cleaned = cleaned.replace(/__(.*?)__/g, '$1');
  }
  cleaned = cleaned.replace(/__/g, '');

  // 3. *이탤릭* 마크다운 제거 (단, 문장 중간의 단독 * 는 보존)
  cleaned = cleaned.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');

  // 4. <u>underline</u> HTML 태그 제거
  for (let i = 0; i < 3; i++) {
    cleaned = cleaned.replace(/<u\s*>(.*?)<\/u\s*>/gi, '$1');
  }
  cleaned = cleaned.replace(/<\/?u\s*>/gi, '');

  // 5. <b>, <i>, <strong>, <em>, <mark>, <span> 등 HTML 태그 제거
  cleaned = cleaned.replace(/<\/?(?:b|i|strong|em|mark|span|font|s|strike|del|ins)[^>]*>/gi, '');

  // 6. 빈 태그 정리
  cleaned = cleaned.replace(/<[^>]+>\s*<\/[^>]+>/gi, '');

  // 7. AI 인용 번호 제거: [1], [2, 3] 등
  cleaned = cleaned.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]\s*/g, ' ');

  // 8. <style> 블록 + CSS 덤프 텍스트 제거 (v1.4.82)
  //    AI가 HTML을 생성할 때 <style> 태그를 포함하면 네이버 에디터가 태그만 제거하고
  //    CSS 본문이 일반 텍스트로 붙어버려 "/* 애드센스 승인 전용 CSS */ .post-body { ... }"
  //    같은 문자열이 본문에 그대로 렌더링되는 버그 차단.
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  // CSS 주석 블록 + 셀렉터 본문 제거 — /* 주석 */ .selector { ...; } 형태
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  // 셀렉터 + 속성블록 제거 — ".class, #id { prop: value; }" 같은 순수 CSS 덩어리
  cleaned = cleaned.replace(/(?:^|\n)\s*[.#]?[a-zA-Z][\w\-]*(?:\s*,\s*[.#]?[a-zA-Z][\w\-]*)*\s*\{[^{}]*\}\s*/g, '\n');
  // @keyframes / @media 블록 제거
  cleaned = cleaned.replace(/@(?:keyframes|media|supports|import|charset)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi, '');

  return cleaned.trim();
}

const INTERNAL_STRUCTURE_SEQUENCE_PREFIX = /^\s*[FIRO](?:\s*(?:\u2192|->|=>|>|\/|-)\s*[FIRO]){1,5}\s*[:：]?\s*/i;
const INTERNAL_STRUCTURE_PAREN_PREFIX = /^\s*\(\s*[FIRO]\s*\)\s*[:：]?\s*/i;

export function removeInternalStructureMarkersFromText(text: string): string {
  if (!text) return text;

  const cleaned = String(text)
    .split(/\r?\n/)
    .map((line) => line
      .replace(INTERNAL_STRUCTURE_SEQUENCE_PREFIX, '')
      .replace(INTERNAL_STRUCTURE_PAREN_PREFIX, '')
      .trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned;
}

export function stripInternalMarkers(s: string): string {
  if (typeof s !== 'string') return s;
  return s
    .replace(/\s*\[자료\d*\]/g, '')
    .replace(/\s*\[원본\s*텍스트\]/g, '')
    .replace(/\s*\[Article\s*Content\]/gi, '')
    // 작성일 못박기 제거 — codex 등 에이전트가 환경 날짜로 "2026-06-21 기준"을 박는 경우 strip.
    // 전체 날짜(연-월-일)+"기준"만 제거. 연도만 있는 "2026년 기준"이나 자료 날짜는 보존.
    .replace(/\d{4}\s*[-.년]\s*\d{1,2}\s*[-.월]\s*\d{1,2}\s*일?\s*기준[으로]*[,.\s]*/g, '');
}

export function removeOrdinalHeadingLabelsFromBody(bodyText: string): string {
  if (!bodyText) return '';
  let cleaned = String(bodyText);

  cleaned = cleaned.replace(/(?:첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*번째\s*소제목\s*[:：]\s*/gi, '');
  cleaned = cleaned.replace(/(?:제\s*)?\d+\s*번째\s*소제목\s*[:：]\s*/gi, '');
  cleaned = cleaned.replace(/^\s*소제목\s*[:：]\s*/gim, '');
  cleaned = cleaned.replace(/^\s*(?:[\?？][\s:：]+|\[\s*공지\s*\]|\(\s*공지\s*\)|【\s*공지\s*】)\s*/gim, '');

  for (let i = 0; i < 3; i++) {
    cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
  }
  cleaned = cleaned.replace(/\*\*/g, '');

  for (let i = 0; i < 3; i++) {
    cleaned = cleaned.replace(/<u\s*>(.*?)<\/u\s*>/gi, '$1');
  }
  cleaned = cleaned.replace(/<\/?u\s*>/gi, '');

  cleaned = cleaned.replace(/<\/?(?:b|i|strong|em|mark|span)[^>]*>/gi, '');
  cleaned = cleaned.replace(/\b(OOO|XXX|AAA|BBB|CCC|DDD|EEE|FFF|GGG|HHH|III|JJJ|KKK|LLL|MMM|NNN)\b/g, '');
  cleaned = cleaned.replace(/[○□]{3}/g, '');
  cleaned = cleaned.replace(/\{[^}]+\}/g, '');
  cleaned = cleaned.replace(/\[(?:인물명|키워드|서브키워드|주제|이름|제품명|브랜드명|이미지|사진|IMAGE|image)\]/gi, '');
  cleaned = cleaned.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]\s*/g, ' ');

  cleaned = cleaned.replace(/([^\n])(📌[^\n]+)/g, '$1\n\n$2');
  cleaned = cleaned.replace(/(📌[^\n]+)([^\n])/g, '$1\n\n$2');

  cleaned = cleaned.replace(/(📌[^\n]*(?:반응|요약|정리)[^\n]*[\n]*)([^\n]{20,})/g, (match, label, content) => {
    let formatted = content
      .replace(/(다|네요?|요|죠|음|야|지|어요?|워요?|아요?|했다|겠다|있다|없다|된다|난다|간다|왔다|했네|됐네|왔네|갔네|봤네|이네|해요|해네|나요|네요|대요|라네|라요|데요|군요|래요|했어요|됐어요|왔어요|좋았어요|싫었어요|진짜|실화|대박) /g, '$1\n')
      .replace(/(가네|하네|보네|되네|오네|같네|싶네|하네요|되네요|오네요) /g, '$1\n')
      .replace(/(ㅋㅋ+|ㅎㅎ+|ㅠㅠ+|ㅜㅜ+) /g, '$1\n');

    formatted = formatted
      .replace(/(뻔|됐네|했네|왔네|갔네|봤네|있네|없네|났네|졌네|됐다|했다|왔다|갔다|봤다|났다|졌다|란다|난다|됩니다|합니다|입니다|군요|네요|대요|래요)([가-힣])/g, '$1\n$2');

    if (formatted.indexOf('\n') === -1 && formatted.length > 50) {
      const words = formatted.split(' ');
      let currentLine = '';
      const lines: string[] = [];

      for (const word of words) {
        if (currentLine.length + word.length > 40 && currentLine.length > 0) {
          lines.push(currentLine.trim());
          currentLine = word;
        } else {
          currentLine += (currentLine ? ' ' : '') + word;
        }
      }
      if (currentLine) lines.push(currentLine.trim());
      formatted = lines.join('\n');
    }

    return label + '\n' + formatted;
  });

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = removeInternalStructureMarkersFromText(cleaned);

  return cleaned.trim();
}

/**
 * 제목 공백 정규화 — 다중 공백 압축 + 쉼표/콜론/파이프 주변 일관된 띄어쓰기 적용.
 *
 * 천 단위 구분자(1,000원 등) 보호: 숫자 사이 쉼표는 변형 없음.
 *
 * @param text - 정규화 대상 제목 문자열
 * @returns 정규화된 제목. 입력이 falsy면 빈 문자열.
 */
export function normalizeTitleWhitespace(text: string): string {
  return String(text || '')
    .replace(/\s+/g, ' ')
    // 숫자 사이 쉼표 보호 (1,000원 등 천 단위 구분자 유지)
    .replace(/(?<!\d)\s*,\s*/g, ', ')
    .replace(/,\s+(?=\d{3})/g, ',')  // 이미 깨진 "1, 000" 복구
    .replace(/\s*:\s*/g, ': ')
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * 본문 공백 정규화 (줄바꿈 보존) — 각 라인 내부 다중 공백 압축, 라인 끝 공백 제거,
 * 라인 시작 trim, 3개 이상 연속 줄바꿈을 2개로 압축.
 *
 * normalizeTitleWhitespace와 달리 `\n`을 보존하여 본문 구조 유지.
 *
 * @param text - 정규화 대상 본문 문자열
 * @returns 정규화된 본문. 입력이 falsy면 원본 반환.
 */
export function normalizeBodyWhitespacePreserveNewlines(text: string): string {
  if (!text) return text;
  const normalized = String(text)
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/g, '').trimStart())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized;
}
