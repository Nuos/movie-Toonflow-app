import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {inspectVideoFile} from "../src/utils/videoTechnicalAudit";

test("real decoding checks files without claiming creative or speech acceptance",async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),"toonflow-audit-"));
  try {
    const file=path.join(folder,"sample.mp4");
    execFileSync("ffmpeg",["-v","error","-f","lavfi","-i","testsrc2=size=64x96:rate=24","-t","1","-c:v","libx264","-y",file]);
    const good=await inspectVideoFile(file,{width:64,height:96,frames:24,fps:24,audio:false});
    assert.equal(good.status,"unverified");
    assert.match(good.mediaSha256,/^[a-f0-9]{64}$/);
    assert.equal(good.checks.find(c=>c.id==="decode")?.status,"pass");
    assert.equal(good.checks.find(c=>c.id==="duration")?.status,"pass");
    assert.equal(good.checks.find(c=>c.id==="action")?.status,"unverified");
    const mismatch=await inspectVideoFile(file,{width:96,height:64,frames:240,fps:24,audio:true});
    for(const id of ["dimensions","duration","audio"])assert.equal(mismatch.checks.find(c=>c.id===id)?.status,"fail");
    const broken=path.join(folder,"broken.mp4");await fs.writeFile(broken,"not a media file");
    const failed=await inspectVideoFile(broken,{});assert.equal(failed.status,"fail");
    assert.equal(failed.checks.find(c=>c.id==="speech")?.status,"unverified");
  } finally {await fs.rm(folder,{recursive:true,force:true});}
});
