// @ts-nocheck
/** Explicit owner-requested finite run, never deployed or scheduled as a production worker. */
import mysql from 'mysql2/promise';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createOrchestrator,makeProviders} from '../server/commandCenter/ai';
import {createRenderQueue} from '../server/commandCenter/renderQueue';
import {notifyAiFailure} from '../server/commandCenter/alerts';
import E from '../server/commandCenter/engine';
import R from '../server/commandCenter/rules';
const root='/home/ubuntu/elevay-w41-rebuild';
const manifestFile=path.join(root,'manifest.json');
const allowed=new Set(['2026-W41-02','2026-W41-04','2026-W41-07']);
const owner={email:'mahmoud.saber@elevay.com',role:'owner'};
const pool=mysql.createPool(process.env.DATABASE_URL);
const q=async(s,a=[])=> (await pool.query(s,a))[0];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clean=e=>String(e?.message||e).replace(/https?:\/\/\S+/g,'[asset]').slice(0,600);
async function loadState(){const m=(await q('SELECT doc FROM ec_meta WHERE id=1'))[0];return {state:{...E.emptyState(),...JSON.parse(m.doc),items:(await q('SELECT doc FROM ec_items')).map(x=>JSON.parse(x.doc)),jobs:(await q("SELECT doc FROM ec_jobs WHERE id LIKE 'REV-W41-%'")).map(x=>JSON.parse(x.doc)),audit:[]}};}
async function mutate(_ctx,fn){
 const c=await pool.getConnection();try{
  await c.beginTransaction();const [rows]=await c.query("SELECT item_id,doc FROM ec_items WHERE item_id LIKE '2026-W41-%' FOR UPDATE");
  const m=(await c.query('SELECT doc FROM ec_meta WHERE id=1'))[0][0];
  const jobs=(await c.query("SELECT doc FROM ec_jobs WHERE id LIKE 'REV-W41-%' FOR UPDATE"))[0].map(x=>JSON.parse(x.doc));
  const state={...E.emptyState(),...JSON.parse(m.doc),items:rows.map(x=>JSON.parse(x.doc)),jobs,audit:[]};
  const before=new Map(state.items.map(i=>[i.item_id,JSON.stringify(i)]));
  const r=await fn(state);if(r?.ok===false){await c.rollback();return r;}
  if(state.jobs.some(j=>j.type!=='revise_item'||!allowed.has(j.payload?.item_id)||!j.payload?.owner_authorized))throw new Error('Finite W41 rebuild forbids publishing/scheduling or external job dispatch.');
  for(const i of state.items)if(before.get(i.item_id)!==JSON.stringify(i)){
   if(!allowed.has(i.item_id))throw new Error('Attempted unrelated item mutation.');
   if(i.revision_status==='owner_approved') { if(!['published','scheduled'].includes(i.status))i.status='revision_approved'; i.publish={...i.publish,revision_hold:{active:true,version:i.version,set_at:new Date().toISOString(),set_by:owner.email,reason:'W41 content revision approved; no Meta publication authorized.'}}; }
   await c.query('UPDATE ec_items SET doc=?,updated_at=? WHERE item_id=?',[JSON.stringify(i),new Date().toISOString(),i.item_id]);
  }
  for(const a of state.audit)await c.query('INSERT INTO ec_audit (at,doc) VALUES (?,?)',[a.at,JSON.stringify(a)]);
  for(const j of state.jobs)await c.query('UPDATE ec_jobs SET doc=? WHERE id=?',[JSON.stringify(j),j.id]);
  await c.commit();return r;
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}
const queue=createRenderQueue(q),providers=makeProviders(fetch,queue);
const rawCompose=providers.composeReelStep;providers.composeReelStep=x=>rawCompose({...x,musicUrl:null});
const o=createOrchestrator({q,loadState,mutate,providers,E,R,allowSandboxRuns:true,notifyFailure:notifyAiFailure,liveReport:async()=>{throw new Error('No Meta/CRM reporting in W41 rebuild.');}});
async function renderOnce(id){
 const env={...process.env,ELEVAY_REEL_THREADS:'1',ELEVAY_RENDER_WORK_DIR:path.join(root,'renders'),OMP_NUM_THREADS:'1'};
 await new Promise((resolve,reject)=>{const child=spawn('pnpm',['exec','tsx','scripts/elevay-render-worker.ts','--once',`--runs=${id}`],{cwd:'/home/ubuntu/spain_dnv_qa',env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>process.stdout.write(d));child.stderr.on('data',d=>process.stdout.write(d));child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('Finite render worker failed: '+code)));});
}
async function main(){
 await fsp.mkdir(root,{recursive:true});await queue.ensure();
 let manifest;try{manifest=JSON.parse(await fsp.readFile(manifestFile,'utf8'));}catch{manifest={week:'2026-W41',createdAt:new Date().toISOString(),items:[]};}
 for(const itemId of allowed){
  let entry=manifest.items.find(i=>i.itemId===itemId);
  if(!entry){
   const item=JSON.parse((await q('SELECT doc FROM ec_items WHERE item_id=?',[itemId]))[0].doc);
   const request=`Rebuild this W41 reel completely FROM SCRATCH. Topic: ${item.topic}. Program: ${item.program}. Preserve its topic, objective and original scheduled posting time, but write a fresh distinct 4-scene storyboard, a 100–150 word Modern Standard Arabic caption and natural Egyptian Arabic voice-over. All people Arab/Middle Eastern, modern elegant Western attire, explicitly uncovered hair, no headscarves or traditional accessories, proper leather formal shoes. Each motion prompt must be detailed 2–4 sentences, one restrained action, coherent identity and wardrobe within each 5-second scene. Narration short: 7–10 words, including a natural Egyptian marker in every scene, fits below 4.85 seconds without rushing. Country and ELEVAY names in English, all other speech Arabic. No text in footage, no passports, contacts, flags or guarantees. Do not reuse previous storyboard, keyframes, clips or voices. Existing schedule: ${JSON.stringify(item.publish)}.`;
   const run=await o.create({kind:'reel',request,options:{sandboxOnly:true,week:'2026-W41',program:item.program,datetime_cairo:item.publish?.datetime_cairo||'',manualReviewOnly:true,revision:{itemId,baseVersion:item.version,scope:'all',request:'Owner requested full W41 reel rebuild using new seven-step pipeline.'}},user:owner});
   entry={itemId,runId:run.id,baseVersion:item.version};manifest.items.push(entry);await fsp.writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');
   console.log(`Created isolated rebuild #${run.id} for ${itemId} v${item.version+1}.`);
  }
  const jobId=`REV-W41-${itemId.slice(-2)}-${entry.runId}`;
  const job={id:jobId,type:'revise_item',status:'in_progress',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),created_by:owner.email,payload:{item_id:itemId,base_version:entry.baseVersion,from_version:entry.baseVersion,scope:'whole_concept',owner_authorized:true,run_id:String(entry.runId),comment:'Owner requested all W41 reels from scratch; preserve previous versions.'},manus:{task_id:null,push_attempted:true},history:[],result:null};
  await q('INSERT IGNORE INTO ec_jobs (id,created_at,doc) VALUES (?,?,?)',[jobId,job.created_at,JSON.stringify(job)]);
  const current=await o.get(entry.runId);if(current.status==='failed' && current.steps.find(s=>s.status==='failed')?.action==='to_weekly_plan')await o.retry(current.id,owner);
  const start=Date.now();let lastRenderAt=0;
  while(Date.now()-start<5400000){
   const run=await o.get(entry.runId);entry.status=run.status;entry.step=run.steps.find(s=>!['done','skipped'].includes(s.status))?.action;
   console.log(`${itemId} · run #${run.id} · ${run.status} · ${entry.step||'finished'} · elapsed ${Math.round((Date.now()-start)/1000)}s`);
   if(['done','failed','needs_review','cancelled'].includes(run.status)){
    entry.final=run.artifacts.final?{url:run.artifacts.final.url,seconds:run.artifacts.final.seconds,peakRssBytes:run.artifacts.final.peakRssBytes,peakFfmpegRssBytes:run.artifacts.final.peakFfmpegRssBytes,renderJobId:run.artifacts.final.renderJobId}:null;
    entry.review=run.artifacts.final_qc||null;entry.error=run.steps.find(s=>['failed','needs_review'].includes(s.status))?.error||null;
    entry.generated={keyframes:run.artifacts.keyframes?.length||0,clips:run.artifacts.clips?.length||0,voices:run.artifacts.voices?.length||0,repairRounds:run.artifacts.repair_rounds||0};
    break;
   }
   const step=run.steps.find(s=>!['done','skipped'].includes(s.status));
   if(step?.action==='compose_reel' && step.status==='waiting' && Date.now()-lastRenderAt>10000){await renderOnce(run.id);lastRenderAt=Date.now();}
   if(!['running','sandbox_running'].includes(run.status))await o.resume(run.id);
   await fsp.writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');await sleep(15000);
  }
  await fsp.writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');
 }
 console.log('W41 finite rebuild completed.');console.log(JSON.stringify(manifest.items.map(i=>({itemId:i.itemId,runId:i.runId,status:i.status,error:i.error,peakRssBytes:i.final?.peakRssBytes})),null,2));
}
main().catch(e=>{console.error('W41 rebuild stopped: '+clean(e));process.exitCode=1;}).finally(()=>pool.end());
