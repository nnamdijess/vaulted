import type { TextStyle } from './studio-text-style';
export type Media = { folder_id?: number | null; provider?: 'pixabay' | 'pexels' | 'upload' | 'placeholder'; title?: string; author?: string; id: number; provider_id: string; favorite: boolean; thumbnail?: string; preview_url: string; video_url: string; source_url: string; tags: string; duration: number; width: number; height: number };
export type StudioSong = { id: number; title: string; artist: string; project_id: number; project_name: string; cover_path: string | null; versions: { id: number; name: string }[] };
export type RenderJob = { output_format?: OutputFormat; id: number; status: string; progress: number; error: string | null; revision: number };
export type ContentProject = { output_format?: OutputFormat; id: number; title: string; song_id: number; song_version_id: number; song_title: string; artist: string; project_id: number; cover_path: string | null; version_name: string; status: string; start_time: number; end_time: number; lyrics_text: string; aesthetic: string; lyric_style: string; media_pool?: number[]; text_style?: Partial<TextStyle>; revision: number; lines: { text: string; start_time: number | null; end_time: number | null }[]; clips: { id: number; media_id: number; start_time: number; end_time: number; source_start: number; loop_source?: boolean; framing?: Framing; media: Media }[]; jobs: RenderJob[] };
export type Presets = { aesthetics: { id: string; name: string; keywords: { query: string; weight: number }[] }[]; styles: { id: string; name: string }[] };
export type AestheticCollection = { id: number; name: string; base_aesthetic: string; keywords: string[]; media_ids: number[]; media: Media[] };

export type Framing = { mode: 'fit' | 'fill'; zoom: number; x: number; y: number };

export type OutputFormat = '9:16' | '4:3';
export const outputDimensions = (format?: OutputFormat) => format === '4:3' ? [1440, 1080] as const : [1080, 1920] as const;
