
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function findModel() {
    try {
        const envPath = path.join(__dirname, '.env');
        const env = fs.readFileSync(envPath, 'utf-8');
        const keyMatch = env.match(/VITE_GEMINI_API_KEY=["']?([^"'\s]*)["']?/);
        const apiKey = keyMatch[1].trim();

        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        const models = data.models.map(m => m.name);
        console.log("Full Model List:", models);

        const visionModels = models.filter(m => m.includes('flash') || m.includes('pro'));
        console.log("Potential Vision Models:", visionModels);

    } catch (e) {
        console.error("Listing Failed:", e);
    }
}

findModel();
