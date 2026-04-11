import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ScanLine, X, AlertCircle, Camera, RefreshCw, Package } from 'lucide-react';
import { User } from '../types';
import { Header } from '../components/layout/Header';
import { cn } from '../lib/utils';
import { useScanner } from '../hooks/useScanner';

interface UploadProps {
  user: User | null;
  orderId: string;
  setOrderId: (id: string) => void;
  imagePreviews: string[];
  setImagePreviews: React.Dispatch<React.SetStateAction<string[]>>;
  maxImages: number;
  onSubmit: (previews: string[]) => Promise<void>;
  loading: boolean;
  navigateTo: (page: any) => void;
}

export const Upload: React.FC<UploadProps> = ({
  user,
  orderId,
  setOrderId,
  imagePreviews,
  setImagePreviews,
  maxImages,
  onSubmit,
  loading,
  navigateTo
}) => {
  const { isScanning, setIsScanning } = useScanner((text) => {
    setOrderId(text);
  });

  const validateOrderId = (id: string) => {
    const regex = /^(Lulu-)?\d{12}(INP1)?$/i;
    return regex.test(id.trim());
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <motion.div 
      key="upload"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="min-h-screen bg-slate-50 pb-20"
    >
      <Header title="Order Evidence" showBack onBack={() => navigateTo("dashboard")} user={user} />
      
      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <div className="bg-white p-5 rounded-[1.5rem] shadow-xl border border-slate-100 space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Order Identification</label>
              <motion.button 
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsScanning(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-blue-100 transition-all"
              >
                <ScanLine size={12} /> Scan Barcode
              </motion.button>
            </div>
            
            <div className="relative group">
              <Package className="absolute left-4 top-4 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
              <input 
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-4 pl-12 outline-none focus:border-blue-500 focus:bg-white transition-all font-black text-base tracking-tight"
                placeholder="Enter Order ID..."
              />
            </div>

            {isScanning && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-[2rem] border-2 border-slate-100 overflow-hidden shadow-xl"
              >
                <div className="p-4 bg-slate-800 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ScanLine size={18} className="animate-pulse" />
                    <span className="text-xs font-black uppercase tracking-widest">Scanner Active</span>
                  </div>
                  <button 
                    onClick={() => setIsScanning(false)}
                    className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div id="reader" className="w-full"></div>
                <div className="p-4 bg-slate-50 text-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Point camera at the barcode</p>
                </div>
              </motion.div>
            )}

            {orderId && !validateOrderId(orderId) && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[9px] sm:text-[10px] text-red-500 font-bold uppercase tracking-widest ml-4"
              >
                ❌ Invalid Format. Use: 319917802565
              </motion.p>
            )}
            {orderId && validateOrderId(orderId) && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[9px] sm:text-[10px] text-emerald-600 font-bold uppercase tracking-widest ml-4"
              >
                ✅ Correct Format
              </motion.p>
            )}
          </div>

          <div className="space-y-3">
            <label className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Visual Evidence</label>
            
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-4">
              {imagePreviews.map((img, index) => (
                <motion.div 
                  key={index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] border-4 border-slate-50 shadow-lg group aspect-video"
                >
                  <img src={img} className="w-full h-full object-cover" alt={`Preview ${index + 1}`} />
                  <button 
                    onClick={() => setImagePreviews(prev => prev.filter((_, i) => i !== index))}
                    className="absolute top-2 right-2 sm:top-3 sm:right-3 h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg transition-all hover:scale-110 active:scale-90 z-10"
                  >
                    <X size={16} />
                  </button>
                  <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 px-2 py-0.5 sm:px-3 sm:py-1 bg-black/50 backdrop-blur-sm rounded-full text-[8px] sm:text-[10px] font-black text-white uppercase tracking-widest">
                    Image {index + 1}
                  </div>
                </motion.div>
              ))}

              {imagePreviews.length < maxImages && (
                <div className="relative aspect-video rounded-[1.5rem] sm:rounded-[2rem] overflow-hidden border-4 border-dashed border-slate-100 bg-slate-50 group">
                  <motion.label 
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-all"
                  >
                    <div className="h-10 w-10 sm:h-16 sm:w-16 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-300 group-hover:text-blue-500 transition-all mb-2 sm:mb-3">
                      <Camera size={24} className="sm:hidden" />
                      <Camera size={32} className="hidden sm:block" />
                    </div>
                    <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                      <span className="text-slate-500 font-black text-[8px] sm:text-[10px] uppercase tracking-widest text-center">
                        {imagePreviews.length > 0 ? "Add Another" : "Camera"}
                      </span>
                      <span className="text-[7px] sm:text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                        {imagePreviews.length} / {maxImages}
                      </span>
                    </div>
                    <input type="file" accept="image/*" capture="environment" onChange={handleFileUpload} className="hidden" />
                  </motion.label>
                </div>
              )}
            </div>
          </div>

          <motion.button 
            whileTap={{ scale: 0.95 }}
            disabled={loading || imagePreviews.length === 0 || !orderId}
            onClick={() => onSubmit(imagePreviews)}
            className={cn(
              "w-full rounded-[1.25rem] sm:rounded-[1.5rem] p-5 sm:p-6 font-black text-white shadow-2xl transition-all text-lg sm:text-xl flex items-center justify-center gap-3",
              (imagePreviews.length === 0 || !orderId) 
                ? "bg-slate-200 text-slate-400 shadow-none cursor-not-allowed" 
                : "bg-blue-600 shadow-blue-200 hover:bg-blue-700 active:bg-blue-800 ring-4 ring-blue-500/10"
            )}
          >
            {loading ? (
              <>
                <RefreshCw className="animate-spin" size={24} />
                Processing...
              </>
            ) : (
              <>Finalize Order</>
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};
