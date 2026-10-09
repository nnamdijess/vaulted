"use client";
import { TextStyle, studioFonts, lyricCss } from '@/lib/studio-text-style';

const colors = { White: '#FFFFFF', Black: '#000000', Yellow: '#FFFF80', Orange: '#FF9F43', Pink: '#FF6BAE', Blue: '#59B5FF', Green: '#B7F56B', Purple: '#BB91FF' };
export function TextStylePanel({ value, onChange, dirty, disabled, save, cancel, saved }: {
  value: TextStyle; onChange: (value: TextStyle) => void; dirty: boolean; disabled: boolean; save: () => void; cancel: () => void; saved: boolean;
}) {
  return <aside className="studio-text-panel" aria-label="Text styling">
    <h3>Text style</h3><p>Applies to all lyrics in this draft.</p>
    <fieldset disabled={disabled}><legend>Text color</legend>
      <div className="studio-color-swatches">{Object.entries(colors).map(([name, color]) => <button key={name} type="button" className="secondary studio-color-swatch"
        aria-label={`${name} text`} aria-pressed={value.color.toUpperCase() === color} onClick={() => onChange({ ...value, color })}>
        <span style={{ background: color }} aria-hidden="true" />
      </button>)}</div>
      <label className="studio-custom-color">Custom text color<input type="color" value={value.color} onChange={event => onChange({ ...value, color: event.target.value })} /></label>
    </fieldset>
    <fieldset disabled={disabled}><legend>Font</legend><div className="studio-font-options">
      {Object.entries(studioFonts).filter(([font]) => !['lobster', 'blackletter', 'dela', 'bowlby'].includes(font)).map(([font, family]) => <button type="button" className="secondary" key={font} style={{ fontFamily: family }}
        aria-pressed={value.font === font} onClick={() => onChange({ ...value, font: font as TextStyle['font'] })}>{font === 'default' ? 'Default' : family.replace('Vaulted ', '')}</button>)}
    </div></fieldset>
    <fieldset disabled={disabled}><legend>Formatting</legend><div className="studio-alignment-options">
      {(['bold', 'italic', 'underline'] as const).map(format => <button type="button" key={format} aria-pressed={!!value[format]}
        style={{ fontWeight: format === 'bold' ? 700 : 400, fontStyle: format === 'italic' ? 'italic' : 'normal', textDecoration: format === 'underline' ? 'underline' : 'none' }}
        onClick={() => onChange({ ...value, [format]: !value[format] })}>{format[0].toUpperCase() + format.slice(1)}</button>)}
    </div></fieldset>
    <fieldset disabled={disabled}><legend>Alignment</legend><div className="studio-alignment-options">
      {(['left', 'center', 'right'] as const).map(align => <button type="button" key={align} className="secondary" aria-label={`Align ${align}`}
        aria-pressed={value.align === align} onClick={() => onChange({ ...value, align })}>{align[0].toUpperCase() + align.slice(1)}</button>)}
    </div></fieldset>
    <fieldset disabled={disabled}><legend>Spacing</legend>
      <label>Letter spacing<input type="range" min="0" max="0.3" step="0.01" value={value.letter_spacing ?? 0} onChange={event => onChange({ ...value, letter_spacing: Number(event.target.value) })} /></label>
      <label>Text width<input type="range" min="40" max="90" step="1" value={value.text_width ?? 82} onChange={event => onChange({ ...value, text_width: Number(event.target.value) })} /></label>
      <small>Narrow the text area for shorter lines and more space around your lyrics.</small>
    </fieldset>
    <div className="studio-text-sample" style={lyricCss(value)} aria-label="Text style sample">Your lyrics, your style</div>
    <div className="studio-actions"><button disabled={disabled || !dirty} onClick={save}>Save text style</button>
      {dirty && <button className="secondary" disabled={disabled} onClick={cancel}>Cancel style changes</button>}
    </div>
    <p role="status">{dirty ? 'Previewing unsaved changes.' : saved ? 'Text style saved.' : 'Changes preview instantly. Save to include them in exports.'}</p>
  </aside>;
}
