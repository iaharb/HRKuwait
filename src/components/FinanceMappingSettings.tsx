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

        // Fetch the shadow sub-ledger detail
        const { data: detailData, error: detailError } = await supabase
          .from('journal_entries')
          .select(`
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
    <div className={`transition-all duration-300 ${compactMode ? 'p-4 space-y-4' : 'p-8 space-y-8'} animate-in fade-in duration-500 relative`}>
      <h1 className={`${compactMode ? 'text-xl' : 'text-3xl'} font-black text-slate-900 tracking-tight`}>{t('financeMapping', 'Finance Mapping Engine')}</h1>

      {/* --- MODAL OVERLAY --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <h2 className="text-xl font-bold">{t('addNewAccount', 'Add New GL Account')}</h2>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Account Code</label>
              <input
                className="w-full border border-slate-300 rounded-xl p-2"
                placeholder="e.g. 6010"
                value={newAccount.account_code}
                onChange={(e) => setNewAccount({ ...newAccount, account_code: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Account Name</label>
              <input
                className="w-full border border-slate-300 rounded-xl p-2"
                placeholder="e.g. Basic Salary Expense"
                value={newAccount.account_name}
                onChange={(e) => setNewAccount({ ...newAccount, account_name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
              <select
                className="w-full border border-slate-300 rounded-xl p-2 bg-white"
                value={newAccount.account_type}
                onChange={(e) => setNewAccount({ ...newAccount, account_type: e.target.value as any })}
              >
                <option value="EXPENSE">Expense</option>
                <option value="LIABILITY">Liability</option>
                <option value="ASSET">Asset</option>
              </select>
            </div>

            <div className="flex gap-3 pt-4">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition">
                Cancel
              </button>
              <button onClick={saveNewAccount} className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition">
                Save Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- TABS --- */}
      <div className={`flex border-b border-slate-200 ${compactMode ? 'gap-4' : 'gap-0'}`}>
        <button
          className={`px-4 py-2 font-medium transition-all ${activeTab === 'intelligence' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-700'} ${compactMode ? 'text-xs pb-1' : ''}`}
          onClick={() => setActiveTab('intelligence')}
        >
          {t('intelligenceHub', 'Intelligence Hub')}
        </button>
        <button
          className={`px-4 py-2 font-medium transition-all ${activeTab === 'chart' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-700'} ${compactMode ? 'text-xs pb-1' : ''}`}
          onClick={() => setActiveTab('chart')}
        >
          {t('chartOfAccounts', 'Chart of Accounts')}
        </button>
        <button
          className={`px-4 py-2 font-medium transition-all ${activeTab === 'rules' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-700'} ${compactMode ? 'text-xs pb-1' : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          {t('smartRulesBuilder', 'Smart Rules Builder')}
        </button>
        <button
          className={`px-4 py-2 font-medium transition-all ${activeTab === 'jv' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-700'} ${compactMode ? 'text-xs pb-1' : ''}`}
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
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800">{t('glCodes', 'GL Codes Repository')}</h2>
              <button
                className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition shadow-indigo-500/20 shadow-lg"
                onClick={() => setIsModalOpen(true)}
              >
                + {t('addNewAccount', 'Add GL Account')}
              </button>
            </div>

            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 ${compactMode ? 'gap-4' : 'gap-6'}`}>
              {accounts.map((a) => (
                <div key={a.id} onClick={() => { setNewAccount(a); setIsModalOpen(true); }} className={`relative bg-white/60 backdrop-blur-xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] rounded-3xl hover:-translate-y-1 transition-all cursor-pointer overflow-hidden group ${compactMode ? 'p-4' : 'p-6'}`}>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-400/10 rounded-full blur-3xl group-hover:bg-indigo-400/20 transition-all"></div>

                  <div className={`flex justify-between items-start ${compactMode ? 'mb-2' : 'mb-4'}`}>
                    <span className={`font-black text-slate-800 tracking-tight ${compactMode ? 'text-lg' : 'text-xl'}`}>{a.account_code}</span>
                    <div className="flex items-center gap-2">
                      {a.is_active !== false && <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"></span>}
                    </div>
                  </div>

                  <h3 className={`font-bold text-slate-700 leading-tight ${compactMode ? 'text-sm mb-0.5' : 'text-base mb-1'}`}>{a.account_name}</h3>

                  <div className={`flex justify-between items-center relative z-10 ${compactMode ? 'mt-4' : 'mt-6'}`}>
                    <span className={`uppercase tracking-widest font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg ${compactMode ? 'text-[8px]' : 'text-[10px]'}`}>
                      {a.account_type}
                    </span>
                    <span className={`text-slate-400 font-semibold ${compactMode ? 'text-[10px]' : 'text-xs'}`}>
                      {a.is_active !== false ? 'Active' : 'Archived'}
                    </span>
                  </div>
                </div>
              ))}
              {accounts.length === 0 && (
                <div className="col-span-1 md:col-span-2 lg:col-span-3 text-center p-12 bg-slate-50 rounded-3xl border border-slate-200 text-slate-400">
                  <span className="text-2xl mb-2 block">🏦</span>
                  No GL accounts found. Add one to begin mapping.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------- Smart Rules Builder ---------- */}
        {activeTab === 'rules' && (
          <div className="space-y-8">
            <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${compactMode ? 'p-4' : 'p-6'}`}>
              <h2 className={`${compactMode ? 'text-base mb-3' : 'text-lg mb-4'} font-bold`}>{t('createMappingRule', 'Create Mapping Rule')}</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className={`${compactMode ? 'space-y-1' : 'space-y-2'}`}>
                  <label className="block text-[10px] uppercase tracking-widest font-black text-slate-500">{t('payrollItem', 'Payroll Item')}</label>
                  <select
                    className={`w-full rounded-xl border-slate-200 bg-slate-50/50 focus:ring-2 focus:ring-indigo-600 transition-all font-bold ${compactMode ? 'p-2 text-xs' : 'p-2.5 text-sm'}`}
                    value={newRule.payroll_item_type || ''}
                    onChange={(e) => setNewRule({ ...newRule, payroll_item_type: e.target.value })}
                  >
                    <option value="">{t('select', 'Select...')}</option>
                    {payrollItemTypes.map((p) => (
                      <option key={p} value={p}>{p.replace(/_/g, ' ').toUpperCase()}</option>
                    ))}
                  </select>
                </div>

                <div className={`${compactMode ? 'space-y-1' : 'space-y-2'}`}>
                  <label className="block text-[10px] uppercase tracking-widest font-black text-slate-500">{t('nationality', 'Nationality Group')}</label>
                  <select
                    className={`w-full rounded-xl border-slate-200 bg-slate-50/50 focus:ring-2 focus:ring-indigo-600 transition-all font-bold ${compactMode ? 'p-2 text-xs' : 'p-2.5 text-sm'}`}
                    value={newRule.nationality_group || 'ALL'}
                    onChange={(e) => setNewRule({ ...newRule, nationality_group: e.target.value as any })}
                  >
                    <option value="ALL">{t('all', 'ALL (Applies to everyone)')}</option>
                    <option value="LOCAL">{t('local', 'LOCAL (Kuwaiti)')}</option>
                    <option value="EXPAT">{t('expat', 'EXPAT (Non-Kuwaiti)')}</option>
                  </select>
                </div>

                <div className={`${compactMode ? 'space-y-1' : 'space-y-2'}`}>
                  <label className="block text-[10px] uppercase tracking-widest font-black text-slate-500">{t('glAccount', 'GL Account')}</label>
                  <select
                    className={`w-full rounded-xl border-slate-200 bg-slate-50/50 focus:ring-2 focus:ring-indigo-600 transition-all font-bold ${compactMode ? 'p-2 text-xs' : 'p-2.5 text-sm'}`}
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

              <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${compactMode ? 'mt-4' : 'mt-6'}`}>
                <div className={`${compactMode ? 'space-y-1' : 'space-y-2'}`}>
                  <label className="block text-[10px] uppercase tracking-widest font-black text-slate-500">{t('ruleName', 'Rule Name')}</label>
                  <input
                    className={`w-full rounded-xl border-slate-200 bg-slate-50/50 focus:ring-2 focus:ring-indigo-600 transition-all font-bold ${compactMode ? 'p-2 text-xs' : 'p-2.5 text-sm'}`}
                    placeholder={t('ruleNamePlaceholder', 'e.g. Expat Indemnity Accrual')}
                    value={newRule.rule_name || ''}
                    onChange={(e) => setNewRule({ ...newRule, rule_name: e.target.value })}
                  />
                </div>

                <div className={`${compactMode ? 'space-y-1' : 'space-y-2'}`}>
                  <label className="block text-[10px] uppercase tracking-widest font-black text-slate-500">{t('creditOrDebit', 'Credit / Debit')}</label>
                  <select
                    className={`w-full rounded-xl border-slate-200 bg-slate-50/50 focus:ring-2 focus:ring-indigo-600 transition-all font-bold ${compactMode ? 'p-2 text-xs' : 'p-2.5 text-sm'}`}
                    value={newRule.credit_or_debit || 'DR'}
                    onChange={(e) => setNewRule({ ...newRule, credit_or_debit: e.target.value as any })}
                  >
                    <option value="DR">{t('debit', 'Debit (DR - Expense/Asset)')}</option>
                    <option value="CR">{t('credit', 'Credit (CR - Liability/Revenue)')}</option>
                  </select>
                </div>
              </div>

              <div className="mt-6 flex gap-4">
                <button
                  className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition"
                  onClick={createRule}
                >
                  {newRule.id ? t('updateRule', 'Update Mapping Rule') : t('saveRule', 'Save Mapping Rule')}
                </button>
                {newRule.id && (
                  <button
                    className="px-6 py-2.5 bg-slate-100 text-slate-600 font-medium rounded-xl hover:bg-slate-200 transition"
                    onClick={() => setNewRule({ nationality_group: 'ALL', credit_or_debit: 'DR' })}
                  >
                    Cancel Edit
                  </button>
                )}
                {!newRule.id && (
                  <button
                    className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-medium rounded-xl hover:opacity-90 transition flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                    onClick={() => alert("AI Auto-Map: Detected 'Remote Work Stipend'. Suggesting mapping to GL 'Other Allowances Expense'.")}
                  >
                    <span className="text-lg">✨</span> Auto-Map New Items
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
          <div className="space-y-6">
            <div className={`bg-indigo-50 border border-indigo-100 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-6 shadow-sm ${compactMode ? 'p-4' : 'p-6'}`}>
              <div>
                <h3 className={`text-indigo-900 font-black flex items-center gap-2 ${compactMode ? 'text-base' : 'text-lg'}`}>
                  <span className={`bg-indigo-200/50 rounded-lg ${compactMode ? 'p-1' : 'p-1.5'}`}>⚙️</span>
                  {t('autoDetection', 'Engine Control Panel')}
                </h3>
                <p className={`text-indigo-700 mt-1 mb-4 font-medium ${compactMode ? 'text-xs' : 'text-sm'}`}>
                  {t('jvDescription', 'Select a finalized payroll batch to process or run a dry simulation.')}
                </p>
                <div className="flex items-center gap-3">
                  <select
                    className={`rounded-xl border border-indigo-200 bg-white font-bold text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm ${compactMode ? 'px-3 py-1.5 text-xs w-48' : 'px-4 py-2 w-64'}`}
                    value={selectedRunId}
                    onChange={(e) => setSelectedRunId(e.target.value)}
                  >
                    {pendingRuns.length === 0 && <option value="">{t('noPendingRuns', 'No Runs Found')}</option>}
                    {pendingRuns.map(run => (
                      <option key={run.id} value={run.id}>[{run.status?.toUpperCase()}] {run.period_key}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Only show Generate/Simulate buttons if the run is NOT locked */}
              {pendingRuns.find(r => r.id === selectedRunId)?.status?.toLowerCase() !== 'locked' && (
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={runDrySimulation}
                    className="bg-white border-2 border-indigo-200 text-indigo-700 hover:bg-slate-50 px-6 py-3 rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <span className="text-lg">🧪</span> {t('dryRunSimulation', 'Dry Run Simulation')}
                  </button>
                  <button
                    onClick={generateJV}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-2xl font-black shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
                  >
                    <span className="text-lg">⚡</span> {t('generateLatestJV', 'Generate JV')}
                  </button>
                </div>
              )}
            </div>

            <div className={`grid grid-cols-1 md:grid-cols-3 animate-in slide-in-from-bottom-4 duration-300 ${compactMode ? 'gap-4' : 'gap-6'}`}>
              <div className={`bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between ${compactMode ? 'p-4' : 'p-6'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`p-1 px-2 bg-indigo-50 text-indigo-500 rounded-lg ${compactMode ? 'text-xs' : 'text-sm'}`}>⭐</span>
                  <h4 className={`font-black text-slate-400 uppercase tracking-widest ${compactMode ? 'text-[8px]' : 'text-[10px]'}`}>KPI Performance Bonuses</h4>
                </div>
                <div className={`font-black text-slate-900 tracking-tighter ${compactMode ? 'text-lg' : 'text-2xl'}`}>
                  {rollup.filter(r => r.payroll_item_type === 'performance_bonus').reduce((sum, r) => sum + Number(r.total_amount), 0).toLocaleString('en-KW', { minimumFractionDigits: 3 })} <span className="text-xs text-slate-400 font-bold ml-1">KWD</span>
                </div>
              </div>
              <div className={`bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between ${compactMode ? 'p-4' : 'p-6'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`p-1 px-2 bg-emerald-50 text-emerald-500 rounded-lg ${compactMode ? 'text-xs' : 'text-sm'}`}>💰</span>
                  <h4 className={`font-black text-slate-400 uppercase tracking-widest ${compactMode ? 'text-[8px]' : 'text-[10px]'}`}>Company Profit Sharing</h4>
                </div>
                <div className={`font-black text-slate-900 tracking-tighter ${compactMode ? 'text-lg' : 'text-2xl'}`}>
                  {rollup.filter(r => r.payroll_item_type === 'company_bonus').reduce((sum, r) => sum + Number(r.total_amount), 0).toLocaleString('en-KW', { minimumFractionDigits: 3 })} <span className="text-xs text-slate-400 font-bold ml-1">KWD</span>
                </div>
              </div>
              <div className={`bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between ${compactMode ? 'p-4' : 'p-6'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`p-1 px-2 bg-amber-50 text-amber-500 rounded-lg ${compactMode ? 'text-xs' : 'text-sm'}`}>⏰</span>
                  <h4 className={`font-black text-slate-400 uppercase tracking-widest ${compactMode ? 'text-[8px]' : 'text-[10px]'}`}>Overtime Conversion</h4>
                </div>
                <div className={`font-black text-slate-900 tracking-tighter ${compactMode ? 'text-lg' : 'text-2xl'}`}>
                  {rollup.filter(r => r.payroll_item_type === 'overtime').reduce((sum, r) => sum + Number(r.total_amount), 0).toLocaleString('en-KW', { minimumFractionDigits: 3 })} <span className="text-xs text-slate-400 font-bold ml-1">KWD</span>
                </div>
              </div>
            </div>

            {varianceAnalysis && (
              <div className={`p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between border shadow-sm animate-in fade-in zoom-in duration-300 ${varianceAnalysis.status === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                varianceAnalysis.status === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-900' :
                  'bg-rose-50 border-rose-200 text-rose-900'
                }`}>
                <div className="flex items-center gap-4 mb-4 md:mb-0">
                  <span className="text-4xl bg-white p-2 rounded-2xl shadow-sm">
                    {varianceAnalysis.status === 'success' ? '✅' : varianceAnalysis.status === 'warning' ? '⚠️' : '🚨'}
                  </span>
                  <div>
                    <h4 className="font-bold text-lg leading-tight uppercase tracking-wider opacity-80">Dry Run Pre-Flight</h4>
                    <p className="font-semibold text-xl mt-1">{varianceAnalysis.message}</p>
                  </div>
                </div>
                <div className="text-right flex flex-col items-center md:items-end">
                  <div className={`text-3xl font-black ${varianceAnalysis.status === 'success' ? 'text-emerald-600' :
                    varianceAnalysis.status === 'warning' ? 'text-amber-600' :
                      'text-rose-600'
                    }`}>
                    {varianceAnalysis.variance > 0 ? '+' : ''}{varianceAnalysis.variance.toFixed(1)}%
                  </div>
                  <div className="text-xs uppercase tracking-widest font-bold opacity-70 mt-1 bg-white/50 px-3 py-1 rounded-full">
                    {varianceAnalysis.status === 'success' ? 'Consistent' : varianceAnalysis.status === 'warning' ? 'Review Recommended' : 'Possible Error'}
                  </div>
                </div>
              </div>
            )}

            {graphData && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4 duration-500">
                {/* 1. Leave Provision */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col items-center justify-center">
                  <h4 className="text-slate-500 font-medium mb-2 text-center text-sm">Accumulated Yearly Leave Provision</h4>
                  <div className="text-3xl font-black text-indigo-600">
                    {graphData.leaveProvision.toLocaleString('en-KW', { minimumFractionDigits: 3 })} <span className="text-sm font-medium">KWD</span>
                  </div>
                </div>

                {/* 2. EOS Provision */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col items-center justify-center">
                  <h4 className="text-slate-500 font-medium mb-2 text-center text-sm">Accumulated EOS Provision To-Date</h4>
                  <div className="text-3xl font-black text-indigo-600">
                    {graphData.eosProvision.toLocaleString('en-KW', { minimumFractionDigits: 3 })} <span className="text-sm font-medium">KWD</span>
                  </div>
                </div>

                {/* 3. Monthly YTD Chart */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm md:col-span-2">
                  <h4 className="text-slate-800 font-bold mb-6 text-center text-lg">YTD Monthly Net Payroll by Cost Center</h4>
                  <div className="h-96 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={graphData.monthlyNetByCostCenter}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={(v) => (v / 1000).toFixed(0) + 'k'} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                        <Bar dataKey="Total Net Payroll" barSize={40} fill="#f1f5f9" radius={[8, 8, 0, 0]} />
                        {Object.keys(graphData.monthlyNetByCostCenter[0] || {}).filter(k => k !== 'name' && k !== 'Total Net Payroll' && k !== 'sortKey').map((key, i) => (
                          <Line type="monotone" strokeWidth={3} key={key} dataKey={key} stroke={['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1'][i % 6]} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                        ))}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {rollup.length > 0 && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold">{t('previewRollup', 'Journal Voucher Breakdown')}</h3>
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
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition border border-slate-200"
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
                    <div key={segment} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white mb-6">
                      <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                        <h4 className="font-bold text-slate-800">{segment}</h4>
                        <span className="bg-indigo-100 text-indigo-800 text-sm font-bold px-3 py-1 rounded-full">
                          {items.reduce((sum, item) => sum + Number(item.total_amount), 0).toLocaleString('en-KW', { minimumFractionDigits: 3 })} KWD
                        </span>
                      </div>
                      <table className="w-full text-left">
                        <thead className="text-slate-500 text-sm border-b border-slate-100 bg-white">
                          <tr>
                            <th className="px-6 py-3 font-semibold">{t('nationalityTh')}</th>
                            <th className="px-6 py-3 font-semibold">{t('accountGlTh')}</th>
                            <th className="px-6 py-3 font-semibold text-right">{t('amountKwdTh')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {items.map((r, i) => (
                            <tr key={i} className="hover:bg-slate-50 transition">
                              <td className="px-6 py-4">
                                <span className={`text-xs font-bold px-2 py-1 rounded-md ${r.nationality_status === 'LOCAL' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {r.nationality_status}
                                </span>
                              </td>
                              <td className="px-6 py-4 font-medium text-slate-700">{r.account_name}</td>
                              <td className="px-6 py-4 text-right font-mono text-indigo-600">
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
              <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-4">
                <button
                  onClick={() => setShowSubLedger(!showSubLedger)}
                  className="w-full flex justify-between items-center py-4 px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition border border-slate-200/60"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-xl">🕵️</span> Detailed Shadow Sub-Ledger (Gross-to-Net Audit)
                  </span>
                  <span>{showSubLedger ? '▲ Hide Details' : '▼ Show Details'}</span>
                </button>

                {showSubLedger && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm overflow-x-auto animate-in slide-in-from-top-2">
                    <table className="w-full text-left table-auto">
                      <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-3 font-semibold rounded-tl-lg">Employee</th>
                          <th className="px-4 py-3 font-semibold">Cost Center</th>
                          <th className="px-4 py-3 font-semibold">GL Account</th>
                          <th className="px-4 py-3 font-semibold text-center">DR / CR</th>
                          <th className="px-4 py-3 font-semibold text-right rounded-tr-lg">Amount (KWD)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {subLedger.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition">
                            <td className="px-4 py-3 font-medium text-slate-800">{row.employees.name}</td>
                            <td className="px-4 py-3 text-slate-600">{row.finance_cost_centers.segment_name}</td>
                            <td className="px-4 py-3 text-slate-600">
                              <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 mr-2">{row.finance_chart_of_accounts.account_code}</span>
                              {row.finance_chart_of_accounts.account_name}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`font-black text-[10px] px-2 py-1 rounded-full ${row.entry_type === 'DR' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {row.entry_type}
                              </span>
                            </td>
                            <td className={`text-right font-mono text-indigo-600 font-medium ${compactMode ? 'px-4 py-2 text-xs' : 'px-4 py-3'}`}>
                              {Number(row.amount).toLocaleString('en-KW', { minimumFractionDigits: 3 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {rollup.length > 0 && !isLocked && (
              <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-6 shadow-2xl animate-in slide-in-from-bottom-4 duration-700 mt-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl"></div>
                <div className="relative z-10 w-full md:w-2/3">
                  <h3 className="text-white font-black text-xl flex items-center gap-3 mb-2">
                    <span className="p-2 bg-white/10 rounded-xl text-lg">🔒</span> Workflow Approval: Lock JV Month
                  </h3>
                  <p className="text-slate-400 text-sm font-medium">
                    This step permanently commits the Journal Voucher to the General Ledger. After approval, the current payroll cycle cannot be reversed. This action requires an authorized Director or Finance signature.
                  </p>
                </div>
                <div className="relative z-10 w-full md:w-auto">
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
                    className={`w-full md:w-auto px-8 py-4 rounded-2xl font-black shadow-lg transition-all flex items-center justify-center gap-3 uppercase text-xs tracking-widest whitespace-nowrap ${isLocked ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-50 shadow-none' : 'bg-emerald-500 hover:bg-emerald-600 text-slate-900 shadow-emerald-500/20'
                      }`}
                  >
                    {isLocked ? 'JV Locked' : 'Approve & Lock Month'}
                    {!isLocked && <span className="text-lg">➔</span>}
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
