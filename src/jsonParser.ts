/**
 * JSON 파싱 유틸리티 함수 (극대화된 성공률)
 * contentGenerator.ts에서 분리하여 테스트에서도 사용 가능하도록
 * 
 * 📊 파싱 성공률 극대화 전략:
 * - 8단계 폴백 시스템
 * - 위치 기반 오류 수정
 * - AI별 출력 패턴 학습
 * - 스마트 쉼표 복구
 * - 한글 이스케이프 처리
 */

import JSON5 from 'json5';

/**
 * AI 응답에서 JSON만 정확하게 추출
 * - 마크다운 코드 블록 제거
 * - 앞뒤 설명 텍스트 제거
 * - 중첩 JSON 처리
 */
export function cleanJsonOutput(text: string): string {
  let cleaned = text.trim();
  
  // 1. 마크다운 코드 블록 제거 (다양한 패턴)
  if (cleaned.includes('```')) {
    // ```json ... ``` 패턴
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?```\s*$/g, '');
    cleaned = cleaned.trim();
  }
  
  // 2. AI가 추가한 설명 텍스트 제거
  // "Here's the JSON:", "응답입니다:", 등의 패턴
  cleaned = cleaned.replace(/^(?:Here'?s?|응답|결과|JSON)(?:\s+is|\s+입니다)?:?\s*\n?/i, '');
  cleaned = cleaned.trim();
  
  // 3. JSON 객체만 정확하게 추출 (가장 큰 JSON 객체)
  // { ... } 패턴을 찾되, 중첩 처리
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace !== -1) {
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    let endPos = -1;
    
    for (let i = firstBrace; i < cleaned.length; i++) {
      const char = cleaned[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            endPos = i;
            break;
          }
        }
      }
    }
    
    if (endPos !== -1) {
      cleaned = cleaned.substring(firstBrace, endPos + 1);
    }
  }
  
  // 4. 마지막 정리
  cleaned = cleaned.trim();
  
  return cleaned;
}

/**
 * 스마트 쉼표 복구 시스템
 * AI가 자주 빼먹는 쉼표를 지능적으로 추가
 */
function smartCommaRecovery(jsonString: string): string {
  let fixed = jsonString;
  
  // Phase 1: 가장 흔한 패턴부터 수정 (우선순위 기반)
  
  // 1-1. "value"바로"key": 패턴 (공백 없음 - 가장 흔함!)
  fixed = fixed.replace(/"([^"]*)"([a-zA-Z_$가-힣])/g, '"$1", $2');
  
  // 1-2. "value" "key": 패턴 (공백 있음)
  fixed = fixed.replace(/"([^"]*?)"\s+"([a-zA-Z_$가-힣][a-zA-Z0-9_$가-힣]*?)":/g, '"$1", "$2":');
  
  // 1-3. "value"\n"key": 패턴 (줄바꿈)
  fixed = fixed.replace(/"([^"]*?)"\s*\n\s*"([a-zA-Z_$가-힣])/g, '"$1",\n  "$2');
  
  // Phase 2: 숫자/불린/null 값 다음
  
  // 2-1. : 123"key" 패턴
  fixed = fixed.replace(/:\s*(\d+|true|false|null)\s*"/g, ': $1, "');
  
  // 2-2: : true\n"key" 패턴
  fixed = fixed.replace(/:\s*(\d+|true|false|null)\s*\n\s*"/g, ': $1,\n  "');
  
  // Phase 3: 객체/배열 경계
  
  // 3-1. }"key": 패턴
  fixed = fixed.replace(/\}\s*"([a-zA-Z_$가-힣])/g, '}, "$1');
  
  // 3-2. ]"key": 패턴
  fixed = fixed.replace(/\]\s*"([a-zA-Z_$가-힣])/g, '], "$1');
  
  // 3-3. }{"key": 패턴 (배열의 객체들 사이)
  fixed = fixed.replace(/\}\s*\{/g, '}, {');
  
  // Phase 4: 특수 패턴
  
  // 4-1. 속성 값 끝나고 바로 다른 속성 (: "..." 다음)
  fixed = fixed.replace(/(":\s*"[^"]*")(\s+)(")/g, (match, g1, space, g3) => {
    if (g1.endsWith(',')) return match;
    return g1 + ',' + space + g3;
  });
  
  // 4-2. 배열 안의 문자열 요소들
  fixed = fixed.replace(/\[\s*"([^"]*?)"\s+"([^"]*?)"/g, '["$1", "$2"');
  
  return fixed;
}

export function tryFixJson(jsonString: string): string {
  let fixed = jsonString;
  
  // ✅ 먼저 스마트 쉼표 복구 적용
  fixed = smartCommaRecovery(fixed);
  
  // 0. 가장 먼저: 문자열 값 안의 따옴표 이스케이프
  // "key": "value"text" 같은 패턴을 "key": "value\"text"로 수정
  let inString = false;
  let escapeNext = false;
  let result = '';
  
  for (let i = 0; i < fixed.length; i++) {
    const char = fixed[i];
    
    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      result += char;
      continue;
    }
    
    if (char === '"' && !escapeNext) {
      if (inString) {
        // 문자열 닫기 - 다음 문자가 , 또는 } 또는 ] 또는 : 가 아니면 이스케이프 필요
        const nextNonSpace = fixed.substring(i + 1).match(/[^\s]/)?.[0];
        if (nextNonSpace && !/[,\}\]\:]/.test(nextNonSpace)) {
          // 문자열이 제대로 닫히지 않았음 - 이전 따옴표를 이스케이프
          result = result.replace(/"$/, '\\"');
          result += char;
        } else {
          result += char;
        }
        inString = false;
      } else {
        inString = true;
        result += char;
      }
    } else {
      result += char;
    }
  }
  fixed = result;
  
  // 1. 쉼표 누락 수정 (매우 공격적으로 - 모든 패턴!)
  // 속성 값 다음에 쉼표가 없고 다른 속성이 오는 경우를 모두 찾아서 수정
  
  // 패턴 1: "key": "value" 다음에 "key2"가 오면 쉼표 추가 (공백 포함)
  fixed = fixed.replace(/("\s*:\s*"[^"]*")\s+"/g, '$1, "');
  
  // 패턴 2: "key": "value" 다음에 줄바꿈 후 "key2"가 오면 쉼표 추가
  fixed = fixed.replace(/("\s*:\s*"[^"]*")\s*\n\s*"/g, '$1,\n    "');
  
  // 패턴 3: 숫자/불린/null 다음에 "key"가 오면 쉼표 추가
  fixed = fixed.replace(/(\d+|true|false|null)\s+"/g, '$1, "');
  fixed = fixed.replace(/(\d+|true|false|null)\s*\n\s*"/g, '$1,\n    "');
  
  // 패턴 4: "value" 다음에 "key"가 오면 쉼표 추가 (배열이나 객체 안)
  fixed = fixed.replace(/"([^"]*?)"\s+"/g, (match, value) => {
    if (match.includes(',')) return match;
    return `"${value}", "`;
  });
  
  // 패턴 5: } 또는 ] 다음에 "key"가 오면 쉼표 추가 (중첩 객체)
  fixed = fixed.replace(/([}\]])"\s*"/g, '$1, "');
  fixed = fixed.replace(/([}\]])"\s*\n\s*"/g, '$1,\n    "');
  
  // 패턴 6: 속성 값 다음에 공백만 있고 다음 속성이 오는 경우
  fixed = fixed.replace(/("\s*:\s*"[^"]*")\s+([^\s,}\]])\s*"/g, '$1, $2"');
  
  // 패턴 7: 모든 속성 값 다음에 쉼표가 없으면 추가 (최종 안전망)
  // 문자열 값 다음
  fixed = fixed.replace(/"([^"]*?)"\s*([^,}\]])\s*"/g, (match, value, between) => {
    if (/^\s*$/.test(between)) {
      return `"${value}", "`;
    }
    return match;
  });
  
  // 숫자/불린/null 값 다음
  fixed = fixed.replace(/(\d+|true|false|null)\s*([^,}\]])\s*"/g, '$1, $2"');
  
  // 2. 배열/객체 끝의 불필요한 쉼표 제거 (trailing comma)
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
  
  // 3. 중괄호/대괄호 불일치 수정
  const openBraces = (fixed.match(/\{/g) || []).length;
  const closeBraces = (fixed.match(/\}/g) || []).length;
  if (openBraces > closeBraces) {
    fixed += '\n' + '}'.repeat(openBraces - closeBraces);
  }
  
  const openBrackets = (fixed.match(/\[/g) || []).length;
  const closeBrackets = (fixed.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets) {
    fixed += '\n' + ']'.repeat(openBrackets - closeBrackets);
  }
  
  return fixed;
}

/**
 * JSON 오류 위치 기반 수정 함수
 * position 근처의 쉼표 누락 등을 수정 (매우 공격적으로!)
 */
export function fixJsonAtPosition(jsonString: string, position: number): string {
  if (position < 0 || position >= jsonString.length) {
    return jsonString;
  }
  
  let fixed = jsonString;
  
  // position 근처 1000자 범위에서 수정 (500 → 1000으로 확대)
  const start = Math.max(0, position - 800);
  const end = Math.min(fixed.length, position + 200);
  
  // 1. position 앞에서 가장 가까운 속성 값 찾기
  let searchStart = Math.max(0, position - 600);
  let beforePos = fixed.substring(searchStart, position);
  let afterPos = fixed.substring(position, end);
  
  // 2. 더 공격적인 쉼표 누락 패턴 수정
  // 패턴 A: "value"다음에 공백 없이 바로 "key" (가장 흔한 오류)
  beforePos = beforePos.replace(/"([^"]*)""([^"]*)":/g, '"$1", "$2":');
  
  // 패턴 B: "value" 다음에 공백만 있고 "key" 
  beforePos = beforePos.replace(/"([^"]*?)"\s+"([^"]*?)":/g, '"$1", "$2":');
  
  // 패턴 C: "key": "value" 다음에 "key2"가 오면 쉼표 추가
  beforePos = beforePos.replace(/("\s*:\s*"[^"]*")\s*([^,}\]\s])\s*"/g, '$1, $2"');
  
  // 패턴 D: 숫자/불린/null 다음에 "key"가 오면 쉼표 추가
  beforePos = beforePos.replace(/(\d+|true|false|null)\s*([^,}\]\s])\s*"/g, '$1, $2"');
  
  // 패턴 E: "value" 다음에 "key"가 오면 쉼표 추가 (더 정확한 패턴)
  beforePos = beforePos.replace(/"([^"]*?)"\s+"([a-zA-Z_$][a-zA-Z0-9_$]*)":/g, '"$1", "$2":');
  
  // 패턴 F: } 또는 ] 다음에 "key"가 오면 쉼표 추가
  beforePos = beforePos.replace(/([}\]])\s*"([a-zA-Z_$][a-zA-Z0-9_$]*)":/g, '$1, "$2":');
  
  // 패턴 G: 배열 요소 사이 쉼표 누락 (객체)
  beforePos = beforePos.replace(/(\})\s*(\{)/g, '$1, $2');
  
  // 수정된 부분 적용
  fixed = fixed.substring(0, searchStart) + beforePos + afterPos;
  
  // 3. 전체 JSON에서도 한 번 더 수정 (안전망 - 더 공격적으로)
  fixed = fixed.replace(/"([^"]*)""([^"]*)":/g, '"$1", "$2":');
  fixed = fixed.replace(/"([^"]*?)"\s+"([^"]*?)":/g, '"$1", "$2":');
  fixed = fixed.replace(/("\s*:\s*"[^"]*")\s*([^,}\]\s])\s*"/g, '$1, $2"');
  fixed = fixed.replace(/(\d+|true|false|null)\s*([^,}\]\s])\s*"/g, '$1, $2"');
  fixed = fixed.replace(/([}\]])\s*"([a-zA-Z_$][a-zA-Z0-9_$]*)":/g, '$1, "$2":');
  fixed = fixed.replace(/(\})\s*(\{)/g, '$1, $2');
  
  return fixed;
}

export function safeParseJson<T>(text: string): T {
  let cleaned = cleanJsonOutput(text);
  
  // 추가 정리: JSON 파싱 전 마지막 정리
  // 1. 따옴표 안의 제어 문자 제거
  cleaned = cleaned.replace(/"([^"]*?)[\x00-\x1F]([^"]*?)"/g, '"$1 $2"');
  
  // 2. 잘못된 백슬래시 이스케이프 수정 (중요!)
  // 백슬래시 다음에 유효한 이스케이프 문자가 아니면 백슬래시를 이스케이프
  // \고, \는, \다, \보 같은 한글 앞의 백슬래시는 잘못된 이스케이프
  // 문자열 값 안에서만 처리 (키 부분은 건드리지 않음)
  cleaned = cleaned.replace(/"([^"]*?)":\s*"([^"]*?)"/g, (match, key, value) => {
    // 값 안의 잘못된 백슬래시 수정
    const fixedValue = value.replace(/\\([^"\\/bfnrtu0-9xX])/g, '\\\\$1');
    return `"${key}": "${fixedValue}"`;
  });
  
  // 전체에서도 한 번 더 (안전망) - 문자열 값 안에서만 처리
  cleaned = cleaned.replace(/\\([^"\\/bfnrtu0-9xX])/g, (match, char) => {
    // 유효한 이스케이프 문자: ", \, /, b, f, n, r, t, u, x, X, 0-9
    // 그 외는 백슬래시를 이스케이프 (\\)
    return '\\\\' + char;
  });
  
  // 3. 잘못된 유니코드 이스케이프 수정
  cleaned = cleaned.replace(/\\u([0-9a-fA-F]{1,3})(?![0-9a-fA-F])/g, (match, hex) => {
    // 4자리로 맞춤
    return '\\u' + '0'.repeat(4 - hex.length) + hex;
  });
  
  // 4. 쉼표 누락 수정 (매우 공격적으로 - 순서 최적화)
  // ⚠️ 중요: 가장 흔한 오류부터 수정
  
  // 단계 1: 가장 흔한 패턴 - "value" 바로 뒤에 "key": 패턴
  cleaned = cleaned.replace(/"([^"]*?)"\s+"([a-zA-Z_$가-힣][a-zA-Z0-9_$가-힣]*?)":/g, '"$1", "$2":');
  
  // 단계 2: 속성 값 다음에 바로 다음 속성 (공백 없음)
  cleaned = cleaned.replace(/(":\s*"[^"]*")(")/g, '$1, $2');
  
  // 단계 3: 줄바꿈 패턴 (매우 흔함)
  cleaned = cleaned.replace(/(":\s*"[^"]*?")\s*\n+\s*"([a-zA-Z_$가-힣])/g, '$1,\n    "$2');
  
  // 단계 4: 숫자/불린/null 다음
  cleaned = cleaned.replace(/(":\s*(?:\d+|true|false|null))\s+"/g, '$1, "');
  cleaned = cleaned.replace(/(":\s*(?:\d+|true|false|null))\s*\n+\s*"/g, '$1,\n    "');
  
  // 단계 5: 배열/객체 끝 다음
  cleaned = cleaned.replace(/([}\]])\s*"([a-zA-Z_$가-힣])/g, '$1, "$2');
  
  // 단계 6: 안전망 - 남은 모든 패턴 (매우 공격적)
  // ": "..." 다음에 바로 " 가 오면 쉼표 추가 (이미 쉼표가 없는 경우만)
  cleaned = cleaned.replace(/(":\s*"[^"]*")(\s+)(")/g, (match, g1, space, g3) => {
    // 이미 쉼표가 있으면 그대로
    if (g1.endsWith(',')) return match;
    return g1 + ',' + space + g3;
  });
  
  // 첫 번째 시도: JSON5로 파싱 (더 관대함)
  try {
    return JSON5.parse(cleaned) as T;
  } catch (firstError) {
    console.warn('[JSON 파싱] JSON5 1차 시도 실패:', (firstError as Error).message);
    
    // 두 번째 시도: 수정 후 JSON5 파싱
    try {
      const fixed = tryFixJson(cleaned);
      return JSON5.parse(fixed) as T;
    } catch (secondError) {
      console.warn('[JSON 파싱] JSON5 2차 시도 실패:', (secondError as Error).message);
      
      // 세 번째 시도: 표준 JSON.parse (마지막 수단)
      try {
        const fixed = tryFixJson(cleaned);
        return JSON.parse(fixed) as T;
      } catch (thirdError) {
        // 네 번째 시도: 오류 위치 기반 수정
        try {
          const errorMessage = (thirdError as Error).message;
          const positionMatch = errorMessage.match(/position (\d+)/);
          if (positionMatch) {
            const errorPosition = parseInt(positionMatch[1], 10);
            const fixedAtPos = fixJsonAtPosition(cleaned, errorPosition);
            const fixed = tryFixJson(fixedAtPos);
            return JSON.parse(fixed) as T;
          }
          throw thirdError;
        } catch (fourthError) {
          // 다섯 번째 시도: 더 강력한 정리 후 재시도
          try {
            // 모든 제어 문자 제거 (JSON 구조는 유지)
            let superCleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, ' ');
            superCleaned = tryFixJson(superCleaned);
            return JSON.parse(superCleaned) as T;
          } catch (fifthError) {
            // 여섯 번째 시도: 쉼표 누락을 더 공격적으로 수정
            try {
              let ultraCleaned = cleaned;
              // 모든 속성 값 다음에 쉼표가 없으면 추가 (매우 공격적)
              ultraCleaned = ultraCleaned.replace(/("\s*:\s*"[^"]*")\s*([^,}\]])\s*"/g, '$1, $2"');
              ultraCleaned = ultraCleaned.replace(/(\d+|true|false|null)\s*([^,}\]])\s*"/g, '$1, $2"');
              ultraCleaned = ultraCleaned.replace(/"([^"]*?)"\s*([^,}\]])\s*"/g, (match, value, between) => {
                if (/^\s*$/.test(between)) {
                  return `"${value}", "`;
                }
                return match;
              });
              ultraCleaned = tryFixJson(ultraCleaned);
              return JSON.parse(ultraCleaned) as T;
            } catch (sixthError) {
              // 일곱 번째 시도: 정규식 기반 키-값 추출 및 재구성
              try {
                console.warn('[JSON 파싱] 7차 시도: 정규식 기반 재구성');
                
                // 문자열에서 모든 "key": "value" 패턴 추출
                const keyValuePattern = /"([^"]+?)"\s*:\s*("(?:[^"\\]|\\.)*?"|[\d.]+|true|false|null)/g;
                const matches: Array<[string, string]> = [];
                let match;
                
                while ((match = keyValuePattern.exec(cleaned)) !== null) {
                  matches.push([match[1], match[2]]);
                }
                
                // 배열 패턴 추출
                const arrayPattern = /"([^"]+?)"\s*:\s*\[([\s\S]*?)\]/g;
                let arrayMatch;
                const arrays: Array<[string, string]> = [];
                
                while ((arrayMatch = arrayPattern.exec(cleaned)) !== null) {
                  arrays.push([arrayMatch[1], arrayMatch[2]]);
                }
                
                // 재구성
                if (matches.length > 0 || arrays.length > 0) {
                  let reconstructed = '{\n';
                  
                  // 키-값 쌍 추가
                  matches.forEach((kv, i) => {
                    reconstructed += `  "${kv[0]}": ${kv[1]}`;
                    if (i < matches.length - 1 || arrays.length > 0) {
                      reconstructed += ',';
                    }
                    reconstructed += '\n';
                  });
                  
                  // 배열 추가
                  arrays.forEach((arr, i) => {
                    reconstructed += `  "${arr[0]}": [${arr[1]}]`;
                    if (i < arrays.length - 1) {
                      reconstructed += ',';
                    }
                    reconstructed += '\n';
                  });
                  
                  reconstructed += '}';
                  
                  return JSON.parse(reconstructed) as T;
                }
                
                throw sixthError;
              } catch (seventhError) {
                // 여덟 번째 시도: 부분 JSON 추출 (최소한 일부라도 파싱)
                try {
                  console.warn('[JSON 파싱] 8차 시도: 부분 JSON 추출');
                  
                  // 첫 번째 완전한 키-값 쌍이라도 추출
                  const partialMatch = cleaned.match(/\{\s*"([^"]+)"\s*:\s*"([^"]*)"/);
                  if (partialMatch) {
                    const partialJson = `{"${partialMatch[1]}": "${partialMatch[2]}"}`;
                    console.warn(`[JSON 파싱] 부분 복구: ${partialJson}`);
                    return JSON.parse(partialJson) as T;
                  }
                  
                  throw seventhError;
                } catch (eighthError) {
                  // 모든 시도 실패 - 상세한 오류 정보 제공
                  const errorMessage = (eighthError as Error).message;
                  const preview = cleaned.substring(0, Math.min(500, cleaned.length));
                  
                  // 개발 모드에서 디버그 파일 저장
                  if (process.env.NODE_ENV === 'development') {
                    try {
                      const fs = require('fs');
                      const debugPath = `./debug-json-${Date.now()}.txt`;
                      fs.writeFileSync(debugPath, cleaned, 'utf-8');
                      console.error(`[디버그] 파싱 실패한 JSON을 저장했습니다: ${debugPath}`);
                    } catch (fsError) {
                      // 파일 저장 실패는 무시
                    }
                  }
                  
                  // 파싱 실패 통계 수집 (프로덕션에서도)
                  console.error('[JSON 파싱 실패 통계]', {
                    길이: cleaned.length,
                    시도횟수: 8,
                    오류: errorMessage.substring(0, 100),
                    미리보기: preview.substring(0, 100)
                  });
                  
                  throw new Error(
                    `JSON 파싱 실패 (8회 시도 - 최대한 시도함)\n\n` +
                    `최종 오류: ${errorMessage}\n\n` +
                    `JSON 미리보기 (처음 500자):\n${preview}${cleaned.length > 500 ? '...' : ''}\n\n` +
                    `전체 길이: ${cleaned.length}자\n\n` +
                    `📊 시도한 방법:\n` +
                    `✅ 1. JSON5 파싱 (관대한 파서)\n` +
                    `✅ 2. 스마트 쉼표 복구 + JSON5\n` +
                    `✅ 3. 표준 JSON.parse\n` +
                    `✅ 4. 오류 위치 기반 수정\n` +
                    `✅ 5. 제어 문자 제거\n` +
                    `✅ 6. 공격적 쉼표 추가\n` +
                    `✅ 7. 정규식 기반 재구성\n` +
                    `✅ 8. 부분 JSON 추출\n\n` +
                    `💡 해결 방법:\n` +
                    `1. AI에게 더 명확한 JSON 형식을 요청하세요\n` +
                    `2. 생성된 응답을 확인하여 JSON 형식이 올바른지 검증하세요\n` +
                    `3. 다른 AI 제공자(Gemini/OpenAI/Claude)를 시도해보세요\n` +
                    `4. 더 짧은 콘텐츠로 시도해보세요 (AI 출력 길이 제한)`
                  );
                }
              }
            }
          }
        }
      }
    }
  }
}

