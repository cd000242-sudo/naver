import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { NaverBlogAutomation, type RunOptions } from '../naverBlogAutomation';
import { generateStructuredContent, type ContentSource, type StructuredContent } from '../contentGenerator';
import { generateImages } from '../imageGenerator';

type Provider = 'gemini' | 'openai' | 'claude';

function loadSettings(): {
	id?: string;
	password?: string;
	geminiApiKey?: string;
	openaiApiKey?: string;
	generator?: Provider;
} {
	const base =
		process.env.APPDATA ||
		(process.platform === 'darwin'
			? path.join(os.homedir(), 'Library', 'Application Support')
			: path.join(os.homedir(), '.config'));
	const settingsPath = path.join(base, 'naver-blog-automation', 'settings.json');
	if (!fs.existsSync(settingsPath)) {
		throw new Error(`settings.json이 없습니다: ${settingsPath}`);
	}
	const raw = fs.readFileSync(settingsPath, 'utf-8');
	const json = JSON.parse(raw) as any;
	const out: any = {};
	if (json.rememberCredentials && json.savedNaverId && json.savedNaverPassword) {
		out.id = json.savedNaverId;
		out.password = json.savedNaverPassword;
	}
	if (json.geminiApiKey) {
		process.env.GEMINI_API_KEY = json.geminiApiKey;
		out.geminiApiKey = json.geminiApiKey;
		out.generator = 'gemini';
	} else if (json.openaiApiKey) {
		process.env.OPENAI_API_KEY = json.openaiApiKey;
		out.openaiApiKey = json.openaiApiKey;
		out.generator = 'openai';
	}

	return out as {
		id?: string;
		password?: string;
		geminiApiKey?: string;
		openaiApiKey?: string;
		generator?: Provider;
	};
}

async function prepareAIImages(content: StructuredContent) {
	if (!process.env.GEMINI_API_KEY) {
		throw new Error('GEMINI_API_KEY가 settings.json에 없습니다.');
	}
	// 테스트 비용/시간 절약: 앞 2~3개만
	const targets = (content.headings || []).slice(0, 3);
	if (targets.length === 0) {
		throw new Error('소제목이 없어 이미지를 준비할 수 없습니다.');
	}
	const items = targets.map((h) => ({
		heading: h.title,
		prompt: `Editorial stock photo for "${h.title}", natural light, clean, professional, no text, no watermark`,
	}));

	// 테스트 출력 디렉토리 지정
	const userData =
		process.env.APPDATA ||
		(process.platform === 'darwin'
			? path.join(os.homedir(), 'Library', 'Application Support')
			: path.join(os.homedir(), '.config'));
	const outDir = path.join(userData, 'naver-blog-automation', 'generated-images-typing');
	await fsp.mkdir(outDir, { recursive: true });
	process.env.TEST_MODE = 'true';
	process.env.GENERATED_IMAGES_DIR = outDir;

	const generated = await generateImages({
		provider: 'nano-banana-pro',
		items,
		styleHint: 'editorial clean',
	});

	// 환경변수 정리
	delete process.env.TEST_MODE;
	delete process.env.GENERATED_IMAGES_DIR;

	return generated.map((g) => ({
		heading: g.heading,
		filePath: g.filePath,
		provider: 'nano-banana-pro',
		alt: g.heading,
		caption: g.heading,
	}));
}

async function main() {
	console.log('🧪 AI 이미지 포함 실제 타이핑 배치 테스트 시작');
	const cfg = loadSettings();
	if (!cfg.id || !cfg.password) {
		throw new Error('네이버 자격증명이 settings.json에 없습니다. (rememberCredentials 켜고 저장 필요)');
	}
	if (!cfg.generator) {
		throw new Error('콘텐츠 생성용 API 키가 settings.json에 없습니다. (geminiApiKey 또는 openaiApiKey)');
	}


	// 1) 콘텐츠 생성 (간단 테스트 소스)
	const source: ContentSource = {
		sourceType: 'custom_text',
		rawText:
			'테스트용 본문입니다. 자동화가 소제목과 본문을 올바른 순서로 타이핑하는지, 그리고 이미지가 소제목 아래에 정확히 들어가는지 검증합니다.',
		title: '타이핑·이미지 배치 통합 테스트',
		categoryHint: '테스트',
		generator: cfg.generator,
		articleType: 'general',
		targetAge: 'all',
	};
	console.log('→ AI 콘텐츠 생성…');
	const structured = await generateStructuredContent(source, { minChars: 800 });

	// 2) AI 이미지 준비
	console.log('→ AI 이미지 준비…');
	const images = await prepareAIImages(structured);
	console.log('   이미지 준비 완료:', images.map((i) => i.filePath));

	// 3) 브라우저 자동화로 실제 타이핑+이미지 삽입 확인
	const automation = new NaverBlogAutomation(
		{
			naverId: cfg.id,
			naverPassword: cfg.password,
			headless: false,
			slowMo: 15,
			navigationTimeoutMs: 60000,
		},
		(msg) => console.log(msg),
	);

	console.log('→ 브라우저 준비/로그인/글쓰기 이동…');
	await automation.setupBrowser();
	await automation.loginToNaver();
	await automation.navigateToBlogWrite();
	await automation.switchToMainFrame();
	await automation.closePopups();

	const runOptions: RunOptions = {
		title: structured.selectedTitle || '타이핑·이미지 배치 통합 테스트',
		structuredContent: structured,
		hashtags: ['자동화', '테스트', '타이핑', '이미지', '검증'],
		publishMode: 'draft', // 임시저장 모드로 검증
		skipImages: false, // ← 이미지 포함
		images, // ← 소제목별 매핑
	};

	console.log('→ 자동 포스팅 실행 (임시저장, 이미지 포함)…');
	// runPostOnly는 내부에서 applyStructuredContent를 호출하고 발행 단계까지 수행
	await automation.runPostOnly(runOptions, true);
	console.log('✅ 타이핑/이미지 배치 완료(임시저장). 에디터 화면에서 배치 순서를 확인하세요.');

	// 30초 대기 (사용자가 브라우저에서 결과 확인할 시간 제공)
	console.log('⏳ 30초 후 브라우저를 자동으로 닫습니다. 브라우저에서 타이핑 위치를 확인하세요...');
	await new Promise((r) => setTimeout(r, 30000));
	await automation.closeBrowser();
	console.log('🔒 테스트 종료. 브라우저가 닫혔습니다.');
}

main().catch((e) => {
	console.error('❌ 테스트 실패:', e);
	process.exit(1);
});


