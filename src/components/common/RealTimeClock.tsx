import React, { useState, useEffect } from 'react';

export const RealTimeClock: React.FC = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center sm:items-start">
      <p className="text-3xl sm:text-4xl font-black text-white tracking-tighter tabular-nums">
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </p>
      <p className="text-[10px] sm:text-xs font-black text-blue-200 uppercase tracking-[0.2em] mt-1">
        {time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>
    </div>
  );
};
