import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { generateStructuredContent, type ContentSource } from '../contentGenerator';
import { generateImages } from '../imageGenerator';
import { NaverBlogAutomation } from '../naverBlogAutomation';

interface SettingsJson {
	geminiApiKey?: string;
	openaiApiKey?: string;
	pexelsApiKey?: string;
	savedNaverId?: string;
	savedNaverPassword?: string;
	authorName?: string;
}

async function readSettingsJson(): Promise<SettingsJson> {
	const userDataBase =
		process.env.APPDATA ||
		(process.platform === 'darwin'
			? path.join(os.homedir(), 'Library', 'Application Support')
			: path.join(os.homedir(), '.config'));
	const userDataSettings = path.join(userDataBase, 'naver-blog-automation', 'settings.json');

	try {
		const raw = await fs.readFile(userDataSettings, 'utf-8');
		return JSON.parse(raw) as SettingsJson;
	} catch {
		const fallback = path.join(process.cwd(), 'settings.json');
		const raw = await fs.readFile(fallback, 'utf-8');
		return JSON.parse(raw) as SettingsJson;
	}
}

function applyEnvFromSettings(cfg: SettingsJson): void {
	if (cfg.geminiApiKey && cfg.geminiApiKey.trim()) process.env.GEMINI_API_KEY = cfg.geminiApiKey.trim();
	if (cfg.openaiApiKey && cfg.openaiApiKey.trim()) process.env.OPENAI_API_KEY = cfg.openaiApiKey.trim();
	if (cfg.pexelsApiKey && cfg.pexelsApiKey.trim()) process.env.PEXELS_API_KEY = cfg.pexelsApiKey.trim();
}

async function run(): Promise<void> {
	console.log('🧪 Typing + Pexels placement test (settings.json only)…');
	const cfg = await readSettingsJson();
	applyEnvFromSettings(cfg);

	if (!cfg.savedNaverId || !cfg.savedNaverPassword) {
		console.error('❌ NAVER 자격증명이 settings.json에 없습니다 (savedNaverId/savedNaverPassword).');
		process.exit(1);
	}
	if (!process.env.PEXELS_API_KEY) {
		console.error('❌ PEXELS_API_KEY가 없습니다. settings.json에 pexelsApiKey를 넣어주세요.');
		process.exit(1);
	}

	// 1) 테스트용 콘텐츠 생성 (짧게)
	const source: ContentSource = {
		sourceType: 'custom_text',
		rawText:
			'테스트용 본문입니다. 소제목과 이미지 배치가 올바른지 확인하기 위한 짧은 더미 텍스트입니다. 실제 발행 없이 임시 저장(임시글) 모드로 동작합니다.',
		categoryHint: '테스트',
		generator: 'gemini',
	};
	console.log('🧠 Generating structured content (short)…');
	const content = await generateStructuredContent(source, { minChars: 800 });

	if (!content.headings || content.headings.length < 2) {
		console.error('❌ 소제목이 2개 미만입니다. 테스트를 중단합니다.');
		process.exit(1);
	}

	// 2) Pexels 이미지 생성 (첫 2~3개 소제목)
	const sampleHeadings = content.headings.slice(0, Math.min(3, content.headings.length));
	const items = sampleHeadings.map((h) => ({
		heading: h.title,
		prompt: `Editorial realistic photo for "${h.title}", cinematic lighting, premium, no text, no watermark, safe`,
	}));

	console.log(`🖼 Fetching Pexels images for ${items.length} headings…`);
	process.env.TEST_MODE = 'true';
	// Save under generated-images-test to avoid mixing with real runs
	const outBase =
		process.env.APPDATA ||
		(process.platform === 'darwin'
			? path.join(os.homedir(), 'Library', 'Application Support')
			: path.join(os.homedir(), '.config'));
	const outDir = path.join(outBase, 'naver-blog-automation', 'generated-images-test');
	await fs.mkdir(outDir, { recursive: true });
	process.env.GENERATED_IMAGES_DIR = outDir;

	const imgs = await generateImages({
		provider: 'pexels',
		items,
		styleHint: 'editorial realistic',
	});

	if (imgs.length === 0) {
		console.error('❌ Pexels 이미지가 생성되지 않았습니다.');
		process.exit(2);
	}
	console.log('✅ Pexels images prepared:', imgs.map((i) => i.filePath));

	// 3) 자동화 실행 (임시글, 이미지 포함, 정확한 배치 시나리오)
	const title = content.selectedTitle || '타이핑+Pexels 배치 자동화 테스트';
	const hashtags = ['테스트', '자동화', '배치검증', '펙셀스', '네이버블로그'];

	const automation = new NaverBlogAutomation(
		{
			naverId: cfg.savedNaverId!,
			naverPassword: cfg.savedNaverPassword!,
			headless: true,
			slowMo: 0,
			viewport: { width: 1280, height: 900 },
			defaultTitle: title,
			defaultContent: content.bodyPlain || '본문이 비어 있습니다.',
		},
		(msg) => console.log(msg),
	);

	console.log('📝 Launching Naver writer (draft mode, with images)…');
	await automation.runPostOnly(
		{
			title,
			structuredContent: content,
			images: imgs.map((g) => ({
				heading: g.heading,
				filePath: g.filePath,
				provider: 'pexels',
				alt: g.heading,
			})),
			hashtags,
			publishMode: 'draft',
		skipImages: false,
		},
		false,
	);

	// cleanup env
	delete process.env.TEST_MODE;
	delete process.env.GENERATED_IMAGES_DIR;

	console.log('🎉 Typing + Pexels placement test completed (draft saved).');
}

run().catch((err) => {
	console.error('❌ Test failed:', err);
	process.exit(99);
});


