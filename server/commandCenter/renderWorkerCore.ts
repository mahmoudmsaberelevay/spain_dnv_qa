// @ts-nocheck
/**
 * Render-worker core shared by the separate worker process (scripts/elevay-render-worker.ts) and the
 * optional embedded worker inside the website (embeddedRenderWorker.ts). Leases one ec_render_jobs row
 * at a time, renders it single-threaded on disk, stores every piece, then the final MP4 and QC sheets.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { storagePutFile } from '../storage';
import { notifyAiFailure } from './alerts';

export function createRenderWorker({ q, root, renderReel, owner = crypto.randomUUID(), log = console.log, logError = console.error }) {
  const console = { log, error: logError };
  async function sheets(file, directory) {
    const pattern=path.join(directory,'qc-%03d.jpg');
    const bin=process.env.ELEVAY_FFMPEG_BIN||'/usr/bin/ffmpeg';
    await new Promise((resolve,reject)=>{
      const c=spawn(bin,['-y','-hide_banner','-loglevel','error','-threads','1','-i',file,'-vf','trim=duration=20,fps=30,scale=360:640:flags=bicubic,tile=4x2:nb_frames=8','-frames:v','75','-q:v','3','-threads','1','-filter_threads','1',pattern],{stdio:['ignore','ignore','pipe']});
      let err='';const t=setTimeout(()=>c.kill('SIGKILL'),180000);
      c.stderr.on('data',d=>err=(err+d).slice(-500));c.on('error',reject);c.on('close',code=>{clearTimeout(t);code===0?resolve():reject(new Error('Final frame-sheet extraction failed: '+err));});
    });
    const names=(await fsp.readdir(directory)).filter(n=>/^qc-\d+\.jpg$/.test(n)).sort();
    if(names.length!==75)throw new Error('All 600 narrative frames must be represented in 75 QC sheets.');
    const evidence = names.map((n,i)=>({file:path.join(directory,n),label:`Sheet ${i+1}: chronological frames ${i*8+1}–${i*8+8}, row-major, t=${(i*8/30).toFixed(3)}–${((i*8+7)/30).toFixed(3)} s. Scene = floor(t/5)+1.`}));
    for (const [index,time] of [20.1,22.8].entries()) {
      const f = path.join(directory, `outro-qc-${index}.jpg`);
      await new Promise((resolve,reject)=>{
        const c=spawn(bin,['-y','-hide_banner','-loglevel','error','-threads','1','-ss',String(time),'-i',file,'-frames:v','1','-vf','scale=540:960','-threads','1','-filter_threads','1',f],{stdio:'ignore'});
        c.on('error',reject);c.on('close',code=>code===0?resolve(undefined):reject(new Error('Outro review extraction failed.')));
      });
      evidence.push({file:f,label:`Outro frame at ${time}s: exact official logo centered on pure white; no narration here.`});
    }
    return evidence;
  }
  async function processJob(row) {
    let doc=JSON.parse(row.doc);
    const dir=path.join(root,row.id);
    await fsp.mkdir(dir,{recursive:true});
    const persist=async()=>{
      const r=await q("UPDATE ec_render_jobs SET doc=?,updated_at=?,lease_until=? WHERE id=? AND lease_owner=? AND status='running'",[JSON.stringify(doc),Date.now(),Date.now()+900000,row.id,owner]);
      if(r.affectedRows!==1)throw new Error('Render lease lost; stopping without overwriting another worker.');
    };
    const heartbeat=setInterval(()=>persist().catch(()=>{}),30000);
    try{
      console.log(`Render #${row.run_id}: saved inputs only, threads=1, disk directory=${dir}`);
      if (!doc.manifest?.outroUrl) throw new Error('Waiting for the required fixed ELEVAYEXTRO.mov; no logo-image fallback is permitted.');
      const result=await renderReel({manifest:doc.manifest,directory:dir,savedParts:doc.parts,
        onPart:async({name,file,type,sha256,metrics})=>{
          const stored=await storagePutFile(`marketing/command-center/render-worker/${row.id}/${sha256.slice(0,24)}-${name}`,file,type);
          doc.parts={...doc.parts,[name]:stored.url};doc.metrics=metrics;doc.stage=name;await persist();console.log(`Render #${row.run_id}: ${name} stored`);return stored;
        },onProgress:async({stage,parts,metrics})=>{doc.parts={...doc.parts,...parts};doc.metrics=metrics;doc.stage=stage;await persist();}
      });
      const stored=await storagePutFile(`marketing/command-center/render-worker/${row.id}/${result.final.sha256.slice(0,24)}-final.mp4`,result.final.file,'video/mp4');
      doc.stage='final visual evidence';await persist();
      const evidence=await sheets(result.final.file,dir);
      const qcFrames=[];
      const previousFrames = doc.final?.qcFrames || [];
      for(let i=0;i<evidence.length;i++){
        const e=evidence[i];if(i<75 && previousFrames[i]){qcFrames.push(previousFrames[i]);continue;}const s=await storagePutFile(`marketing/command-center/render-worker/${row.id}/qc-${i+1}.jpg`,e.file,'image/jpeg');qcFrames.push({url:s.url,label:e.label});
        if((i+1)%15===0)console.log(`Render #${row.run_id}: ${i+1}/75 full-frame QC sheets stored`);
      }
      const {file,...final}=result.final;
      final.peakRssBytes = Math.max(final.peakRssBytes, doc.final?.peakRssBytes || 0);
      final.peakFfmpegRssBytes = Math.max(final.peakFfmpegRssBytes, doc.final?.peakFfmpegRssBytes || 0);
      final.metrics.peakRssBytes = final.peakRssBytes; final.metrics.peakFfmpegRssBytes = final.peakFfmpegRssBytes;
      doc.final={...final,url:stored.url,qcFrames};doc.parts.final=stored.url;doc.stage='done';doc.metrics=final.metrics;
      await q("UPDATE ec_render_jobs SET status='done',doc=?,updated_at=?,lease_until=0 WHERE id=? AND lease_owner=?",[JSON.stringify(doc),Date.now(),row.id,owner]);
      await fsp.writeFile(path.join(dir,'result.json'),JSON.stringify(doc,null,2)+'\n');
      console.log(JSON.stringify({runId:row.run_id,status:'done',seconds:final.seconds,peakRssBytes:final.peakRssBytes,peakFfmpegRssBytes:final.peakFfmpegRssBytes,output:result.final.file}));
    }catch(e){
      const failedStage = doc.stage;
      doc.error=String(e.message||e).replace(/https?:\/\/\S+/g,'[asset]').slice(0,1800);doc.stage='failed';
      const attempts = Number(row.attempts || 0) + 1;
      if (attempts <= 3) {
        doc.retryAt = Date.now() + 120000; doc.stage = 'retry_wait';
        await q("UPDATE ec_render_jobs SET status='pending',doc=?,updated_at=?,lease_until=?,lease_owner=NULL WHERE id=? AND lease_owner=?",[JSON.stringify(doc),Date.now(),doc.retryAt,row.id,owner]);
        console.error(`Render #${row.run_id}: attempt ${attempts} failed; saved parts retained, retry in two minutes.`);
      } else {
        doc.notification = await notifyAiFailure({runId:row.run_id,stepName:`Final edit — ${failedStage}`,reason:doc.error});
        await q("UPDATE ec_render_jobs SET status='failed',doc=?,updated_at=?,lease_until=0 WHERE id=? AND lease_owner=?",[JSON.stringify(doc),Date.now(),row.id,owner]);
        console.error(`Render #${row.run_id} failed after three automatic retries: ${doc.error}`);
      }
    }finally{clearInterval(heartbeat);}
  }

  /** Claims and renders the oldest available job. Returns true when a job was processed. */
  async function runNext(allowed = []) {
    const filter=allowed.length?` AND run_id IN (${allowed.map(()=>'?').join(',')})`:'';
    const rows=await q(`SELECT * FROM ec_render_jobs WHERE ((status='pending' AND lease_until<=?) OR (status='running' AND lease_until<?))${filter} ORDER BY created_at LIMIT 1`,[Date.now(),Date.now(),...allowed]);
    if(!rows.length) return false;
    const row=rows[0];
    const r=await q("UPDATE ec_render_jobs SET status='running',lease_owner=?,lease_until=?,attempts=attempts+1 WHERE id=? AND ((status='pending' AND lease_until<=?) OR (status='running' AND lease_until<?))",[owner,Date.now()+900000,row.id,Date.now(),Date.now()]);
    if(r.affectedRows!==1) return true;
    await fsp.mkdir(root,{recursive:true});
    await processJob(row);
    return true;
  }
  return { runNext, processJob, owner };
}
