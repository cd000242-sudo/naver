import { sanitizeUnverifiedOfficialGuideClaims } from './contentClaimSanitizer.js';

export function filterExaggeratedContent(text: string): string {
  if (!text) return text;

  const internalSettingPatterns: RegExp[] = [
    /실제\s*경험을\s*바탕으로,?\s*/g,
    /최신\s*연구\s*결과,?\s*/g,
    /비용\s*대비\s*효율을\s*따지면,?\s*/g,
    /실제\s*생활에서는\s*/g,
    /전문가\s*의견에\s*따르면,?\s*/g,
    /업계\s*관계자에\s*따르면,?\s*/g,
    /통계에\s*따르면,?\s*/g,
    /데이터에\s*따르면,?\s*/g,
    /조사\s*결과에\s*따르면,?\s*/g,
    /연구에\s*따르면,?\s*/g,
    /실제\s*경험처럼\s*작성/g,
    /EEAT\s*(강화|믹싱|적용)/gi,
    /글쓰기\s*스타일\s*(통일|설정|적용)/g,
    /톤\s*:\s*(친근하고|전문적인|정보\s*전달력)/g,
    /표현\s*:\s*["']?[~]?[가-힣]+["']?/g,
    /구조\s*:\s*소제목당/g,
    /목표\s*분량\s*:\s*[\d,]+[~\-][\d,]+자/g,
    /\[?프롬프트\s*(지시|내용|설정)\]?[^\n]*/gi,
    /\[?시스템\s*(메시지|지시)\]?[^\n]*/gi,
    /⚠️\s*CRITICAL[^\n]*/g,
    /⚠️\s*DO\s*NOT[^\n]*/g,
    /⚠️\s*PRIORITY[^\n]*/g,
    /⚠️\s*절대\s*금지[^\n]*/g,
    /✅\s*필수[^\n]*/g,
    /❌\s*(금지|절대\s*금지)[^\n]*/g,
    /ABSOLUTE\s*FORBIDDEN[^\n]*/gi,
    /MANDATORY[^\n]*/gi,
    /QUALITY\s*REQUIREMENT[^\n]*/gi,
    /\[Note:\s*[^\]]+\]/gi,
    /\[참고:\s*[^\]]+\]/g,
    /\(AI\s*지시[^)]*\)/gi,
    /\(내부\s*설정[^)]*\)/g,
    /targetAge\s*[:=]\s*['"]?[^'";\n]+['"]?/gi,
    /toneStyle\s*[:=]\s*['"]?[^'";\n]+['"]?/gi,
    /writeStyle\s*[:=]\s*['"]?[^'";\n]+['"]?/gi,
    /experienceStyle\s*[:=]\s*['"]?[^'";\n]+['"]?/gi,
  ];

  let filtered = text;
  for (const pattern of internalSettingPatterns) {
    filtered = filtered.replace(pattern, '');
  }

  const foreignLanguagePatterns: RegExp[] = [
    /[А-Яа-яЁё][А-Яа-яЁё\s.,!?;:'"()-]+/g,
    /[\u4E00-\u9FFF]{4,}[^\n]*[\u4E00-\u9FFF]{2,}/g,
    /[\u3040-\u30FF]{3,}[^\n]*/g,
  ];

  for (const pattern of foreignLanguagePatterns) {
    filtered = filtered.replace(pattern, '');
  }

  const ctaPatterns: RegExp[] = [
    /🔗\s*더\s*알아보기[^\n]*/g,
    /🔗\s*관련\s*기사\s*보기[^\n]*/g,
    /🔗\s*자세히\s*보기[^\n]*/g,
    /더\s*알아보기\s*[→>]?[\s\n]*$/g,
    /관련\s*기사\s*보기\s*[→>]?[\s\n]*$/g,
    /자세히\s*보기\s*[→>]?[\s\n]*$/g,
    /\n+🔗[^\n]*$/g,
  ];

  for (const pattern of ctaPatterns) {
    filtered = filtered.replace(pattern, '');
  }

  const replacements: Array<[RegExp, string]> = [
    [/최고의\s+/g, '만족스러운 '],
    [/완벽한\s+/g, '좋은 '],
    [/필수\s+(제품|아이템)/g, '추천할 만한 $1'],
    [/최강의?\s+/g, '추천할 만한 '],
    [/확실히\s+/g, ''],
    [/반드시\s+/g, ''],
    [/무조건\s+/g, ''],
    [/100%\s*/g, '대부분 '],
    [/지금\s*바로\s*/g, ''],
    [/마지막\s*기회/g, '기회'],
    [/놓치면\s*후회/g, '참고하시면 좋을'],
    [/완치/g, '개선'],
    [/치료한다/g, '도움이 될 수 있다'],
    [/최저가/g, '합리적인 가격'],
  ];

  for (const [pattern, replacement] of replacements) {
    filtered = filtered.replace(pattern, replacement);
  }

  filtered = sanitizeUnverifiedOfficialGuideClaims(filtered);
  filtered = filtered.replace(/\n{3,}/g, '\n\n');

  return filtered.trim();
}
