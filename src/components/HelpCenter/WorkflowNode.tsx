
import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

const WorkflowNode = ({ data }: any) => {
    const { label, type, actor, description, color, icon, formula } = data;

    const getColors = () => {
        switch (type) {
            case 'status':
                return {
                    bg: color || 'bg-indigo-500',
                    border: 'border-indigo-400/30',
                    text: 'text-white',
                    shadow: 'shadow-indigo-500/20'
                };
            case 'actor':
                return {
                    bg: 'bg-slate-900',
                    border: 'border-slate-800',
                    text: 'text-white',
                    shadow: 'shadow-slate-900/20'
                };
            case 'formula':
                return {
                    bg: 'bg-emerald-500',
                    border: 'border-emerald-400/30',
                    text: 'text-white',
                    shadow: 'shadow-emerald-500/20'
                };
            case 'step':
                return {
                    bg: 'bg-white',
                    border: 'border-slate-200',
                    text: 'text-slate-900',
                    shadow: 'shadow-slate-200/50'
                };
            default:
                return {
                    bg: 'bg-white',
                    border: 'border-slate-200',
                    text: 'text-slate-900',
                    shadow: 'shadow-slate-200/50'
                };
        }
    };

    const style = getColors();

    return (
        <div className={`px-4 py-3 rounded-2xl border ${style.border} ${style.bg} ${style.shadow} shadow-lg min-w-[180px] transition-all duration-300 hover:scale-105 group relative overflow-hidden`}>
            {/* Gloss Effect */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>

            <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-slate-300 border-none" />

            <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                    <span className="text-lg opacity-80">{icon || '●'}</span>
                    {actor && (
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
                            {actor}
                        </span>
                    )}
                </div>

                <div className={`font-black tracking-tight ${style.text} ${type === 'step' ? 'text-sm' : 'text-[15px]'}`}>
                    {label}
                </div>

                {description && (
                    <div className={`${type === 'step' ? 'text-slate-500' : 'text-white/70'} text-[11px] leading-tight font-medium mt-1`}>
                        {description}
                    </div>
                )}

                {formula && (
                    <div className="mt-2 p-2 rounded-lg bg-black/20 backdrop-blur-sm font-mono text-[10px] text-white/90 border border-white/10 italic">
                        {formula}
                    </div>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-slate-300 border-none" />
        </div>
    );
};

export default memo(WorkflowNode);
