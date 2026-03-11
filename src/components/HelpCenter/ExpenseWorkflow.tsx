
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
            label: 'Claim Created',
            type: 'status',
            actor: 'Employee',
            description: 'Draft with merchant, date, amount, and receipt',
            color: 'bg-slate-500',
            icon: '📝'
        },
        position: { x: 350, y: 0 },
    },
    {
        id: '2',
        type: 'workflowNode',
        data: {
            label: 'Manager Review',
            type: 'status',
            actor: 'Manager',
            description: 'Department budget and reason check',
            color: 'bg-amber-500',
            icon: '👤'
        },
        position: { x: 350, y: 180 },
    },
    {
        id: '3',
        type: 'workflowNode',
        data: {
            label: 'HR Policy Check',
            type: 'status',
            actor: 'HR Manager',
            description: 'Verification of receipt and claim category rules',
            color: 'bg-indigo-500',
            icon: '🛡️'
        },
        position: { x: 350, y: 360 },
    },
    {
        id: '4',
        type: 'workflowNode',
        data: {
            label: 'Approved for Payroll',
            type: 'status',
            actor: 'Payroll',
            description: 'Validated for next settlement run',
            color: 'bg-blue-600',
            icon: '💰'
        },
        position: { x: 350, y: 540 },
    },
    {
        id: '5',
        type: 'workflowNode',
        data: {
            label: 'Finance Settled',
            type: 'status',
            actor: 'Finance',
            description: 'Journal entries created and payment processed',
            color: 'bg-emerald-600',
            icon: '🏛️'
        },
        position: { x: 350, y: 720 },
    },
    {
        id: 'X',
        type: 'workflowNode',
        data: {
            label: 'Rejected',
            type: 'status',
            actor: 'Manager/HR',
            description: 'Claim was declined with a reason',
            color: 'bg-rose-500',
            icon: '✕'
        },
        position: { x: 750, y: 270 },
    },
];

const initialEdges: any[] = [
    { id: 'e1-2', source: '1', target: '2', animated: true },
    { id: 'e2-3', source: '2', target: '3', animated: true },
    { id: 'e3-4', source: '3', target: '4', animated: true },
    { id: 'e4-5', source: '4', target: '5', animated: true },
    { id: 'e2-X', source: '2', target: 'X', animated: false, style: { stroke: '#f43f5e', strokeDasharray: '3,3' } },
    { id: 'e3-X', source: '3', target: 'X', animated: false, style: { stroke: '#f43f5e', strokeDasharray: '3,3' } },
];

const ExpenseWorkflow = () => {
    return (
        <div className="h-[1000px] w-full bg-slate-50/50 rounded-3xl overflow-hidden border border-slate-200">
            <ReactFlow
                nodes={initialNodes}
                edges={initialEdges}
                fitView
                snapToGrid
                nodeTypes={nodeTypes}
            >
                <Background gap={20} color="#e2e8f0" />
                <Controls />
                <MiniMap zoomable pannable nodeColor="#cbd5e1" maskColor="rgba(248, 250, 252, 0.7)" />
            </ReactFlow>
        </div>
    );
};

export default ExpenseWorkflow;
