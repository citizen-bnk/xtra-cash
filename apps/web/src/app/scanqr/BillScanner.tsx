'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, ScanLine } from 'lucide-react';
import { detectCorners, flattenDocument, parseBillText, type ParsedBill, type Point } from './billScan';

export default function BillScanner({ file, onDone }: { file: File; onDone: (scan: File, parsed: ParsedBill) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [corners, setCorners] = useState<Point[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (cancelled || !canvas.current) return;
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.current.width = Math.round(image.naturalWidth * scale);
      canvas.current.height = Math.round(image.naturalHeight * scale);
      const ctx = canvas.current.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, canvas.current.width, canvas.current.height);
      setCorners(detectCorners(ctx.getImageData(0, 0, canvas.current.width, canvas.current.height)));
    };
    image.onerror = () => setError('This image could not be opened. Choose a JPG, PNG or WebP photo.');
    image.src = url;
    return () => { cancelled = true; URL.revokeObjectURL(url); };
  }, [file]);

  function move(index: number, clientX: number, clientY: number) {
    const bounds = frame.current?.getBoundingClientRect();
    if (!bounds) return;
    const point = { x: Math.min(.99, Math.max(.01, (clientX - bounds.left) / bounds.width)), y: Math.min(.99, Math.max(.01, (clientY - bounds.top) / bounds.height)) };
    setCorners(current => current.map((corner, i) => i === index ? point : corner));
  }

  async function scan() {
    if (!canvas.current || corners.length !== 4 || busy) return;
    setBusy(true); setError(''); setProgress('Straightening bill…');
    let worker: Awaited<ReturnType<typeof import('tesseract.js').createWorker>> | undefined;
    try {
      const flat = flattenDocument(canvas.current, corners);
      setProgress('Reading bill text…');
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('eng');
      const result = await worker.recognize(flat);
      const parsed = parseBillText(result.data.text);
      const blob = await new Promise<Blob>((resolve, reject) => flat.toBlob(value => value ? resolve(value) : reject(new Error('Could not prepare the scan.')), 'image/jpeg', .88));
      onDone(new File([blob], `scanned-${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' }), parsed);
    } catch {
      setError('Automatic reading is unavailable. Try again, or enter the bill details manually.');
    } finally {
      await worker?.terminate();
      setBusy(false); setProgress('');
    }
  }

  return <div className="sq-scanner">
    <p className="sq-note">Drag the four corners to the edges of the bill. Automatic detection is a starting point; check the crop before continuing.</p>
    <div className="sq-scan-frame" ref={frame}>
      <canvas ref={canvas} aria-label="Bill photo for cropping" />
      {corners.length === 4 && <svg className="sq-scan-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points={corners.map(p => `${p.x * 100},${p.y * 100}`).join(' ')} /></svg>}
      {corners.map((point, index) => <button key={index} type="button" className="sq-scan-handle" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} aria-label={`Move corner ${index + 1}`} onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) move(index, event.clientX, event.clientY); }} />)}
    </div>
    <button type="button" className="sq-secondary" onClick={() => setCorners([{ x: .02, y: .02 }, { x: .98, y: .02 }, { x: .98, y: .98 }, { x: .02, y: .98 }])} disabled={busy || !corners.length}>Use full photo</button>
    {error && <p className="sq-error" role="alert">{error}</p>}
    {progress && <p className="sq-note" role="status">{progress}</p>}
    <button type="button" className="sq-primary" onClick={() => void scan()} disabled={busy || corners.length !== 4}><ScanLine size={18} /> {busy ? 'Reading bill…' : 'Straighten and read bill'}</button>
    <p className="sq-footnote"><Camera size={14} /> OCR runs in this browser. Confirm every item and amount.</p>
  </div>;
}
