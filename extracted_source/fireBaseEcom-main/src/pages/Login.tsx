import React from 'react';
import { motion } from 'motion/react';
import { Package, ArrowRight } from 'lucide-react';

interface LoginProps {
  onLogin: (username: string, password: string) => void;
  loading: boolean;
}

export const Login: React.FC<LoginProps> = ({ onLogin, loading }) => {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;
    onLogin(username, password);
  };

  return (
    <motion.div 
      key="login"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex min-h-screen items-center justify-center p-6 bg-slate-50"
    >
      <div className="w-full max-w-md rounded-[2.5rem] bg-white p-8 sm:p-10 shadow-2xl border border-slate-100">
        <div className="mb-10 text-center">
          <motion.div 
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            className="mx-auto mb-6 flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-3xl bg-blue-600 text-white shadow-2xl shadow-blue-200"
          >
            <Package size={32} className="sm:hidden" />
            <Package size={40} className="hidden sm:block" />
          </motion.div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">Warehouse Pro</h2>
          <p className="text-slate-500 font-bold text-xs sm:text-sm mt-2 uppercase tracking-widest">Enterprise Logistics</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Staff ID / Username</label>
            <input 
              name="username" 
              required 
              disabled={loading}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-sm disabled:opacity-50" 
              placeholder="Enter your ID" 
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Password</label>
            <input 
              name="password" 
              type="password" 
              required 
              disabled={loading}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-bold text-sm disabled:opacity-50" 
              placeholder="••••••••" 
            />
          </div>
          <motion.button 
            whileHover={{ scale: loading ? 1 : 1.02 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
            type="submit" 
            disabled={loading}
            className="w-full rounded-2xl bg-blue-600 p-4 sm:p-5 font-black text-white hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 mt-4 flex items-center justify-center gap-2 disabled:bg-slate-400 disabled:shadow-none text-xs sm:text-sm uppercase tracking-widest"
          >
            {loading ? "Authenticating..." : "Access System"} <ArrowRight size={20} />
          </motion.button>
        </form>

        <p className="mt-8 text-center text-[10px] text-slate-400 font-black uppercase tracking-widest">
          Authorized Personnel Only • v3.3.3
        </p>
      </div>
    </motion.div>
  );
};
