import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/VITE_GEMINI_API_KEY="(.*)"/)?.[1] || env.match(/VITE_GEMINI_API_KEY=(.*)/)?.[1];

console.log("Using key:", key);

const genAI = new GoogleGenerativeAI(key || '');
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

async function test() {
    try {
        const res = await model.generateContent("Hello");
        console.log(res.response.text());
    } catch (e) {
        console.error("Error:", e.message);
    }
}

test();
