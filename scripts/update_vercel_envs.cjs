const { execSync } = require('child_process');
const fs = require('fs');

function run(cmd, input) {
    try {
        console.log(`Running: ${cmd}`);
        if (input) {
            execSync(cmd, { encoding: 'utf8', input: input });
        } else {
            execSync(cmd, { encoding: 'utf8' });
        }
    } catch (e) {
        console.log('Error executing:', cmd);
    }
}

// Read from .env
const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));

const url = vars.VITE_SUPABASE_URL;
const anonKey = vars.VITE_SUPABASE_ANON_KEY;

console.log(`Syncing URL: ${url}`);

const envs = ['production', 'preview', 'development'];

for (const env of envs) {
    // Kill existing to avoid "already exists" errors
    run(`npx vercel env rm VITE_SUPABASE_URL ${env} -y`);
    run(`npx vercel env rm VITE_SUPABASE_ANON_KEY ${env} -y`);

    // Add new ones
    run(`npx vercel env add VITE_SUPABASE_URL ${env}`, url);
    run(`npx vercel env add VITE_SUPABASE_ANON_KEY ${env}`, anonKey);
}
