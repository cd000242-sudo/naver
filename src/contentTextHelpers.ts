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
