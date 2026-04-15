import { AGE_BUCKETS } from '../constants';

export const fixImageUrl = (url: string) => {
  if (!url) return "";
  if (url.includes("drive.google.com")) {
    const id = url.split("id=")[1] || url.split("/d/")[1]?.split("/")[0];
    if (!id) return url;
    return `https://lh3.googleusercontent.com/d/${id}`;
  }
  return url;
};

export const getImages = (url: string): string[] => {
  if (!url) return [];
  return url.split("|||").filter(Boolean);
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
