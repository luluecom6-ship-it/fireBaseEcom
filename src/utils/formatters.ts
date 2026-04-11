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
