const { execSync } = require('child_process');
const fs = require('fs');

function run(cmd) {
    try {
        console.log(`Running: ${cmd}`);
        execSync(cmd, { encoding: 'utf8', stdio: 'inherit' });
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
const serviceRoleKey = vars.VITE_SUPABASE_SERVICE_ROLE_KEY;

console.log(`Syncing URL: ${url}`);

const envs = ['production', 'preview', 'development'];

for (const env of envs) {
    // Kill existing to avoid "already exists" errors
    run(`npx vercel env rm VITE_SUPABASE_URL ${env} -y`);
    run(`npx vercel env rm VITE_SUPABASE_ANON_KEY ${env} -y`);
    run(`npx vercel env rm SUPABASE_SERVICE_ROLE_KEY ${env} -y`);

    // Add new ones with --value for non-interactive mode
    // URL - config (client-side)
    run(`npx vercel env add VITE_SUPABASE_URL ${env} --type config --value "${url}" --yes`);
    // Anon key - config (client-side, VITE_ prefix required for Vite)
    run(`npx vercel env add VITE_SUPABASE_ANON_KEY ${env} --type config --value "${anonKey}" --yes`);
    // Service role key - SECRET (server-side only, no VITE_ prefix)
    if (serviceRoleKey) run(`npx vercel env add SUPABASE_SERVICE_ROLE_KEY ${env} --type secret --value "${serviceRoleKey}" --yes`);
}
