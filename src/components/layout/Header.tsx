import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import { User } from '../../types';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  user: User | null;
}

export const Header: React.FC<HeaderProps> = ({ title, showBack, onBack, user }) => (
  <div className="sticky top-0 z-40 flex items-center justify-between bg-blue-900 p-3 text-white shadow-lg backdrop-blur-md bg-opacity-90">
    <div className="flex items-center gap-2">
      {showBack && (
        <motion.button 
          whileTap={{ scale: 0.9 }}
          onClick={onBack} 
          className="p-1.5 hover:bg-blue-800 rounded-full transition-colors"
        >
          <ChevronLeft size={20} />
        </motion.button>
      )}
      <h1 className="text-lg font-bold tracking-tight">{title}</h1>
    </div>
    <div className="flex flex-col items-end">
      <div className="text-[9px] font-black uppercase tracking-widest opacity-60">Station</div>
      <div className="text-xs font-bold">{user?.storeId || "N/A"}</div>
    </div>
  </div>
);
