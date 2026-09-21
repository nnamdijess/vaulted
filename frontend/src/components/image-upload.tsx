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
  return <fieldset disabled={busy}><p className="muted">JPEG, PNG or WebP. Maximum 10 MiB and 25 megapixels. Move the square selection; drag its bottom-right corner to resize.</p>
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
  const drag = useRef<{ x: number; y: number; resize: boolean } | null>(null);
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
  const scale = image ? Math.min(300 / image.width, 300 / image.height) : 1;
  const width = (image?.width ?? 0) * scale, height = (image?.height ?? 0) * scale;
  const left = (300 - width) / 2, top = (300 - height) / 2;
  const size = Math.min(width, height) / zoom;
  const cropX = left + (position.x + 1) / 2 * (width - size);
  const cropY = top + (position.y + 1) / 2 * (height - size);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context || !image) return;
    context.clearRect(0, 0, 300, 300); context.drawImage(image, left, top, width, height);
    context.fillStyle = '#0008'; context.beginPath(); context.rect(left, top, width, height);
    context.rect(cropX, cropY, size, size); context.fill('evenodd');
    context.strokeStyle = '#fff'; context.lineWidth = 2; context.strokeRect(cropX, cropY, size, size);
    context.fillStyle = '#fff'; context.fillRect(cropX + size - 7, cropY + size - 7, 14, 14);
  }, [image, left, top, width, height, cropX, cropY, size]);
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  async function saveCrop() {
    if (!image || saving.current || busy) return;
    saving.current = true;
    try {
      const output = document.createElement('canvas'); output.width = output.height = 1024;
      const context = output.getContext('2d'); if (!context) { setError('Image editing is unavailable'); return; }
      context.drawImage(image, (cropX - left) / scale, (cropY - top) / scale, size / scale, size / scale, 0, 0, 1024, 1024);
      const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, 'image/png'));
      if (!blob) { setError('Could not crop image'); return; }
      await onSave(new File([blob], 'cropped.png', { type: 'image/png' }));
    } finally { saving.current = false; }
  }
  return <div className="crop-editor">{error && <p role="alert" className="error">{error}</p>}
    <canvas className="crop-preview" aria-label="Square crop preview" width={300} height={300} ref={canvas}
      onPointerDown={event => {
        if (busy || !image) return;
        const rect = event.currentTarget.getBoundingClientRect(), factor = 300 / rect.width;
        const x = (event.clientX - rect.left) * factor, y = (event.clientY - rect.top) * factor;
        const resize = Math.hypot(x - cropX - size, y - cropY - size) < 24;
        if (!resize && (x < cropX || x > cropX + size || y < cropY || y > cropY + size)) return;
        drag.current = { x: event.clientX, y: event.clientY, resize }; event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        if (!drag.current || busy) return;
        const factor = 300 / event.currentTarget.getBoundingClientRect().width;
        const dx = (event.clientX - drag.current.x) * factor, dy = (event.clientY - drag.current.y) * factor;
        if (drag.current.resize) {
          const next = Math.max(Math.min(width,height) / 4, Math.min(size + (dx + dy) / 2, left + width - cropX, top + height - cropY));
          setZoom(Math.min(width,height) / next);
          setPosition({ x: width > next ? clamp((cropX-left) * 2 / (width-next) - 1) : 0, y: height > next ? clamp((cropY-top) * 2 / (height-next) - 1) : 0 });
        } else setPosition(previous => ({ x: width > size ? clamp(previous.x + dx * 2 / (width-size)) : 0, y: height > size ? clamp(previous.y + dy * 2 / (height-size)) : 0 }));
        drag.current = { ...drag.current, x: event.clientX, y: event.clientY };
      }} onPointerUp={event => { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }} onLostPointerCapture={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
    <label>Selection zoom<input type="range" min="1" max="4" step="0.01" value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label>
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
