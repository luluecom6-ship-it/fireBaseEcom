import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search as SearchIcon, X, RefreshCw } from 'lucide-react';
import { OrderRecord, User } from '../types';
import { Header } from '../components/layout/Header';
import { SmartImage } from '../components/common/SmartImage';
import { fixImageUrl, getImages } from '../utils/formatters';
import { cn } from '../lib/utils';

interface SearchProps {
  searchResults: OrderRecord[];
  isSearching: boolean;
  onSearch: (query: string) => void;
  onViewImage: (url: string | null) => void;
  navigateTo: (page: any) => void;
  user: User | null;
}

export const Search: React.FC<SearchProps> = ({
  searchResults,
  isSearching,
  onSearch,
  onViewImage,
  navigateTo,
  user
}) => {
  const [query, setQuery] = useState("");

  return (
    <motion.div 
      key="search"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="min-h-screen bg-slate-50 pb-20"
    >
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6 sm:space-y-8">
        <div className="text-center space-y-1 sm:space-y-2">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">Deep Dive Search</h2>
          <p className="text-slate-500 font-bold text-xs sm:text-sm">Search any order ID to view historical proof</p>
        </div>

        <div className="flex gap-2 sm:gap-3">
          <div className="relative flex-1 group">
            <SearchIcon className="absolute left-4 top-4 sm:left-5 sm:top-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={20} />
            <input 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearch(query)}
              className="w-full rounded-[1.25rem] sm:rounded-[1.5rem] border-2 border-slate-100 bg-slate-50 p-4 pl-12 sm:p-5 sm:pl-14 pr-12 outline-none focus:border-blue-500 focus:bg-white transition-all font-black text-base sm:text-lg tracking-tight"
              placeholder="Order ID..."
            />
            {query && (
              <button 
                onClick={() => setQuery("")}
                className="absolute right-4 top-4 sm:right-5 sm:top-5 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            )}
          </div>
          <motion.button 
            whileTap={{ scale: 0.95 }}
            onClick={() => onSearch(query)}
            disabled={isSearching}
            className="bg-blue-600 text-white px-4 sm:px-6 rounded-[1.25rem] sm:rounded-[1.5rem] font-black shadow-lg shadow-blue-100 disabled:opacity-50 text-sm sm:text-base"
          >
            {isSearching ? <RefreshCw className="animate-spin" size={20} /> : "Search"}
          </motion.button>
        </div>

        <div className="space-y-4">
          {isSearching ? (
            <div className="space-y-4 animate-pulse">
              {[1, 2].map((i) => (
                <div key={i} className="bg-white rounded-[1.5rem] sm:rounded-[2rem] h-64 border border-slate-100 flex flex-col p-4 gap-4">
                  <div className="h-40 bg-slate-50 rounded-xl" />
                  <div className="space-y-2">
                    <div className="h-4 w-1/2 bg-slate-50 rounded" />
                    <div className="h-3 w-1/3 bg-slate-50 rounded" />
                  </div>
                </div>
              ))}
              <div className="text-center py-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-bounce">Searching Vault...</p>
              </div>
            </div>
          ) : searchResults.length > 0 ? (
            searchResults.map((order, i) => (
              <motion.div 
                key={`${order.orderId}-${order.timestamp}-${i}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-white rounded-[1.5rem] sm:rounded-[2rem] overflow-hidden shadow-lg border border-slate-100"
              >
                <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    {getImages(order.imageUrl).map((img, idx) => (
                      <div 
                        key={idx} 
                        className={cn(
                          "relative group overflow-hidden rounded-xl bg-slate-100",
                          getImages(order.imageUrl).length === 1 ? "col-span-2 aspect-video" : "aspect-square"
                        )}
                      >
                        <SmartImage 
                          src={fixImageUrl(img)} 
                          className="w-full h-full cursor-zoom-in transition-transform duration-500 group-hover:scale-110" 
                          alt={`Order ${idx + 1}`} 
                          onClick={() => onViewImage(fixImageUrl(img))}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center pointer-events-none">
                          <SearchIcon className="text-white" size={20} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-5 sm:p-6 pt-0 space-y-3 sm:space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Order ID</p>
                      <h4 className="text-base sm:text-xl font-black text-slate-800 tracking-tight break-all">{order.orderId}</h4>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] sm:text-[10px] text-slate-400 font-black uppercase tracking-widest">Store</p>
                      <p className="font-bold text-blue-600 text-sm sm:text-base">{order.storeId}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-3 sm:pt-4 border-t border-slate-50">
                    <div>
                      <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">User Name</p>
                      <p className="font-bold text-slate-700 text-xs sm:text-sm">{order.pickerName || order.uploadedBy || "Unknown"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] sm:text-[10px] text-slate-400 font-black uppercase tracking-widest">Timestamp</p>
                      <p className="font-bold text-slate-700 text-[10px] sm:text-xs">{new Date(order.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          ) : query && !isSearching && (
            <div className="text-center py-12 sm:py-20 bg-white rounded-[1.5rem] sm:rounded-[2rem] border-2 border-dashed border-slate-100">
              <div className="mx-auto mb-4 flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-slate-50 text-slate-300">
                <SearchIcon size={24} className="sm:hidden" />
                <SearchIcon size={32} className="hidden sm:block" />
              </div>
              <p className="text-slate-400 font-bold text-sm sm:text-base">No orders found for this ID</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
