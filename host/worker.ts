import { dispatchOffload } from "../vendor/pocketjs/tools/offload-provider.ts";
import { createMediaStreamServer, mediaHeader } from "../vendor/pocketjs/tools/media-stream.ts";
import type { MediaSource } from "../vendor/pocketjs/contracts/spec/media.ts";
import { Jellyfin, validId, offsetOf } from "./jellyfin.ts";
import { nativeMedia } from "./native-media.ts";
let api:Jellyfin, server:Awaited<ReturnType<typeof createMediaStreamServer>>, init:Promise<void>;
let active: {source:Awaited<ReturnType<Jellyfin["source"]>>;ticket:MediaSource;position:number}|undefined;
let generation=0;
let reportQueue=Promise.resolve();
const report=(event:"Playing"|"Playing/Progress"|"Playing/Stopped",p:NonNullable<typeof active>,paused=false)=> {
 const position=p.position; reportQueue=reportQueue.then(()=>api.report(event,p.source,position,paused)).catch(()=>console.error("Jellyfin playback reporting failed"));
};
function stop(){generation++;if(active){server.revoke(active.ticket);report("Playing/Stopped",active);active=undefined;}}
const methods={"jellyfin.command":async(raw:string)=>{
 await init;const cmd=JSON.parse(raw);let result:unknown;
 switch(cmd.t){
 case "hello": result={user:api.userName};break;
 case "list": result=await api.list(cmd.mode,offsetOf(cmd.offset),cmd.parent,cmd.query);break;
 case "play": {
   validId(cmd.id); if(!Number.isFinite(cmd.seconds)||cmd.seconds<0)throw new Error("Invalid playback position");
   stop();const owner=generation; const source=await api.source(cmd.id);if(owner!==generation)throw new Error("Playback cancelled");
   if(source.seconds<=0)throw new Error("Live or unknown-duration video is unsupported");
   const position=Math.min(cmd.seconds,Math.max(0,source.seconds-1));
   const ticket=server.publish(mediaHeader(Math.round(position*1000),Math.round(source.seconds*1000)),signal=>nativeMedia({videoUrl:source.url,audioUrl:source.url,token:source.token,width:source.width,height:source.height,hasAudio:source.hasAudio},position,signal));
   active={source,ticket,position};report("Playing",active);
   result={source:ticket,seconds:source.seconds,position};break;
 }
 case "progress":
   if(active&&cmd.id===active.source.id&&Number.isFinite(cmd.seconds)){active.position=Math.max(0,Math.min(cmd.seconds,active.source.seconds));report("Playing/Progress",active,!!cmd.paused);}result={};break;
 case "stop":
   if(active&&Number.isFinite(cmd.seconds))active.position=Math.max(0,Math.min(cmd.seconds,active.source.seconds));stop();result={};break;
 default:throw new Error("Unsupported command");
 }
 return JSON.stringify(result);
}};
self.onmessage=event=>{
 if(event.data.init){init=(async()=>{api=new Jellyfin(event.data.init);await api.login();server=await createMediaStreamServer({advertiseHost:event.data.init.advertiseHost,port:event.data.init.mediaPort,log:console.error});})();init.catch(()=>console.error("Jellyfin initialization failed; verify credentials and media port"));return;}
 void dispatchOffload(methods,event.data).then(reply=>self.postMessage(reply));
};
