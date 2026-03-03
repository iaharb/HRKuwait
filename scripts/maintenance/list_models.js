
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function listModels() {
    try {
        const envPath = path.join(__dirname, '.env');
        const env = fs.readFileSync(envPath, 'utf-8');
        const keyMatch = env.match(/VITE_GEMINI_API_KEY=["']?([^"'\s]*)["']?/);
        const apiKey = keyMatch[1].trim();

        // Standard fetch to Gemini API to list models
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        console.log("Available Models:", JSON.stringify(data, null, 2));

    } catch (e) {
        console.error("Listing Failed:", e);
    }
}

listModels();
