// ⚡ Gemini Tier 1 (paid) 확인 스크립트
// 사용: node scripts/check-gemini-tier.mjs
//
// 동작:
// 1. %APPDATA%/better-life-naver/settings.json 에서 Gemini API 키 로드
// 2. 최신 Pro 모델 접근 확인
// 3. 최신 Flash 연속 호출로 현재 프로젝트 한도 동작 확인
// 4. 최종 판정

import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SETTINGS_PATH = join(homedir(), 'AppData', 'Roaming', 'better-life-naver', 'settings.json');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(color, msg) {
  console.log(color + msg + RESET);
}

async function main() {
  console.log('');
  log(CYAN + BOLD, '🐙 Gemini Tier 1 (paid) 확인');
  console.log('');

  // 1. settings.json 읽기
  let settings;
  try {
    settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch (e) {
    log(RED, '❌ settings.json 읽기 실패: ' + e.message);
    log(YELLOW, '   경로: ' + SETTINGS_PATH);
    process.exit(1);
  }

  const apiKey = settings.geminiApiKey || (settings.geminiApiKeys && settings.geminiApiKeys[0]);
  if (!apiKey) {
    log(RED, '❌ Gemini API 키 없음');
    process.exit(1);
  }

  log(GREEN, `✓ API 키 로드 (길이 ${apiKey.length})`);

  const extraKeys = (settings.geminiApiKeys || []).filter(k => k && k !== apiKey);
  if (extraKeys.length > 0) {
    log(CYAN, `  추가 키: ${extraKeys.length}개`);
  }
  console.log('');

  // ━━━ TEST 1: 최신 Pro 모델 접근 확인 ━━━
  log(BOLD, '📍 TEST 1: Gemini 3.1 Pro Preview 접근 확인');
  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent',
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say hi in one word' }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
      }
    );

    const body = await res.text();
    console.log(`  HTTP: ${res.status}`);

    if (res.ok) {
      log(GREEN, '  ✅ Pro 모델 호출 성공');
      log(GREEN + BOLD, '  → 최신 Pro 모델 접근 가능');
      try {
        const data = JSON.parse(body);
        const usage = data.usageMetadata;
        if (usage) {
          console.log(`  Usage: prompt=${usage.promptTokenCount}, total=${usage.totalTokenCount} tokens`);
        }
      } catch {}
    } else {
      const bodyShort = body.substring(0, 500);
      if (bodyShort.includes('limit: 0') || bodyShort.includes('FreeTier')) {
        log(RED, '  ❌ 현재 프로젝트에서 Pro 한도가 0입니다');
        log(YELLOW, '     프로젝트 등급·과금 연결·모델 접근 권한을 AI Studio에서 확인하세요');
      } else if (res.status === 429) {
        log(YELLOW, '  ⚠️ 429 (Rate Limit) — 다른 원인 가능');
      } else {
        log(RED, `  ❌ 실패 (HTTP ${res.status})`);
      }
      console.log(`  Body: ${bodyShort}`);
    }
  } catch (e) {
    log(RED, '  ❌ 네트워크 오류: ' + e.message);
  }
  console.log('');

  // ━━━ TEST 2: Flash 빠른 연속 호출 (RPM 확인) ━━━
  log(BOLD, '📍 TEST 2: Gemini 3.5 Flash 연속 12회 호출');
  log(CYAN, '  (정확한 RPM·TPM·RPD는 프로젝트별 AI Studio 한도를 따릅니다)');

  let success = 0;
  let rateLimit = 0;
  let other = 0;
  const results = [];

  for (let i = 1; i <= 12; i++) {
    const start = Date.now();
    try {
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Reply ${i}` }] }],
            generationConfig: { maxOutputTokens: 5 },
          }),
        }
      );
      const elapsed = Date.now() - start;

      if (res.ok) {
        success++;
        results.push(`  ${i.toString().padStart(2)}. ✅ ${res.status} (${elapsed}ms)`);
      } else if (res.status === 429) {
        rateLimit++;
        const body = await res.text();
        const perMinute = body.includes('PerMinute') || body.includes('RPM');
        const perDay = body.includes('PerDay') || body.includes('RPD');
        const tier = body.includes('FreeTier') ? ' [FREE TIER]' : '';
        results.push(`  ${i.toString().padStart(2)}. ⚠️ 429${tier}${perMinute ? ' (RPM)' : perDay ? ' (RPD)' : ''}`);
      } else {
        other++;
        results.push(`  ${i.toString().padStart(2)}. ❌ ${res.status}`);
      }
    } catch (e) {
      other++;
      results.push(`  ${i.toString().padStart(2)}. ❌ err: ${e.message}`);
    }
    // 짧은 간격으로 현재 프로젝트의 실제 rate-limit 응답을 확인
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('');
  console.log(results.join('\n'));
  console.log('');
  console.log(`  성공: ${success}/12, Rate Limit: ${rateLimit}, 기타: ${other}`);
  console.log('');

  // ━━━ 최종 판정 ━━━
  log(BOLD, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(BOLD, '🎯 최종 판정');
  console.log('');

  if (success === 12) {
    log(GREEN + BOLD, '✅ Gemini 3.5 Flash 12/12 호출 통과');
    log(GREEN, '   정확한 프로젝트 등급과 잔여 한도는 AI Studio에서 확인하세요');
    log(CYAN, '');
    log(CYAN, '💡 다음 단계:');
    log(CYAN, '   1. 앱 설정 → Gemini → 플랜 타입은 자동 감지 유지');
    log(CYAN, '   2. 모델: Gemini 3.1 Flash-Lite / 3.5 Flash / 3.1 Pro Preview 중 선택');
    log(CYAN, '   3. v1.4.50 Safety Lock 예산 $50 정도로 설정 (월 실제 $3~5 수준)');
  } else if (rateLimit >= 2) {
    log(YELLOW + BOLD, '🟡 현재 프로젝트 Rate Limit에 걸림');
    log(YELLOW, '   가능한 원인:');
    log(YELLOW, '   1. billing 계정은 등록했지만 이 API 키의 프로젝트에 미연결');
    log(YELLOW, '   2. billing 프로세스가 완료되는 데 1~2시간 지연');
    log(YELLOW, '   3. 다른 프로젝트의 키 사용 중');
    log(CYAN, '');
    log(CYAN, '💡 확인 방법:');
    log(CYAN, '   1. https://aistudio.google.com/apikey');
    log(CYAN, '      → 사용 중인 키 옆 프로젝트명 확인');
    log(CYAN, '   2. https://console.cloud.google.com/billing/linkedaccount?project={프로젝트명}');
    log(CYAN, '      → Billing account linked 되어 있는지 확인');
    log(CYAN, '   3. 연결 안 됐으면: billing → 프로젝트에 linking');
  } else {
    log(YELLOW + BOLD, '⚠️ 판정 불가');
    log(YELLOW, `   success=${success}, rateLimit=${rateLimit}, other=${other}`);
    log(YELLOW, '   네트워크/설정 문제일 수 있음');
  }
  console.log('');
}

main().catch(e => {
  log(RED, '스크립트 오류: ' + e.message);
  console.error(e.stack);
  process.exit(1);
});
