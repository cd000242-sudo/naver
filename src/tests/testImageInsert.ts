import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { generateImages } from '../imageGenerator';
import { NaverBlogAutomation } from '../naverBlogAutomation';
import type { StructuredContent } from '../contentGenerator';

interface SettingsJson {
	geminiApiKey?: string;
	openaiApiKey?: string;

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

}

async function run(): Promise<void> {
	console.log('🧪 이미지 삽입 테스트 시작...\n');

	const cfg = await readSettingsJson();
	applyEnvFromSettings(cfg);

	// API 키 확인
	const hasGemini = !!process.env.GEMINI_API_KEY;

	if (!hasGemini) {
		console.error('❌ Gemini API 키가 없습니다. settings.json에 geminiApiKey를 설정해주세요.');
		process.exit(1);
	}

	if (!cfg.savedNaverId || !cfg.savedNaverPassword) {
		console.error('❌ NAVER 자격증명이 settings.json에 없습니다 (savedNaverId/savedNaverPassword).');
		process.exit(1);
	}

	// 테스트용 소제목 (5개)
	const testHeadings = [
		{ title: '테스트 이미지 1', body: '이것은 첫 번째 테스트 이미지입니다.' },
		{ title: '테스트 이미지 2', body: '이것은 두 번째 테스트 이미지입니다.' },
		{ title: '테스트 이미지 3', body: '이것은 세 번째 테스트 이미지입니다.' },
		{ title: '테스트 이미지 4', body: '이것은 네 번째 테스트 이미지입니다.' },
		{ title: '테스트 이미지 5', body: '이것은 다섯 번째 테스트 이미지입니다.' },
	];

	console.log('📝 테스트 소제목:');
	testHeadings.forEach((h, i) => {
		console.log(`   ${i + 1}. ${h.title}`);
	});
	console.log('');

	const provider = 'nano-banana-pro'; // AI 이미지 생성
	console.log(`🖼️ AI 이미지 생성 중...`);

	const items = testHeadings.map((h) => ({
		heading: h.title,
		prompt: `High-quality editorial photo for "${h.title}", cinematic lighting, premium quality, no text, no watermark`,
	}));

	let images;
	try {
		images = await generateImages({
			provider,
			items,
		});
		console.log(`\n📊 이미지 생성 결과:`);
		console.log(`   요청: ${items.length}개`);
		console.log(`   성공: ${images.length}개`);
		console.log(`   실패: ${items.length - images.length}개\n`);

		if (images.length === 0) {
			console.error(`❌ 생성된 이미지가 없습니다.`);
			process.exit(1);
		}

		if (images.length < items.length) {
			console.warn(`⚠️ 일부 이미지 생성이 실패했습니다. (${images.length}/${items.length})`);
		}
	} catch (error) {
		console.error(`❌ 이미지 생성 실패: ${(error as Error).message}`);
		process.exit(1);
	}

	// URL 확인
	console.log('🔍 생성된 이미지 URL 확인:');
	images.forEach((img, i) => {
		const isUrl = img.filePath.startsWith('http://') || img.filePath.startsWith('https://');
		console.log(`   ${i + 1}. ${img.heading}`);
		console.log(`      URL: ${img.filePath.substring(0, 80)}...`);
		console.log(`      타입: ${isUrl ? '✅ 외부 URL' : '❌ 로컬 파일'}`);
	});
	console.log('');

	// 네이버 블로그 자동화 실행
	console.log('📝 네이버 블로그 에디터 열기 및 이미지 삽입 테스트...\n');

	const automation = new NaverBlogAutomation(
		{
			naverId: cfg.savedNaverId!,
			naverPassword: cfg.savedNaverPassword!,
			headless: false, // 브라우저를 보이게 해서 확인 가능
			slowMo: 100, // 천천히 실행하여 확인 가능
			viewport: { width: 1280, height: 900 },
			defaultTitle: '최신글',
			defaultContent: testHeadings.map((h) => `${h.title}\n\n${h.body}`).join('\n\n'),
		},
		(msg) => console.log(`   ${msg}`),
	);

	try {
		// 간단한 테스트 콘텐츠 생성
		const testContent: StructuredContent = {
			status: 'success',
			generationTime: new Date().toISOString(),
			selectedTitle: '최신글',
			titleAlternatives: ['최신글', '이미지 삽입 테스트'],
			titleCandidates: [],
			bodyHtml: testHeadings.map((h) => `<h2>${h.title}</h2><p>${h.body}</p>`).join(''),
			bodyPlain: testHeadings.map((h) => `${h.title}\n\n${h.body}`).join('\n\n'),
			headings: testHeadings.map((h) => ({
				title: h.title,
				summary: h.body,
				keywords: [h.title],
				imagePrompt: `High-quality editorial photo for "${h.title}", cinematic lighting, premium quality`,
			})),
			hashtags: ['테스트', '이미지삽입'],
			images: [],
			metadata: {
				category: 'general',
				targetAge: 'all',
				urgency: 'evergreen',
				estimatedReadTime: '2분',
				wordCount: testHeadings.reduce((sum, h) => sum + h.title.length + h.body.length, 0),
				aiDetectionRisk: 'low',
				legalRisk: 'safe',
				seoScore: 70,
				keywordStrategy: '테스트',
				publishTimeRecommend: new Date().toISOString(),
			},
			quality: {
				aiDetectionRisk: 'low',
				legalRisk: 'safe',
				seoScore: 70,
				originalityScore: 80,
				readabilityScore: 75,
				warnings: [],
				viralPotential: 50,
				engagementScore: 60,
			},
		};

		await automation.runPostOnly(
			{
				title: '최신글',
				structuredContent: testContent,
				images: images.map((img) => ({
					heading: img.heading,
					filePath: img.filePath, // 외부 URL
					provider: img.provider,
					alt: img.heading,
				})),
				hashtags: ['테스트', '이미지삽입'],
				publishMode: 'draft', // 임시 저장으로 테스트
				skipImages: false,
			},
			false,
		);

		console.log('\n✅ 이미지 삽입 테스트 완료!');
		console.log('📌 네이버 블로그 에디터에서 이미지가 제대로 삽입되었는지 확인해주세요.');
		console.log('📌 브라우저가 열려있으므로 직접 확인할 수 있습니다.');
		console.log('\n💡 확인 사항:');
		console.log('   1. 각 소제목 아래에 이미지가 삽입되었는지');
		console.log('   2. 이미지가 제대로 표시되는지');
		console.log('   3. 이미지 URL이 외부 URL인지 (네이버 서버에 업로드되지 않음)');
		console.log('\n⏸️ 브라우저를 확인한 후 아무 키나 누르면 종료됩니다...');

		// 사용자 입력 대기 (선택사항)
		await new Promise((resolve) => {
			if (process.stdin.isTTY) {
				process.stdin.setRawMode(true);
				process.stdin.resume();
				process.stdin.once('data', () => {
					process.stdin.setRawMode(false);
					process.stdin.pause();
					resolve(undefined);
				});
			} else {
				// TTY가 아닌 경우 30초 대기
				setTimeout(resolve, 30000);
			}
		});
	} catch (error) {
		console.error(`\n❌ 테스트 실패: ${(error as Error).message}`);
		console.error(error);
		process.exit(1);
	} finally {
		await automation.closeBrowser();
	}
}

run().catch((err) => {
	console.error('❌ 예상치 못한 오류:', err);
	process.exit(99);
});

