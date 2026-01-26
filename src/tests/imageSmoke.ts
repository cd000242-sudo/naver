import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { generateImages } from '../imageGenerator';

interface SettingsJson {
	geminiApiKey?: string;
	openaiApiKey?: string;
	pexelsApiKey?: string;
}

async function readSettingsJson(): Promise<SettingsJson> {
	// Try Electron userData location first
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
		// Fallback: project root
		const fallback = path.join(process.cwd(), 'settings.json');
		const raw = await fs.readFile(fallback, 'utf-8');
		return JSON.parse(raw) as SettingsJson;
	}
}

function applyEnvFromSettings(cfg: SettingsJson): void {
	if (cfg.openaiApiKey && cfg.openaiApiKey.trim()) {
		process.env.OPENAI_API_KEY = cfg.openaiApiKey.trim();
	}
	if (cfg.pexelsApiKey && cfg.pexelsApiKey.trim()) {
		process.env.PEXELS_API_KEY = cfg.pexelsApiKey.trim();
	}
}

async function ensureTestOutDir(): Promise<string> {
	const outBase =
		process.env.APPDATA ||
		(process.platform === 'darwin'
			? path.join(os.homedir(), 'Library', 'Application Support')
			: path.join(os.homedir(), '.config'));
	const dir = path.join(outBase, 'naver-blog-automation', 'generated-images-test');
	await fs.mkdir(dir, { recursive: true });
	return dir;
}

async function run(): Promise<void> {
	console.log('🧪 Image smoke test starting (reads settings.json, not .env)…');
	const cfg = await readSettingsJson();
	applyEnvFromSettings(cfg);

	const hasDalle = !!process.env.OPENAI_API_KEY;
	const hasPexels = !!process.env.PEXELS_API_KEY;

	if (!hasDalle && !hasPexels) {
		console.error('❌ No image provider API keys found. Please put keys in settings.json (openaiApiKey or pexelsApiKey).');
		process.exit(1);
	}

	const outDir = await ensureTestOutDir();
	process.env.TEST_MODE = 'true';
	process.env.GENERATED_IMAGES_DIR = outDir;

	// Sample user-like headings to simulate UI flow
	const headings = [
		{ title: '박보영 골드랜드 캐릭터 감정 포인트' },
		{ title: '연말정산 환급 더 받는 체크리스트' },
		{ title: '아이 공부 루틴, 초등 저학년 현실 팁' },
	];

	// Create prompts (English-only for safety)
	const items = headings.map((h) => ({
		heading: h.title,
		prompt: `High-quality editorial photo about "${h.title}" for a Korean blog article, cinematic lighting, natural color, realistic, tasteful composition, no text, no watermark, professional look`,
	}));

	const results: Array<{ provider: string; files: string[] }> = [];

	if (hasDalle) {
		console.log('▶ Testing DALL·E generation (OpenAI)…');
		try {
			const gen = await generateImages({
				provider: 'dalle',
				items,
				styleHint: 'cinematic realistic editorial',
			});
			const files = gen.map((g) => g.filePath);
			console.log('✅ DALL·E generated:', files);
			results.push({ provider: 'dalle', files });
		} catch (e: any) {
			console.error('❌ DALL·E generation failed:', e?.message || e);
		}
	} else {
		console.log('⏭ Skipping DALL·E (no OPENAI_API_KEY in settings.json)');
	}

	if (hasPexels) {
		console.log('▶ Testing Pexels fetch…');
		try {
			const gen = await generateImages({
				provider: 'pexels',
				items,
				styleHint: 'editorial realistic',
			});
			const files = gen.map((g) => g.filePath);
			console.log('✅ Pexels fetched & saved:', files);
			results.push({ provider: 'pexels', files });
		} catch (e: any) {
			console.error('❌ Pexels fetch failed:', e?.message || e);
		}
	} else {
		console.log('⏭ Skipping Pexels (no PEXELS_API_KEY in settings.json)');
	}

	delete process.env.TEST_MODE;
	delete process.env.GENERATED_IMAGES_DIR;

	if (results.length === 0 || results.every((r) => r.files.length === 0)) {
		console.error('❌ No images were produced by any provider.');
		process.exit(2);
	}

	console.log('🎉 Image smoke test completed.');
}

run().catch((err) => {
	console.error('❌ Unexpected error:', err);
	process.exit(99);
});










