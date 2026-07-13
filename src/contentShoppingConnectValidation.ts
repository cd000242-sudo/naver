import { visibleCharacterCount } from './contentTextMetrics.js';

export const SHOPPING_CONNECT_TARGET_SCORE = 90;
export const SHOPPING_CONNECT_PUBLISH_MIN_SCORE = 80;

export function canPublishShoppingConnectQuality(score: number): boolean {
  return Number.isFinite(score) && score >= SHOPPING_CONNECT_PUBLISH_MIN_SCORE;
}

const BANNED_HEADING_PATTERNS = [
  '삶의 질이 달라졌', '삶의 질이 달라졌네요', '삶의 질이 달라졌어요',
  '실제 체감하는 성능 변화', '실제 체감하는 변화', '체감하는 성능 변화',
  '소음 짜증 다 사라졌', '소음 다 사라졌어요',
  '이것 하나로 끝', '이것만 알면 끝', '이거 하나로 끝',
  '결정적 포인트', '핵심 포인트', '꿀팁 포인트',
  '직접 써보니 알았다', '직접 해보니 알겠더라고요', '직접 써보니 알겠더라',
  '실사용자가 말하는 편의성', '실사용자 후기',
  '위생과 관리의 결정적 포인트', '위생과 관리의 포인트',
  '피부가 달라졌어요', '피부가 달라졌네요',
  '입맛이 돌아왔어요', '입맛이 살아났어요',
  '스타일이 달라졌어요', '패션이 달라졌어요',
  '드라이빙이 달라졌어요', '운전이 달라졌어요',
  '육아가 편해졌어요', '육아가 달라졌어요',
  '반려생활이 달라졌어요', '펫 라이프가 달라졌어요',
  '여행이 편해졌어요', '여행이 달라졌어요',
  '인생템 발견', '인생템을 만났', '갓성비',
  '강력 추천', '무조건 사세요', '안 사면 후회',
];

export type ShoppingConnectValidationContent = {
  bodyPlain?: string;
  headings?: Array<{ title: string; content?: string }>;
  conclusion?: string;
};

export interface ShoppingConnectValidationOptions {
  minimumBodyChars?: number;
}

export function detectBannedHeadingPatterns(headings: Array<{ title: string }>): string[] {
  const detectedPatterns: string[] = [];

  for (const heading of headings) {
    const titleLower = heading.title.toLowerCase();
    for (const pattern of BANNED_HEADING_PATTERNS) {
      if (titleLower.includes(pattern.toLowerCase())) {
        detectedPatterns.push(`"${heading.title}" contains banned pattern: "${pattern}"`);
      }
    }
  }

  if (detectedPatterns.length > 0) {
    console.warn(`[Shopping Connect] ⚠️ 금지 패턴 ${detectedPatterns.length}개 감지됨:`, detectedPatterns);
  }

  return detectedPatterns;
}

export function validateShoppingConnectContent(
  content: ShoppingConnectValidationContent,
  options: ShoppingConnectValidationOptions = {},
): { score: number; feedback: string[] } {
  const feedback: string[] = [];
  let score = 100;

  const headingCount = content.headings?.length || 0;
  if (headingCount < 3) {
    score -= 20;
    feedback.push(`❌ 소제목 ${headingCount}개 (최소 3개 필요)`);
  } else if (headingCount > 8) {
    score -= 10;
    feedback.push(`⚠️ 소제목 ${headingCount}개 (8개 이하 권장)`);
  } else {
    feedback.push(`✅ 소제목 ${headingCount}개 (구조 변동 엔진 허용 범위)`);
  }

  const bannedPatterns = detectBannedHeadingPatterns(content.headings || []);
  if (bannedPatterns.length > 0) {
    score -= bannedPatterns.length * 10;
    feedback.push(`❌ 금지 패턴 ${bannedPatterns.length}개 감지`);
    bannedPatterns.forEach((pattern) => feedback.push(`   - ${pattern}`));
  } else {
    feedback.push('✅ 금지 패턴 없음');
  }

  const minimumBodyChars = Math.max(1, Math.round(Number(options.minimumBodyChars) || 2500));
  const headingBody = content.headings?.map(heading => heading.content || '').join('\n\n') || '';
  const totalChars = visibleCharacterCount(content.bodyPlain || headingBody);
  if (totalChars < minimumBodyChars) {
    score -= 15;
    feedback.push(`⚠️ 본문 ${totalChars}자 (${minimumBodyChars}자 이상 권장)`);
  } else {
    feedback.push(`✅ 본문 ${totalChars}자`);
  }

  const conclusionText = content.conclusion || '';
  if (!conclusionText.includes('쇼핑커넥트') && !conclusionText.includes('수수료')) {
    score -= 10;
    feedback.push('⚠️ 쇼핑커넥트 고지 문구 누락');
  } else {
    feedback.push('✅ 쇼핑커넥트 고지 문구 포함');
  }

  console.log(`[Shopping Connect] 📊 콘텐츠 품질 점수: ${score}/100`);
  return { score: Math.max(0, score), feedback };
}
