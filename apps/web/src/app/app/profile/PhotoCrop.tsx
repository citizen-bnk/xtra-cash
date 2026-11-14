'use client';

import { useEffect, useRef, useState } from 'react';

export default function PhotoCrop({ onSave }: { onSave: (file: Blob) => Promise<void> }) {
  const image = useRef<HTMLImageElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [crop, setCrop] = useState({ x: 50, y: 50, zoom: 1 });

  useEffect(() => {
    const source = image.current;
    if (!source || !canvas.current || !ready) return;
    const size = Math.min(source.naturalWidth, source.naturalHeight) / crop.zoom;
    const left = Math.max(0, Math.min(source.naturalWidth - size, source.naturalWidth * crop.x / 100 - size / 2));
    const top = Math.max(0, Math.min(source.naturalHeight - size, source.naturalHeight * crop.y / 100 - size / 2));
    canvas.current.getContext('2d')?.drawImage(source, left, top, size, size, 0, 0, 512, 512);
  }, [crop, ready]);

  async function select(file?: File) {
    if (!file) return;
    setBusy(true); setError(''); setReady(false); setNotice('');
    const url = URL.createObjectURL(file);
    try {
      const photo = new Image();
      photo.src = url;
      await photo.decode();
      image.current = photo;
      setCrop({ x: 50, y: 50, zoom: 1 });
      try {
        const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
        const runtime = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm');
        const detector = await FaceDetector.createFromOptions(runtime, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite' },
          runningMode: 'IMAGE',
        });
        try {
          const faces = detector.detect(photo).detections.flatMap(face => face.boundingBox ? [face.boundingBox] : []);
          faces.sort((a, b) => b.width * b.height - a.width * a.height);
          const face = faces[0];
          if (!face) throw new Error('No face detected');
          const side = Math.min(photo.naturalWidth, photo.naturalHeight);
          setCrop({
            x: 100 * (face.originX + face.width / 2) / photo.naturalWidth,
            y: 100 * (face.originY + face.height / 2) / photo.naturalHeight,
            zoom: Math.max(1, Math.min(4, side / (1.6 * Math.max(face.width, face.height)))),
          });
          setNotice('Face centred. Adjust the frame before saving.');
        } finally { detector.close(); }
      } catch { setNotice('Adjust the square to frame your face.'); }
      setReady(true);
    } catch { setError('Could not open this photo. Try a JPEG or PNG.'); }
    finally { URL.revokeObjectURL(url); setBusy(false); }
  }

  async function save() {
    setBusy(true); setError('');
    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.current?.toBlob(resolve, 'image/jpeg', 0.85));
      if (!blob) throw new Error('Could not crop the photo.');
      await onSave(blob);
      setReady(false);
      setNotice('Profile photo saved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the photo.'); }
    finally { setBusy(false); }
  }

  return <div className="mt-3 w-full max-w-sm space-y-3 rounded-2xl border border-purple-100 bg-white p-4 text-sm">
    <label className="block font-semibold">Choose a photo
      <input className="mt-2 block w-full text-sm" type="file" accept="image/*" disabled={busy} onChange={event => { void select(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
    </label>
    <label className="block font-semibold">Take a selfie
      <input className="mt-2 block w-full text-sm" type="file" accept="image/*" capture="user" disabled={busy} onChange={event => { void select(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
    </label>
    {ready && <>
      <canvas ref={canvas} width={512} height={512} className="mx-auto aspect-square w-40 rounded-2xl" aria-label="Square photo preview" />
      {(['x', 'y', 'zoom'] as const).map(key => <label key={key} className="block">{({ x: 'Horizontal position', y: 'Vertical position', zoom: 'Zoom' })[key]}
        <input className="block w-full" type="range" min={key === 'zoom' ? 1 : 0} max={key === 'zoom' ? 4 : 100} step={key === 'zoom' ? .05 : .5} value={crop[key]} onChange={event => setCrop({ ...crop, [key]: Number(event.target.value) })} />
      </label>)}
      <button className="w-full rounded-xl bg-purple-700 px-4 py-2 font-semibold text-white disabled:opacity-50" type="button" disabled={busy} onClick={() => void save()}>Save profile photo</button>
    </>}
    {(busy || notice) && <p role="status">{busy ? 'Working on your photo…' : notice}</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </div>;
}
