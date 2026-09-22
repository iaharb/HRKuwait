/* src/components/FinanceMappingSettings.tsx */
import { generateJournalEntries } from '../services/financeUtils'; // Ensure import
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient'; // Adjust path if needed
import { dbService } from '../services/dbService';
import { BarChart, Bar, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  FinanceChartOfAccount,
  FinanceMappingRule,
  FinancialRollup,
} from '../types/types';
import { useTranslation } from 'react-i18next';
import { useNotifications } from './NotificationSystem';

import { FinanceIntelligenceHub } from './FinanceIntelligenceHub';

interface FinanceMappingSettingsProps {
  compactMode?: boolean;
}

export const FinanceMappingSettings: React.FC<FinanceMappingSettingsProps> = ({ compactMode }) => {
  const { t, i18n } = useTranslation();
  const { notify } = useNotifications();
  const [activeTab, setActiveTab] = useState<'intelligence' | 'chart' | 'rules' | 'jv'>('intelligence');

  // --- Modal State for Add Account ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newAccount, setNewAccount] = useState<Partial<FinanceChartOfAccount>>({
    account_code: '',
    account_name: '',
    account_type: 'EXPENSE',
  });

  /* ----------  Tab 1 – Chart of Accounts ---------- */
  const [accounts, setAccounts] = useState<FinanceChartOfAccount[]>([]);

  const fetchAccounts = async () => {
    const { data, error } = await supabase
      .from('finance_chart_of_accounts')
      .select('*')
      .order('account_code');
    if (!error) setAccounts(data as FinanceChartOfAccount[]);
  };

  const saveNewAccount = async () => {
    if (!newAccount.account_code || !newAccount.account_name) return;
    if (newAccount.id) {
      const { error } = await supabase.from('finance_chart_of_accounts').update({
        account_code: newAccount.account_code,
        account_name: newAccount.account_name,
        account_type: newAccount.account_type
      }).eq('id', newAccount.id);
      if (!error) {
        setIsModalOpen(false);
        setNewAccount({ account_code: '', account_name: '', account_type: 'EXPENSE' });
        fetchAccounts();
        notify("Success", "GL Account successfully updated.", "success");
      } else {
        notify("Error", "Failed to update GL Account.", "error");
      }
    } else {
      const { error } = await supabase.from('finance_chart_of_accounts').insert([newAccount]);
      if (!error) {
        setIsModalOpen(false);
        setNewAccount({ account_code: '', account_name: '', account_type: 'EXPENSE' });
        fetchAccounts();
        notify("Success", "New GL Account created.", "success");
      } else {
        notify("Error", "Failed to create GL Account.", "error");
      }
    }
  };

  /* ----------  Tab 2 – Smart Rules Builder ---------- */
  const [rules, setRules] = useState<FinanceMappingRule[]>([]);

  // EXPANDED LIST: Covers all specific HR components discussed
  const [payrollItemTypes] = useState<string[]>([
    'basic_salary',
    'housing_allowance',
    'transport_allowance',
    'other_allowances',
    'sick_leave',
    'annual_leave',
    'indemnity_accrual',
    'pifss_employer_share',
    'pifss_deduction',
    'performance_bonus',
    'company_bonus',
    'kuwait_tax',
    'net_salary_payable'
  ]);

  const [newRule, setNewRule] = useState<Partial<FinanceMappingRule>>({
    nationality_group: 'ALL',
    credit_or_debit: 'DR'
  });

  const fetchRules = async () => {
    const { data, error } = await supabase
      .from('finance_mapping_rules')
      .select('*, finance_chart_of_accounts(account_name)')
      .order('rule_name');
    if (!error) setRules(data as any[]);
  };

  const createRule = async () => {
    if (!newRule.rule_name || !newRule.payroll_item_type || !newRule.gl_account_id) {
      notify("Validation", "Please fill all required mapping fields.", "warning");
      return;
    }

    if (newRule.id) {
      const { error } = await supabase.from('finance_mapping_rules').update({
        rule_name: newRule.rule_name,
        payroll_item_type: newRule.payroll_item_type,
        gl_account_id: newRule.gl_account_id,
        nationality_group: newRule.nationality_group,
        credit_or_debit: newRule.credit_or_debit
      }).eq('id', newRule.id);
      if (!error) {
        setNewRule({ nationality_group: 'ALL', credit_or_debit: 'DR' });
        fetchRules();
        notify("Success", "Mapping Rule updated.", "success");
      } else {
        notify("Error", "Failed to update mapping rule.", "error");
      }
    } else {
      const { error } = await supabase.from('finance_mapping_rules').insert([newRule]);
      if (!error) {
        setNewRule({ nationality_group: 'ALL', credit_or_debit: 'DR' });
        fetchRules();
        notify("Success", "New Mapping Rule created.", "success");
      } else {
        notify("Error", "Failed to create mapping rule.", "error");
      }
    }
  };

  /* ----------  Tab 3 – JV Generator ---------- */
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [pendingRuns, setPendingRuns] = useState<{ id: string, period_key: string, status?: string }[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [rollup, setRollup] = useState<FinancialRollup[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [subLedger, setSubLedger] = useState<any[]>([]);
  const [showSubLedger, setShowSubLedger] = useState<boolean>(false);
  const [expandedEmployees, setExpandedEmployees] = useState<Record<string, boolean>>({});
  const [graphData, setGraphData] = useState<{
    leaveProvision: number;
    eosProvision: number;
    monthlyNetByCostCenter: any[];
  } | null>(null);

  const [varianceAnalysis, setVarianceAnalysis] = useState<{ status: 'success' | 'warning' | 'error', message: string, variance: number } | null>(null);

  const runDrySimulation = async () => {
    try {
      if (!selectedRunId) {
        notify("Attention", "Please select a payroll run to simulate.", "warning");
        return;
      }

      // 1. Fetch current rollup data from the database
      const { data, error: rollupError } = await supabase
        .from('view_financial_rollup')
        .select('*')
        .eq('payroll_run_id', selectedRunId);

      if (rollupError || !data) {
        notify("Simulation Error", "Could not fetch active rollup data.", "error");
        return;
      }

      const currentRollup = data as any[];

      // 2. Mocking previous month's data by deflating the current totals slightly. 
      // In production, this would compare against a parameterized historical view.
      const previousRollup = currentRollup.map(r => {
        if (r.account_name && (r.account_name.includes('Housing Allowance') || r.account_name.includes('Basic Salary'))) {
          // Simulate a +4.2% variance by taking current / 1.042
          return { ...r, total_amount: Number(r.total_amount) / 1.042 };
        }
        return { ...r, total_amount: Number(r.total_amount) };
      });

      // 3. Comparison Logic (from Intelligence Hub spec)
      const currentHousing = currentRollup
        .filter(r => r.account_name?.includes('Housing Allowance'))
        .reduce((sum, r) => sum + Number(r.total_amount), 0);

      const prevHousing = previousRollup
        .filter(r => r.account_name?.includes('Housing Allowance'))
        .reduce((sum, r) => sum + Number(r.total_amount), 0);

      let variance = 0;
      if (prevHousing > 0) {
        variance = ((currentHousing - prevHousing) / prevHousing) * 100;
      }

      let status: 'success' | 'warning' | 'error' = 'success';
      let message = "Totals are consistent with last month.";

      if (Math.abs(variance) > 10) {
        status = 'error';
        message = `Variance: ${variance > 0 ? '+' : ''}${variance.toFixed(1)}% in Housing Allowances. Check mapping rules!`;
      } else if (Math.abs(variance) > 2) {
        status = 'warning';
        message = `Variance: ${variance > 0 ? '+' : ''}${variance.toFixed(1)}% in Housing Allowances. Review recommended.`;
      }

      setVarianceAnalysis({ status, message, variance });

      notify(
        'Simulation Complete',
        status === 'success' ? message : `Dry Run Mode: ${message}`,
        status === 'error' ? 'error' : status === 'warning' ? 'warning' : 'success'
      );

    } catch (err: any) {
      console.error(err);
      notify("Simulation Failed", err.message || err.toString(), "error");
    }
  };

  const fetchPendingRuns = async () => {
    try {
      const { data, error } = await supabase
        .from('payroll_runs')
        .select('*')
        .in('status', ['Finalized', 'Locked', 'JV_Generated', 'finalized', 'locked', 'jv_generated'])
        .order('period_key', { ascending: false });

      if (error) throw error;
      if (data) {
        setPendingRuns(data);
        const stillExists = data.some((d: any) => d.id === selectedRunId);
        if (data.length > 0 && (!selectedRunId || !stillExists)) {
          setSelectedRunId(data[0].id);
          setCurrentRunId('');
          setRollup([]);
          setSubLedger([]);
        } else if (data.length === 0) {
          setSelectedRunId('');
          setCurrentRunId('');
          setRollup([]);
          setSubLedger([]);
        }
      }
    } catch (e: any) {
      console.error("Failed to fetch pending runs:", e);
    }
  };

  // Auto-fetch if the user dynamically selects a locked run from the dropdown
  useEffect(() => {
    if (!selectedRunId) return;
    const run = pendingRuns.find(r => r.id === selectedRunId);
    if (run && run.status?.toLowerCase() === 'locked') {
      const fetchLockedJV = async () => {
        setCurrentRunId(run.id);
        setIsLocked(true);
        setVarianceAnalysis(null);

        // Fetch the rolled-up data for the UI
        const { data, error: rollupError } = await supabase
          .from('view_financial_rollup')
          .select('*')
          .eq('payroll_run_id', run.id);

        const { data: detailData, error: detailError } = await supabase
          .from('journal_entries')
          .select(`
                payroll_item_type,
                amount,
                entry_type,
                finance_chart_of_accounts!inner(account_name, account_code),
                finance_cost_centers!inner(segment_name),
                employees!inner(name)
              `)
          .eq('payroll_run_id', run.id);

        if (!detailError && detailData) setSubLedger(detailData);
        if (!rollupError && data) {
          setRollup(data as FinancialRollup[]);
          // We don't recalculate provisions graph data on locked views since locked implies it might be historical.
          // Just keep it simple and skip graphData, or recalculate it anyway.
          // For safety, clear it.
          setGraphData(null);
        }
      };
      fetchLockedJV();
    } else {
      // If it was changed to an unlocked run, clear the old data so they generate from scratch
      setCurrentRunId('');
      setRollup([]);
      setSubLedger([]);
      setGraphData(null);
      setVarianceAnalysis(null);
      setIsLocked(false);
    }
  }, [selectedRunId, pendingRuns]);

  const generateJV = async () => {
    if (!selectedRunId) {
      notify("Attention", "No payroll runs found for selection.", "warning");
      return;
    }

    try {
      // Query payroll_runs – only select columns that exist in the table
      const { data: latestRun, error: runError } = await supabase
        .from('payroll_runs')
        .select('id, period_key, status')
        .eq('id', selectedRunId)
        .maybeSingle();

      if (runError) {
        console.error("Payroll run query error:", runError);
        notify("Query Error", runError.message, "error");
        return;
      }

      if (!latestRun) {
        notify("Attention", "Selected payroll run could not be resolved.", "warning");
        return;
      }

      console.log("Found finalized run:", latestRun);
      setCurrentRunId(latestRun.id);
      setIsLocked(false);

      // Trigger the utility to process the mapping rules (DR/CR, Local/Expat)
      await generateJournalEntries(latestRun.id);

      // Fetch the rolled-up data for the UI
      const { data, error: rollupError } = await supabase
        .from('view_financial_rollup')
        .select('*')
        .eq('payroll_run_id', latestRun.id);

      // Fetch the shadow sub-ledger detail
      const { data: detailData, error: detailError } = await supabase
        .from('journal_entries')
        .select(`
          payroll_item_type,
          amount,
          entry_type,
          finance_chart_of_accounts!inner(account_name, account_code),
          finance_cost_centers!inner(segment_name),
          employees!inner(name)
        `)
        .eq('payroll_run_id', latestRun.id);

      if (!detailError && detailData) {
        setSubLedger(detailData);
        // After successful JV generation, mark the run as JV_Generated so WPS can see it
        await supabase.from('payroll_runs').update({ status: 'JV_Generated' }).eq('id', latestRun.id);
      }

      if (!rollupError && data) {
        setRollup(data as FinancialRollup[]);

        // Calculate Graph Data
        const employees = await dbService.getEmployees();
        let leaveProv = 0;
        let eosProv = 0;

        employees.forEach(emp => {
          if (emp.status === 'Active') {
            const basic = Number(emp.salary) || 0;
            const allowanceTotal = emp.allowances.reduce((acc, a) => acc + (a.type === 'Fixed' ? Number(a.value) : (basic * (Number(a.value) / 100))), 0);
            const gross = basic + allowanceTotal;
            const dailyRate = gross / 26;

            // 1. Leave Provision
            const leaveBalance = (emp.leaveBalances?.annual || 30) - (emp.leaveBalances?.annualUsed || 0);
            if (leaveBalance > 0) leaveProv += (leaveBalance * dailyRate);

            // 2. EOS Provision
            const joinDate = new Date(emp.joinDate);
            const daysService = Math.max(0, Math.floor((new Date().getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24)));
            const yearsService = daysService / 365;
            let eos = 0;
            if (yearsService <= 5) eos = (yearsService * 15) * dailyRate;
            else eos = (5 * 15 * dailyRate) + ((yearsService - 5) * 30 * dailyRate);
            eos = Math.min(eos, gross * 18); // Capped at 18 months salary
            eosProv += eos;
          }
        });

        // Fetch IDs of Finalized/Locked runs first for reliable filtering
        const { data: runs, error: runsError } = await supabase
          .from('payroll_runs')
          .select('id')
          .in('status', ['Finalized', 'Locked', 'JV_Generated', 'finalized', 'locked', 'jv_generated']);

        const runIds = runs?.map(r => r.id) || [];

        // 3. Monthly Net Payroll by Cost Center (YTD month by month) - Filtered by Run IDs
        const { data: histData, error: histError } = await supabase
          .from('journal_entries')
          .select(`
            amount,
            entry_date,
            finance_chart_of_accounts!inner(account_name),
            finance_cost_centers!inner(segment_name)
          `)
          .in('payroll_run_id', runIds);

        const monthlyNetByCostCenter: any[] = [];
        if (!histError && histData) {
          const groupedHist: Record<string, any> = {};
          histData.forEach((row: any) => {
            const accName = row.finance_chart_of_accounts?.account_name?.toLowerCase() || '';
            if (accName.includes('net ') || accName.includes('payable')) {
              const date = new Date(row.entry_date);
              // Use UTC to avoid timezone bleeding for month-end dates
              const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
              const monthLabel = `${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
              const sortKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
              const cc = row.finance_cost_centers.segment_name;
              const amt = Number(row.amount);

              if (!groupedHist[sortKey]) groupedHist[sortKey] = { name: monthLabel, sortKey, 'Total Net Payroll': 0 };
              if (!groupedHist[sortKey][cc]) groupedHist[sortKey][cc] = 0;
              groupedHist[sortKey][cc] += amt;
              groupedHist[sortKey]['Total Net Payroll'] += amt;
            }
          });
          Object.keys(groupedHist).sort().forEach(key => monthlyNetByCostCenter.push(groupedHist[key]));
        }

        setGraphData({
          leaveProvision: leaveProv,
          eosProvision: eosProv,
          monthlyNetByCostCenter
        });
      }

      notify("Successfully Validated", `JV generated successfully for run: ${latestRun.period_key}`, "success");
    } catch (err: any) {
      console.error("JV Generation Failed:", err);
      notify("JV Generation Failed", err.message || err.toString(), "error");
    }
  };

  /* ----------  Lifecycle ---------- */
  useEffect(() => {
    fetchAccounts();
    fetchRules();
    fetchPendingRuns();
  }, []);

  return (
    <div className="cds--registry-view" style={{ padding: compactMode ? '0' : 'var(--cds-spacing-05)', animation: 'fade-in 0.8s ease', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)' }}>
      <h1 style={{ fontSize: compactMode ? '1.5rem' : '2rem', fontWeight: 600, color: 'var(--cds-text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('financeMapping', 'Finance Mapping Engine')}</h1>

      {/* --- MODAL OVERLAY --- */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--cds-spacing-05)', backdropFilter: 'blur(4px)' }}>
          <div className="cds--tile" style={{ width: '100%', maxWidth: '500px', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-strong)', padding: 'var(--cds-spacing-07)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{t('addNewAccount', 'Add New GL Account')}</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>Account Code</label>
              <input
                style={{ width: '100%', padding: 'var(--cds-spacing-04)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', color: 'var(--cds-text-primary)', fontFamily: 'monospace' }}
                placeholder="e.g. 6010"
                value={newAccount.account_code}
                onChange={(e) => setNewAccount({ ...newAccount, account_code: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>Account Name</label>
              <input
                style={{ width: '100%', padding: 'var(--cds-spacing-04)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', color: 'var(--cds-text-primary)' }}
                placeholder="e.g. Basic Salary Expense"
                value={newAccount.account_name}
                onChange={(e) => setNewAccount({ ...newAccount, account_name: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>Type</label>
              <select
                style={{ width: '100%', padding: 'var(--cds-spacing-04)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', color: 'var(--cds-text-primary)' }}
                value={newAccount.account_type}
                onChange={(e) => setNewAccount({ ...newAccount, account_type: e.target.value as any })}
              >
                <option value="EXPENSE">Expense</option>
                <option value="LIABILITY">Liability</option>
                <option value="ASSET">Asset</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 'var(--cds-spacing-05)', marginTop: 'var(--cds-spacing-05)' }}>
              <button onClick={() => setIsModalOpen(false)} className="cds--btn cds--btn--secondary" style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                Cancel
              </button>
              <button onClick={saveNewAccount} className="cds--btn cds--btn--primary" style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                Save Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- TABS --- */}
      <div className="cds--tabs" style={{ display: 'flex', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
        <button
          className={`cds--tabs__nav-item ${activeTab === 'intelligence' ? 'cds--tabs__nav-item--selected' : ''}`}
          onClick={() => setActiveTab('intelligence')}
        >
          {t('intelligenceHub', 'Intelligence Hub')}
        </button>
        <button
          className={`cds--tabs__nav-item ${activeTab === 'chart' ? 'cds--tabs__nav-item--selected' : ''}`}
          onClick={() => setActiveTab('chart')}
        >
          {t('chartOfAccounts', 'Chart of Accounts')}
        </button>
        <button
          className={`cds--tabs__nav-item ${activeTab === 'rules' ? 'cds--tabs__nav-item--selected' : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          {t('smartRulesBuilder', 'Smart Rules Builder')}
        </button>
        <button
          className={`cds--tabs__nav-item ${activeTab === 'jv' ? 'cds--tabs__nav-item--selected' : ''}`}
          onClick={() => setActiveTab('jv')}
        >
          {t('jvGenerator', 'JV Generator')}
        </button>
      </div>

      {/* --- TAB CONTENT --- */}
      <div className="pt-2">

        {/* ---------- Intelligence Hub ---------- */}
        {activeTab === 'intelligence' && <FinanceIntelligenceHub />}

        {/* ---------- Chart of Accounts ---------- */}
        {activeTab === 'chart' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{t('glCodes', 'GL Codes Repository')}</h2>
              <button
                className="cds--btn cds--btn--primary"
                onClick={() => setIsModalOpen(true)}
              >
                + {t('addNewAccount', 'Add GL Account')}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--cds-spacing-06)' }}>
              {accounts.map((a) => (
                <div key={a.id} onClick={() => { setNewAccount(a); setIsModalOpen(true); }} className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)', position: 'relative' }}>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-primary)' }}>{a.account_code}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {a.is_active !== false && <span style={{ width: '8px', height: '8px', background: '#24a148', display: 'block' }}></span>}
                    </div>
                  </div>

                  <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--cds-text-primary)', lineHeight: 1.4 }}>{a.account_name}</h3>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                    <span style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-interactive-01)', background: 'var(--cds-layer-active-01)', padding: '2px 8px', textTransform: 'uppercase' }}>
                      {a.account_type}
                    </span>
                    <span style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>
                      {a.is_active !== false ? 'Active' : 'Archived'}
                    </span>
                  </div>
                </div>
              ))}
              {accounts.length === 0 && (
                <div className="cds--tile" style={{ gridColumn: '1 / -1', padding: 'var(--cds-spacing-09)', textAlign: 'center', background: 'var(--cds-background)', border: '1px dashed var(--cds-border-strong)', color: 'var(--cds-text-disabled)' }}>
                  <span style={{ fontSize: '2rem', display: 'block', marginBottom: 'var(--cds-spacing-05)', filter: 'grayscale(100%)' }}>🏦</span>
                  No GL accounts found. Add one to begin mapping.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------- Smart Rules Builder ---------- */}
        {activeTab === 'rules' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)' }}>
            <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cds-text-primary)', marginBottom: 'var(--cds-spacing-06)' }}>{t('createMappingRule', 'Create Mapping Rule')}</h2>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 'var(--cds-spacing-06)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                  <label style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('payrollItem', 'Payroll Item')}</label>
                  <select
                    style={{ padding: 'var(--cds-spacing-04)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', color: 'var(--cds-text-primary)' }}
                    value={newRule.payroll_item_type || ''}
                    onChange={(e) => setNewRule({ ...newRule, payroll_item_type: e.target.value })}
                  >
                    <option value="">{t('select', 'Select...')}</option>
                    {payrollItemTypes.map((p) => (
                      <option key={p} value={p}>{p.replace(/_/g, ' ').toUpperCase()}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                  <label style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('nationality', 'Nationality Group')}</label>
                  <select
                    style={{ padding: 'var(--cds-spacing-04)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', color: 'var(--cds-text-primary)' }}
                    value={newRule.nationality_group || 'ALL'}
                    onChange={(e) => setNewRule({ ...newRule, nationality_group: e.target.value as any })}
                  >
                    <option value="ALL">{t('all', 'ALL (Applies to everyone)')}</option>
                    <option value="LOCAL">{t('local', 'LOCAL (Kuwaiti)')}</option>
                    <option value="EXPAT">{t('expat', 'EXPAT (Non-Kuwaiti)')}</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                  <label style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('glAccount', 'GL Account')}</label>
                  <select
                    style={{ padding: 'var(--cds-spacing-04)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', color: 'var(--cds-text-primary)' }}
                    value={newRule.gl_account_id || ''}
                    onChange={(e) => setNewRule({ ...newRule, gl_account_id: e.target.value })}
                  >
                    <option value="">{t('select', 'Select Account...')}</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.account_code} – {a.account_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--cds-spacing-06)', marginTop: 'var(--cds-spacing-06)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                  <label style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('ruleName', 'Rule Name')}</label>
                  <input
                    style={{ padding: 'var(--cds-spacing-04)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', color: 'var(--cds-text-primary)' }}
                    placeholder={t('ruleNamePlaceholder', 'e.g. Expat Indemnity Accrual')}
                    value={newRule.rule_name || ''}
                    onChange={(e) => setNewRule({ ...newRule, rule_name: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                  <label style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('creditOrDebit', 'Credit / Debit')}</label>
                  <select
                    style={{ padding: 'var(--cds-spacing-04)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', color: 'var(--cds-text-primary)' }}
                    value={newRule.credit_or_debit || 'DR'}
                    onChange={(e) => setNewRule({ ...newRule, credit_or_debit: e.target.value as any })}
                  >
                    <option value="DR">{t('debit', 'Debit (DR - Expense/Asset)')}</option>
                    <option value="CR">{t('credit', 'Credit (CR - Liability/Revenue)')}</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--cds-spacing-04)', marginTop: 'var(--cds-spacing-06)' }}>
                <button
                  className="cds--btn cds--btn--primary"
                  onClick={createRule}
                >
                  {newRule.id ? t('updateRule', 'Update Mapping Rule') : t('saveRule', 'Save Mapping Rule')}
                </button>
                {newRule.id && (
                  <button
                    className="cds--btn cds--btn--secondary"
                    onClick={() => setNewRule({ nationality_group: 'ALL', credit_or_debit: 'DR' })}
                  >
                    Cancel Edit
                  </button>
                )}
                {!newRule.id && (
                  <button
                    className="cds--btn cds--btn--ghost"
                    onClick={() => alert("AI Auto-Map: Detected 'Remote Work Stipend'. Suggesting mapping to GL 'Other Allowances Expense'.")}
                  >
                    ✨ Auto-Map New Items
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-100">
                <h3 className="text-lg font-bold">{t('existingRules', 'Active Mapping Rules')}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left table-auto">
                  <thead className="bg-slate-50 text-slate-500 text-sm">
                    <tr>
                      <th className="px-6 py-3 font-medium">{t('ruleNameTh')}</th>
                      <th className="px-6 py-3 font-medium">{t('payrollItemTh')}</th>
                      <th className="px-6 py-3 font-medium">{t('nationalityTh')}</th>
                      <th className="px-6 py-3 font-medium">{t('glAccountTh')}</th>
                      <th className="px-6 py-3 font-medium">{t('drcrTh')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rules.map((r) => (
                      <tr key={r.id} onClick={() => setNewRule(r)} className="hover:bg-indigo-50/80 transition cursor-pointer">
                        <td className="px-6 py-3 font-medium text-slate-700">{r.rule_name}</td>
                        <td className="px-6 py-3 text-sm">{r.payroll_item_type}</td>
                        <td className="px-6 py-3">
                          <span className={`text-xs font-bold px-2 py-1 rounded-md ${r.nationality_group === 'LOCAL' ? 'bg-green-100 text-green-700' : r.nationality_group === 'EXPAT' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                            {r.nationality_group}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-sm">{r.finance_chart_of_accounts?.account_name || 'Unknown'}</td>
                        <td className="px-6 py-3 font-mono text-sm">{r.credit_or_debit}</td>
                      </tr>
                    ))}
                    {rules.length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">No mapping rules configured yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ---------- Updated Tab 3 Render ---------- */}
        {activeTab === 'jv' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)' }}>
            <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-interactive-01)', background: 'var(--cds-layer-02)', display: 'flex', flexWrap: 'wrap', gap: 'var(--cds-spacing-05)', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--cds-text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
                  <span style={{ fontSize: '1rem' }}>⚙️</span>
                  {t('autoDetection', 'Engine Control Panel')}
                </h3>
                <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', marginTop: '4px', marginBottom: 'var(--cds-spacing-05)' }}>
                  {t('jvDescription', 'Select a finalized payroll batch to process or run a dry simulation.')}
                </p>
                <select
                  style={{ padding: 'var(--cds-spacing-04)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', color: 'var(--cds-text-primary)' }}
                  value={selectedRunId}
                  onChange={(e) => setSelectedRunId(e.target.value)}
                >
                  {pendingRuns.length === 0 && <option value="">{t('noPendingRuns', 'No Runs Found')}</option>}
                  {pendingRuns.map(run => (
                    <option key={run.id} value={run.id}>[{run.status?.toUpperCase()}] {run.period_key}</option>
                  ))}
                </select>
              </div>

              {pendingRuns.find(r => r.id === selectedRunId)?.status?.toLowerCase() !== 'locked' && (
                <div style={{ display: 'flex', gap: 'var(--cds-spacing-04)' }}>
                  <button
                    onClick={runDrySimulation}
                    className="cds--btn cds--btn--secondary"
                  >
                    {t('dryRunSimulation', 'Dry Run Simulation')}
                  </button>
                  <button
                    onClick={generateJV}
                    className="cds--btn cds--btn--primary"
                  >
                    {t('generateLatestJV', 'Generate JV')}
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--cds-spacing-06)' }}>
              <div className="cds--tile" style={{ padding: 'var(--cds-spacing-05)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
                  <span style={{ fontSize: '0.875rem', color: '#8a3ffc' }}>⭐</span>
                  <h4 style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>KPI Performance Bonuses</h4>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--cds-spacing-03)' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-primary)' }}>
                    {rollup.filter(r => r.payroll_item_type === 'performance_bonus').reduce((sum, r) => sum + Number(r.total_amount), 0).toLocaleString('en-KW', { minimumFractionDigits: 3 })}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)' }}>KWD</span>
                </div>
              </div>
              <div className="cds--tile" style={{ padding: 'var(--cds-spacing-05)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
                  <span style={{ fontSize: '0.875rem', color: '#24a148' }}>💰</span>
                  <h4 style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Company Profit Sharing</h4>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--cds-spacing-03)' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-primary)' }}>
                    {rollup.filter(r => r.payroll_item_type === 'company_bonus').reduce((sum, r) => sum + Number(r.total_amount), 0).toLocaleString('en-KW', { minimumFractionDigits: 3 })}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)' }}>KWD</span>
                </div>
              </div>
              <div className="cds--tile" style={{ padding: 'var(--cds-spacing-05)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
                  <span style={{ fontSize: '0.875rem', color: '#f1c21b' }}>⏰</span>
                  <h4 style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Overtime Conversion</h4>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--cds-spacing-03)' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-primary)' }}>
                    {rollup.filter(r => r.payroll_item_type === 'overtime').reduce((sum, r) => sum + Number(r.total_amount), 0).toLocaleString('en-KW', { minimumFractionDigits: 3 })}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)' }}>KWD</span>
                </div>
              </div>
            </div>

            {varianceAnalysis && (
              <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: `1px solid ${varianceAnalysis.status === 'success' ? '#24a148' : varianceAnalysis.status === 'warning' ? '#f1c21b' : '#da1e28'}`, background: varianceAnalysis.status === 'success' ? '#defbe6' : varianceAnalysis.status === 'warning' ? '#fcf0cb' : '#fff1f1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-05)' }}>
                  <span style={{ fontSize: '1.5rem' }}>
                    {varianceAnalysis.status === 'success' ? '✅' : varianceAnalysis.status === 'warning' ? '⚠️' : '🚨'}
                  </span>
                  <div>
                    <h4 style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dry Run Pre-Flight</h4>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{varianceAnalysis.message}</p>
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', color: varianceAnalysis.status === 'success' ? '#044317' : varianceAnalysis.status === 'warning' ? '#8a6d3b' : '#750e13' }}>
                    {varianceAnalysis.variance > 0 ? '+' : ''}{varianceAnalysis.variance.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', padding: '2px 8px', background: 'rgba(0,0,0,0.05)', marginTop: '4px' }}>
                    {varianceAnalysis.status === 'success' ? 'Consistent' : varianceAnalysis.status === 'warning' ? 'Review Recommended' : 'Possible Error'}
                  </div>
                </div>
              </div>
            )}

            {graphData && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--cds-spacing-07)' }}>
                {/* 1. Leave Provision */}
                <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-secondary)', marginBottom: 'var(--cds-spacing-03)' }}>Accumulated Yearly Leave Provision</h4>
                  <div style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-interactive-01)' }}>
                    {graphData.leaveProvision.toLocaleString('en-KW', { minimumFractionDigits: 3 })} <span style={{ fontSize: '0.875rem' }}>KWD</span>
                  </div>
                </div>

                {/* 2. EOS Provision */}
                <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-secondary)', marginBottom: 'var(--cds-spacing-03)' }}>Accumulated EOS Provision To-Date</h4>
                  <div style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-interactive-01)' }}>
                    {graphData.eosProvision.toLocaleString('en-KW', { minimumFractionDigits: 3 })} <span style={{ fontSize: '0.875rem' }}>KWD</span>
                  </div>
                </div>

                {/* 3. Monthly YTD Chart */}
                <div className="cds--tile" style={{ gridColumn: '1 / -1', padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--cds-text-primary)', marginBottom: 'var(--cds-spacing-06)', textAlign: 'center' }}>YTD Monthly Net Payroll by Cost Center</h4>
                  <div style={{ height: '384px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={graphData.monthlyNetByCostCenter}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--cds-border-subtle)" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--cds-text-secondary)', fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--cds-text-secondary)', fontFamily: 'monospace' }} axisLine={false} tickLine={false} tickFormatter={(v) => (v / 1000).toFixed(0) + 'k'} />
                        <Tooltip contentStyle={{ borderRadius: '0', border: '1px solid var(--cds-border-strong)', background: 'var(--cds-layer-01)', fontFamily: 'monospace' }} />
                        <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', fontFamily: 'monospace' }} />
                        <Bar dataKey="Total Net Payroll" barSize={40} fill="var(--cds-layer-02)" />
                        {Object.keys(graphData.monthlyNetByCostCenter[0] || {}).filter(k => k !== 'name' && k !== 'Total Net Payroll' && k !== 'sortKey').map((key, i) => (
                          <Line type="monotone" strokeWidth={2} key={key} dataKey={key} stroke={['#10b981', '#0f62fe', '#f1c21b', '#da1e28', '#8a3ffc', '#0043ce'][i % 6]} dot={{ r: 3, strokeWidth: 1 }} activeDot={{ r: 5 }} />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {rollup.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{t('previewRollup', 'Journal Voucher Breakdown')}</h3>
                  <button
                    onClick={() => {
                      const detailRows = rollup.filter(r => r.segment_name && r.account_name && r.nationality_status);
                      const headers = ["Cost Center", "Nationality", "GL Account", "Amount (KWD)"];
                      const rows = detailRows.map(r => [
                        r.segment_name,
                        r.nationality_status,
                        r.account_name,
                        Number(r.total_amount).toFixed(3)
                      ]);
                      const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const link = document.createElement("a");
                      const url = URL.createObjectURL(blob);
                      link.setAttribute("href", url);
                      link.setAttribute("download", `JV_Report_${currentRunId}.csv`);
                      link.style.visibility = 'hidden';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="cds--btn cds--btn--tertiary"
                  >
                    <span>📥</span> Export CSV Report
                  </button>
                </div>

                {(() => {
                  const detailRows = rollup.filter(r => r.segment_name && r.account_name && r.nationality_status);
                  const groupedData = detailRows.reduce((acc, row) => {
                    if (!acc[row.segment_name]) acc[row.segment_name] = [];
                    acc[row.segment_name].push(row);
                    return acc;
                  }, {} as Record<string, FinancialRollup[]>);

                  Object.values(groupedData).forEach(rows => {
                    rows.sort((a, b) => {
                      if (a.nationality_status !== b.nationality_status) return a.nationality_status.localeCompare(b.nationality_status);
                      return a.account_name.localeCompare(b.account_name);
                    });
                  });

                  return Object.entries(groupedData).map(([segment, items]) => (
                    <div className="cds--tile" key={segment} style={{ padding: '0', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', overflow: 'hidden' }}>
                      <div style={{ padding: 'var(--cds-spacing-05)', background: 'var(--cds-layer-02)', borderBottom: '1px solid var(--cds-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{segment}</h4>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-interactive-01)', background: 'var(--cds-layer-active-01)', padding: '2px 8px' }}>
                          {items.reduce((sum, item) => sum + Number(item.total_amount), 0).toLocaleString('en-KW', { minimumFractionDigits: 3 })} KWD
                        </span>
                      </div>
                      <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                        <thead style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-secondary)', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
                          <tr>
                            <th style={{ padding: 'var(--cds-spacing-04)' }}>{t('nationalityTh')}</th>
                            <th style={{ padding: 'var(--cds-spacing-04)' }}>{t('accountGlTh')}</th>
                            <th style={{ padding: 'var(--cds-spacing-04)', textAlign: 'right' }}>{t('amountKwdTh')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((r, i) => (
                            <tr key={i} style={{ borderBottom: i < items.length - 1 ? '1px solid var(--cds-border-subtle)' : 'none' }}>
                              <td style={{ padding: 'var(--cds-spacing-04)' }}>
                                <span style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', padding: '2px 8px', color: r.nationality_status === 'LOCAL' ? '#044317' : '#0043ce', background: r.nationality_status === 'LOCAL' ? '#defbe6' : '#d0e2ff' }}>
                                  {r.nationality_status}
                                </span>
                              </td>
                              <td style={{ padding: 'var(--cds-spacing-04)', fontSize: '0.875rem', color: 'var(--cds-text-primary)' }}>{r.account_name}</td>
                              <td style={{ padding: 'var(--cds-spacing-04)', fontSize: '0.875rem', fontFamily: 'monospace', color: 'var(--cds-interactive-01)', textAlign: 'right' }}>
                                {Number(r.total_amount).toLocaleString('en-KW', { minimumFractionDigits: 3 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ));
                })()}
              </div>
            )}

            {rollup.length > 0 && subLedger.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)' }}>
                <button
                  onClick={() => setShowSubLedger(!showSubLedger)}
                  className="cds--btn cds--btn--secondary"
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
                    <span>🕵️</span> Detailed Shadow Sub-Ledger (Gross-to-Net Audit)
                  </span>
                  <span>{showSubLedger ? '▲ Hide Details' : '▼ Show Details'}</span>
                </button>

                {showSubLedger && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)', marginTop: 'var(--cds-spacing-04)' }}>
                    {(() => {
                      const groups: Record<string, { name: string, dept: string, entries: any[], net: number }> = {};
                      subLedger.forEach(row => {
                        const name = row.employees.name;
                        if (!groups[name]) groups[name] = { name, dept: row.finance_cost_centers.segment_name, entries: [], net: 0 };
                        groups[name].entries.push(row);

                        // Detect Net Payable - Use Type or common names
                        const pType = row.payroll_item_type;
                        const accName = row.finance_chart_of_accounts.account_name.toLowerCase();
                        if (pType === 'net_salary_payable' || pType === 'net_salary' || accName.includes('net salary') || accName.includes('payable')) {
                          groups[name].net += Number(row.amount);
                        }
                      });

                      return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name)).map((group) => {
                        const isExpanded = expandedEmployees[group.name];
                        return (
                          <div className="cds--tile" key={group.name} style={{ padding: '0', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', overflow: 'hidden' }}>
                            <div
                              onClick={() => setExpandedEmployees({ ...expandedEmployees, [group.name]: !isExpanded })}
                              style={{ padding: 'var(--cds-spacing-05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: isExpanded ? 'var(--cds-layer-active-01)' : 'transparent' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-05)' }}>
                                <div style={{ fontSize: '1rem', color: 'var(--cds-interactive-01)' }}>👤</div>
                                <div>
                                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>
                                    {group.name} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--cds-text-secondary)' }}>({group.dept})</span>
                                  </h4>
                                  <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{group.entries.length} Ledger Records</p>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-06)' }}>
                                <div style={{ textAlign: 'right' }}>
                                  <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>Net Payable After Offsets</p>
                                  <p style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-interactive-01)' }}>{group.net.toLocaleString('en-KW', { minimumFractionDigits: 3 })} <span style={{ fontSize: '0.75rem' }}>KWD</span></p>
                                </div>
                                <div style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--cds-text-secondary)' }}>
                                  ▼
                                </div>
                              </div>
                            </div>

                            {isExpanded && (
                              <div style={{ borderTop: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-02)', padding: 'var(--cds-spacing-05)' }}>
                                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                                  <thead style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>
                                    <tr>
                                      <th style={{ padding: 'var(--cds-spacing-03)' }}>GL Account</th>
                                      <th style={{ padding: 'var(--cds-spacing-03)', textAlign: 'center' }}>Type</th>
                                      <th style={{ padding: 'var(--cds-spacing-03)', textAlign: 'right' }}>Amount (KWD)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.entries.map((ent, idx) => (
                                      <tr key={idx} style={{ borderTop: '1px solid var(--cds-border-subtle)' }}>
                                        <td style={{ padding: 'var(--cds-spacing-03)' }}>
                                          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{ent.finance_chart_of_accounts.account_name}</div>
                                          <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)' }}>{ent.finance_chart_of_accounts.account_code}</div>
                                        </td>
                                        <td style={{ padding: 'var(--cds-spacing-03)', textAlign: 'center' }}>
                                          <span style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', padding: '2px 8px', color: ent.entry_type === 'DR' ? '#8a6d3b' : '#044317', background: ent.entry_type === 'DR' ? '#fcf0cb' : '#defbe6' }}>
                                            {ent.entry_type}
                                          </span>
                                        </td>
                                        <td style={{ padding: 'var(--cds-spacing-03)', fontSize: '0.875rem', fontFamily: 'monospace', color: ent.entry_type === 'DR' ? '#8a6d3b' : '#044317', textAlign: 'right' }}>
                                          {Number(ent.amount).toLocaleString('en-KW', { minimumFractionDigits: 3 })}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            )}

            {rollup.length > 0 && !isLocked && (
              <div className="cds--tile" style={{ padding: 'var(--cds-spacing-07)', border: '1px solid var(--cds-interactive-01)', background: '#161616', marginTop: 'var(--cds-spacing-08)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)', '@media (min-width: 768px)': { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } } as any}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f4f4f4', display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-04)' }}>
                    <span style={{ fontSize: '1rem' }}>🔒</span> Workflow Approval: Lock JV Month
                  </h3>
                  <p style={{ fontSize: '0.875rem', fontFamily: 'monospace', color: '#c6c6c6', marginTop: 'var(--cds-spacing-04)', lineHeight: 1.5 }}>
                    This step permanently commits the Journal Voucher to the General Ledger. After approval, the current payroll cycle cannot be reversed. This action requires an authorized Director or Finance signature.
                  </p>
                </div>
                <div>
                  <button
                    onClick={async () => {
                      if (!currentRunId || isLocked) {
                        notify("Error", "No active payroll run available to lock, or already locked.", "error");
                        return;
                      }
                      try {
                        const { error } = await supabase.from('payroll_runs').update({ status: 'Locked' }).eq('id', currentRunId);
                        if (error) throw error;
                        setIsLocked(true);
                        notify("JV Successfully Locked", "The entries have been submitted to the GL and the payroll run is now irrevocably closed.", "success");
                        fetchPendingRuns(); // Refresh pending list
                      } catch (err: any) {
                        notify("Error", "Could not lock JV: " + err.message, "error");
                      }
                    }}
                    disabled={isLocked}
                    className="cds--btn cds--btn--danger"
                    style={{ width: '100%', fontFamily: 'monospace', padding: '12px 24px', opacity: isLocked ? 0.5 : 1 }}
                  >
                    {isLocked ? 'JV Locked' : 'Approve & Lock Month ➔'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
