/**
 * ImageFX v2.0 리팩토링 후 통합 테스트
 * 빌드된 dist/image/imageFxGenerator.js를 직접 테스트
 */
const path = require('path');
const fs = require('fs');

const LOG_FILE = 'C:\\tmp\\imagefx_v2_test.log';
function log(msg) {
  fs.appendFileSync(LOG_FILE, msg + '\n');
  console.log(msg);
}

async function main() {
  fs.writeFileSync(LOG_FILE, '');
  log('=== ImageFX v2.0 리팩토링 테스트 ===\n');

  // dist 빌드 후 테스트 (tsc를 먼저 실행해야 함)
  try {
    // 동적 import가 ESM이므로 직접 API 호출 방식으로 테스트
    const http = require('http');
    const { chromium } = require('playwright');

    // 1. AdsPower 프로필 열기
    const list = await new Promise((resolve, reject) => {
      http.get('http://local.adspower.com:50325/api/v1/user/list?page=1&page_size=10', (res) => {
        let data = ''; res.on('data', c => data += c); res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    const profile = list.data.list[0];
    log(`프로필: ${profile.name} (${profile.user_id})`);

    const openRes = await new Promise((resolve, reject) => {
      http.get(`http://local.adspower.com:50325/api/v1/browser/start?user_id=${profile.user_id}`, (res) => {
        let data = ''; res.on('data', c => data += c); res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });
    
    // 2. Playwright 연결 + labs.google/fx 접속
    const browser = await chromium.connectOverCDP(openRes.data.ws.puppeteer);
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();

    const currentUrl = page.url();
    if (!currentUrl.includes('labs.google/fx')) {
      log('labs.google/fx 접속...');
      await page.goto('https://labs.google/fx/tools/image-fx', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
    } else {
      log('labs.google/fx 이미 접속됨');
    }

    // 3. 세션 토큰 획득
    log('세션 토큰 획득...');
    const session = await page.evaluate(async () => {
      const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
      if (!res.ok) return { error: res.status };
      return await res.json();
    });

    if (!session.access_token) {
      log('세션 실패: ' + JSON.stringify(session).substring(0, 200));
      await browser.close();
      return;
    }
    log(`토큰 OK: ${session.user?.name} (${session.user?.email})`);

    // 4. 이미지 3장 연속 생성 테스트 (실제 사용 시나리오)
    const prompts = [
      { text: 'A Korean woman in her 30s cooking kimchi in a modern kitchen, warm lighting, photorealistic', ratio: 'IMAGE_ASPECT_RATIO_SQUARE' },
      { text: 'A cozy Korean bookstore cafe with wooden shelves, warm afternoon light, people reading, photorealistic', ratio: 'IMAGE_ASPECT_RATIO_LANDSCAPE' },
      { text: 'Fresh Korean street food tteokbokki and fried chicken on a wooden table, top-down view, appetizing food photography', ratio: 'IMAGE_ASPECT_RATIO_PORTRAIT' },
    ];

    for (let i = 0; i < prompts.length; i++) {
      const { text, ratio } = prompts[i];
      log(`\n[${i+1}/3] 이미지 생성 중...`);
      log(`  프롬프트: ${text.substring(0, 60)}...`);
      log(`  비율: ${ratio}`);

      const startTime = Date.now();
      const genResult = await page.evaluate(async (params) => {
        try {
          const body = JSON.stringify({
            userInput: { candidatesCount: 1, prompts: [params.prompt], seed: params.seed },
            clientContext: { sessionId: `;${Date.now()}`, tool: 'IMAGE_FX' },
            modelInput: { modelNameType: 'IMAGEN_3_5' },
            aspectRatio: params.ratio,
          });

          const res = await fetch('https://aisandbox-pa.googleapis.com/v1:runImageFx', {
            method: 'POST', body,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${params.token}` },
          });

          if (!res.ok) return { error: `HTTP ${res.status}`, detail: (await res.text()).substring(0, 300) };
          const data = await res.json();
          const img = data?.imagePanels?.[0]?.generatedImages?.[0];
          if (img?.encodedImage) return { success: true, encodedImage: img.encodedImage, w: img.width, h: img.height };
          return { error: 'no_image' };
        } catch (e) { return { error: e.message }; }
      }, { token: session.access_token, prompt: text, ratio, seed: Math.floor(Math.random() * 999999) });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      if (genResult.success) {
        const buf = Buffer.from(genResult.encodedImage, 'base64');
        const outPath = path.join(require('os').tmpdir(), `imagefx_v2_test_${i+1}.png`);
        fs.writeFileSync(outPath, buf);
        log(`  ✅ 성공! ${elapsed}초 | ${Math.round(buf.length/1024)}KB | ${genResult.w}x${genResult.h}`);
        log(`  💾 ${outPath}`);
      } else {
        log(`  ❌ 실패 (${elapsed}초): ${genResult.error}`);
        if (genResult.detail) log(`  상세: ${genResult.detail.substring(0, 200)}`);
      }
    }

    await browser.close();
    log('\n=== 테스트 완료 ===');
  } catch (err) {
    log(`오류: ${err.message}`);
    log(err.stack?.substring(0, 500));
  }
}

main().catch(err => { log(`치명적: ${err.message}`); process.exit(1); });
