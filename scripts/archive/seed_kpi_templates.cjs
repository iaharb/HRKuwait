const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function seedKpiTemplates() {
    const templates = [
        {
            title: 'Sales & Revenue',
            department: 'Sales',
            role_name: 'Sales Executive',
            kpis: [
                { name: 'Sales Quota Achieved', weight: 50 },
                { name: 'New Client Acquisition', weight: 20 },
                { name: 'Client Retention Rate', weight: 15 },
                { name: 'CRM Data Compliance', weight: 15 }
            ]
        },
        {
            title: 'Engineering / IT',
            department: 'Engineering',
            role_name: 'Engineer',
            kpis: [
                { name: 'Project Delivery Speed', weight: 40 },
                { name: 'Code Quality / Bugs', weight: 30 },
                { name: 'System Uptime / SLA', weight: 15 },
                { name: 'Peer & Manager Review', weight: 15 }
            ]
        },
        {
            title: 'Human Resources',
            department: 'HR',
            role_name: 'HR Officer',
            kpis: [
                { name: 'Time-to-Hire', weight: 40 },
                { name: 'Payroll / Compliance Accuracy', weight: 30 },
                { name: 'Employee Retention Rate', weight: 20 },
                { name: 'Onboarding Satisfaction', weight: 10 }
            ]
        },
        {
            title: 'Finance & Accounting',
            department: 'Finance',
            role_name: 'Accountant',
            kpis: [
                { name: 'Month-End Close Speed', weight: 35 },
                { name: 'Ledger Audit Accuracy', weight: 35 },
                { name: 'Invoicing / Collections', weight: 20 },
                { name: 'Process Automation', weight: 10 }
            ]
        },
        {
            title: 'Operations & Admin',
            department: 'Operations',
            role_name: 'Operations Manager',
            kpis: [
                { name: 'Budget Variance', weight: 40 },
                { name: 'Internal Ticket SLA', weight: 30 },
                { name: 'Vendor Contract Savings', weight: 15 },
                { name: 'Audit Compliance', weight: 15 }
            ]
        }
    ];

    for (const t of templates) {
        const { error } = await supabase.from('kpi_templates').insert([t]);
        if (error) {
            console.log('Error inserting template', t.title, error.message);
        } else {
            console.log('Inserted template:', t.title);
        }
    }
}

seedKpiTemplates();
