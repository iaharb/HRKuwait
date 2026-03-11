
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
            label: 'Request Submitted',
            type: 'status',
            actor: 'Employee',
            description: 'Initial submission of leave request',
            color: 'bg-amber-500',
            icon: '📝'
        },
        position: { x: 350, y: 0 },
    },
    {
        id: '2',
        type: 'workflowNode',
        data: {
            label: 'Manager Approved',
            type: 'status',
            actor: 'Manager',
            description: 'Forwarded to HR department',
            color: 'bg-indigo-500',
            icon: '👤'
        },
        position: { x: 350, y: 180 },
    },
    {
        id: '3',
        type: 'workflowNode',
        data: {
            label: 'HR Approved',
            type: 'status',
            actor: 'HR Officer',
            description: 'Pre-approval granted, awaiting resumption',
            color: 'bg-blue-500',
            icon: '🛡️'
        },
        position: { x: 350, y: 360 },
    },
    {
        id: '4',
        type: 'workflowNode',
        data: {
            label: 'Resumed',
            type: 'status',
            actor: 'Employee',
            description: 'Confirmed return to work',
            color: 'bg-emerald-500',
            icon: '✅'
        },
        position: { x: 350, y: 540 },
    },
    {
        id: '5',
        type: 'workflowNode',
        data: {
            label: 'HR Finalized',
            type: 'status',
            actor: 'HR Manager',
            description: 'Days confirmed, balance deducted',
            color: 'bg-violet-600',
            icon: '📜'
        },
        position: { x: 350, y: 720 },
    },
    {
        id: '6',
        type: 'workflowNode',
        data: {
            label: 'Settlement Decision',
            type: 'step',
            actor: 'System',
            description: 'Logic: hub payout vs month-end',
            color: 'bg-white',
            icon: '⚖️'
        },
        position: { x: 350, y: 900 },
    },
    {
        id: '7a',
        type: 'workflowNode',
        data: {
            label: 'Paid (Hub Payout)',
            type: 'status',
            actor: 'Payroll',
            description: 'Immediate settlement via Leave Run',
            color: 'bg-indigo-600',
            icon: '💰'
        },
        position: { x: 150, y: 1080 },
    },
    {
        id: '7b',
        type: 'workflowNode',
        data: {
            label: 'Pushed to Payroll',
            type: 'status',
            actor: 'Payroll',
            description: 'Deferred to standard monthly cycle',
            color: 'bg-slate-400',
            icon: '📅'
        },
        position: { x: 550, y: 1080 },
    },
    {
        id: 'X',
        type: 'workflowNode',
        data: {
            label: 'Rejected',
            type: 'status',
            actor: 'Manager/HR',
            description: 'Request cancelled, balance retained',
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
    { id: 'e5-6', source: '5', target: '6', animated: true },
    { id: 'e6-7a', source: '6', target: '7a', label: 'Hub Path', animated: true },
    { id: 'e6-7b', source: '6', target: '7b', label: 'Month-End Path', animated: true },
    { id: 'e1-X', source: '1', target: 'X', animated: false, style: { stroke: '#f43f5e', strokeDasharray: '3,3' } },
    { id: 'e2-X', source: '2', target: 'X', animated: false, style: { stroke: '#f43f5e', strokeDasharray: '3,3' } },
    { id: 'eX-1', source: 'X', target: '1', label: 'Re-open', animated: true, style: { stroke: '#10b981' } },
];

const LeaveWorkflow = () => {
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

export default LeaveWorkflow;
