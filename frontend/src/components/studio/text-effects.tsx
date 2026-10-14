"use client";
import type { TextStyle } from '@/lib/studio-text-style';

export function TextEffects({value,onChange,disabled}: {value:TextStyle;onChange:(style:TextStyle)=>void;disabled:boolean}) {
  const update = (patch:Partial<TextStyle>) => onChange({...value,...patch});
  return <details className="studio-inspector-group"><summary>Outline & shadow</summary>
    <fieldset disabled={disabled}><legend>Outline</legend>
      <label><input type="checkbox" checked={value.outline_enabled ?? true} onChange={e=>update({outline_enabled:e.target.checked})} /> Enable outline</label>
      {(value.outline_enabled ?? true) && <>
        <label className="studio-custom-color">Outline color<input type="color" value={value.outline_color ?? '#101010'} onChange={e=>update({outline_color:e.target.value})} /></label>
        <label>Outline thickness: {value.outline_thickness ?? 1}px<input aria-label="Outline thickness" type="range" min="0" max="12" step="1" value={value.outline_thickness ?? 1} onChange={e=>update({outline_thickness:Number(e.target.value)})} /></label>
      </>}
    </fieldset>
    <fieldset disabled={disabled}><legend>Shadow</legend>
      <label><input type="checkbox" checked={value.shadow_enabled ?? false} onChange={e=>update({shadow_enabled:e.target.checked})} /> Enable shadow</label>
      {value.shadow_enabled && <>
        <label className="studio-custom-color">Shadow color<input type="color" value={value.shadow_color ?? '#000000'} onChange={e=>update({shadow_color:e.target.value})} /></label>
        <label>Shadow blur: {value.shadow_blur ?? 6}px<input aria-label="Shadow blur" type="range" min="0" max="30" step="1" value={value.shadow_blur ?? 6} onChange={e=>update({shadow_blur:Number(e.target.value)})} /></label>
        <label>Shadow horizontal offset: {value.shadow_x ?? 4}px<input aria-label="Shadow horizontal offset" type="range" min="-40" max="40" step="1" value={value.shadow_x ?? 4} onChange={e=>update({shadow_x:Number(e.target.value)})} /></label>
        <label>Shadow vertical offset: {value.shadow_y ?? 4}px<input aria-label="Shadow vertical offset" type="range" min="-40" max="40" step="1" value={value.shadow_y ?? 4} onChange={e=>update({shadow_y:Number(e.target.value)})} /></label>
        <label>Shadow opacity: {Math.round((value.shadow_opacity ?? .6)*100)}%<input aria-label="Shadow opacity" type="range" min="0" max="1" step="0.05" value={value.shadow_opacity ?? .6} onChange={e=>update({shadow_opacity:Number(e.target.value)})} /></label>
      </>}
    </fieldset><small>Sizes are measured in export pixels. The video preview shows the rendered effects.</small>
  </details>;
}
