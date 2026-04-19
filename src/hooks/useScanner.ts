import { useState, useCallback, useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

export function useScanner(onScanSuccess: (text: string) => void) {
  const [isScanning, setIsScanning] = useState(false);

  const startScanner = useCallback(() => {
    setIsScanning(true);
  }, []);

  useEffect(() => {
    if (isScanning) {
      const scanner = new Html5QrcodeScanner(
        "reader",
        { 
          fps: 10, 
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        false
      );

      scanner.render(
        (decodedText) => {
          onScanSuccess(decodedText);
          setIsScanning(false);
        },
        (error) => {
          // Silent error for scanner
        }
      );

      return () => {
        scanner.clear().catch(err => console.error("Failed to clear scanner", err));
      };
    }
  }, [isScanning, onScanSuccess]);

  return { isScanning, setIsScanning, startScanner };
}
