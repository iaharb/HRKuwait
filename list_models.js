import fs from 'fs';
import https from 'https';

const env = fs.readFileSync('.env', 'utf8');
const key = env.match(/VITE_GEMINI_API_KEY="(.*)"/)?.[1] || env.match(/VITE_GEMINI_API_KEY=(.*)/)?.[1];

const options = {
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models?key=${key}`,
    method: 'GET'
};

const req = https.request(options, res => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            const names = parsed.models.map(m => m.name);
            console.log(names.join('\n'));
        } catch (e) {
            console.log(data);
        }
    });
});
req.end();
