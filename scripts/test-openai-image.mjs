// v2.7.4 진단 스크립트: OpenAI Image API 모델 가용성 직접 검증
// 사용: OPENAI_API_KEY=sk-... node scripts/test-openai-image.mjs
//
// 목적: 'gpt-image-1' / 'gpt-image-2' / 'dall-e-3' 각 모델에 대해
//       (1) 모델 호출 가능 여부
//       (2) 응답 형식 (b64_json vs url)
//       (3) 응답 버퍼 크기
//       (4) 오류 코드/메시지
// 를 실측해서 출력. 사용자가 실제로 어떤 모델을 쓸 수 있는지 즉시 확정.

import { config } from 'dotenv';
config({ override: false });

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey) {
  console.error('❌ OPENAI_API_KEY 환경변수 없음. .env 또는 셸에 설정 후 재실행.');
  process.exit(1);
}
console.log(`🔑 API 키 감지 (length=${apiKey.length}, prefix=${apiKey.slice(0, 7)}...)`);

const OPENAI_URL = 'https://api.openai.com/v1/images/generations';
const TEST_PROMPT = 'A simple red apple on a white background, professional product photography';
const MODELS_TO_TEST = ['gpt-image-1', 'gpt-image-2', 'dall-e-3'];

async function testModel(model) {
  console.log(`\n━━━ ${model} 테스트 ━━━`);
  const startedAt = Date.now();
  try {
    const body = {
      model,
      prompt: TEST_PROMPT,
      n: 1,
      size: '1024x1024',
    };
    if (model === 'dall-e-3') {
      body.quality = 'standard';
    } else {
      body.quality = 'auto';
    }

    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const elapsedMs = Date.now() - startedAt;

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const code = errBody.error?.code || res.status;
      const msg = errBody.error?.message || res.statusText;
      const type = errBody.error?.type || '';
      console.log(`  ❌ HTTP ${res.status} (${elapsedMs}ms)`);
      console.log(`     code: ${code}`);
      console.log(`     type: ${type}`);
      console.log(`     message: ${msg.substring(0, 200)}`);
      return { model, ok: false, code, msg };
    }

    const data = await res.json();
    const imageData = data.data?.[0];
    if (!imageData) {
      console.log(`  ⚠️ 200 OK이지만 data 배열이 비어있음 (${elapsedMs}ms)`);
      return { model, ok: false, code: 'empty_data', msg: 'data 배열 비어있음' };
    }

    let bufLen = 0;
    let format = '';
    if (imageData.b64_json) {
      bufLen = Buffer.from(imageData.b64_json, 'base64').length;
      format = 'b64_json';
    } else if (imageData.url) {
      format = 'url';
      try {
        const dl = await fetch(imageData.url);
        const ab = await dl.arrayBuffer();
        bufLen = ab.byteLength;
      } catch (e) {
        console.log(`  ⚠️ URL 다운로드 실패: ${e.message}`);
      }
    } else {
      console.log(`  ⚠️ 응답에 b64_json/url 둘 다 없음 (${elapsedMs}ms)`);
      return { model, ok: false, code: 'no_image_field', msg: '응답 필드 누락' };
    }

    const isValid = bufLen >= 1024;
    console.log(`  ${isValid ? '✅' : '⚠️'} HTTP 200 (${elapsedMs}ms)`);
    console.log(`     형식: ${format}`);
    console.log(`     버퍼 크기: ${bufLen.toLocaleString()} bytes ${isValid ? '(정상)' : '(빈 이미지!)'}`);
    return { model, ok: isValid, format, bufLen, elapsedMs };
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    console.log(`  ❌ 예외 (${elapsedMs}ms): ${err.message?.substring(0, 200)}`);
    return { model, ok: false, code: 'exception', msg: err.message };
  }
}

console.log('\n=== OpenAI Image API 가용성 진단 ===');
const results = [];
for (const model of MODELS_TO_TEST) {
  results.push(await testModel(model));
  // 모델 사이 1초 간격 (rate limit 회피)
  await new Promise((r) => setTimeout(r, 1000));
}

console.log('\n\n=== 종합 결과 ===');
console.table(
  results.map((r) => ({
    model: r.model,
    ok: r.ok ? '✅' : '❌',
    detail: r.ok ? `${r.format}, ${r.bufLen?.toLocaleString()} bytes` : `${r.code}: ${(r.msg || '').substring(0, 80)}`,
  })),
);

const usableModels = results.filter((r) => r.ok).map((r) => r.model);
console.log(`\n👉 사용 가능 모델: ${usableModels.length > 0 ? usableModels.join(', ') : '없음 — API 키 권한/계정 상태 확인 필요'}`);
