import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// .env 파일 로드 (환경 변수 확인)
dotenv.config();

async function listModels() {
    // 실제 프로젝트의 config에서 API 키 가져오기 시도
    let apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        try {
            const configPath = 'c:/Users/박성현/AppData/Roaming/naver-blog-automation/config.json';
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                apiKey = config.geminiApiKey;
            }
        } catch (e) {
            console.error("Config 파일 로드 실패:", e);
        }
    }

    if (!apiKey) {
        console.error("❌ Gemini API 키를 찾을 수 없습니다.");
        return;
    }

    console.log("🔍 Gemini API 모델 목록 조사 중... (Key 앞 10자:", apiKey.substring(0, 10) + "...)");

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        // v1beta 엔드포인트를 사용하여 모델 목록 조회
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();

        if (data.error) {
            console.error("❌ API 오류 발생:", data.error.message);
            return;
        }

        console.log("\n✅ 사용 가능한 모델 목록:");
        console.table(data.models.map(m => ({
            name: m.name.replace('models/', ''),
            version: m.version,
            displayName: m.displayName
        })));

        const hasGemini3 = data.models.some(m => m.name.includes('gemini-3'));
        if (hasGemini3) {
            console.log("\n🚀 Gemini 3 모델이 활성화되어 있습니다!");
        } else {
            console.warn("\n⚠️ Gemini 3 모델이 현재 키에서 목록에 보이지 않습니다.");
        }

    } catch (error) {
        console.error("❌ 요청 중 오류 발생:", error);
    }
}

listModels();
