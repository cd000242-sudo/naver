/**
 * Perplexity 콘텐츠 생성 테스트 스크립트
 * - 설정 파일에서 API 키를 로드
 * - Perplexity sonar 모델로 콘텐츠 생성 테스트
 * - 생성된 콘텐츠의 길이와 품질 확인
 */
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ===== 설정 파일에서 API 키 로드 =====
function loadApiKey() {
    // Electron userData 경로: %APPDATA%/better-life-naver/settings.json
    const possiblePaths = [
        path.join(os.homedir(), 'AppData', 'Roaming', 'better-life-naver', 'settings.json'),
        path.join(os.homedir(), 'AppData', 'Roaming', 'Better Life Naver', 'settings.json'),
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            console.log(`📂 설정 파일 발견: ${p}`);
            const raw = fs.readFileSync(p, 'utf-8');
            const config = JSON.parse(raw);
            const key = config.perplexityApiKey || config['perplexity-api-key'];
            if (key) {
                console.log(`🔑 Perplexity API 키 로드됨 (길이: ${key.length})`);
                return key;
            }
        }
    }

    // 환경변수 fallback
    if (process.env.PERPLEXITY_API_KEY) {
        console.log('🔑 환경변수에서 API 키 로드');
        return process.env.PERPLEXITY_API_KEY;
    }

    throw new Error('Perplexity API 키를 찾을 수 없습니다. settings.json 또는 PERPLEXITY_API_KEY 환경변수를 확인하세요.');
}

// ===== Perplexity 콘텐츠 생성 (contentGenerator.ts의 callPerplexity와 동일 로직) =====
async function callPerplexity(apiKey, prompt, model = 'sonar') {
    const client = new OpenAI({
        apiKey: apiKey,
        baseURL: 'https://api.perplexity.ai',
    });

    console.log(`\n🚀 Perplexity API 호출 (모델: ${model})...`);
    const startTime = Date.now();

    const response = await client.chat.completions.create({
        model: model,
        messages: [
            {
                role: 'system',
                content: `당신은 한국어 블로그 전문 작가입니다. 
주어진 키워드에 대해 SEO에 최적화된 네이버 블로그 포스트를 작성합니다.

반드시 다음 JSON 형식으로 응답하세요:
{
  "selectedTitle": "제목",
  "titleAlternatives": ["대안1", "대안2"],
  "bodyPlain": "전체 본문 (최소 1500자 이상, 소제목 포함)",
  "headings": [
    {"title": "소제목1", "content": "본문1"},
    {"title": "소제목2", "content": "본문2"},
    {"title": "소제목3", "content": "본문3"},
    {"title": "소제목4", "content": "본문4"}
  ],
  "tags": ["태그1", "태그2"]
}

[글자수 필수 준수]
이 글은 최소 2800자 이상 작성되어야 합니다. 각 소제목마다 5문장 이상 자세히 서술하세요.`
            },
            {
                role: 'user',
                content: `다음 키워드로 네이버 블로그 포스트를 작성하세요: "겨울 제주도 여행 코스 추천"

주제에 맞는 실질적이고 유용한 정보를 담아주세요. 최소 2800자 이상으로 작성하세요.`
            }
        ],
        max_tokens: 4096,
        temperature: 0.7,
    });

    const elapsed = Date.now() - startTime;
    const content = response.choices[0]?.message?.content?.trim() || '';
    const usage = response.usage;

    return { content, elapsed, usage };
}

// ===== 콘텐츠 검증 (contentGenerator.ts의 detectDuplicateContent 로직 시뮬레이션) =====
function validateContent(content) {
    console.log('\n📊 === 콘텐츠 검증 결과 ===');

    // JSON 파싱 시도
    let parsed = null;
    try {
        // JSON 블록 추출
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.log('⚠️ JSON 파싱 실패 - 원시 텍스트로 분석');
    }

    const bodyPlain = parsed?.bodyPlain || content;
    const plainText = bodyPlain.replace(/<[^>]+>/g, '').trim();
    const charCount = plainText.length;

    console.log(`📝 본문 글자수: ${charCount}자`);

    // detectDuplicateContent 기준 시뮬레이션
    if (charCount >= 1500) {
        console.log('✅ 기준 통과: 1500자 이상 (완벽)');
    } else if (charCount >= 800) {
        console.log('⚠️ 약간 짧음: 800-1499자 (경고와 함께 통과)');
    } else if (charCount >= 400) {
        console.log('❌ 부족: 400-799자 (재시도 유도 → 마지막 시도에서는 통과)');
    } else {
        console.log('❌ 매우 짧음: 400자 미만 (품질 미달)');
    }

    // 소제목 확인
    if (parsed?.headings) {
        console.log(`📌 소제목: ${parsed.headings.length}개`);
        for (const h of parsed.headings) {
            const contentLen = (h.content || h.summary || '').length;
            console.log(`   - "${h.title}" (${contentLen}자)`);
        }
    }

    // 제목 확인
    if (parsed?.selectedTitle) {
        console.log(`📋 제목: "${parsed.selectedTitle}"`);
    }

    // 태그 확인
    if (parsed?.tags) {
        console.log(`🏷️ 태그: ${parsed.tags.join(', ')}`);
    }

    return { charCount, parsed, valid: charCount >= 800 };
}

// ===== 메인 실행 =====
async function main() {
    console.log('='.repeat(60));
    console.log('🧪 Perplexity 콘텐츠 생성 테스트');
    console.log('='.repeat(60));

    try {
        const apiKey = loadApiKey();

        const { content, elapsed, usage } = await callPerplexity(apiKey, '겨울 제주도 여행 코스 추천');

        console.log(`\n⏱️ 응답 시간: ${(elapsed / 1000).toFixed(1)}초`);
        console.log(`📊 토큰: prompt=${usage?.prompt_tokens || 0}, completion=${usage?.completion_tokens || 0}, total=${usage?.total_tokens || 0}`);
        console.log(`📄 원시 응답 길이: ${content.length}자`);

        const result = validateContent(content);

        console.log('\n' + '='.repeat(60));
        if (result.valid) {
            console.log('✅ 테스트 통과: Perplexity 콘텐츠 생성 성공');
        } else {
            console.log('⚠️ 테스트 경고: 콘텐츠가 800자 미만 - 마지막 시도에서 통과 처리됨');
        }
        console.log('='.repeat(60));

        // 본문 미리보기 (처음 500자)
        const preview = (result.parsed?.bodyPlain || content).substring(0, 500);
        console.log(`\n📖 본문 미리보기 (500자):\n${preview}...`);

    } catch (error) {
        console.error('\n❌ 테스트 실패:', error.message);
        if (error.message.includes('API 키')) {
            console.log('\n💡 해결: 앱 설정에서 Perplexity API 키를 입력하세요.');
        }
        process.exit(1);
    }
}

main();
