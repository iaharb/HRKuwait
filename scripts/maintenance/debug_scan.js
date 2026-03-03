
import { GoogleGenAI } from "@google/genai";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testScan() {
    try {
        const envPath = path.join(__dirname, '.env');
        const env = fs.readFileSync(envPath, 'utf-8');
        const keyMatch = env.match(/VITE_GEMINI_API_KEY=["']?([^"'\s]*)["']?/);
        const apiKey = keyMatch[1].trim();

        const genAI = new GoogleGenAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const imagePath = path.join(__dirname, 'docs', 'scanned.jpeg');
        const imageBase64 = fs.readFileSync(imagePath).toString('base64');

        console.log("Starting Analysis for scanned.jpeg...");

        const result = await model.generateContent([
            "Analyze this receipt image. Extract exactly these 3 fields as a JSON object: amount (number, value only in KWD), date (format: YYYY-MM-DD), and merchant (string). Return only the JSON.",
            {
                inlineData: {
                    data: imageBase64,
                    mimeType: "image/jpeg"
                }
            }
        ]);

        const response = await result.response;
        console.log("Raw Response received.");
        const text = response.text();
        console.log("Extracted Text:", text);

    } catch (e) {
        console.error("Test Failed:", e);
    }
}

testScan();
