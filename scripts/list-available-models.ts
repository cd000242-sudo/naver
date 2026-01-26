import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

dotenv.config();

function loadApiKey(): string | null {
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    try {
        const appDataPath = process.env.APPDATA || (os.platform() === 'win32'
            ? path.join(os.homedir(), 'AppData', 'Roaming')
            : os.homedir());
        const settingsPath = path.join(appDataPath, 'better-life-naver', 'settings.json');
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            if (settings.geminiApiKey) return settings.geminiApiKey;
        }
    } catch (e) { }
    return null;
}

async function listAllModels() {
    const apiKey = loadApiKey();
    if (!apiKey) {
        console.error('API KEY NOT FOUND');
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    try {
        // Note: listModels is usually available on the client or via a direct API call
        // In @google/generative-ai, we might need to use the REST API or a specific method
        // Actually, listModels is not directly on genAI in the helper lib usually.
        // I will use axios to call the REST endpoint directly for listing.
        const axios = (await import('axios')).default;
        const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

        let output = '=== AVAILABLE GEMINI MODELS ===\n';
        response.data.models.forEach((m: any) => {
            const id = m.name.replace('models/', '');
            if (id.includes('gemini')) {
                output += `ID: ${id} | Display: ${m.displayName}\n`;
            }
        });
        fs.writeFileSync(path.join(process.cwd(), 'available_models_clean.txt'), output, 'utf8');
        console.log('Done mapping models to available_models_clean.txt');
    } catch (error: any) {
        console.error('Error listing models:', error.response?.data || error.message);
    }
}

listAllModels();
