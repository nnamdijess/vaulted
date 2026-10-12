"use client";
import { TextStyle, studioFonts, lyricCss } from '@/lib/studio-text-style';

const colors = { White: '#FFFFFF', Black: '#000000', Yellow: '#FFFF80', Orange: '#FF9F43', Pink: '#FF6BAE', Blue: '#59B5FF', Green: '#B7F56B', Purple: '#BB91FF' };
export function TextStylePanel({ value, onChange, disabled }: {
  value: TextStyle; onChange: (value: TextStyle) => void; disabled: boolean;
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
      {Object.entries(studioFonts).filter(([font]) => !['lobster', 'blackletter', 'dela', 'bowlby', 'mono', 'unbounded'].includes(font)).map(([font, family]) => <button type="button" className="secondary" key={font} style={{ fontFamily: family }}
        aria-pressed={value.font === font} onClick={() => onChange({ ...value, font: font as TextStyle['font'] })}>{font === 'default' ? 'Default' : family.replace('Vaulted ', '')}</button>)}
    </div></fieldset>
    <fieldset disabled={disabled}><legend>Lyric position</legend><div className="studio-alignment-options">
      {(['top', 'middle', 'bottom'] as const).map(position => <button type="button" key={position} aria-pressed={value.position === position}
        onClick={() => onChange({ ...value, position })}>{position[0].toUpperCase() + position.slice(1)}</button>)}
    </div></fieldset>
    <fieldset disabled={disabled}><legend>Alignment</legend><div className="studio-alignment-options">
      {(['left', 'center', 'right', 'justify'] as const).map(align => <button type="button" key={align} className="secondary" aria-label={`Align ${align}`}
        aria-pressed={value.align === align} onClick={() => onChange({ ...value, align })}>{align[0].toUpperCase() + align.slice(1)}</button>)}
    </div>{value.align === 'justify' && <small>Spreads every line across the text box. Single words stay centered. Word spacing sets the minimum gap before wrapping.</small>}</fieldset>
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
    <div className="studio-text-sample" style={lyricCss(value)} aria-label="Text style sample">Your lyrics, your style</div>
    <p>Changes save automatically.</p>
  </aside>;
}
