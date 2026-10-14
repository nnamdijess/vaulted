import { OutputFormat } from '@/lib/studio';
export function FormatSelector({value, onChange, disabled=false}: {value?:OutputFormat;onChange:(value:OutputFormat)=>void;disabled?:boolean}) {
 return <label className="studio-format">Output format<select value={value??'9:16'} disabled={disabled} onChange={e=>onChange(e.target.value as OutputFormat)}><option value="9:16">9:16 Vertical · 1080 × 1920</option><option value="4:3">4:3 Landscape · 1440 × 1080</option></select></label>;
}
