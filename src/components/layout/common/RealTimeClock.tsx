import React, { useState, useEffect } from 'react';

export const RealTimeClock: React.FC = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center sm:items-start">
      <p className="text-xl sm:text-2xl font-black text-white tracking-tighter tabular-nums leading-none">
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </p>
      <p className="text-[8px] sm:text-[9px] font-black text-blue-200 uppercase tracking-widest mt-0.5">
        {time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
      </p>
    </div>
  );
};
