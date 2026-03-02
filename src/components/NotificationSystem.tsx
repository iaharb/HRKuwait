
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { ToastMessage, ToastType } from '../types.ts';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface NotificationContextType {
  notify: (title: string, message: string, type: ToastType) => void;
  confirm: (options: ConfirmOptions) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used within NotificationProvider");
  return context;
};

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmOptions | null>(null);

  const notify = (title: string, message: string, type: ToastType) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const confirm = (options: ConfirmOptions) => {
    setConfirmDialog(options);
  };

  return (
    <NotificationContext.Provider value={{ notify, confirm }}>
      {children}

      {/* Toast Container */}
      <div className="fixed bottom-6 right-6 z-[200] space-y-3 w-80">
        {toasts.map(toast => (
          <div 
            key={toast.id} 
            className={`p-4 rounded-2xl shadow-xl border animate-in slide-in-from-right-4 duration-300 flex flex-col gap-1 ${
              toast.type === 'success' ? 'bg-emerald-600 border-emerald-500 text-white' :
              toast.type === 'error' ? 'bg-rose-600 border-rose-500 text-white' :
              toast.type === 'warning' ? 'bg-amber-500 border-amber-400 text-white' :
              'bg-slate-800 border-slate-700 text-white'
            }`}
          >
            <p className="text-xs font-black uppercase tracking-widest opacity-80">{toast.title}</p>
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        ))}
      </div>

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"></div>
          <div className="relative bg-white rounded-[32px] w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95 duration-200 border border-slate-100">
            <h3 className="text-xl font-bold text-slate-900 mb-2">{confirmDialog.title}</h3>
            <p className="text-slate-600 text-sm mb-8 leading-relaxed">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  confirmDialog.onCancel?.();
                  setConfirmDialog(null);
                }}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-200 transition-all"
              >
                {confirmDialog.cancelText || 'Cancel'}
              </button>
              <button 
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
              >
                {confirmDialog.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
};
