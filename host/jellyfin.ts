import { PAGE_SIZE, type Item, type Page } from "../app/protocol.ts";
export interface Config { url: string; username: string; password: string; deviceId: string }
export function validId(id: unknown): string { if(typeof id!=="string" || !/^[a-fA-F0-9-]{1,64}$/.test(id)) throw new Error("Invalid item identifier"); return id; }
export function offsetOf(value: unknown): number { if(!Number.isSafeInteger(value) || Number(value)<0 || Number(value)>1000000) throw new Error("Invalid page"); return Number(value); }
// Runtime atlases contain Latin-1. Avoid missing-glyph squares and wire-budget overflow.
export function displayText(value: unknown, limit=76): string { return String(value??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\x20-\x7e]/g,"?").slice(0,limit); }
export function compact(row: any): Item { return {id:validId(row.Id),name:displayText(row.SeriesName ? `${row.SeriesName} - ${row.Name}` : row.Name),type:displayText(row.Type,24),folder:!!row.IsFolder,seconds:Math.max(0,Number(row.RunTimeTicks)||0)/1e7,resume:Math.max(0,Number(row.UserData?.PlaybackPositionTicks)||0)/1e7,played:!!row.UserData?.Played,year:row.ProductionYear}; }
export class Jellyfin {
  readonly base: string; token=""; userId=""; userName="";
  constructor(readonly config: Config, readonly fetcher: typeof fetch = fetch) {
    const u=new URL(config.url); if(!["http:","https:"].includes(u.protocol)||u.username||u.password||u.search||u.hash) throw new Error("Use an HTTP(S) Jellyfin base URL without credentials or query");
    this.base=u.toString().replace(/\/$/,"");
  }
  get authorization() { return `MediaBrowser Client="Jellyfin3DS", Device="Nintendo 3DS", DeviceId="${this.config.deviceId.replace(/[^a-zA-Z0-9-]/g,"")}", Version="0.1.0"${this.token?`, Token="${this.token}"`:""}`; }
  async request(path: string, query: Record<string,unknown>={}, body?: unknown): Promise<any> {
    const url=new URL(this.base+path); for(const [k,v] of Object.entries(query)) if(v!==undefined) url.searchParams.set(k,String(v));
    let response: Response;
    try { response=await this.fetcher(url,{method:body===undefined?"GET":"POST",headers:{Authorization:this.authorization,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(6500),redirect:"error"}); }
    catch { throw new Error("Jellyfin unreachable or timed out; check companion settings"); }
    if(!response.ok) throw new Error(response.status===401?"Jellyfin login expired or credentials invalid":response.status===403?"Jellyfin user lacks permission":`Jellyfin returned HTTP ${response.status}`);
    if(response.status===204 || response.headers.get("content-length")==="0") return {};
    const text=await response.text(); return text?JSON.parse(text):{};
  }
  async login() {
    const data=await this.request("/Users/AuthenticateByName",{}, {Username:this.config.username,Pw:this.config.password});
    if(typeof data.AccessToken!=="string" || !/^[a-zA-Z0-9_-]+$/.test(data.AccessToken)) throw new Error("Invalid authentication response");
    this.token=data.AccessToken; this.userId=validId(data.User?.Id); this.userName=displayText(data.User?.Name,32);
  }
  async list(mode:string, offset:number, parent?:string, query?:string):Promise<Page> {
    offsetOf(offset); const fields="UserData,RunTimeTicks";
    let data:any;
    if(mode==="libraries") {
      data=await this.request(`/Users/${this.userId}/Views`);
      const rows=(data.Items??[]).filter((v:any)=>!v.CollectionType || ["movies","tvshows","homevideos","boxsets","mixed"].includes(v.CollectionType));
      return {items:rows.slice(offset,offset+PAGE_SIZE).map(compact),total:rows.length,offset};
    }
    const params:Record<string,unknown>={UserId:this.userId,StartIndex:offset,Limit:PAGE_SIZE,Fields:fields,EnableImages:false,EnableTotalRecordCount:true};
    if(mode==="resume") { Object.assign(params,{MediaTypes:"Video"}); data=await this.request(`/Users/${this.userId}/Items/Resume`,params); }
    else {
      if(mode==="search") { if(typeof query!=="string" || !query.trim() || query.length>100) throw new Error("Enter a search term"); Object.assign(params,{SearchTerm:query.trim(),Recursive:true,IncludeItemTypes:"Movie,Series,Episode,Video"}); }
      else if(mode==="folder") Object.assign(params,{ParentId:validId(parent),SortBy:"SortName",SortOrder:"Ascending"});
      else throw new Error("Unknown library view");
      data=await this.request("/Items",params);
    }
    return {items:(data.Items??[]).slice(0,PAGE_SIZE).map(compact),total:Number(data.TotalRecordCount)||0,offset};
  }
  async source(id:string) {
    validId(id);
    const data=await this.request(`/Items/${id}/PlaybackInfo`,{UserId:this.userId});
    const source=data.MediaSources?.find((s:any)=>s.SupportsDirectStream!==false && s.Protocol==="File") ?? data.MediaSources?.[0];
    if(!source || source.RequiresOpening || source.IsInfiniteStream) throw new Error("This source needs an unsupported live/opening session");
    const video=source.MediaStreams?.find((s:any)=>s.Type==="Video");
    if(!video) throw new Error("Select a video item");
    const url=new URL(`${this.base}/Videos/${id}/stream`); url.searchParams.set("Static","true"); url.searchParams.set("MediaSourceId",validId(source.Id));
    return {id,mediaSourceId:source.Id,playSessionId:data.PlaySessionId,url:url.toString(),token:this.token,width:video.Width||400,height:video.Height||240,seconds:(source.RunTimeTicks||0)/1e7,hasAudio:source.MediaStreams.some((s:any)=>s.Type==="Audio")};
  }
  report(event:"Playing"|"Playing/Progress"|"Playing/Stopped", source: {id:string;mediaSourceId:string;playSessionId?:string}, seconds:number, paused=false) {
    return this.request(`/Sessions/${event}`,{}, {ItemId:source.id,MediaSourceId:source.mediaSourceId,PlaySessionId:source.playSessionId,PositionTicks:Math.round(Math.max(0,seconds)*1e7),IsPaused:paused,CanSeek:true,PlayMethod:"DirectStream"});
  }
}
