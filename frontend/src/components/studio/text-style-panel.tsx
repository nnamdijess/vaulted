"use client";
import { TextStyle, studioFonts, lyricCss, fontWeights } from '@/lib/studio-text-style';

export function TextStylePanel({ value, onChange, disabled, lyrics = [] }: {
  lyrics?: string[]; value: TextStyle; onChange: (value: TextStyle) => void; disabled: boolean;
}) {
  const weights = fontWeights(value.font);
  const selectedWeight = weights.reduce((best, weight) => Math.abs(weight-(value.font_weight ?? 400)) < Math.abs(best-(value.font_weight ?? 400)) ? weight : best);
  const condensed = ['oswald','barlow_condensed','bebas','anton','archivo_narrow','teko','fjalla_one','saira_condensed','league_gothic','roboto_condensed'];
  return <aside className="studio-text-panel" aria-label="Text styling">
    <h3>Text style</h3><p>Applies to all lyrics in this draft.</p>
    <fieldset disabled={disabled}><legend>Text color</legend>
      <label className="studio-custom-color">Custom text color<input type="color" value={value.color} onChange={event => onChange({ ...value, color: event.target.value })} /></label>
    </fieldset>
    <fieldset disabled={disabled}><legend>Font</legend>{[true, false].map(narrow => <div key={String(narrow)}><h4>{narrow ? 'Condensed & display' : 'More fonts'}</h4><div className="studio-font-options">
      {Object.entries(studioFonts).filter(([font]) => condensed.includes(font) === narrow).filter(([font]) => !['lobster', 'blackletter', 'dela', 'bowlby', 'mono', 'unbounded'].includes(font)).map(([font, family]) => <button type="button" className="secondary" key={font} style={{ fontFamily: family }}
        aria-pressed={value.font === font} onClick={() => onChange({ ...value, font: font as TextStyle['font'], font_weight: fontWeights(font as TextStyle['font']).reduce((best, weight) => Math.abs(weight-(value.font_weight ?? 400)) < Math.abs(best-(value.font_weight ?? 400)) ? weight : best) })}>{font === 'default' ? 'Default' : family.replace('Vaulted ', '')}</button>)}
    </div></div>)}</fieldset>
    <fieldset disabled={disabled}><legend>Lyric position</legend><div className="studio-alignment-options">
      {(['top', 'middle', 'bottom'] as const).map(position => <button type="button" key={position} aria-pressed={value.position === position}
        onClick={() => onChange({ ...value, position })}>{position[0].toUpperCase() + position.slice(1)}</button>)}
    </div></fieldset>
    <fieldset disabled={disabled}><legend>Alignment</legend><div className="studio-alignment-options">
      {(['left', 'center', 'right', 'justify'] as const).map(align => <button type="button" key={align} className="secondary" aria-label={`Align ${align}`}
        aria-pressed={value.align === align} onClick={() => onChange({ ...value, align })}>{align[0].toUpperCase() + align.slice(1)}</button>)}
    </div>{value.align === 'justify' && <small>Spreads words across the region. Single words keep their shape. Choose how the final line aligns below.</small>}</fieldset>
    <fieldset disabled={disabled}><legend>Layout</legend>
      <label>Font weight<select aria-label="Font weight" value={selectedWeight} onChange={e => onChange({...value, font_weight:Number(e.target.value)})}>{weights.map(weight => <option key={weight} value={weight}>{weight}</option>)}</select></label>
      <small>Uses the nearest available weight for this font.</small>
      <label>Tracking<input aria-label="Tracking" type="range" min="-2" max="12" step="0.5" value={value.tracking ?? 0} onChange={e => onChange({...value, tracking:Number(e.target.value)})} /></label>
      <label>Text horizontal position<input aria-label="Text horizontal position" type="range" min="0" max="1" step="0.01" value={value.text_x ?? .5} onChange={e => onChange({...value, text_x:Number(e.target.value)})} /></label>
      {value.align === 'justify' && <label>Last line<select aria-label="Last line alignment" value={value.last_line_align ?? 'center'} onChange={e => onChange({...value, last_line_align:e.target.value as TextStyle['last_line_align']})}>{['left','center','right','justify'].map(align => <option key={align} value={align}>{align}</option>)}</select></label>}
    </fieldset>
    <fieldset disabled={disabled}><legend>Font Size</legend>
      <label>Font Size: {value.font_size ?? 48}px<input aria-label="Font Size" type="range" min="24" max="160" step="1" value={value.font_size ?? 48} onChange={event => onChange({ ...value, font_size: Number(event.target.value) })} /></label>
      <small>Pixels in the 1080 × 1920 export.</small>
    </fieldset>
    <fieldset disabled={disabled}><legend>Spacing</legend>
      <label>Word spacing: {value.word_spacing ?? 0}px<input aria-label="Word spacing" type="range" min="0" max="160" step="1" value={value.word_spacing ?? 0} onChange={event => onChange({ ...value, letter_spacing: 0, word_spacing: Number(event.target.value) })} /></label>
      <label>Line spacing: {(value.line_spacing ?? 1.2).toFixed(1)}×<input aria-label="Line spacing" type="range" min="1" max="2.5" step="0.1" value={value.line_spacing ?? 1.2} onChange={event => onChange({ ...value, line_spacing: Number(event.target.value) })} /></label>
      <label>Text width: {value.text_width_px ?? Math.round((value.text_width ?? 82) * 10.8)}px<input aria-label="Text width" type="range" min="240" max="972" step="1" value={value.text_width_px ?? Math.round((value.text_width ?? 82) * 10.8)} onChange={event => onChange({ ...value, text_width_px: Number(event.target.value) })} /></label>
      <small>Pixels in the 1080 × 1920 export. Narrow the box to wrap words onto shorter lines.</small>
    </fieldset>
    {!!lyrics.length && <details><summary>Edit lyric line breaks</summary><p>Keep the words unchanged. Enter adds a row inside the same timed lyric; blank rows add space.</p>{lyrics.map((text,index) => <label key={index}>Lyric {index+1}<textarea aria-label={`Layout for lyric ${index+1}`} value={value.line_breaks?.[text] ?? text} disabled={disabled} maxLength={1000} onChange={e => onChange({...value, line_breaks:{...value.line_breaks,[text]:e.target.value}})} /></label>)}</details>}
    <div className="studio-text-sample" style={lyricCss(value)} aria-label="Text style sample">Your lyrics, your style</div>
    <p>Changes save automatically.</p>
  </aside>;
}
