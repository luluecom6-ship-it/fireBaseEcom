import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Download, Volume2, VolumeX } from 'lucide-react';
import { User } from '../../types';
import { cn } from '../../lib/utils';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  user: User | null;
  isInstallable?: boolean;
  onInstall?: () => void;
  onToggleSound?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, showBack, onBack, user, isInstallable, onInstall, onToggleSound }) => (
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
    <div className="flex items-center gap-3">
      {onToggleSound && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onToggleSound}
          className={cn(
            "p-2 rounded-xl transition-all",
            user?.soundAlertsEnabled !== false ? "bg-blue-500/20 text-blue-200" : "bg-red-500/20 text-red-200"
          )}
        >
          {user?.soundAlertsEnabled !== false ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </motion.button>
      )}
      {isInstallable && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onInstall}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500 hover:bg-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-lg shadow-blue-900/20"
        >
          <Download size={14} /> Install
        </motion.button>
      )}
      <motion.div 
        whileTap={{ scale: 0.95 }}
        onClick={onToggleSound}
        className="flex flex-col items-end cursor-pointer group"
      >
        <div className="text-[9px] font-black uppercase tracking-widest opacity-60 group-hover:text-blue-400 transition-all flex items-center gap-1">
          {user?.region ? user.region : "Station"}
        </div>
        <div className="text-xs font-bold group-hover:text-blue-500 transition-colors">{user?.storeId || "N/A"}</div>
      </motion.div>
    </div>
  </div>
);
