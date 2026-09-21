"use client";
import { useEffect, useRef, useState } from 'react';

export function ImageUpload({ label, onSave, onCancel, onRemove }: {
  label: string; onSave: (file: File) => Promise<void>; onCancel: () => void; onRemove?: () => Promise<void>;
}) {
  const [selection, setSelection] = useState<{ file: File; revision: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(file?: File) {
    setBusy(true); setError('');
    try { if (file) await onSave(file); else await onRemove?.(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save image'); }
    finally { setBusy(false); }
  }
  return <fieldset disabled={busy}><p className="muted">JPEG, PNG or WebP. Maximum 10 MiB and 25 megapixels. Drag to reposition, then adjust zoom.</p>
    <label>{label}<input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={event => {
      const file = event.target.files?.[0]; setError('');
      if (!file) return;
      if (!/\.(jpe?g|png|webp)$/i.test(file.name) || !['image/jpeg','image/png','image/webp'].includes(file.type)) { setError('Choose a JPEG, PNG or WebP image'); return; }
      if (file.size > 10 * 1024 * 1024) { setError('Image exceeds the 10 MiB limit'); return; }
      setSelection(previous => ({ file, revision: (previous?.revision ?? 0) + 1 }));
    }} /></label>
    {error && <p className="error" role="alert">{error}</p>}
    {selection && <CropEditor key={selection.revision} file={selection.file} onSave={save} busy={busy} />}
    <div className="dialog-buttons"><button type="button" className="secondary" onClick={onCancel}>Cancel</button>{onRemove && <button type="button" className="secondary" onClick={() => void save()}>Remove {label === 'Cover image' ? 'cover' : 'profile picture'}</button>}</div>
  </fieldset>;
}

function CropEditor({ file, onSave, busy }: { file: File; onSave: (file: File) => Promise<void>; busy: boolean }) {
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const canvas = useRef<HTMLCanvasElement>(null);
  const saveTouch = useRef<{ x: number; y: number } | null>(null);
  const lastTouchSave = useRef(-Infinity);
  const saving = useRef(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    let active = true; let bitmap: ImageBitmap | null = null;
    void createImageBitmap(file).then(decoded => {
      bitmap = decoded;
      if (!active) { decoded.close(); return; }
      if (decoded.width * decoded.height > 25_000_000) { decoded.close(); setError('Image must be at most 25 megapixels'); }
      else setImage(decoded);
    }).catch(() => { if (active) setError('This image could not be opened'); });
    return () => { active = false; bitmap?.close(); };
  }, [file]);
  const scale = image ? Math.max(300 / image.width, 300 / image.height) * zoom : 1;
  const width = (image?.width ?? 0) * scale, height = (image?.height ?? 0) * scale;
  const left = (300 - width) / 2 + position.x * (width - 300) / 2;
  const top = (300 - height) / 2 + position.y * (height - 300) / 2;
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context || !image) return;
    context.clearRect(0, 0, 300, 300); context.drawImage(image, left, top, width, height);
  }, [image, left, top, width, height]);
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  async function saveCrop() {
    if (!image || saving.current || busy) return;
    saving.current = true;
    try {
      const output = document.createElement('canvas'); output.width = output.height = 1024;
      const context = output.getContext('2d'); if (!context) { setError('Image editing is unavailable'); return; }
      context.drawImage(image, left * 1024 / 300, top * 1024 / 300, width * 1024 / 300, height * 1024 / 300);
      const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, 'image/png'));
      if (!blob) { setError('Could not crop image'); return; }
      await onSave(new File([blob], 'cropped.png', { type: 'image/png' }));
    } finally { saving.current = false; }
  }
  return <div className="crop-editor">{error && <p role="alert" className="error">{error}</p>}
    <canvas className="crop-preview" aria-label="Square crop preview" width={300} height={300} ref={canvas}
      onPointerDown={event => { if (busy) return; drag.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => {
        if (!drag.current || busy) return;
        const factor = 300 / event.currentTarget.getBoundingClientRect().width;
        const dx = (event.clientX - drag.current.x) * factor, dy = (event.clientY - drag.current.y) * factor;
        setPosition(previous => ({ x: width > 300 ? clamp(previous.x + dx * 2 / (width - 300)) : 0, y: height > 300 ? clamp(previous.y + dy * 2 / (height - 300)) : 0 }));
        drag.current = { x: event.clientX, y: event.clientY };
      }} onPointerUp={event => { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }} onLostPointerCapture={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
    <label>Zoom<input type="range" min="1" max="4" step="0.01" value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label>
    <label>Horizontal position<input type="range" min="-1" max="1" step="0.01" value={position.x} onChange={event => setPosition({ ...position, x: Number(event.target.value) })} /></label>
    <label>Vertical position<input type="range" min="-1" max="1" step="0.01" value={position.y} onChange={event => setPosition({ ...position, y: Number(event.target.value) })} /></label>
    <button type="button" disabled={!image || busy} onPointerDown={event => { if (event.pointerType === 'touch') saveTouch.current = { x: event.clientX, y: event.clientY }; }}
      onPointerCancel={() => { saveTouch.current = null; }}
      onPointerUp={event => {
        const start = saveTouch.current; saveTouch.current = null;
        if (event.pointerType === 'touch' && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 10) {
          // Mobile browsers can suppress a synthesized click following a captured crop drag.
          // Activate a stationary touch release, then ignore its possible duplicate click.
          lastTouchSave.current = performance.now(); void saveCrop();
        }
      }} onClick={event => { if (event.detail === 0 || performance.now() - lastTouchSave.current > 700) void saveCrop(); }}>{busy ? 'Saving…' : 'Save'}</button>
  </div>;
}
