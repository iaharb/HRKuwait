
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
            label: '1. Select Period',
            type: 'step',
            actor: 'Payroll Manager',
            description: 'Choose month, year, and cycle architecture (Monthly/Bi-Weekly)',
            icon: '📅'
        },
        position: { x: 350, y: 0 },
    },
    {
        id: '2',
        type: 'workflowNode',
        data: {
            label: '2. Execute Audit',
            type: 'step',
            actor: 'System',
            description: 'Trigger "generate_payroll_draft" RPC call',
            icon: '⚙️'
        },
        position: { x: 350, y: 180 },
    },
    {
        id: '3',
        type: 'workflowNode',
        data: {
            label: '3. Draft Generated',
            type: 'status',
            actor: 'System',
            description: 'Payroll items created for all active employees',
            color: 'bg-amber-500',
            icon: '📄'
        },
        position: { x: 350, y: 360 },
    },
    {
        id: '4',
        type: 'workflowNode',
        data: {
            label: '4. HR Review',
            type: 'step',
            actor: 'HR Manager',
            description: 'Verify line items, check variance, and audit core integrity',
            icon: '🔍'
        },
        position: { x: 350, y: 540 },
    },
    {
        id: '5',
        type: 'workflowNode',
        data: {
            label: '5. Finalize Run',
            type: 'status',
            actor: 'Payroll Manager',
            description: 'Lock individual items and finalized run status',
            color: 'bg-indigo-600',
            icon: '🔒'
        },
        position: { x: 350, y: 720 },
    },
    {
        id: '6',
        type: 'workflowNode',
        data: {
            label: '6. Generate JV',
            type: 'status',
            actor: 'Finance',
            description: 'Create Journal Entries based on GL mapping rules',
            color: 'bg-violet-600',
            icon: '🏦'
        },
        position: { x: 350, y: 900 },
    },
    {
        id: '7',
        type: 'workflowNode',
        data: {
            label: '7. Export WPS',
            type: 'step',
            actor: 'Payroll Manager',
            description: 'Download CSV for NBK, KFH, BOUB, Gulf, or Standard',
            icon: '📤'
        },
        position: { x: 350, y: 1080 },
    },
];

const initialEdges: any[] = [
    { id: 'e1-2', source: '1', target: '2', animated: true },
    { id: 'e2-3', source: '2', target: '3', animated: true },
    { id: 'e3-4', source: '3', target: '4', animated: true },
    { id: 'e4-5', source: '4', target: '5', animated: true },
    { id: 'e5-6', source: '5', target: '6', animated: true },
    { id: 'e6-7', source: '6', target: '7', animated: true },
];

const PayrollWorkflow = () => {
    return (
        <div className="h-[1200px] w-full bg-slate-50/50 rounded-3xl overflow-hidden border border-slate-200">
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

export default PayrollWorkflow;
