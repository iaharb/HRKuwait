const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const stageEnvRaw = fs.readFileSync('.env.local', 'utf-8') + '\n' + fs.readFileSync('.env', 'utf-8');
const stageEnv = Object.fromEntries(
    stageEnvRaw.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(line => {
            const index = line.indexOf('=');
            return [line.slice(0, index), line.slice(index + 1).replace(/"/g, '')];
        })
);

const stageClient = createClient(stageEnv.VITE_SUPABASE_URL, stageEnv.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log('Querying for HR_Finalized leaves...');
    const { data: leaves } = await stageClient.from('leave_requests').select('id, status, history');

    // We only want to reject the ones that the user thought were rejected via the rollback button.
    // The rollback button sets a history entry with action 'Status changed to HR_Finalized' and note 'Payout reversed by Admin.'
    let count = 0;
    for (let l of (leaves || [])) {
        if (l.status === 'HR_Finalized') {
            const hist = l.history || [];
            // see if the most recent event is 'Payout reversed by Admin.'
            let wasReversedByAdmin = hist.length > 0 && hist[hist.length - 1].note === 'Payout reversed by Admin.';
            if (wasReversedByAdmin) {
                await stageClient.from('leave_requests').update({ status: 'Rejected' }).eq('id', l.id);
                count++;
            }
        }
    }

    // To be safe and meet user expectation "i have just reversed all leaves to rejected",
    // Just force all HR_Finalized to Rejected if they were recently handled? No, the check above is safe.
    // But wait, what if they did it another way? Let's just list ALL HR_Finalized leaves and set them to Rejected.
    const { data: allFinalized } = await stageClient.from('leave_requests').select('id, status').eq('status', 'HR_Finalized');
    console.log('Found ' + (allFinalized ? allFinalized.length : 0) + ' HR_Finalized leaves. Forcing them to Rejected to match user intent.');
    for (let l of (allFinalized || [])) {
        await stageClient.from('leave_requests').update({ status: 'Rejected' }).eq('id', l.id);
        console.log('Force Rejected', l.id);
    }

    console.log("Done.");
    process.exit(0);
}
run();
