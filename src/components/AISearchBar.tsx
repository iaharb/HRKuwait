import React, { useState } from 'react';
import { runAiTask } from '../services/geminiService.ts';
import { useTranslation } from 'react-i18next';
import { useNotifications } from './NotificationSystem.tsx';

interface AISearchBarProps {
    data: any[];
    onFilter: (filteredIds: string[] | null) => void;
    placeholder?: string;
    contextMessage: string;
    extractInfo: (item: any) => string;
    onFocus?: () => void;
    onBlur?: () => void;
    onQueryChange?: (q: string) => void;
    initialValue?: string;
}

const AISearchBar: React.FC<AISearchBarProps> = ({
    data, onFilter, placeholder, contextMessage, extractInfo, onFocus, onBlur, onQueryChange, initialValue
}) => {
    const { t } = useTranslation();
    const { notify } = useNotifications();
    const [query, setQuery] = useState(initialValue || '');
    const [isSearching, setIsSearching] = useState(false);

    // Sync prop changes
    React.useEffect(() => {
        if (initialValue !== undefined) {
            setQuery(initialValue);
        }
    }, [initialValue]);

    const handleAISearch = async () => {
        if (!query.trim()) {
            onFilter(null);
            return;
        }

        setIsSearching(true);
        try {
            const minimalData = data.map(d => ({
                id: d.id,
                info: extractInfo(d)
            }));

            const systemPrompt = `You are a semantic search engine returning ONLY a JSON array of string IDs.
Your job is to read the data array provided, evaluate the user's natural language query, and return an array of IDs that best match.
Example Output: ["uuid-1", "uuid-2"]
If the query is a greeting or invalid, return []. If it matches all, return all IDs. No markdown formatting. Return valid JSON only.`;

            const userPrompt = `Context: ${contextMessage}
User Query: "${query}"

Data: 
${JSON.stringify(minimalData)}`;

            const res = await runAiTask(userPrompt, true, systemPrompt);
            let parsedIds: string[] = [];
            try {
                let cleaned = res.replace(/```json/g, '').replace(/```/g, '').trim();
                parsedIds = JSON.parse(cleaned);
                if (!Array.isArray(parsedIds)) {
                    parsedIds = [];
                }
            } catch (e) {
                parsedIds = [];
            }

            onFilter(parsedIds);
        } catch (error: any) {
            notify('AI Search Failed', error.message, 'error');
            // Local fallback in case of AI outage
            onFilter(null);
        } finally {
            setIsSearching(false);
        }
    };

    const clearSearch = () => {
        setQuery('');
        if (onQueryChange) onQueryChange('');
        onFilter(null);
    };

    return (
        <div className="relative group w-full min-w-[340px] flex gap-2">
            <div className="relative flex-1">
                <span className={`absolute inset-y-0 left-0 pl-4 flex items-center text-indigo-400 transition-colors ${isSearching ? 'animate-pulse' : ''}`}>✨</span>
                <input
                    type="text"
                    placeholder={placeholder || 'Ask AI to filter or find...'}
                    disabled={isSearching}
                    className="w-full pl-10 pr-10 py-3.5 border border-indigo-200/60 rounded-[28px] bg-indigo-50/30 backdrop-blur-md text-sm font-bold text-indigo-900 outline-none transition-all shadow-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 disabled:opacity-50"
                    value={query}
                    onChange={e => {
                        setQuery(e.target.value);
                        if (onQueryChange) onQueryChange(e.target.value);
                        if (e.target.value === '') onFilter(null);
                    }}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    onKeyDown={e => e.key === 'Enter' && handleAISearch()}
                />
                {query && (
                    <button onClick={clearSearch} className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-rose-500">
                        ✕
                    </button>
                )}
            </div>
            <button
                onClick={handleAISearch}
                disabled={isSearching}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-[28px] px-6 flex items-center justify-center font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all border border-indigo-500 min-w-[100px]"
            >
                {isSearching ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'AI Search'}
            </button>
        </div>
    );
};

export default AISearchBar;
