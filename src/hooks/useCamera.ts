import { useState, useCallback, useRef, useEffect } from 'react';

export function useCamera() {
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isSupported] = useState(() => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia);
  const [error, setError] = useState<string | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoElementRef.current = node;
    if (node && streamRef.current && node.srcObject !== streamRef.current) {
      node.srcObject = streamRef.current;
    }
  }, []);

  useEffect(() => {
    const video = videoElementRef.current;
    if (video && stream) {
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
      
      if (video.paused) {
        video.play().catch(err => {
          if (err.name !== 'AbortError') {
            console.warn("Video play failed:", err);
          }
        });
      }
    }
  }, [stream]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setStream(null);
    }
    if (videoElementRef.current) {
      videoElementRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (streamRef.current) return;
    
    setError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Camera API not supported in this browser");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      streamRef.current = s;
      setStream(s);
    } catch (err) {
      console.warn("Preferred camera constraints failed, trying fallback:", err);
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = s;
        setStream(s);
      } catch (fallbackErr) {
        console.error("Camera access denied:", fallbackErr);
        setError(fallbackErr instanceof Error ? fallbackErr.message : "Camera access denied");
      }
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (videoElementRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = videoElementRef.current.videoWidth;
      canvas.height = videoElementRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Mirror the context to match the mirrored video UI
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoElementRef.current, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        stopCamera();
        return dataUrl;
      }
    }
    return null;
  }, [stopCamera]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return { videoRef: setVideoRef, stream, isSupported, error, startCamera, stopCamera, capturePhoto };
}
