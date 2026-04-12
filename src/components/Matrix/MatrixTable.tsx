import React from 'react';
import { cn } from '../../lib/utils';
import { MatrixItem } from '../../types';
import { STATUSES, AGE_BUCKETS } from '../../constants';

interface MatrixTableProps {
  title: string;
  headers: string[];
  data: MatrixItem[];
  keyField: keyof MatrixItem;
  themeColor: string;
  onCellClick: (stat: string, key: string, orders: MatrixItem[]) => void;
  statuses?: string[];
  isQuick?: boolean;
}

const normalize = (s: string) => (s || "").toString().toUpperCase().replace(/\s+/g, '').trim();

export const MatrixTable: React.FC<MatrixTableProps> = ({
  title,
  headers,
  data,
  keyField,
  themeColor,
  onCellClick,
  statuses = STATUSES,
  isQuick = false
}) => {
  // Derive all statuses present in data to avoid blank rows if source system uses different names
  const dataStatuses = [...new Set((data || []).map(d => (d.status || "").trim()))].filter((s: string) => {
    if (!s) return false;
    const sLower = s.toLowerCase().trim();
    // For quick orders, we map these statuses to new labels, so they shouldn't appear as "extra" rows
    if (isQuick) {
      if (sLower === "parking") return false;
    }
    return !(statuses || []).some(st => st.toLowerCase().trim() === sLower);
  });
  const displayStatuses = [...new Set([...(statuses || []), ...dataStatuses])];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
      <div className={cn("px-4 py-3 text-white font-black text-xs flex items-center justify-between uppercase tracking-wider", themeColor)}>
        <span>{title}</span>
        <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black border border-white/20">
          {data.length} ORDERS
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-[#f1f5f9] border-b border-slate-200">
              <th className="p-2.5 text-left font-black text-slate-400 uppercase tracking-widest border-r border-slate-200 min-w-[140px]">STATUS</th>
              {headers.map(h => (
                <th key={h} className="p-2.5 text-center font-black text-slate-400 uppercase tracking-widest border-r border-slate-200 min-w-[70px]">
                  <div className="flex flex-col items-center gap-0.5">
                    <span>{h.split(' - ')[0]}</span>
                    {h.includes(' - ') && <span className="text-[8px] opacity-40 leading-none">to {h.split(' - ')[1]}</span>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayStatuses.map((stat: string) => (
              <tr key={stat} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                <td className="p-2.5 text-left font-black text-slate-700 border-r border-slate-200 sticky left-0 bg-white z-10 shadow-[1px_0_3px_rgba(0,0,0,0.02)] uppercase">{stat}</td>
                {headers.map(h => {
                  const matches = (data || []).filter(d => {
                    const dStatus = normalize(d.status);
                    const sStatus = normalize(stat);
                    const keyMatch = normalize(String(d[keyField] || "")) === normalize(String(h || ""));
                    
                    if (!keyMatch) return false;

                    // Mapping for Quick Orders
                    if (isQuick) {
                      if (sStatus === "STORING" && dStatus === "PARKING") return true;
                    }

                    return dStatus === sStatus;
                  });
                  const count = matches.length;
                  const hasData = count > 0;
                  const isRed = themeColor.includes('red');
                  const cellBg = hasData ? (isRed ? 'bg-[#fff1f2]' : 'bg-[#f0fdf4]') : '';
                  const textColor = hasData ? (isRed ? 'text-[#e11d48]' : 'text-[#16a34a]') : 'text-slate-200';
                  
                  return (
                    <td 
                      key={h} 
                      className={cn("p-2.5 text-center font-black border-r border-slate-200 transition-all", cellBg, textColor, hasData && "cursor-pointer active:scale-95 hover:brightness-95")}
                      onClick={() => {
                        if (hasData) {
                          onCellClick(stat, h, matches);
                        }
                      }}
                      title={matches.map(m => `${m.orderID} (${m.storeID})`).join('\n')}
                    >
                      {hasData ? count : '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="bg-[#f8fafc] font-black">
              <td className="p-2.5 text-left text-slate-900 border-r border-slate-200 sticky left-0 bg-[#f8fafc] z-10">TOTAL</td>
              {headers.map(h => {
                const matches = (data || []).filter(d => normalize(String(d[keyField] || "")) === normalize(String(h || "")));
                const count = matches.length;
                return (
                  <td key={h} className="p-2.5 text-center text-slate-900 border-r border-slate-200">
                    {count > 0 ? count : '-'}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const getAgeing = (triggeredAt: string) => {
  if (!triggeredAt) return "N/A";
  let start = new Date(triggeredAt).getTime();
  
  if (isNaN(start)) {
    const cleaned = triggeredAt.replace(/,/g, '');
    start = new Date(cleaned).getTime();
  }
  
  if (isNaN(start)) return "N/A";
  const now = new Date().getTime();
  const diff = Math.floor((now - start) / 1000);
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  return `${mins}m ${secs}s`;
};

export const getBucketFromAgeing = (createdAt: string, triggeredAt?: string) => {
  if (!createdAt) return "--";
  let start = new Date(createdAt).getTime();
  let end = triggeredAt ? new Date(triggeredAt).getTime() : new Date().getTime();

  if (isNaN(start)) {
    const cleaned = createdAt.replace(/,/g, '');
    start = new Date(cleaned).getTime();
  }
  if (isNaN(end) && triggeredAt) {
    const cleaned = triggeredAt.replace(/,/g, '');
    end = new Date(cleaned).getTime();
  }

  if (isNaN(start)) return "--";
  
  const diff = Math.floor((end - start) / (1000 * 60));
  if (diff < 0) return AGE_BUCKETS[0];
  if (diff >= 60) return "60MIN+";
  
  const bucketIndex = Math.floor(diff / 5);
  return AGE_BUCKETS[bucketIndex] || "60MIN+";
};

export const sortSlots = (slots: string[]) => {
  return [...slots].sort((a, b) => {
    const timeA = a.split(' - ')[0];
    const timeB = b.split(' - ')[0];
    
    const parseTime = (t: string) => {
      const [time, period] = t.split(' ');
      let [hrs, mins] = time.split(':').map(Number);
      if (period === 'PM' && hrs !== 12) hrs += 12;
      if (period === 'AM' && hrs === 12) hrs = 0;
      return hrs * 60 + mins;
    };
    
    return parseTime(timeA) - parseTime(timeB);
  });
};
