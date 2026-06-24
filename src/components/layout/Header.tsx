import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Download, Volume2, VolumeX, User as UserIcon, Camera, Loader2 } from 'lucide-react';
import { User } from '../../types';
import { cn } from '../../lib/utils';
import { compressImage } from '../../utils/imageUtils';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  user: User | null;
  isInstallable?: boolean;
  onInstall?: () => void;
  onToggleSound?: () => void;
  onUpdateProfileImage?: (image: string) => Promise<{ success: boolean; message?: string }>;
}

export const Header: React.FC<HeaderProps> = ({ 
  title, showBack, onBack, user, isInstallable, onInstall, onToggleSound, onUpdateProfileImage 
}) => {
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProfileImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateProfileImage) return;

    if (!file.type.startsWith('image/')) {
      alert("Please select an image file.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert("Image must be smaller than 2MB.");
      return;
    }

    setUploadLoading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        // Compress to 200px max width, JPEG 0.7 quality to keep under Firestore 1MB doc limit
        const compressed = await compressImage(base64, 200, 0.7);
        const res = await onUpdateProfileImage(compressed);
        if (!res.success) {
          alert(res.message || "Failed to update profile image");
        }
        setUploadLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setUploadLoading(false);
    }
  };

  return (
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
              "p-1.5 rounded-xl transition-all",
              user?.soundAlertsEnabled !== false ? "bg-blue-500/20 text-blue-200" : "bg-red-500/20 text-red-200"
            )}
          >
            {user?.soundAlertsEnabled !== false ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </motion.button>
        )}

        {isInstallable && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onInstall}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-blue-500 hover:bg-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-lg shadow-blue-900/20"
          >
            <Download size={14} /> Install
          </motion.button>
        )}

        {/* Global Profile Picture */}
        {user && (
          <div className="relative group flex items-center">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleProfileImageChange} 
              accept="image/*" 
              className="hidden" 
            />
            <motion.div 
              whileTap={{ scale: 0.95 }}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "h-8 w-8 rounded-lg overflow-hidden border border-white/20 shadow-md cursor-pointer relative bg-blue-800/50 flex items-center justify-center transition-all duration-300",
                uploadLoading && "opacity-50 pointer-events-none"
              )}
            >
              {user.profileImage ? (
                <img 
                  src={user.profileImage} 
                  alt={user.name} 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <UserIcon size={14} className="text-white/40" />
              )}
              
              {/* Subtle hover icon */}
              <div className="absolute inset-0 bg-blue-600/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Camera size={10} className="text-white" />
              </div>

              {uploadLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Loader2 size={12} className="animate-spin text-white" />
                </div>
              )}
            </motion.div>
          </div>
        )}

        <div className="hidden sm:flex flex-col items-end">
          <div className="text-[9px] font-black uppercase tracking-widest opacity-60">
            {user?.region || "Station"}
          </div>
          <div className="text-[10px] font-black">{user?.storeId || "N/A"}</div>
        </div>
      </div>
    </div>
  );
};
