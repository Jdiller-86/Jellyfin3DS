import {test,expect} from "bun:test";
import {createWasmUi} from "../vendor/pocketjs/hosts/web/wasm-ops.js";
import {__packTouch} from "../vendor/pocketjs/framework/src/touch.ts";
import {encodePNG} from "../vendor/pocketjs/tests/png.ts";
import {mkdirSync} from "node:fs";
test("compiled direct client browses, plays, pauses, seeks, searches and restarts",async()=>{
 const wasm=await createWasmUi(await Bun.file("vendor/pocketjs/hosts/web/pocketjs.wasm").arrayBuffer(),{width:400,height:240});wasm.createAuxiliarySurface(320,240);
 const g=globalThis as any,replies:string[]=[],commands:any[]=[];
 let session=1,signedIn=false,opened=0,position=0,phase="idle";
 const rows=Array.from({length:5},(_,i)=>({id:`a${i}`,name:["Big Buck Bunny","Sintel","Tears of Steel","Cosmos - The shore of the cosmic ocean","Planet Earth - From pole to pole"][i],type:"Movie",folder:false,seconds:600,resume:12,played:false,year:2024}));
 const texture=wasm.ops.uploadTexture(new Uint8Array(512*256*4).fill(100),512,256,3);
 g.ui=wasm.ops;g.__pak=await Bun.file("vendor/pocketjs/dist/3ds/guest/jellyfin3ds.pak").arrayBuffer();
 g.offload={session:()=>session,take:()=>replies.shift(),submit:(raw:string)=>{const r=JSON.parse(raw),c=JSON.parse(r.payload);commands.push(c);let value:any={};
 if(c.t==="hello")value={direct:true,authenticated:signedIn,server:"http://jellyfin.local:8096",username:"Mii"};if(c.t==="list")value={items:rows,total:10,offset:c.offset};if(c.t==="play"){position=c.seconds;value={source:{host:"127.0.0.1",port:1,token:"0".repeat(64)},seconds:600,position};}
 replies.push(JSON.stringify({id:r.id,payload:JSON.stringify(value)}));return true;}};
 g.media={open:()=>{opened++;phase="playing";return true;},close:()=>{phase="idle";},paused:(v:boolean)=>phase=v?"paused":"playing",volume:()=>{},texture:()=>texture,status:()=>JSON.stringify({phase,positionMs:position*1000,bufferedMs:1000,decodedFrames:opened?1:0,presentedFrames:phase!=="idle"?1:0,droppedFrames:0,receivedBytes:0,decodeMaxUs:0,audioUnderruns:0,hardware:true,videoWidth:400,videoHeight:224,error:""})};
 (0,eval)(await Bun.file("vendor/pocketjs/dist/3ds/guest/jellyfin3ds.js").text());
 const step=(n=12,x?:number,y?:number,buttons=0)=>{for(let i=0;i<n;i++){g.frame(buttons,undefined,x===undefined?[]:[__packTouch(1,x,y!)],x===undefined?[]:[wasm.ops.hitTestBoundsAuxiliary!(x,y!)],x===undefined?[]:[1]);wasm.tick();}};
 const tap=(x:number,y:number)=>{step(3,x,y);step();};const press=(b:number)=>{step(1,undefined,undefined,b);step();};
 mkdirSync(".pocket-build/validation/ui",{recursive:true});
 const capture=async(name:string)=>{await Bun.write(`.pocket-build/validation/ui/${name}-top.png`,encodePNG(wasm.render().slice(),400,240));await Bun.write(`.pocket-build/validation/ui/${name}-bottom.png`,encodePNG(wasm.renderAuxiliary().slice(),320,240));};
 step(30);expect(commands.some(c=>c.t==="list")).toBe(false);await capture("setup");
 signedIn=true;session=0;step();session=2;step(30);expect(commands.some(c=>c.t==="list")).toBe(true);await capture("browse");
 press(0x1);await capture("account");press(0x4000);
 press(0x20);expect(commands.filter(c=>c.t==="list").at(-1).offset).toBe(5);
 tap(60,62);await capture("detail");press(0x2000);expect(opened).toBe(1);expect(position).toBe(12);await capture("player");
 press(0x8);expect(phase).toBe("paused");press(0x8);expect(phase).toBe("playing");
 press(0x200);expect(opened).toBe(2);expect(position).toBe(22);
 press(0x1);await capture("playing-browse");press(0x1000);await capture("keyboard");press(0x4000); // cancel keyboard
 session=0;step();expect(phase).toBe("idle");session=3;step(30);expect(commands.filter(c=>c.t==="hello")).toHaveLength(3);
},30000);
