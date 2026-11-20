import {test,expect} from "bun:test";
import {createWasmUi} from "../vendor/pocketjs/hosts/web/wasm-ops.js";
import {__packTouch} from "../vendor/pocketjs/framework/src/touch.ts";
import {encodePNG} from "../vendor/pocketjs/tests/png.ts";
import {mkdirSync} from "node:fs";
test("compiled direct client browses, plays, pauses, seeks, searches and restarts",async()=>{
 const wasm=await createWasmUi(await Bun.file("vendor/pocketjs/hosts/web/pocketjs.wasm").arrayBuffer(),{width:400,height:240});wasm.createAuxiliarySurface(320,240);
 const g=globalThis as any,replies:string[]=[],commands:any[]=[];
 let keyboardAccept=true;
 let session=1,signedIn=false,opened=0,position=0,phase="idle",currentQuality="standard";
 const rows=Array.from({length:50},(_,i)=>({id:`a${i}`,name:["Big Buck Bunny","Sintel","Tears of Steel","Cosmos - The shore of the cosmic ocean","Planet Earth - From pole to pole"][i%5],type:"Movie",folder:false,seconds:600,resume:12,played:false,year:2024}));
 const texture=wasm.ops.uploadTexture(new Uint8Array(512*256*4).fill(100),512,256,3);
 const pixels=new Uint8Array(256*256*4);
 for(let y=0;y<144;y++)for(let x=0;x<256;x++){const i=(y*256+x)*4;pixels[i]=x;pixels[i+1]=y;pixels[i+2]=180;pixels[i+3]=255;}
 const artTexture=wasm.ops.uploadTexture(pixels,256,256,3); expect(artTexture).toBeGreaterThanOrEqual(0);
 g.ui=wasm.ops;g.__pak=await Bun.file("vendor/pocketjs/dist/3ds/guest/jellyfin3ds.pak").arrayBuffer();
 g.offload={session:()=>session,take:()=>replies.shift(),submit:(raw:string)=>{const r=JSON.parse(raw),c=JSON.parse(r.payload);commands.push(c);let value:any={};
 if(c.t==="keyboard")value={accepted:keyboardAccept,value:c.field==="search"?"Cosmos":c.field==="server"?"http://new-server:8096":c.value};
 if(c.t==="info")value={overview:"A young rabbit leaves his home and explores a colorful world.",rating:"PG",genre:"Animation"};if(c.t==="art")value=c.preload?{cached:true}:c.candidate===0?{handle:-1,next:1,error:"Artwork unavailable"}:{handle:artTexture,width:256,height:256};if(c.t==="hello")value={direct:true,authenticated:signedIn,server:"http://jellyfin.local:8096",username:"Mii",newModel:true};if(c.t==="list")value={items:rows.slice(c.offset,c.offset+5),total:50,offset:c.offset};if(c.t==="play"){position=c.seconds;currentQuality=c.quality;value={source:{host:"127.0.0.1",port:1,token:"0".repeat(64)},seconds:600,position,profile:{quality:c.quality,videoKbps:c.quality==="native"?850:c.quality==="high"?320:192,audioKbps:64,maxWidth:c.quality==="native"?400:256,maxHeight:c.quality==="native"?240:144,maxFps:c.quality==="native"?30:12,hardware:false}};}
 replies.push(JSON.stringify({id:r.id,payload:JSON.stringify(value)}));return true;}};
 g.media={open:()=>{opened++;phase="playing";return true;},close:()=>{phase="idle";},paused:(v:boolean)=>phase=v?"paused":"playing",volume:()=>{},texture:()=>texture,status:()=>JSON.stringify({phase,positionMs:position*1000,bufferedMs:1000,decodedFrames:opened?1:0,presentedFrames:phase!=="idle"?1:0,droppedFrames:0,receivedBytes:0,decodeMaxUs:0,audioUnderruns:0,hardware:false,videoWidth:currentQuality==="native"?400:256,videoHeight:currentQuality==="native"?240:144,displayFps:currentQuality==="native"?29.7:11.8,error:""})};
 (0,eval)(await Bun.file("vendor/pocketjs/dist/3ds/guest/jellyfin3ds.js").text());
 const step=(n=12,x?:number,y?:number,buttons=0)=>{for(let i=0;i<n;i++){g.frame(buttons,undefined,x===undefined?[]:[__packTouch(1,x,y!)],x===undefined?[]:[wasm.ops.hitTestBoundsAuxiliary!(x,y!)],x===undefined?[]:[1]);wasm.tick();}};
 const tap=(x:number,y:number)=>{step(3,x,y);step();};const press=(b:number)=>{step(1,undefined,undefined,b);step();};
 mkdirSync(".pocket-build/validation/ui",{recursive:true});
 const capture=async(name:string)=>{await Bun.write(`.pocket-build/validation/ui/${name}-top.png`,encodePNG(wasm.render().slice(),400,240));await Bun.write(`.pocket-build/validation/ui/${name}-bottom.png`,encodePNG(wasm.renderAuxiliary().slice(),320,240));};
 step(30);expect(commands.some(c=>c.t==="list")).toBe(false);await capture("setup");
 tap(70,60);expect(commands.at(-1).t).toBe("keyboard");expect(commands.at(-1).field).toBe("server");
 keyboardAccept=false;tap(70,60);expect(commands.at(-1).value).toBe("http://new-server:8096");
 tap(70,60);expect(commands.at(-1).value).toBe("http://new-server:8096");
 tap(70,145);expect(commands.at(-1).field).toBe("password");

 signedIn=true;session=0;step();session=2;step(30);expect(commands.some(c=>c.t==="list")).toBe(true);await capture("browse");
 press(0x1);await capture("account");press(0x4000);
 for(let i=0;i<5;i++)press(0x40);expect(commands.filter(c=>c.t==="list").some(c=>c.offset===5)).toBe(true);
 step(90);expect(commands.some(c=>c.t==="art" && c.candidate===1)).toBe(true);expect(commands.some(c=>c.preload)).toBe(true);
 expect(commands.some(c=>c.t==="info")).toBe(true);
 // Drag with intermediate positions, then release and allow inertial movement.
 const before=wasm.renderAuxiliary().slice();step(2,150,166);step(1,150,155);step(1,150,139);step(1,150,121);step(1,150,100);step(1,150,83);step(90);
 expect(wasm.renderAuxiliary().slice()).not.toEqual(before);
 await capture("scrolled");
 tap(60,62);tap(60,62);await capture("detail");
 press(0x40);press(0x40);press(0x2000);expect(opened).toBe(0); // Back via D-pad.
 press(0x2000);press(0x40);await capture("detail-focus");press(0x2000); // Start over.
 expect(opened).toBe(1);expect(position).toBe(0);await capture("player");
 const playsBeforeSeek=commands.filter(c=>c.t==="play").length;
 step(2,24,103);step(1,70,103);step(1,110,103);step(1,160,103);step();
 expect(commands.filter(c=>c.t==="play").length).toBe(playsBeforeSeek+1);
 expect(position).toBe(300);await capture("player-seek");
 press(0x8);expect(phase).toBe("paused");press(0x8);expect(phase).toBe("playing");
 press(0x200);expect(opened).toBe(3);expect(position).toBe(310);
 tap(56,195);await capture("stream-info");
 tap(266,164);expect(commands.filter(c=>c.t==="play").at(-1).quality).toBe("high");expect(opened).toBe(4);
 await capture("stream-high");tap(266,164);expect(commands.filter(c=>c.t==="play").at(-1).quality).toBe("native");expect(commands.filter(c=>c.t==="play").at(-1).seconds).toBe(310);expect(opened).toBe(5);await capture("stream-native");press(0x4000);
 press(0x4000);await capture("playing-browse");
 tap(225,205);press(0x2000);expect(phase).toBe("paused");press(0x2000);expect(phase).toBe("playing");
 expect(opened).toBe(5);press(0x4000); // Back to browsing without reopening playback.
 press(0x1000);expect(commands.filter(c=>c.t==="keyboard").at(-1).field).toBe("search"); // OS cancellation is mocked.
 keyboardAccept=true;press(0x1000);expect(commands.filter(c=>c.t==="list").at(-1).query).toBe("Cosmos");
 session=0;step();expect(phase).toBe("idle");session=3;step(30);expect(commands.filter(c=>c.t==="hello")).toHaveLength(3);
},30000);
