
import React, { useMemo } from 'react';
import { ReactFlow, Controls, Background, MiniMap } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import WorkflowNode from './WorkflowNode.tsx';

const nodeTypes = {
    workflowNode: WorkflowNode,
};

const initialNodes: any[] = [
    {
        id: '1',
        type: 'workflowNode',
        data: {
            label: '1. Service Tenure',
            type: 'step',
            actor: 'Employee',
            description: 'Days of active service minus unpaid days',
            formula: 'Tenure = (EndDate - JoinDate) - UnpaidDays',
            icon: '📅'
        },
        position: { x: 350, y: 0 },
    },
    {
        id: '2',
        type: 'workflowNode',
        data: {
            label: '2. Remuneration',
            type: 'step',
            actor: 'System',
            description: 'Total monthly pay for EOSB basis',
            formula: 'Remuneration = Basic + All Allowances',
            icon: '💵'
        },
        position: { x: 350, y: 180 },
    },
    {
        id: '3',
        type: 'workflowNode',
        data: {
            label: '3. Daily Rate',
            type: 'step',
            actor: 'System',
            description: 'Calculated basis for indemnity',
            formula: 'Daily Rate = Remuneration / 26',
            icon: '⚖️'
        },
        position: { x: 350, y: 360 },
    },
    {
        id: '4',
        type: 'workflowNode',
        data: {
            label: '4. Raw Indemnity',
            type: 'step',
            actor: 'System',
            description: 'Tiered calculation based on tenure',
            formula: 'Indemnity = (min(yrs, 5)*15 + max(0, yrs-5)*30) * Rate',
            icon: '🧮'
        },
        position: { x: 350, y: 540 },
    },
    {
        id: '5',
        type: 'workflowNode',
        data: {
            label: '5. 18-Month Cap',
            type: 'step',
            actor: 'System',
            description: 'Legal limit according to Kuwait Labour Law',
            formula: 'Max = Remuneration * 18',
            icon: '🛑'
        },
        position: { x: 350, y: 720 },
    },
    {
        id: '6',
        type: 'workflowNode',
        data: {
            label: '6. Resignation Path?',
            type: 'step',
            actor: 'System',
            description: 'Decision node: Termination or Resignation',
            icon: '🔀'
        },
        position: { x: 350, y: 900 },
    },
    {
        id: '7a',
        type: 'workflowNode',
        data: {
            label: 'Termination',
            type: 'status',
            actor: 'HR',
            description: 'Multiplier: 1.0 (100% payout)',
            color: 'bg-emerald-600',
            icon: '✅'
        },
        position: { x: 100, y: 1080 },
    },
    {
        id: '7b',
        type: 'workflowNode',
        data: {
            label: 'Resignation',
            type: 'status',
            actor: 'Employee',
            description: 'Tiered based on tenure path',
            color: 'bg-amber-600',
            icon: '📨'
        },
        position: { x: 600, y: 1080 },
    },
    {
        id: '8',
        type: 'workflowNode',
        data: {
            label: 'Resignation Payouts',
            type: 'formula',
            actor: 'System',
            description: 'Tiered multipliers',
            formula: '< 3y: 0% | 3-5y: 50% | 5-10y: 66.7% | 10+y: 100%',
            icon: '📊'
        },
        position: { x: 600, y: 1260 },
    },
];

const initialEdges: any[] = [
    { id: 'e1-2', source: '1', target: '2', animated: true },
    { id: 'e2-3', source: '2', target: '3', animated: true },
    { id: 'e3-4', source: '3', target: '4', animated: true },
    { id: 'e4-5', source: '4', target: '5', animated: true },
    { id: 'e5-6', source: '5', target: '6', animated: true },
    { id: 'e6-7a', source: '6', target: '7a', label: 'Termination', animated: true },
    { id: 'e6-7b', source: '6', target: '7b', label: 'Resignation', animated: true },
    { id: 'e7b-8', source: '7b', target: '8', animated: true },
];

const SettlementWorkflow = () => {
    return (
        <div className="h-[1400px] w-full bg-slate-50/50 rounded-3xl overflow-hidden border border-slate-200">
            <ReactFlow
                nodes={initialNodes}
                edges={initialEdges}
                nodeTypes={nodeTypes}
                fitView
                snapToGrid
            >
                <Background gap={20} color="#e2e8f0" />
                <Controls />
                <MiniMap zoomable pannable nodeColor="#cbd5e1" maskColor="rgba(248, 250, 252, 0.7)" />
            </ReactFlow>
        </div>
    );
};

export default SettlementWorkflow;
