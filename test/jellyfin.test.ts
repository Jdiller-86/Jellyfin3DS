import {test,expect} from "bun:test";
import {Jellyfin,offsetOf,compact,validId} from "../host/jellyfin.ts";
const config={url:"https://server.test/jellyfin/",username:"jake",password:"secret",deviceId:"test"};
test("authentication preserves base path and keeps secrets out of URL",async()=>{
 let seen:any;
 const api=new Jellyfin(config,(async(url:any,init:any)=>{seen={url:String(url),init};return Response.json({AccessToken:"token",User:{Id:"abc",Name:"Jake"}});})as any);
 await api.login();expect(seen.url).toBe("https://server.test/jellyfin/Users/AuthenticateByName");expect(JSON.parse(seen.init.body)).toEqual({Username:"jake",Pw:"secret"});expect(api.authorization).toContain('Token="token"');
});
test("search and pagination are bounded and encoded",async()=>{
 let seen="";const api=new Jellyfin(config,(async(url:any)=>{seen=String(url);return Response.json({Items:[],TotalRecordCount:7});})as any);api.userId="abc";
 expect(await api.list("search",5,undefined,"A & B")).toEqual({items:[],total:7,offset:5});const u=new URL(seen);expect(u.searchParams.get("SearchTerm")).toBe("A & B");expect(u.searchParams.get("Limit")).toBe("5");expect(u.searchParams.get("StartIndex")).toBe("5");
});
test("reject path injection, invalid paging and non-http servers",()=>{
 expect(()=>validId("../admin")).toThrow();expect(()=>offsetOf(-1)).toThrow();expect(()=>offsetOf(1.1)).toThrow();expect(()=>new Jellyfin({...config,url:"file:///etc"})).toThrow();
});
test("metadata fits the companion record and converts resume ticks",()=>{
 const item=compact({Id:"abc",Name:"é".repeat(500),Type:"Movie",RunTimeTicks:120e7,UserData:{PlaybackPositionTicks:30e7}});
 expect(item.resume).toBe(30);expect(item.name.length).toBe(76);expect(JSON.stringify({items:Array(5).fill(item),total:1000,offset:0}).length).toBeLessThan(2500);
});
test("stream uses authenticated direct source and reports actual position",async()=>{
 const calls:any[]=[];const api=new Jellyfin(config,(async(url:any,init:any)=>{calls.push({url:String(url),init});return String(url).includes("PlaybackInfo")?Response.json({PlaySessionId:"session",MediaSources:[{Id:"def",Protocol:"File",RunTimeTicks:100e7,MediaStreams:[{Type:"Video",Width:1920,Height:1080},{Type:"Audio"}]}]}):new Response(null,{status:204});})as any);api.userId="abc";api.token="token";
 const s=await api.source("abc");expect(s.url).toBe("https://server.test/jellyfin/Videos/abc/stream?Static=true&MediaSourceId=def");expect(s.hasAudio).toBe(true);await api.report("Playing/Progress",s,12.5,true);expect(JSON.parse(calls[1].init.body).PositionTicks).toBe(125e6);expect(calls[1].url).not.toContain("token");
});
test("errors do not expose credentials or server response body",async()=>{
 const api=new Jellyfin(config,(async()=>new Response("password=secret",{status:401}))as any);await expect(api.login()).rejects.toThrow("credentials invalid");
});
