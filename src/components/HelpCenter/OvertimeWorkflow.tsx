
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
            label: 'Attendance Recorded',
            type: 'step',
            actor: 'Employee',
            description: 'Clock-in/out via Web, Mobile, or Hardware',
            icon: '🕒'
        },
        position: { x: 350, y: 0 },
    },
    {
        id: '2',
        type: 'workflowNode',
        data: {
            label: 'Duration > 8h?',
            type: 'step',
            actor: 'System',
            description: 'Standard shift exceeded (28,800 sec)',
            formula: 'OT_Hours = (Duration - 28800) / 3600',
            icon: '❓'
        },
        position: { x: 350, y: 180 },
    },
    {
        id: '3',
        type: 'workflowNode',
        data: {
            label: 'OT Request Created',
            type: 'status',
            actor: 'System',
            description: 'Pending Manager review',
            color: 'bg-amber-500',
            icon: '📝'
        },
        position: { x: 350, y: 360 },
    },
    {
        id: '4',
        type: 'workflowNode',
        data: {
            label: 'Manager Review',
            type: 'step',
            actor: 'Manager',
            description: 'Verify work reason and approve hours',
            icon: '🔍'
        },
        position: { x: 350, y: 540 },
    },
    {
        id: '5',
        type: 'workflowNode',
        data: {
            label: 'HR Acknowledged',
            type: 'status',
            actor: 'HR Manager',
            description: 'Verified for policy compliance',
            color: 'bg-indigo-500',
            icon: '🛡️'
        },
        position: { x: 350, y: 720 },
    },
    {
        id: '6',
        type: 'workflowNode',
        data: {
            label: 'Approved for Payroll',
            type: 'status',
            actor: 'Payroll',
            description: 'Locked for next monthly run',
            color: 'bg-emerald-600',
            icon: '💰'
        },
        position: { x: 350, y: 900 },
    },
    {
        id: 'X',
        type: 'workflowNode',
        data: {
            label: 'Rejected',
            type: 'status',
            actor: 'Manager/HR',
            description: 'OT request dismissed',
            color: 'bg-rose-500',
            icon: '✕'
        },
        position: { x: 750, y: 630 },
    },
];

const initialEdges: any[] = [
    { id: 'e1-2', source: '1', target: '2', animated: true },
    { id: 'e2-3', source: '2', target: '3', label: 'Yes', animated: true },
    { id: 'e3-4', source: '3', target: '4', animated: true },
    { id: 'e4-5', source: '4', target: '5', animated: true },
    { id: 'e5-6', source: '5', target: '6', animated: true },
    { id: 'e4-X', source: '4', target: 'X', animated: false, style: { stroke: '#f43f5e', strokeDasharray: '3,3' } },
];

const OvertimeWorkflow = () => {
    return (
        <div className="h-[1100px] w-full bg-slate-50/50 rounded-3xl overflow-hidden border border-slate-200">
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

export default OvertimeWorkflow;
