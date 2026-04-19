import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Camera, RefreshCw, AlertCircle } from 'lucide-react';
import { User, AttendanceStatus } from '../types';
import { Header } from '../components/layout/Header';
import { cn } from '../lib/utils';
import { useCamera } from '../hooks/useCamera';

interface AttendanceProps {
  user: User | null;
  attendanceStatus: AttendanceStatus;
  onAttendanceSubmit: (image: string) => Promise<boolean>;
  loading: boolean;
  navigateTo: (page: any) => void;
}

export const Attendance: React.FC<AttendanceProps> = ({
  user,
  attendanceStatus,
  onAttendanceSubmit,
  loading,
  navigateTo
}) => {
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const { videoRef, stream, isSupported, error, startCamera, stopCamera, capturePhoto } = useCamera();
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    if (isSupported && imagePreviews.length === 0 && !useFallback) {
      startCamera();
    } else {
      stopCamera();
    }
  }, [isSupported, imagePreviews.length, startCamera, stopCamera, useFallback]);

  const handleCapture = () => {
    const photo = capturePhoto();
    if (photo) {
      setImagePreviews([photo]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews([reader.result as string]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (imagePreviews.length === 0) return;
    const success = await onAttendanceSubmit(imagePreviews[0]);
    if (success) {
      // After successful submission, navigate back to dashboard
      navigateTo("dashboard");
    }
  };

  return (
    <motion.div 
      key="attendance"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="min-h-screen bg-slate-50 pb-20"
    >
      <div className="p-4 max-w-2xl mx-auto space-y-4">
        {attendanceStatus.missingPunchOut && (
          <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-center gap-4 text-amber-700">
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <AlertCircle size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest leading-tight">Session Reset</p>
              <p className="text-xs font-bold mt-0.5">Your previous shift exceeded 24 hours without a punch out. Please start a new session.</p>
            </div>
          </div>
        )}

        <div className="bg-white p-5 rounded-[1.5rem] shadow-xl border border-slate-100 space-y-5">
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Biometric Selfie</label>
            
            <div className="grid grid-cols-1 gap-3">
              {imagePreviews.map((img, index) => (
                <motion.div 
                  key={index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative overflow-hidden rounded-xl border-4 border-slate-50 shadow-lg group aspect-video"
                >
                  <img src={img} className="w-full h-full object-cover" alt={`Preview ${index + 1}`} referrerPolicy="no-referrer" />
                  <button 
                    onClick={() => setImagePreviews([])}
                    className="absolute top-2 right-2 h-8 w-8 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg transition-all hover:scale-110 active:scale-90 z-10"
                  >
                    <X size={14} />
                  </button>
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/50 backdrop-blur-sm rounded-full text-[8px] font-black text-white uppercase tracking-widest">
                    Selfie Verification
                  </div>
                </motion.div>
              ))}

              {imagePreviews.length === 0 && (
                <div className="relative aspect-video rounded-xl overflow-hidden border-4 border-dashed border-slate-100 bg-slate-50 group">
                  {isSupported && !useFallback ? (
                    <div className="relative w-full h-full">
                      {error ? (
                        <div className="flex flex-col items-center justify-center w-full h-full p-6 text-center space-y-4">
                          <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center text-red-500">
                            <Camera size={32} />
                          </div>
                          <div className="space-y-1">
                            <p className="text-red-600 font-black text-xs uppercase tracking-widest">Camera Error</p>
                            <p className="text-slate-500 text-[10px] leading-relaxed max-w-[200px]">{error}</p>
                          </div>
                          <div className="flex flex-col gap-2 w-full max-w-[200px]">
                            <button 
                              onClick={() => startCamera()}
                              className="w-full py-2 bg-slate-900 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors"
                            >
                              Retry Camera
                            </button>
                            <button 
                              onClick={() => setUseFallback(true)}
                              className="w-full py-2 bg-white border border-slate-200 text-slate-600 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-colors"
                            >
                              Use Manual Upload
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            muted
                            className="w-full h-full object-cover scale-x-[-1] bg-slate-900"
                          />
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-32 h-32 sm:w-48 sm:h-48 border-2 border-white/50 rounded-full border-dashed animate-pulse" />
                          </div>
                          <button 
                            onClick={handleCapture}
                            className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all ring-4 ring-white/30"
                          >
                            <Camera size={24} className="sm:hidden" />
                            <Camera size={32} className="hidden sm:block" />
                          </button>
                          <div className="absolute top-3 left-3 sm:top-4 sm:left-4 px-2 py-0.5 sm:px-3 sm:py-1 bg-black/50 backdrop-blur-sm rounded-full text-[8px] sm:text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-red-500 rounded-full animate-pulse" />
                            Live
                          </div>
                          <button 
                            onClick={() => setUseFallback(true)}
                            className="absolute top-3 right-3 sm:top-4 sm:right-4 h-8 w-8 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center hover:bg-white/30 transition-all"
                            title="Switch to manual upload"
                          >
                            <RefreshCw size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <motion.label 
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-all p-6 text-center"
                    >
                      <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-300 group-hover:text-blue-500 transition-all mb-2 sm:mb-3">
                        <Camera size={24} className="sm:hidden" />
                        <Camera size={32} className="hidden sm:block" />
                      </div>
                      <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                        <span className="text-slate-500 font-black text-[8px] sm:text-[10px] uppercase tracking-widest">
                          {useFallback ? "Upload Selfie Manually" : "Initialize Camera"}
                        </span>
                        {useFallback && (
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              setUseFallback(false);
                            }}
                            className="mt-2 text-blue-600 font-black text-[8px] uppercase tracking-widest hover:underline"
                          >
                            Try Camera Again
                          </button>
                        )}
                      </div>
                      <input type="file" accept="image/*" capture="user" onChange={handleFileUpload} className="hidden" />
                    </motion.label>
                  )}
                </div>
              )}
            </div>
          </div>

          <motion.button 
            whileTap={{ scale: 0.95 }}
            disabled={loading || imagePreviews.length === 0}
            onClick={handleSubmit}
            className={cn(
              "w-full rounded-[1.25rem] sm:rounded-[1.5rem] p-5 sm:p-6 font-black text-white shadow-2xl transition-all text-lg sm:text-xl flex items-center justify-center gap-3",
              (imagePreviews.length === 0) 
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
              <>
                {attendanceStatus.inTime && !attendanceStatus.outTime 
                  ? "Confirm Punch Out" 
                  : (attendanceStatus.outTime ? "Confirm Punch In Again" : "Confirm Punch In")
                }
              </>
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};
