import React from 'react';
import { motion } from 'motion/react';
import { Package, ArrowRight } from 'lucide-react';

interface LoginProps {
  onLogin: (username: string, password: string) => void;
  onGoogleLogin: () => void;
  loading: boolean;
}

export const Login: React.FC<LoginProps> = ({ onLogin, onGoogleLogin, loading }) => {
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
      className="flex min-h-screen items-center justify-center p-6"
    >
      <div className="w-full max-w-md rounded-[2.5rem] bg-white p-10 shadow-2xl border border-slate-100">
        <div className="mb-10 text-center">
          <motion.div 
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-600 text-white shadow-2xl shadow-blue-200"
          >
            <Package size={40} />
          </motion.div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Warehouse Pro</h2>
          <p className="text-slate-500 font-medium mt-2">Enterprise Logistics Management</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 ml-4">Username</label>
            <input 
              name="username" 
              required 
              disabled={loading}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-5 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium disabled:opacity-50" 
              placeholder="Enter your ID" 
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 ml-4">Password</label>
            <input 
              name="password" 
              type="password" 
              required 
              disabled={loading}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-5 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium disabled:opacity-50" 
              placeholder="••••••••" 
            />
          </div>
          <motion.button 
            whileHover={{ scale: loading ? 1 : 1.02 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
            type="submit" 
            disabled={loading}
            className="w-full rounded-2xl bg-blue-600 p-5 font-bold text-white hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 mt-4 flex items-center justify-center gap-2 disabled:bg-slate-400 disabled:shadow-none"
          >
            {loading ? "Authenticating..." : "Access System"} <ArrowRight size={20} />
          </motion.button>
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-100"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-4 text-slate-400 font-bold tracking-widest">Admin Access</span>
          </div>
        </div>

        <motion.button 
          whileHover={{ scale: loading ? 1 : 1.02 }}
          whileTap={{ scale: loading ? 1 : 0.98 }}
          onClick={onGoogleLogin}
          disabled={loading}
          className="w-full rounded-2xl border-2 border-blue-100 bg-blue-50/30 p-5 font-bold text-blue-700 hover:bg-blue-50 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="h-5 w-5" referrerPolicy="no-referrer" />
          Sign in with Google Admin
        </motion.button>

        <p className="mt-8 text-center text-xs text-slate-400 font-medium">
          Authorized Personnel Only • v3.3.0
        </p>
      </div>
    </motion.div>
  );
};
