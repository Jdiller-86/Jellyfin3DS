import {test,expect} from "bun:test";
import {nativeFit,accessUnits,nativeMedia} from "../host/native-media.ts";
import {mkdirSync} from "node:fs";
test("letterboxing maps square and widescreen sources to native decoder plane",()=>{expect(nativeFit(400,240)).toEqual({w:512,h:256});expect(nativeFit(1920,1080).h).toBe(240);expect(nativeFit(1,1).w).toBe(306);});
test("Annex B delimiters survive single-byte network chunks",async()=>{
 const source=new Uint8Array([0,0,0,1,9,240,0,0,1,1,30,0,0,0,1,9,240,0,0,1,1,31]);
 async function* chunks(){for(const byte of source)yield new Uint8Array([byte]);}
 const units=[];for await(const unit of accessUnits(chunks()))units.push(unit);expect(units.length).toBe(2);expect(units[0].length+units[1].length).toBe(source.length);
});
test("FFmpeg generates bounded H264 and audio for real media, including silent video",async()=>{
 if(!Bun.which("ffmpeg"))return;
 mkdirSync(".pocket-build",{recursive:true});const path=".pocket-build/test.mp4";
 const child=Bun.spawn(["ffmpeg","-y","-v","error","-f","lavfi","-i","testsrc2=size=320x180:rate=30","-t","0.4","-c:v","libx264",path],{stdout:"ignore",stderr:"pipe"});expect(await child.exited).toBe(0);
 const controller=new AbortController();let video=0,audio=0;
 for await(const packet of nativeMedia({videoUrl:path,audioUrl:path,width:320,height:180,hasAudio:false},0,controller.signal)){
   expect(packet.data.length).toBeLessThanOrEqual(128*1024);if(packet.kind===1)video++;if(packet.kind===2)audio++;
 }
 expect(video).toBe(12);expect(audio).toBeGreaterThan(0);
},20000);
