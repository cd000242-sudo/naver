/**
 * Gemini API 10회 연속 테스트
 * 100% 성공률 확인용
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env 로드
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// 앱 설정 파일에서 API 키 로드 (settings.json)
let apiKey = process.env.GEMINI_API_KEY;

// 1. 앱 설정 파일 (userData/settings.json)
if (!apiKey) {
  try {
    // Windows: %APPDATA%\better-life-naver\settings.json
    const appDataPath = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
    const settingsPath = path.join(appDataPath, 'better-life-naver', 'settings.json');
    console.log('설정 파일 경로:', settingsPath);
    
    if (fs.existsSync(settingsPath)) {
      const config = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      apiKey = config.geminiApiKey;
      if (apiKey) {
        console.log('✅ settings.json에서 API 키 로드 성공');
      }
    } else {
      console.log('settings.json 파일이 존재하지 않습니다.');
    }
  } catch (e) {
    console.error('settings.json 로드 실패:', e.message);
  }
}

// 2. .env 파일
if (!apiKey) {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      const match = envContent.match(/GEMINI_API_KEY=(.+)/);
      if (match) {
        apiKey = match[1].trim();
        console.log('✅ .env 파일에서 API 키 로드 성공');
      }
    }
  } catch (e) {
    console.error('.env 파일 로드 실패:', e.message);
  }
}

if (!apiKey) {
  console.error('❌ GEMINI_API_KEY가 설정되지 않았습니다.');
  process.exit(1);
}

console.log(`✅ API 키 확인됨 (길이: ${apiKey.length})`);

const client = new GoogleGenerativeAI(apiKey);
const model = client.getGenerativeModel({ model: 'gemini-1.5-pro' });

const TEST_COUNT = 5;
const results = [];

// ✅ callGemini와 동일한 재시도 설정
const MAX_RETRIES = 8;
const RETRY_DELAYS = [3000, 5000, 8000, 10000, 15000, 20000, 25000, 30000];

// ✅ 실제 앱과 동일한 시스템 프롬프트
const systemInstructionText = `당신은 네이버 블로그 SEO 전문가입니다.
사용자가 제공한 주제에 대해 네이버 검색 상위 노출에 최적화된 블로그 글을 작성합니다.
반드시 JSON 형식으로 응답하세요.`;

async function generateWithRetry(testNum) {
  // ✅ 실제 앱과 동일한 크기의 프롬프트 (블로그 글 생성)
  const prompt = `다음 주제로 네이버 블로그 글을 작성해주세요.

주제: "겨울철 건강 관리 팁"

다음 JSON 형식으로 응답해주세요:
{
  "title": "SEO 최적화된 제목",
  "content": "최소 1500자 이상의 본문 내용. 소제목과 단락을 포함하여 작성.",
  "tags": ["태그1", "태그2", "태그3"],
  "summary": "글 요약 (2-3문장)"
}

요구사항:
- 제목은 검색 키워드를 포함하고 클릭을 유도하는 형태로 작성
- 본문은 소제목(##)을 사용하여 구조화
- 각 단락은 최소 3문장 이상
- 실용적인 정보와 팁을 포함
- 자연스러운 문체로 작성`;

  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    try {
      const startTime = Date.now();
      
      // ✅ 일반 방식 사용 (스트리밍보다 안정적)
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: { role: 'system', parts: [{ text: systemInstructionText }] },
        generationConfig: {
          temperature: 0.9,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 16000,
        },
      });
      
      const text = result.response.text();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      
      if (text && text.trim() && text.length >= 100) {
        return { success: true, elapsed, retry, textLength: text.length };
      }
      throw new Error('빈 응답 또는 너무 짧음');
      
    } catch (error) {
      const errorMsg = error.message || '';
      const isRetryable = 
        errorMsg.includes('503') ||
        errorMsg.includes('overloaded') ||
        errorMsg.includes('500') ||
        errorMsg.includes('502') ||
        errorMsg.includes('504') ||
        errorMsg.includes('rate') ||
        errorMsg.includes('network') ||
        errorMsg.includes('timeout') ||
        errorMsg.includes('fetch failed') ||
        errorMsg.includes('parse stream') ||
        errorMsg.includes('Failed to parse');
      
      if (isRetryable && retry < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retry];
        console.log(`  ⏳ 테스트 ${testNum}: 재시도 ${retry + 1}/${MAX_RETRIES} (${delay/1000}초 대기)`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      
      return { success: false, error: errorMsg.substring(0, 100), retry };
    }
  }
  
  return { success: false, error: '최대 재시도 초과', retry: MAX_RETRIES };
}

async function runTests() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 Gemini API ${TEST_COUNT}회 연속 테스트 시작`);
  console.log(`${'='.repeat(60)}\n`);
  
  let successCount = 0;
  let totalRetries = 0;
  
  for (let i = 1; i <= TEST_COUNT; i++) {
    process.stdout.write(`테스트 ${i}/${TEST_COUNT}: `);
    
    const result = await generateWithRetry(i);
    results.push(result);
    
    if (result.success) {
      successCount++;
      totalRetries += result.retry;
      console.log(`✅ 성공 (${result.elapsed}초, ${result.textLength}자${result.retry > 0 ? `, 재시도 ${result.retry}회` : ''})`);
    } else {
      console.log(`❌ 실패: ${result.error}`);
    }
    
    // 테스트 간 간격 (API 부하 방지)
    if (i < TEST_COUNT) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  // 결과 요약
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 테스트 결과 요약`);
  console.log(`${'='.repeat(60)}`);
  console.log(`총 테스트: ${TEST_COUNT}회`);
  console.log(`성공: ${successCount}회`);
  console.log(`실패: ${TEST_COUNT - successCount}회`);
  console.log(`성공률: ${((successCount / TEST_COUNT) * 100).toFixed(1)}%`);
  console.log(`총 재시도 횟수: ${totalRetries}회`);
  console.log(`${'='.repeat(60)}\n`);
  
  if (successCount === TEST_COUNT) {
    console.log('🎉 100% 성공! Gemini API가 안정적으로 작동합니다.');
  } else {
    console.log('⚠️ 일부 실패가 있습니다. 서버 상태를 확인하세요.');
  }
}

runTests().catch(console.error);
