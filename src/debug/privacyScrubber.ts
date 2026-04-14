/**
 * privacyScrubber.ts — 덤프에서 민감 정보 강제 제거
 * ✅ [v1.4.54] 자동 덤프 시스템의 개인정보 보호 계층
 *
 * 스크럽 대상:
 *  - 네이버 쿠키 (NID_SES/NID_AUT/NID_JKL)
 *  - API 키 (Gemini/OpenAI/Claude)
 *  - 비밀번호 필드
 *  - 이메일 (부분 마스킹)
 *  - 카드번호 패턴
 */

// 정규식 스크럽 목록 (순차 적용)
const SCRUB_PATTERNS: Array<{ name: string; regex: RegExp; replacement: string }> = [
  // 네이버 NID 쿠키 값
  {
    name: 'NID cookies',
    regex: /("(?:NID_SES|NID_AUT|NID_JKL|NID_ES|NID_ESG)"\s*:\s*")[^"]{8,}/g,
    replacement: '$1***REDACTED***',
  },
  // Cookie 헤더 내 NID
  {
    name: 'NID in Cookie header',
    regex: /(NID_(?:SES|AUT|JKL|ES|ESG)=)[^;\s"]+/gi,
    replacement: '$1***REDACTED***',
  },
  // Gemini / Google AI API 키 (AIza + 35자)
  {
    name: 'Gemini API key',
    regex: /AIza[0-9A-Za-z\-_]{35}/g,
    replacement: '***GEMINI_KEY_REDACTED***',
  },
  // Anthropic Claude API 키 (sk-ant- 접두사) — OpenAI보다 먼저 매칭
  {
    name: 'Claude API key',
    regex: /sk-ant-[A-Za-z0-9\-_]{20,}/g,
    replacement: '***CLAUDE_KEY_REDACTED***',
  },
  // OpenAI API 키 (sk- 접두사, 48자 이상)
  {
    name: 'OpenAI API key',
    regex: /sk-(?!ant-)[A-Za-z0-9\-_]{20,}/g,
    replacement: '***OPENAI_KEY_REDACTED***',
  },
  // Perplexity API 키 (pplx- 접두사)
  {
    name: 'Perplexity API key',
    regex: /pplx-[A-Za-z0-9]{20,}/g,
    replacement: '***PERPLEXITY_KEY_REDACTED***',
  },
  // JSON 내 비밀번호 필드
  {
    name: 'password field',
    regex: /("(?:savedNaverPassword|savedLicensePassword|password|pw)"\s*:\s*")[^"]+/gi,
    replacement: '$1***REDACTED***',
  },
  // 이메일 주소 (앞 2자 + 도메인 마스킹)
  {
    name: 'email',
    regex: /([a-zA-Z0-9._%+\-]{2})[a-zA-Z0-9._%+\-]*@([a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g,
    replacement: '$1***@$2',
  },
  // 카드번호 패턴 (4-4-4-4)
  {
    name: 'credit card',
    regex: /\b(\d{4})[\-\s]?\d{4}[\-\s]?\d{4}[\-\s]?(\d{4})\b/g,
    replacement: '$1-****-****-$2',
  },
];

export interface ScrubResult {
  text: string;
  detections: Record<string, number>;
}

/**
 * 텍스트에서 민감 정보를 마스킹합니다.
 * 반환: 마스킹된 텍스트 + 패턴별 감지 건수
 */
export function scrubText(input: string): ScrubResult {
  if (!input) return { text: input, detections: {} };

  let out = input;
  const detections: Record<string, number> = {};

  for (const { name, regex, replacement } of SCRUB_PATTERNS) {
    // 감지 건수 카운트 (전역 플래그 필요)
    const matches = out.match(regex);
    if (matches && matches.length > 0) {
      detections[name] = matches.length;
      out = out.replace(regex, replacement);
    }
  }

  return { text: out, detections };
}

/**
 * 객체를 재귀 순회하며 문자열 필드를 스크럽합니다.
 * 반환: 스크럽된 객체 + 누적 감지 건수
 */
export function scrubObject(obj: unknown): { data: unknown; detections: Record<string, number> } {
  const totalDetections: Record<string, number> = {};

  const visit = (value: unknown): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      const { text, detections } = scrubText(value);
      for (const [k, v] of Object.entries(detections)) {
        totalDetections[k] = (totalDetections[k] || 0) + v;
      }
      return text;
    }
    if (Array.isArray(value)) {
      return value.map(visit);
    }
    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        // 키 이름이 민감 필드면 값 전체 제거
        if (/password|secret|token|apiKey|api_key/i.test(k)) {
          result[k] = '***REDACTED***';
          totalDetections['sensitive key'] = (totalDetections['sensitive key'] || 0) + 1;
        } else {
          result[k] = visit(v);
        }
      }
      return result;
    }
    return value;
  };

  return { data: visit(obj), detections: totalDetections };
}

/**
 * 계정 ID를 마지막 4자리만 남기고 마스킹합니다. (예: blog_user_01 → ****r_01)
 */
export function maskAccountId(accountId: string | undefined): string {
  if (!accountId) return 'unknown';
  if (accountId.length <= 4) return '****';
  return '****' + accountId.slice(-4);
}

/**
 * PRIVACY_REPORT.txt 내용 생성 — 사용자가 개발자에게 보내기 전 검증용
 */
export function generatePrivacyReport(
  dumpPath: string,
  detections: Record<string, number>
): string {
  const lines: string[] = [];
  lines.push('===== PRIVACY REPORT =====');
  lines.push(`생성 시각: ${new Date().toISOString()}`);
  lines.push(`덤프 경로: ${dumpPath}`);
  lines.push('');
  lines.push('[자동 스크럽 완료 항목]');

  if (Object.keys(detections).length === 0) {
    lines.push('  (감지된 민감 정보 없음 — 안전)');
  } else {
    for (const [name, count] of Object.entries(detections)) {
      lines.push(`  - ${name}: ${count}건 마스킹`);
    }
  }

  lines.push('');
  lines.push('[제외된 파일]');
  lines.push('  - cookies.json (세션 쿠키 파일은 덤프에서 완전 제외)');
  lines.push('');
  lines.push('[검증 방법]');
  lines.push('  이 폴더를 개발자에게 보내기 전, 메모장으로 파일을 열고');
  lines.push('  "AIza", "sk-", "NID_SES", "password" 키워드를 검색해 주세요.');
  lines.push('  어떤 결과도 나오면 안 됩니다.');
  lines.push('=========================');
  return lines.join('\n');
}
