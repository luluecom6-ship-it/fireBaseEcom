import React, { useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X, CheckCircle2, Zap, ArrowUpCircle } from 'lucide-react';
import { User, ActiveAlert } from '../../types';
import { cn } from '../../lib/utils';

interface AlertOverlayProps {
  user: User | null;
  activeAlerts: ActiveAlert[];
  minimizedAlerts: string[];
  expandedAlertId: string | null;
  setExpandedAlertId: (id: string | null) => void;
  adminHiddenAlerts: string[];
  handleAlertAction: (alert: ActiveAlert, action: 'acknowledge' | 'escalate' | 'hide') => Promise<void>;
  setMinimizedAlerts: React.Dispatch<React.SetStateAction<string[]>>;
  lastBroadcast: { id: string, title: string, body: string } | null;
  setLastBroadcast: (broadcast: { id: string, title: string, body: string } | null) => void;
}

export const AlertOverlay: React.FC<AlertOverlayProps> = ({
  user,
  activeAlerts,
  minimizedAlerts,
  expandedAlertId,
  setExpandedAlertId,
  adminHiddenAlerts,
  handleAlertAction,
  setMinimizedAlerts,
  lastBroadcast,
  setLastBroadcast
}) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const [hasInteracted, setHasInteracted] = React.useState(false);

  const startBuzzer = () => {
    if (!hasInteracted) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      if (oscillatorRef.current) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // "Car Door Chime" Style: Triangle wave for a warmer "ding"
      osc.type = 'triangle'; 
      osc.frequency.setValueAtTime(987.77, ctx.currentTime); // B5 note
      
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      
      // Pattern: Rhythmic "Ding... Ding..." every 0.8 seconds
      const cycleTotal = 0.8; 
      const chimeDuration = 0.4; // Decay time
      
      // Schedule 100 cycles (80 seconds of alerting)
      for (let i = 0; i < 100; i++) {
        const startTime = now + (i * cycleTotal);
        // Attack
        gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02); 
        // Decay
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + chimeDuration);
        // Silence until next cycle
        gain.gain.setValueAtTime(0, startTime + chimeDuration + 0.01);
      }

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      
      oscillatorRef.current = osc;
      gainRef.current = gain;
    } catch (e) {
      console.error("Failed to start car door chime buzzer:", e);
    }
  };

  const playBroadcastSound = () => {
    if (!hasInteracted) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Short "Ding" for broadcast
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1174.66, ctx.currentTime); // D6 note

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      console.error("Failed to play broadcast sound:", e);
    }
  };

  const stopBuzzer = () => {
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
      } catch (e) {}
      oscillatorRef.current = null;
    }
    if (gainRef.current) {
      try {
        gainRef.current.disconnect();
      } catch (e) {}
      gainRef.current = null;
    }
  };

  const filteredAlerts = useMemo(() => {
    if (!user) return [];
    
    const filtered = activeAlerts.filter(a => {
      const role = String(user.role || "").toLowerCase().trim();
      
      // Admin and Supervisor see everything. Manager only sees their store.
      if (role === 'admin' || role === 'supervisor') {
        if (role === 'admin' && adminHiddenAlerts.includes(a.id)) return false;
        return true;
      }
      
      // Managers, Pickers, and Store staff only see their store
      const userStoreId = String(user.storeId || "").trim().toLowerCase();
      const alertStoreId = String(a.storeId || "").trim().toLowerCase();
      
      if (!userStoreId || userStoreId === 'all') return true; 
      return alertStoreId === userStoreId;
    });
    
    // Unique by orderId, keeping the latest one
    const unique: ActiveAlert[] = [];
    const seen = new Set();
    [...filtered].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).forEach(a => {
      if (!seen.has(a.orderId)) {
        unique.push(a);
        seen.add(a.orderId);
      }
    });
    return unique;
  }, [activeAlerts, user, adminHiddenAlerts]);

  const shouldBuzz = useMemo(() => 
    filteredAlerts.some(a => (a.buzzerStarted || a.managerBuzzerStarted)),
  [filteredAlerts]);

  useEffect(() => {
    const handleInteraction = () => {
      setHasInteracted(true);
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
    };
    
    window.addEventListener('click', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);
    
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      stopBuzzer();
    };
  }, []);

  useEffect(() => {
    if (shouldBuzz && hasInteracted) {
      startBuzzer();
    } else {
      stopBuzzer();
    }
  }, [shouldBuzz, hasInteracted]);

  useEffect(() => {
    if (lastBroadcast && hasInteracted) {
      playBroadcastSound();
    }
  }, [lastBroadcast, hasInteracted]);

  // Determine which alert should be expanded as an overlay
  // 1. If expandedAlertId is set, use it
  // 2. Otherwise, use the first alert that isn't minimized
  const alertToExpand = useMemo(() => {
    if (expandedAlertId) {
      const found = filteredAlerts.find(a => a.id === expandedAlertId);
      if (found) return found;
    }
    return filteredAlerts.find(a => !minimizedAlerts.includes(a.id));
  }, [filteredAlerts, expandedAlertId, minimizedAlerts]);

  if (!user) return null;

  return (
    <>
      {/* Aggressive Unlock UI: Full-screen flashing red/emerald overlay if audio is locked but we should be buzzing or have a broadcast */}
      <AnimatePresence>
        {((shouldBuzz && !hasInteracted) || (lastBroadcast && !hasInteracted)) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "fixed inset-0 z-[200] flex flex-col items-center justify-center p-8 text-center cursor-pointer animate-pulse",
              lastBroadcast ? "bg-emerald-600" : "bg-red-600"
            )}
            onClick={() => {
              setHasInteracted(true);
              if (audioContextRef.current?.state === 'suspended') {
                audioContextRef.current.resume();
              }
            }}
          >
            {lastBroadcast ? (
              <Zap size={120} className="text-white mb-8 animate-bounce" />
            ) : (
              <AlertTriangle size={120} className="text-white mb-8 animate-bounce" />
            )}
            <h1 className="text-4xl sm:text-6xl font-black text-white uppercase tracking-tighter mb-4">
              {lastBroadcast ? "New Broadcast!" : "Critical Alert!"}
            </h1>
            <p className="text-xl sm:text-2xl font-bold text-white/80 uppercase tracking-widest animate-pulse">
              Tap anywhere to silence & view
            </p>
            <div className="mt-12 px-8 py-4 bg-white text-slate-900 rounded-full font-black uppercase tracking-widest text-sm shadow-2xl">
              Unlock Audio Now
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Broadcast Alert Overlay */}
      <AnimatePresence>
        {lastBroadcast && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm"
          >
            <div className="bg-white w-full max-w-md rounded-[2rem] p-8 shadow-2xl border-4 border-emerald-500 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Zap size={120} className="text-emerald-600" />
              </div>
              
              <div className="relative">
                <div className="h-12 w-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-6">
                  <Zap size={24} />
                </div>
                
                <h3 className="text-2xl font-black text-slate-800 tracking-tight leading-tight">
                  {lastBroadcast.title}
                </h3>
                
                <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-slate-600 font-bold text-sm leading-relaxed">
                    {lastBroadcast.body}
                  </p>
                </div>
                
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setLastBroadcast(null)}
                  className="w-full mt-8 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all"
                >
                  Got it
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {filteredAlerts.map((alert) => {
          const isExpanded = alertToExpand?.id === alert.id;
          
          if (!isExpanded) {
            return (
              <motion.div
                key={`min-${alert.id}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                onClick={() => setExpandedAlertId(alert.id)}
                className={cn(
                  "fixed bottom-24 right-8 h-14 w-14 rounded-full flex items-center justify-center cursor-pointer shadow-2xl border-4 z-[100] group",
                  alert.escalation === "TRUE" ? "bg-red-600 border-red-400 text-white" : "bg-amber-500 border-amber-300 text-white"
                )}
              >
                <div className="absolute -top-2 -right-2 bg-white text-slate-800 text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-md border border-slate-100">
                  {alert.orderId.slice(-4)}
                </div>
                <AlertTriangle size={24} className="group-hover:scale-110 transition-transform" />
              </motion.div>
            );
          }

          return (
            <div key={alert.id} className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-xl pointer-events-auto" onClick={() => setExpandedAlertId(null)}>
              <motion.div 
                initial={{ opacity: 0, scale: 0.8, y: 40 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 40 }}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "w-full max-w-lg p-6 sm:p-10 rounded-[3rem] shadow-[0_48px_96px_-24px_rgba(0,0,0,0.6)] border-8 flex flex-col gap-6 sm:gap-8 relative",
                  alert.escalation === "TRUE" ? "bg-red-600 border-red-400 text-white" : (alert.buzzerStarted || alert.managerBuzzerStarted ? "bg-amber-500 border-amber-300 text-white" : "bg-white border-blue-200 text-slate-800")
                )}
              >
                <button 
                  onClick={() => {
                    setMinimizedAlerts(prev => [...prev, alert.id]);
                    setExpandedAlertId(null);
                  }}
                  className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 hover:bg-black/10 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>

                <div className="flex items-center gap-4 sm:gap-6">
                  <div className={cn("h-16 w-16 sm:h-20 sm:w-20 rounded-2xl sm:rounded-[2rem] flex items-center justify-center animate-pulse shadow-inner", alert.escalation === "TRUE" ? "bg-white/20" : "bg-blue-50 text-blue-600")}>
                    <AlertTriangle size={32} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] opacity-60">
                      {alert.escalation === "TRUE" ? "🔥 Escalated Alert" : (alert.buzzerStarted || alert.managerBuzzerStarted ? "🔔 Critical Alert" : "⚠️ New Alert")}
                    </p>
                    <h4 className="text-xs sm:text-sm font-black tracking-tight mt-1 break-all">Order {alert.orderId}</h4>
                    {!hasInteracted && (
                      <p className="text-[8px] text-amber-200 font-bold mt-1 animate-pulse">
                        ⚠️ CLICK ANYWHERE TO UNLOCK AUDIO
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <div className="bg-black/10 p-2 sm:p-3 rounded-xl">
                    <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-0.5">Store ID</p>
                    <p className="font-black text-xs sm:text-sm">{alert.storeId}</p>
                  </div>
                  <div className="bg-black/10 p-2 sm:p-3 rounded-xl">
                    <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-0.5">Trigger</p>
                    <p className="font-black text-xs sm:text-sm">{alert.statusTrigger}</p>
                  </div>
                  <div className="bg-black/10 p-2 sm:p-3 rounded-xl">
                    <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-0.5">Ageing</p>
                    <p className="font-black text-xs sm:text-sm">{alert.bucket}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <motion.button 
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleAlertAction(alert, 'acknowledge')}
                      className={cn(
                        "p-5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl flex items-center justify-center gap-2",
                        alert.escalation === "TRUE" ? "bg-white text-red-600" : "bg-emerald-500 text-white"
                      )}
                    >
                      <CheckCircle2 size={20} /> {user.role === 'manager' ? 'Accept' : 'Acknowledge'}
                    </motion.button>
                    
                    {alert.escalation !== "TRUE" && (
                      <motion.button 
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleAlertAction(alert, 'escalate')}
                        className="bg-amber-100 text-amber-700 p-5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-sm flex items-center justify-center gap-2 border border-amber-200"
                      >
                        <ArrowUpCircle size={20} /> Escalate
                      </motion.button>
                    )}
                    
                    {alert.escalation === "TRUE" && user.role === 'manager' && (
                      <motion.button 
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleAlertAction(alert, 'hide')}
                        className="bg-red-700 text-white p-5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl flex items-center justify-center gap-2"
                      >
                        <X size={20} /> Reject
                      </motion.button>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
    <button 
      onClick={() => {
        setMinimizedAlerts(prev => [...prev, alert.id]);
        setExpandedAlertId(null);
      }}
      className="flex-1 p-4 bg-black/5 rounded-2xl font-black uppercase tracking-widest text-[10px] opacity-60 hover:opacity-100 transition-opacity"
    >
      Minimize
    </button>
  </div>
                </div>
              </motion.div>
            </div>
          );
        })}
      </AnimatePresence>
    </>
  );
};
