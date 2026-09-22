/* dev_local.cjs — run both apps as local servers at once.
   Portal  -> http://localhost:5173
   LeaveApp-> http://localhost:5174  (button on portal's Leave Management links here)
   Ctrl+C stops both. */
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const leavePath = path.join(ROOT, 'leave-app');

const children = [];

function start(label, cwd, viteBin, port) {
  const child = spawn(process.execPath, [viteBin, '--port', String(port), '--strictPort'], {
    cwd,
    env: { ...process.env },
  });
  const tag = `\x1b[36m[${label}]\x1b[0m`;
  child.stdout.on('data', (d) => process.stdout.write(`${tag} ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`${tag} ${d}`));
  child.on('exit', (code) => {
    console.log(`${tag} exited (${code})`);
    if (children.length) {
      children.slice().forEach((c) => { try { c.kill(); } catch {} });
    }
  });
  children.push(child);
}

start('HR Portal  http://localhost:5173', ROOT, path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 5173);
start('Leave App  http://localhost:5174', leavePath, path.join(leavePath, 'node_modules', 'vite', 'bin', 'vite.js'), 5174);

process.on('SIGINT', () => children.forEach((c) => { try { c.kill('SIGINT'); } catch {} }));
process.on('SIGTERM', () => children.forEach((c) => { try { c.kill('SIGTERM'); } catch {} }));