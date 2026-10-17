"use client";
import {useEffect,useState,useSyncExternalStore} from 'react';
import Link from 'next/link';
import {useAuth,AccountArea} from '../auth-provider';
import {api,postJson} from '@/lib/api';
import {Modal} from '../modal';
import './studio.css';
import './studio-refresh.css';

type VaultState={can_create:boolean;vault:null|{id:number;name:string;is_owner:boolean;clip_count:number;members:{id:number;name:string;email:string}[];invites:{id:number;email:string;expires_at:string}[]}};
function subscribeHash(callback:()=>void){window.addEventListener('hashchange',callback);return()=>window.removeEventListener('hashchange',callback);}
const readHash=()=>window.location.hash.slice(1);
const serverHash=()=>'';
export function VideoVaultPage(){
 const {user,loading}=useAuth();
 const token=useSyncExternalStore(subscribeHash,readHash,serverHash);
 const [state,setState]=useState<VaultState|null>(null),[email,setEmail]=useState(''),[link,setLink]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [removing,setRemoving]=useState<{id:number;name:string}|null>(null);
 useEffect(()=>{let active=true;if(user)api<VaultState>('/studio/vault').then(value=>{if(active)setState(value);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[user]);
 async function run(work:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await work();setState(await api<VaultState>('/studio/vault'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const vault=state?.vault;
 return <main className="studio-workspace"><header><Link href="/studio">← Studio</Link>{user&&<AccountArea/>}</header><h1>Video Vault</h1>
 <p>Share footage and folders with invited friends. Your songs, drafts, and exports stay private.</p>
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {loading?<p>Checking your account…</p>:!user?<section><p>Sign in with the email this invitation was sent to, then return to this tab to accept it.</p><Link href="/login" target="_blank" rel="noreferrer">Sign in</Link> · <Link href="/register" target="_blank" rel="noreferrer">Create account</Link><p><button onClick={()=>window.location.reload()}>I’m signed in — continue</button></p></section>:<>
 {token&&!vault&&<section className="studio-panel"><h2>Join a Video Vault</h2><p>Signed in as {user.email}. Accepting gives you access to shared clips and folders. Your existing private uploads stay private; new Studio uploads will go into the shared vault.</p><button disabled={busy} onClick={()=>void run(async()=>{await api('/studio/vault/accept',postJson({token}));window.history.replaceState(null,'',window.location.pathname);window.dispatchEvent(new Event('hashchange'));setNotice('You joined the Video Vault. Shared footage is now available in Review Media.');})}>Accept invitation</button></section>}
 {state&&!vault&&!token&&(state.can_create?<section className="studio-panel"><h2>Your shared footage library</h2><p>Activating shares all your existing Studio uploads and folders with people you invite, without copying files. Only you can delete shared footage or rename shared folders.</p><button disabled={busy} onClick={()=>void run(async()=>{await api('/studio/vault',{method:'POST'});setNotice('Video Vault is ready. Invite your friends below.');})}>Activate Video Vault</button></section>:<p>Ask the vault owner for an invitation link to your email address.</p>)}
 {vault&&<><section className="studio-panel"><h2>{vault.name}</h2><p>{vault.clip_count} shared clips · {vault.is_owner?'Owner':'Contributor'}</p><p>Open a Studio draft and choose <strong>Visuals → Review Media</strong> to browse footage, use folders, or upload clips.</p><p>Everyone can contribute and organize their own uploads. Only the owner can delete footage; deleted clips become black sections in affected drafts.</p><Link className="button" href="/studio/new">Create a video with my music</Link></section>
 {vault.is_owner&&<section className="studio-panel"><h2>Invite a friend</h2><form onSubmit={e=>{e.preventDefault();void run(async()=>{const result=await api<{token:string}>('/studio/vault/invites',postJson({email}));setLink(`${window.location.origin}/studio/vault#${result.token}`);setNotice('Invite created. Copy the link and send it to your friend.');});}}><label>Friend’s email<input type="email" required maxLength={320} value={email} onChange={e=>{setEmail(e.target.value);setLink('');}}/></label><button disabled={busy}>Create invitation</button></form>
 {link&&<div><p>Only the invited account can accept. The link expires in seven days and works once. Creating another invite for this email replaces the previous one.</p><label>Invitation link<input readOnly value={link} onFocus={e=>e.target.select()}/></label><button onClick={()=>void navigator.clipboard.writeText(link).then(()=>setNotice('Invitation copied.')).catch(()=>setError('Select and copy the invitation link above.'))}>Copy invitation</button></div>}
 <h3>Pending invitations</h3>{vault.invites.length?vault.invites.map(invite=><div className="studio-actions" key={invite.id}><span>{invite.email}</span><button disabled={busy} onClick={()=>void run(async()=>{await api(`/studio/vault/invites/${invite.id}`,{method:'DELETE'});setLink('');})}>Revoke invite for {invite.email}</button></div>):<p>No pending invitations.</p>}
 <h3>Members</h3>{vault.members.length?vault.members.map(member=><div className="studio-actions" key={member.id}><span>{member.name} · {member.email}</span><button disabled={busy} onClick={()=>setRemoving(member)}>Remove {member.name}</button></div>):<p>No members yet.</p>}</section>}</>}
 </>}
 {removing&&<Modal title="Remove member" busy={busy} onClose={()=>setRemoving(null)}><p>Remove {removing.name}? They lose browsing and new use of vault footage. Their existing drafts and completed exports remain available. Their contributed clips stay in the vault.</p><button disabled={busy} onClick={()=>void run(async()=>{await api(`/studio/vault/members/${removing.id}`,{method:'DELETE'});setRemoving(null);})}>Remove member</button><button disabled={busy} onClick={()=>setRemoving(null)}>Cancel</button></Modal>}
 </main>;
}
