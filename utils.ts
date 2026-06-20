import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw } from 'lucide-react';

interface LoaderProps {
  loading: boolean;
  message?: string;
}

export const Loader: React.FC<LoaderProps> = ({ loading, message = "Processing..." }) => {
  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="bg-white p-8 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-4 border border-slate-100"
          >
            <div className="relative">
              <div className="h-16 w-16 rounded-full border-4 border-slate-100 border-t-blue-600 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-blue-600">
                <RefreshCw size={24} />
              </div>
            </div>
            <p className="font-black text-slate-800 uppercase tracking-widest text-xs animate-pulse">
              {message}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
