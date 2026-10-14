"use client";
import { useEffect, useRef, useState } from 'react';
import type { OutputFormat } from '@/lib/studio';
import type { TextStyle } from '@/lib/studio-text-style';
export function LyricOverlay({ projectId, text, nextText, style, preset, format='9:16' }: { format?:OutputFormat;projectId:number;text:string;nextText?:string;style:TextStyle;preset:string }) {
 const cache=useRef(new Map<string,string>());
 const [ready,setReady]=useState<{key:string;url:string}|null>(null);
 const [error,setError]=useState('');
 const serialized=JSON.stringify(style),key=JSON.stringify([text,serialized,preset,format]);
 useEffect(()=>{
  let active=true;const abort=new AbortController();
  const timer=setTimeout(async()=>{
    const get=async(line:string)=>{const k=JSON.stringify([line,serialized,preset,format]);const old=cache.current.get(k);if(old)return old;
      const response=await fetch(`/api/studio/projects/${projectId}/lyric-preview`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:line,style:JSON.parse(serialized),preset,output_format:format}),signal:abort.signal});
      if(!response.ok)throw new Error('Lyric preview unavailable');const blob=await response.blob();if(!active)return '';const url=URL.createObjectURL(blob);cache.current.set(k,url);if(cache.current.size>32){const first=cache.current.keys().next().value!;URL.revokeObjectURL(cache.current.get(first)!);cache.current.delete(first);}return url;};
    try{if(text){const url=await get(text);if(active){setReady({key,url});setError('');}}if(nextText)await get(nextText);}catch(e){if(active&&!(e instanceof DOMException&&e.name==='AbortError'))setError('Lyric preview unavailable. Try pausing and retrying.');}
  },cache.current.has(key)?0:120);
  return()=>{active=false;clearTimeout(timer);abort.abort();};
 },[projectId,text,nextText,serialized,preset,format,key]);
 useEffect(()=>{const items=cache.current;return()=>{items.forEach(URL.revokeObjectURL);items.clear();};},[]);
 const url=ready?.key===key?ready.url:undefined;
 // Server-rasterized text uses the export's fonts, wrapping and 1080×1920 positions.
 // eslint-disable-next-line @next/next/no-img-element -- authenticated generated image blob
 return <>{text&&url&&<img className="studio-lyric-raster" alt={text} src={url}/>}<span className="sr-only" aria-live="off">{text}</span>{error&&<span className="studio-lyric-error" role="status">{error}</span>}</>;
}
