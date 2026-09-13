import { createSignal, For, Show, onCleanup } from "solid-js";
import { mount } from "@pocketjs/framework/solid";
import { AuxiliarySurface, View, Text, Image, type NodeMirror } from "@pocketjs/framework/components";
import { onFrame, onButtonPress } from "@pocketjs/framework/lifecycle";
import { BTN } from "@pocketjs/framework/input";
import { createGesture } from "@pocketjs/framework/gesture";
import { createOsk, Osk } from "@pocketjs/framework/osk";
import { offload } from "@pocketjs/framework/offload";
import { mediaPlayer, type MediaStatus } from "@pocketjs/framework/media";
import { getOps } from "@pocketjs/framework/host";
import { type Item, type Page, PAGE_SIZE, time } from "./protocol.ts";

type Location={mode:"libraries"|"folder"|"resume"|"search";title:string;offset:number;parent?:string;query?:string};
function App(){
 const rpc=offload(), player=mediaPlayer();
 const [connected,setConnected]=createSignal(false),[busy,setBusy]=createSignal(false),[message,setMessage]=createSignal("Start the companion on your computer.");
 const [where,setWhere]=createSignal<Location>({mode:"libraries",title:"Libraries",offset:0});
 const [page,setPage]=createSignal<Page>({items:[],offset:0,total:0}),[index,setIndex]=createSignal(0);
 const [detail,setDetail]=createSignal<Item>(),[playing,setPlaying]=createSignal<Item>();
 const [status,setStatus]=createSignal<MediaStatus>(),[controls,setControls]=createSignal(false),[query,setQuery]=createSignal("");
 const [volume,setVolume]=createSignal(0.8);
 let history:Location[]=[], frame=0, session=0, operation=0, plane:NodeMirror|undefined;
 const osk=createOsk({value:query,setValue:setQuery,maxLength:80,onCommit:q=>{if(q.trim())load({mode:"search",title:q.trim(),query:q.trim(),offset:0});}});
 function command(cmd:unknown,done:(value:any)=>void,foreground=true){
   if(!rpc.connected()){setMessage("Companion disconnected. Check Wi-Fi and pairing.");return;}
   const owner=foreground?++operation:operation;
   if(foreground){setBusy(true);setMessage("Working...");}
   const id=rpc.request("jellyfin.command",JSON.stringify(cmd),result=>{
     if(foreground&&owner!==operation)return;
     if(foreground)setBusy(false);
     if(!result.ok){setMessage(result.error);return;}
     try {const value=JSON.parse(result.value);if(foreground)setMessage("");done(value);}
     catch{setMessage("Invalid companion response. Reconnect and retry.");}
   });
   if(!id){if(foreground)setBusy(false);setMessage("Companion busy. Try again.");}
 }
 function load(location:Location){
   if(busy())return;
   command({t:"list",...location},data=>{setWhere(location);setPage(data);setIndex(0);setDetail(undefined);setControls(false);});
 }
 function home(mode:"libraries"|"resume"){history=[];load({mode,title:mode==="resume"?"Continue watching":"Libraries",offset:0});}
 function open(item:Item){
   if(busy())return;
   if(item.folder){history.push(where());load({mode:"folder",title:item.name,parent:item.id,offset:0});}
   else {setDetail(item);setControls(false);}
 }
 function play(item:Item,seconds:number){
   if(busy())return;
   player.close();setStatus(undefined);
   command({t:"play",id:item.id,seconds},data=>{
     setPlaying({...item,seconds:data.seconds});setControls(true);setDetail(undefined);
     if(!player.open(data.source)){setMessage("Player busy. Stop and retry.");command({t:"stop",seconds},()=>{},false);setPlaying(undefined);return;}
     player.volume(volume());if(plane)getOps().setImage(plane.id,player.texture());
   });
 }
 function report(){const item=playing(),s=status();if(item&&s)command({t:"progress",id:item.id,seconds:s.positionMs/1000,paused:s.phase==="paused"},()=>{},false);}
 function stop(){const seconds=status()?.positionMs?status()!.positionMs/1000:0;operation++;setBusy(false);player.close();setPlaying(undefined);setStatus(undefined);setControls(false);command({t:"stop",seconds},()=>{},false);}
 function pause(){if(!playing())return;player.pause(status()?.phase!=="paused");}
 function seek(delta:number){const item=playing();if(item)play(item,Math.max(0,(status()?.positionMs??0)/1000+delta));}
 function back(){if(busy())return;if(detail()){setDetail(undefined);return;}if(controls()){setControls(false);return;}const previous=history.pop();if(previous)load(previous);else home("libraries");}
 function turn(delta:number){const p=page(),next=p.offset+delta*PAGE_SIZE;if(!busy()&&next>=0&&next<p.total)load({...where(),offset:next});}
 function changeVolume(delta:number){setVolume(Math.max(0,Math.min(1,volume()+delta)));player.volume(volume());}
 onButtonPress(BTN.UP,()=>!controls()&&!detail()&&setIndex(Math.max(0,index()-1)));
 onButtonPress(BTN.DOWN,()=>!controls()&&!detail()&&setIndex(Math.min(page().items.length-1,index()+1)));
 onButtonPress(BTN.LEFT,()=>controls()?seek(-10):turn(-1));
 onButtonPress(BTN.RIGHT,()=>controls()?seek(10):turn(1));
 onButtonPress(BTN.CIRCLE,()=>{if(controls())pause();else if(detail())play(detail()!,detail()!.resume);else if(page().items[index()])open(page().items[index()]);});
 onButtonPress(BTN.CROSS,back);
 onButtonPress(BTN.TRIANGLE,()=>!busy()&&osk.open());
 onButtonPress(BTN.SQUARE,()=>home("resume"));
 onButtonPress(BTN.START,pause);
 onButtonPress(BTN.SELECT,()=>playing()&&setControls(!controls()));
 onButtonPress(BTN.LTRIGGER,()=>seek(-10));onButtonPress(BTN.RTRIGGER,()=>seek(10));
 createGesture({surface:"auxiliary",onTap:c=>{
   if(osk.isOpen()||busy())return;
   if(c.y<32){if(c.x<105)home("libraries");else if(c.x<215)home("resume");else osk.open();return;}
   if(controls()){
     if(c.y>=82&&c.y<126){if(c.x<100)seek(-10);else if(c.x<220)pause();else seek(10);}
     if(c.y>=134&&c.y<174){if(c.x<160)changeVolume(-0.1);else changeVolume(0.1);}
     if(c.y>=180&&c.y<220){if(c.x<160)setControls(false);else stop();}return;
   }
   if(detail()){if(c.y>=76&&c.y<116)play(detail()!,detail()!.resume);else if(c.y>=122&&c.y<162)play(detail()!,0);else if(c.y>=170&&c.y<213)back();return;}
   if(c.y>=48&&c.y<188){const item=page().items[Math.floor((c.y-48)/28)];if(item)open(item);}
   if(c.y>=192&&c.y<220){if(c.x<105)turn(-1);else if(c.x<215)back();else turn(1);}
 }});
 onFrame(()=>{
   frame++;const current=rpc.session();
   if(current!==session){operation++;setBusy(false);setConnected(current>0);player.close();setPlaying(undefined);setStatus(undefined);setControls(false);session=current;
     if(current>0)command({t:"hello"},()=>home("libraries"));else setMessage("Companion disconnected. Waiting to reconnect.");}
   if(frame%6===0&&playing()){
     const old=status(),s=player.status();setStatus(s);
     if(s.phase==="error"&&old?.phase!=="error"){setMessage(s.error);command({t:"stop",seconds:s.positionMs/1000},()=>{},false);}
     if(s.phase==="ended"&&old?.phase!=="ended"){command({t:"stop",seconds:s.positionMs/1000},()=>{},false);setMessage("Playback finished.");}
     if(s.phase!==old?.phase&&["paused","playing"].includes(s.phase))report();
   }
   if(frame%300===0&&playing()&&["playing","paused"].includes(status()?.phase??""))report();
 });
 onCleanup(()=>player.close());
 const selected=()=>detail()??page().items[index()];
 const label=(s:string)=>s.length>40?s.slice(0,37)+"...":s;
 return <>
 <View class="relative w-full h-full bg-[#f0f1f4] overflow-hidden">
   <Show when={playing()}><View class="absolute inset-0 bg-black" /></Show>
   <Image nodeRef={n=>{plane=n;getOps().setImage(n.id,player.texture());}} style={{width:400,height:240,opacity:playing()&&(status()?.presentedFrames??0)>0?1:0}} />
   <Show when={!playing()}>
    <View class="absolute left-[12] top-[12] right-[12] bottom-[42] p-[12] rounded-xl bg-white border border-[#c4cbd1] flex-col gap-2">
     <Text class="text-sm text-[#008ab3] font-bold">Jellyfin3DS</Text>
     <Text class="text-lg text-[#3c4954] font-bold">Select something to watch</Text>
     <View class="h-[2] w-[72] bg-[#00b6e7]" />
     <Text class="text-base text-[#3c4954]">{selected()?.name??"Welcome to Jellyfin3DS"}</Text>
     <Text class="text-sm text-[#6a7680]">{selected()?`${selected()!.type}${selected()!.year?` / ${selected()!.year}`:""}${selected()!.seconds?` / ${time(selected()!.seconds)}`:""}`:"Pair with the companion to browse your server."}</Text>
     <Text class="text-sm text-[#008ab3]">{selected()?.resume?`Resume at ${time(selected()!.resume)}`:selected()?.played?"Watched":""}</Text>
    </View>
    <Text class="absolute left-[22] bottom-[15] text-xs text-[#6a7680]">Video requires a New 3DS / New 2DS XL.</Text>
   </Show>
   <Show when={playing()&&!(status()?.presentedFrames)}>
    <View class="absolute inset-0 items-center justify-center"><Text class="text-base text-white">{status()?.phase==="error"?"Playback unavailable":"Buffering video..."}</Text></View>
   </Show>
 </View>
 <AuxiliarySurface>{()=> <View class="relative w-full h-full bg-[#f5f5f5] overflow-hidden">
   <View class="absolute left-0 top-0 w-full h-[32] flex-row items-center justify-around bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca]">
    <Text class="text-xs text-[#3c4954] font-bold">Libraries</Text><Text class="text-xs text-[#3c4954] font-bold">Continue</Text><Text class="text-xs text-[#008ab3] font-bold">Search [X]</Text>
   </View>
   <Show when={!controls()&&!detail()}>
     <Text class="absolute left-[8] top-[33] text-xs text-[#6a7680]">{label(where().title)}</Text>
     <For each={page().items}>{(item,i)=><View style={{insetT:48+i()*28}} class={i()===index()?"absolute left-[6] right-[6] h-[27] bg-gradient-to-b from-[#e8fbff] to-[#c8f0fa] border-2 border-[#00b6e7] rounded-lg overflow-hidden":"absolute left-[6] right-[6] h-[27] bg-gradient-to-b from-white to-[#f0f1f3] border border-[#c4cbd1] rounded-lg overflow-hidden"}>
       <Text class="absolute left-[6] top-[5] text-xs text-[#3c4954]">{item.folder?"> ":"  "}{label(item.name)}</Text>
     </View>}</For>
     <Show when={!page().items.length}><Text class="absolute left-[16] top-[91] text-sm text-[#6a7680]">{connected()?"No videos here. Try another library.":"Waiting for companion..."}</Text></Show>
     <View class="absolute left-[6] right-[6] top-[192] h-[28] bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] flex-row justify-around items-center rounded-lg"><Text class="text-xs text-[#3c4954]">Prev</Text><Text class="text-xs text-[#3c4954]">Back [B]</Text><Text class="text-xs text-[#3c4954]">Next</Text></View>
   </Show>
   <Show when={detail()&&!controls()}>
     <Text class="absolute left-[10] top-[43] text-xs text-[#3c4954]">{label(detail()!.name)}</Text>
     <View class="absolute left-[10] right-[10] top-[76] h-[40] items-center justify-center bg-gradient-to-b from-[#e6faff] to-[#b9eaf6] border border-[#13a8cf] rounded-lg"><Text class="text-sm text-[#3c4954]">{detail()!.resume?`Resume ${time(detail()!.resume)} [A]`:"Play [A]"}</Text></View>
     <View class="absolute left-[10] right-[10] top-[122] h-[40] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"><Text class="text-sm text-[#3c4954]">Play from beginning</Text></View>
     <View class="absolute left-[10] right-[10] top-[170] h-[40] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"><Text class="text-sm text-[#3c4954]">Back [B]</Text></View>
   </Show>
   <Show when={controls()}>
     <Text class="absolute left-[10] top-[40] text-xs text-[#3c4954]">{label(playing()?.name??"")}</Text>
     <Text class="absolute left-[10] top-[61] text-xs text-[#008ab3]">{time((status()?.positionMs??0)/1000)} / {time(playing()?.seconds??0)} - {status()?.phase??"opening"}</Text>
     <View class="absolute left-[8] right-[8] top-[82] h-[44] bg-gradient-to-b from-[#e6faff] to-[#b9eaf6] border border-[#13a8cf] flex-row justify-around items-center rounded-lg"><Text class="text-sm text-[#3c4954]">-10s</Text><Text class="text-sm text-[#3c4954]">{status()?.phase==="paused"?"Resume":"Pause"}</Text><Text class="text-sm text-[#3c4954]">+10s</Text></View>
     <View class="absolute left-[8] right-[8] top-[134] h-[40] bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] flex-row justify-around items-center rounded-lg"><Text class="text-sm text-[#3c4954]">Vol -</Text><Text class="text-sm text-[#008ab3]">{Math.round(volume()*100)}%</Text><Text class="text-sm text-[#3c4954]">Vol +</Text></View>
     <View class="absolute left-[8] right-[8] top-[180] h-[40] bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] flex-row justify-around items-center rounded-lg"><Text class="text-sm text-[#3c4954]">Browse</Text><Text class="text-sm text-[#3c4954]">Stop</Text></View>
   </Show>
   <Text class="absolute left-[6] top-[223] text-xs text-[#6a7680]">{label(message()||`${connected()?"Online":"Offline"} / A: open / Y: continue / SELECT: player`)}</Text>
   <Show when={osk.isOpen()}><View class="absolute inset-0 bg-[#f5f5f5] flex-col justify-end"><Text class="text-sm text-[#3c4954]">{osk.display()}</Text><Osk osk={osk} surface="auxiliary" keyHeight={25} theme="light" /></View></Show>
 </View>}</AuxiliarySurface>
 </>;
}
mount(()=><App/>);
