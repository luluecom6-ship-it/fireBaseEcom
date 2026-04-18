import { AGE_BUCKETS } from '../constants';

export const fixImageUrl = (url: any) => {
  if (!url) return "";
  const str = String(url);
  if (str.includes("drive.google.com")) {
    const id = str.split("id=")[1] || str.split("/d/")[1]?.split("/")[0];
    if (!id) return str;
    return `https://lh3.googleusercontent.com/d/${id}`;
  }
  return str;
};

export const getImages = (url: any): string[] => {
  if (!url) return [];
  return String(url).split("|||").filter(Boolean);
};

export const getAgeing = (triggeredAt: any) => {
  if (!triggeredAt) return "N/A";
  const str = String(triggeredAt);
  let start = new Date(str).getTime();
  
  if (isNaN(start)) {
    const cleaned = str.replace(/,/g, '');
    start = new Date(cleaned).getTime();
  }
  
  if (isNaN(start)) return "N/A";
  const now = new Date().getTime();
  const diff = Math.floor((now - start) / 1000);
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  return `${mins}m ${secs}s`;
};

export const getBucketFromAgeing = (createdAt: any, triggeredAt?: any) => {
  if (!createdAt) return "--";
  const strCreated = String(createdAt);
  const strTriggered = triggeredAt ? String(triggeredAt) : null;
  
  let start = new Date(strCreated).getTime();
  let end = strTriggered ? new Date(strTriggered).getTime() : new Date().getTime();

  if (isNaN(start)) {
    const cleaned = strCreated.replace(/,/g, '');
    start = new Date(cleaned).getTime();
  }
  if (isNaN(end) && strTriggered) {
    const cleaned = strTriggered.replace(/,/g, '');
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
  if (!slots || !Array.isArray(slots)) return [];
  return [...slots].sort((a, b) => {
    const timeA = String(a || "").split(' - ')[0];
    const timeB = String(b || "").split(' - ')[0];
    
    const parseTime = (t: string) => {
      const match = t.toUpperCase().match(/(\d+)(?::(\d+))?\s*(AM|PM)/);
      if (!match) return 0;
      let hrs = parseInt(match[1], 10);
      let mins = match[2] ? parseInt(match[2], 10) : 0;
      const period = match[3];
      if (period === 'PM' && hrs !== 12) hrs += 12;
      if (period === 'AM' && hrs === 12) hrs = 0;
      return hrs * 60 + mins;
    };
    
    return parseTime(timeA) - parseTime(timeB);
  });
};
