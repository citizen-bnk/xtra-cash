'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

export default function RestaurantQrScanner({ onScan }: { onScan: (value: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const captured = useRef(false);
  const callback = useRef(onScan);
  callback.current = onScan;
  const [attempt, retry] = useState(0);
  const [state, setState] = useState<'starting' | 'ready' | 'unavailable'>('starting');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let stream: MediaStream | undefined;
    let frame = 0;
    let last = 0;
    const element = video.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    function stop() {
      active = false;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach(track => track.stop());
      if (element) element.srcObject = null;
    }
    async function start() {
      if (!element || !ctx || !navigator.mediaDevices?.getUserMedia) {
        setState('unavailable');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
        if (!active) { stop(); return; }
        element.srcObject = stream;
        await element.play();
        if (!active) return;
        setState('ready');
        const tick = (now: number) => {
          if (!active) return;
          if (now - last > 160 && element.videoWidth && element.readyState >= 2) {
            last = now;
            const scale = Math.min(1, 720 / Math.max(element.videoWidth, element.videoHeight));
            canvas.width = Math.round(element.videoWidth * scale);
            canvas.height = Math.round(element.videoHeight * scale);
            ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = jsQR(pixels.data, pixels.width, pixels.height);
            if (result?.data && !captured.current) { captured.current = true; stop(); callback.current(result.data); return; }
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch {
        if (active) setState('unavailable');
        stop();
      }
    }
    void start();
    return stop;
  }, [attempt]);

  async function readPhoto(photo: File) {
    setError('');
    const url = URL.createObjectURL(photo);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error();
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(pixels.data, pixels.width, pixels.height);
      if (!result?.data) throw new Error();
      if (!captured.current) { captured.current = true; callback.current(result.data); }
    } catch { setError('No readable QR code found. Try a clearer photo.'); }
    finally { URL.revokeObjectURL(url); }
  }

  return <div className="sq-scanner">
    <video ref={video} muted playsInline autoPlay aria-label="Restaurant QR scanner"
      className="aspect-square w-full max-h-72 rounded-2xl bg-[#27133b] object-cover"
      hidden={state === 'unavailable'} />
    {state === 'starting' && <p className="sq-note">Starting camera…</p>}
    {state === 'unavailable' && <button type="button" className="sq-primary" onClick={() => { setState('starting'); retry(value => value + 1); }}>Open camera</button>}
    <input ref={file} type="file" accept="image/*" hidden onChange={event => {
      const photo = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (photo) void readPhoto(photo);
    }} />
    <button type="button" className="sq-secondary" onClick={() => file.current?.click()}>Use a QR photo</button>
    {error && <p role="alert" className="sq-error">{error}</p>}
  </div>;
}
