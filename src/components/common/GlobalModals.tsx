import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, RefreshCw, AlertCircle, Search, Package, CheckCircle2, AlertTriangle 
} from 'lucide-react';
import { OrderRecord, MatrixDetail, Toast } from '../../types';
import { fixImageUrl, getImages } from '../../utils/formatters';
import { cn } from '../../lib/utils';

interface GlobalModalsProps {
  fullImage: string | null;
  setFullImage: (url: string | null) => void;
  imageScale: number;
  setImageScale: React.Dispatch<React.SetStateAction<number>>;
  duplicateOrder: OrderRecord | null;
  setDuplicateOrder: (order: OrderRecord | null) => void;
  imagePreviews: string[];
  handleDeepDive: (order: OrderRecord) => void;
  successOrder: OrderRecord | null;
  setSuccessOrder: (order: OrderRecord | null) => void;
  navigateTo: (page: string) => void;
  matrixDetail: MatrixDetail | null;
  setMatrixDetail: (detail: MatrixDetail | null) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  showEarlyPunchOutConfirm: boolean;
  setShowEarlyPunchOutConfirm: (show: boolean) => void;
  toast: Toast | null;
}

export const GlobalModals: React.FC<GlobalModalsProps> = ({
  fullImage,
  setFullImage,
  imageScale,
  setImageScale,
  duplicateOrder,
  setDuplicateOrder,
  imagePreviews,
  handleDeepDive,
  successOrder,
  setSuccessOrder,
  navigateTo,
  matrixDetail,
  setMatrixDetail,
  showToast,
  showEarlyPunchOutConfirm,
  setShowEarlyPunchOutConfirm,
  toast
}) => {
  return (
      <AnimatePresence>
        {fullImage && (
          <motion.div 
            key="full-image-viewer"
            initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[20000] bg-slate-950/98 flex flex-col items-center justify-center"
          onClick={() => { setFullImage(null); setImageScale(1); }}
        >
          <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-50 bg-gradient-to-b from-black/50 to-transparent" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-4">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setImageScale(prev => Math.max(0.5, prev - 0.25))}
                className="h-12 w-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20"
              >
                <RefreshCw size={20} className="-scale-x-100" />
              </motion.button>
              <span className="text-white font-black text-sm tracking-widest w-16 text-center">
                {Math.round(imageScale * 100)}%
              </span>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setImageScale(prev => Math.min(3, prev + 0.25))}
                className="h-12 w-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20"
              >
                <RefreshCw size={20} />
              </motion.button>
            </div>
            <motion.button 
              whileTap={{ scale: 0.9 }}
              onClick={() => { setFullImage(null); setImageScale(1); }}
              className="h-12 w-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20"
            >
              <X size={24} />
            </motion.button>
          </div>

          <div className="w-full h-full overflow-auto flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            <motion.div
              drag
              dragConstraints={{ left: -1000, right: 1000, top: -1000, bottom: 1000 }}
              style={{ scale: imageScale }}
              className="relative cursor-grab active:cursor-grabbing"
            >
              <img 
                src={fullImage} 
                className="max-w-none rounded-lg shadow-2xl pointer-events-none" 
                style={{ maxHeight: '85vh' }}
                alt="Full View" 
              />
            </motion.div>
          </div>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 bg-white/10 backdrop-blur-md rounded-full border border-white/20 text-white/60 text-[10px] font-black uppercase tracking-widest pointer-events-none">
            Drag to pan • Use controls to zoom
          </div>
        </motion.div>
      )}

      {/* Duplicate Order Modal */}
      {duplicateOrder && (
        <motion.div 
          key="duplicate-order-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[20000] flex items-center justify-center bg-blue-900/40 backdrop-blur-sm p-6"
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100"
          >
            <div className="bg-red-500 p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle size={28} />
                <h3 className="text-xl font-black tracking-tight">Duplicate Order Found</h3>
              </div>
              <button onClick={() => setDuplicateOrder(null)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Existing Order Images</p>
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    {getImages(duplicateOrder.imageUrl).map((img, idx) => (
                      <div 
                        key={idx} 
                        className="aspect-video h-32 rounded-2xl overflow-hidden border-4 border-slate-50 shadow-inner flex-shrink-0 cursor-zoom-in"
                        onClick={() => setFullImage(fixImageUrl(img))}
                      >
                        <img src={fixImageUrl(img)} className="w-full h-full object-cover" alt="Existing" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em]">Your Uploaded Images</p>
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    {imagePreviews.map((img, idx) => (
                      <div key={idx} className="aspect-video h-32 rounded-2xl overflow-hidden border-4 border-blue-50 shadow-inner flex-shrink-0">
                        <img src={img} className="w-full h-full object-cover" alt="New" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Order ID</p>
                    <p className="text-xs font-black text-slate-800 break-all">{duplicateOrder.orderId}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Store</p>
                    <p className="font-bold text-blue-600">{duplicateOrder.storeId}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Original Picker</p>
                    <p className="font-bold text-slate-700">{duplicateOrder.pickerName}</p>
                  </div>
                  <div className="text-right p-4 bg-slate-50 rounded-2xl">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Timestamp</p>
                    <p className="font-bold text-slate-700 text-[10px]">{new Date(duplicateOrder.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col gap-3">
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleDeepDive(duplicateOrder)}
                  className="w-full bg-blue-600 text-white p-5 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-blue-200 flex items-center justify-center gap-2"
                >
                  <Search size={20} />
                  View in Search Results
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setDuplicateOrder(null)}
                  className="w-full bg-slate-100 text-slate-600 p-5 rounded-2xl font-black uppercase tracking-widest text-sm"
                >
                  Acknowledge & Close
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Success Order Modal */}
      {successOrder && (
        <motion.div 
          key="success-order-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[20000] flex items-center justify-center bg-green-900/40 backdrop-blur-sm p-6"
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100"
          >
            <div className="bg-green-500 p-6 text-white flex flex-col items-center gap-4">
              <div className="h-20 w-20 bg-white/20 rounded-full flex items-center justify-center">
                <CheckCircle2 size={48} />
              </div>
              <h3 className="text-2xl font-black tracking-tight">Upload Successful!</h3>
            </div>
            
            <div className="p-6 sm:p-8 space-y-4 sm:space-y-6 text-center">
              <p className="text-slate-600 font-medium break-all text-xs">
                Order <span className="font-black text-slate-900">{successOrder.orderId}</span> has been successfully recorded.
              </p>

              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide justify-center">
                {getImages(successOrder.imageUrl).map((img, idx) => (
                  <div key={idx} className="aspect-video h-20 rounded-xl overflow-hidden border-2 border-green-100 flex-shrink-0">
                    <img src={fixImageUrl(img)} className="w-full h-full object-cover" alt="Success" />
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3">
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleDeepDive(successOrder)}
                  className="w-full bg-green-600 text-white p-5 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl flex items-center justify-center gap-2"
                >
                  <Search size={20} />
                  Deep Dive Details
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setSuccessOrder(null);
                    navigateTo("dashboard");
                  }}
                  className="w-full bg-slate-100 text-slate-600 p-5 rounded-2xl font-black uppercase tracking-widest text-sm"
                >
                  Back to Dashboard
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Matrix Detail Modal */}
      {matrixDetail && (
        <motion.div 
          key="matrix-detail-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[20000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6"
          onClick={() => setMatrixDetail(null)}
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="w-full max-w-lg bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#1e293b] p-6 text-white flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{matrixDetail.title}</p>
                <h3 className="text-xl font-black tracking-tight">{matrixDetail.stat} • {matrixDetail.key}</h3>
              </div>
              <button onClick={() => setMatrixDetail(null)} className="h-10 w-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-8 bg-[#f8fafc]">
              <div className="max-h-[40vh] overflow-y-auto pr-2 mb-6 space-y-3 custom-scrollbar">
                {matrixDetail.orders.map((order, i) => (
                  <div key={i} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Order ID</p>
                      <p className="font-black text-slate-900 text-sm">{order.orderID}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Store</p>
                      <p className="font-black text-blue-600 text-sm">{order.storeID}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3">
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    const ids = matrixDetail.orders.map(o => o.orderID).join('\n');
                    navigator.clipboard.writeText(ids);
                    showToast(`Copied ${matrixDetail.orders.length} Order IDs`);
                    setMatrixDetail(null);
                  }}
                  className="w-full bg-[#2563eb] text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-100 flex items-center justify-center gap-2"
                >
                  <Package size={18} />
                  Copy All Order IDs
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setMatrixDetail(null)}
                  className="w-full bg-[#f1f5f9] text-slate-600 py-4 rounded-2xl font-black uppercase tracking-widest text-xs"
                >
                  Close
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Early Punch Out Confirm Modal */}
      {showEarlyPunchOutConfirm && (
        <motion.div 
          key="early-punch-out-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[30000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6"
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100"
          >
            <div className="bg-amber-500 p-6 text-white flex flex-col items-center gap-4">
              <div className="h-20 w-20 bg-white/20 rounded-full flex items-center justify-center">
                <AlertTriangle size={48} />
              </div>
              <h3 className="text-2xl font-black tracking-tight">Early Departure</h3>
            </div>
            
            <div className="p-8 space-y-6 text-center">
              <p className="text-slate-600 font-medium">
                You have not completed your <span className="font-black text-slate-900">10-hour shift</span> yet.
              </p>
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-widest leading-relaxed">
                  Please ensure you have taken verbal confirmation from your supervisor before punching out early.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setShowEarlyPunchOutConfirm(false);
                    navigateTo("attendance");
                  }}
                  className="w-full bg-amber-600 text-white p-5 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl"
                >
                  Confirm & Punch Out
                </motion.button>
                <button 
                  onClick={() => setShowEarlyPunchOutConfirm(false)}
                  className="w-full p-4 text-slate-400 font-black uppercase tracking-widest text-xs hover:text-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Toast Notification */}
      {toast && (
        <motion.div 
          key="toast-notification"
          initial={{ opacity: 0, y: 50, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 20, x: '-50%' }}
          className="fixed bottom-10 left-1/2 z-[30000] px-8 py-4 bg-slate-900 text-white rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10"
        >
          {toast.type === 'success' && <CheckCircle2 className="text-emerald-400" size={20} />}
          {toast.type === 'error' && <AlertCircle className="text-red-400" size={20} />}
          <span className="font-black text-sm tracking-tight">{toast.message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
