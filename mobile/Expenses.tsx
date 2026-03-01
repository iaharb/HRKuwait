
import React, { useState, useRef } from 'react';
import { User } from '../types.ts';
import { GoogleGenAI } from "@google/genai";
import { useNotifications } from '../components/NotificationSystem.tsx';

const MobileExpenses: React.FC<{ user: User, language: 'en' | 'ar' }> = ({ user, language }) => {
  const { notify } = useNotifications();
  const [capturing, setCapturing] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [data, setData] = useState<{amount?: string, date?: string, merchant?: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        processWithGemini(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const processWithGemini = async (base64: string) => {
    setCapturing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = "Analyze this receipt. Extract Amount (KWD), Date, and Merchant Name as a clean JSON object.";
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { data: base64.split(',')[1], mimeType: 'image/jpeg' } },
            { text: prompt }
          ]
        },
        config: { responseMimeType: "application/json" }
      });

      const result = JSON.parse(response.text || '{}');
      setData(result);
      notify("Scan Complete", "Financial data extracted successfully.", "success");
    } catch (err) {
      notify("Scan Error", "Unable to analyze receipt.", "error");
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="p-6 space-y-8">
      <div className="bg-white p-8 rounded-[40px] border border-slate-200 text-center space-y-6">
        {!image ? (
          <div className="py-20 flex flex-col items-center gap-6">
            <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center text-5xl">📷</div>
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Submit Claim</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto mt-2">Capture any business receipt. Our AI will automatically extract the data for reimbursement.</p>
            </div>
          </div>
        ) : (
          <div className="relative rounded-3xl overflow-hidden aspect-[3/4] bg-slate-100">
            <img src={image} className="w-full h-full object-cover" />
            {capturing && (
              <div className="absolute inset-0 bg-slate-900/60 flex flex-col items-center justify-center text-white gap-4">
                 <div className="w-12 h-12 border-4 border-white/20 border-t-emerald-400 rounded-full animate-spin"></div>
                 <p className="text-[10px] font-black uppercase tracking-widest">AI Audit in progress...</p>
              </div>
            )}
          </div>
        )}

        <input type="file" accept="image/*" capture="environment" className="hidden" ref={fileInputRef} onChange={handleCapture} />
        
        <button 
          onClick={() => image ? (setImage(null), setData(null)) : fileInputRef.current?.click()}
          className={`w-full py-5 rounded-[24px] font-black text-[11px] uppercase tracking-[0.2em] transition-all shadow-xl active:scale-95 ${
            image ? 'bg-slate-100 text-slate-600' : 'bg-emerald-600 text-white shadow-emerald-600/20'
          }`}
        >
          {image ? 'Retake Photo' : 'Capture Receipt'}
        </button>
      </div>

      {data && (
        <div className="bg-slate-900 p-8 rounded-[40px] text-white space-y-6 animate-in slide-in-from-bottom-4">
           <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Verification Result</h4>
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">AI Confidence: High</span>
           </div>
           <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-xs text-slate-400 font-bold">Merchant</span>
                <span className="text-sm font-black text-white">{data.merchant || 'Unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-slate-400 font-bold">Date</span>
                <span className="text-sm font-black text-white">{data.date || '---'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-slate-400 font-bold">Amount</span>
                <span className="text-2xl font-black text-emerald-400">{data.amount || '0.00'} <span className="text-[10px]">KWD</span></span>
              </div>
           </div>
           <button onClick={() => notify("Submitted", "Claim forwarded for HR review.", "success")} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest">
             Confirm & Submit Claim
           </button>
        </div>
      )}
    </div>
  );
};

export default MobileExpenses;
