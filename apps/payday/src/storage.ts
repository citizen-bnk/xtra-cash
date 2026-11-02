import * as SecureStore from 'expo-secure-store';
import {randomUUID} from 'expo-crypto';
import {XtraClient,type Tokens,type PaydayLeadInput,type PaydayVisitInput} from '@xtra/shared';
const tokenKey='payday.session';
export const tokens={get:async():Promise<Tokens|null>=>{const s=await SecureStore.getItemAsync(tokenKey);return s?JSON.parse(s):null;},set:async(t:Tokens|null)=>{if(t)await SecureStore.setItemAsync(tokenKey,JSON.stringify(t));else await SecureStore.deleteItemAsync(tokenKey);}};
export const client=new XtraClient({baseUrl:process.env.EXPO_PUBLIC_API_URL??'https://xtra-cash-api.vercel.app',tokens});
export type FieldDraft={id:string;kind:'lead';body:PaydayLeadInput}|{id:string;kind:'visit';body:PaydayVisitInput};
function chunks(s:string){const out:string[]=[];let part='',size=0;for(const ch of s){const c=ch.codePointAt(0)!;const bytes=c>0xffff?4:c>0x7ff?3:c>0x7f?2:1;if(size+bytes>1300){out.push(part);part='';size=0;}part+=ch;size+=bytes;}if(part)out.push(part);return out;}
type Manifest={generation:string;count:number};
export async function loadDrafts(owner:string):Promise<FieldDraft[]>{const key=`payday.drafts.${owner}`,raw=await SecureStore.getItemAsync(key);if(!raw)return [];const m:Manifest=JSON.parse(raw);const parts=await Promise.all(Array.from({length:m.count},(_,i)=>SecureStore.getItemAsync(`${key}.${m.generation}.${i}`)));if(parts.some(p=>p===null))throw new Error('Encrypted drafts could not be restored. Contact support before clearing app data.');return JSON.parse(parts.join(''));}
export async function saveDrafts(owner:string,drafts:FieldDraft[]){if(drafts.length>30)throw new Error('Sync existing drafts before adding more than 30.');const key=`payday.drafts.${owner}`,oldRaw=await SecureStore.getItemAsync(key),generation=randomUUID(),parts=chunks(JSON.stringify(drafts));for(let i=0;i<parts.length;i++)await SecureStore.setItemAsync(`${key}.${generation}.${i}`,parts[i]);await SecureStore.setItemAsync(key,JSON.stringify({generation,count:parts.length}));if(oldRaw){const old:Manifest=JSON.parse(oldRaw);await Promise.all(Array.from({length:old.count},(_,i)=>SecureStore.deleteItemAsync(`${key}.${old.generation}.${i}`)));}}
export {randomUUID};
