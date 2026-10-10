// @ts-nocheck
import mysql from 'mysql2/promise';
import fs from 'node:fs/promises';
import {makeProviders,ELEVAY_RULES} from '../server/commandCenter/ai';
const p=mysql.createPool(process.env.DATABASE_URL),q=async(s,a=[])=> (await p.query(s,a))[0];
async function main(){
 const file='/home/ubuntu/elevay-w41-rebuild/manifest.json';const m=JSON.parse(await fs.readFile(file,'utf8'));
 for(const entry of m.items){
  const jobId=`REV-W41-${entry.itemId.slice(-2)}-${entry.runId}`;
  const job={id:jobId,type:'revise_item',status:'in_progress',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),created_by:'mahmoud.saber@elevay.com',payload:{item_id:entry.itemId,base_version:entry.baseVersion,from_version:entry.baseVersion,scope:'whole_concept',owner_authorized:true,run_id:String(entry.runId),comment:'Owner requested all W41 reels from scratch; preserve previous versions.'},manus:{task_id:null,push_attempted:true},history:[],result:null};
  await q('INSERT IGNORE INTO ec_jobs (id,created_at,doc) VALUES (?,?,?)',[jobId,job.created_at,JSON.stringify(job)]);
  const row=(await q('SELECT ver,doc FROM ec_ai_runs WHERE id=?',[entry.runId]))[0];const d=JSON.parse(row.doc);const sb=d.artifacts.brief?.reel?.storyboard;
  if(!sb || d.artifacts.voices?.length)continue;
  const providers=makeProviders();const invalid=[];for(let i=0;i<4;i++){try{if(!sb[i]?.spoken_text_ar)throw new Error('missing');await providers.checkEgyptianScript(sb[i].spoken_text_ar);}catch{invalid.push(i);}}
  if(invalid.length){const r=await providers.claude({system:ELEVAY_RULES,prompt:`Correct ONLY missing/non-Egyptian script lines for scenes ${invalid.map(i=>i+1).join(',')}. Keep every scene visual and all topics unchanged. Natural Egyptian Arabic, 7–9 words per scene, include خلينا or تقدر or بنراجع or معاك or علشان or دلوقتي in each. Only ELEVAY and country names English. No promises, no تأشيرة. Current scenes: ${JSON.stringify(sb)}. Return JSON {"scenes":[{"scene":1,"spoken_text_ar":"..."}]} ONLY specified scene numbers.`,maxTokens:1000});
   for(const s of r.data?.scenes||[])if(invalid.includes(s.scene-1))sb[s.scene-1].spoken_text_ar=s.spoken_text_ar;
   for(const s of sb)await providers.checkEgyptianScript(s.spoken_text_ar);
   const current=(await q('SELECT ver,doc FROM ec_ai_runs WHERE id=?',[entry.runId]))[0];const latest=JSON.parse(current.doc);
   if(latest.artifacts.voices?.length)throw new Error('Voice generation already started; refusing concurrent script change.');
   latest.artifacts.brief.reel.storyboard=sb;
   latest.messages.push({at:new Date().toISOString(),from:'claude',to:'studio',text:'Repaired only incomplete/non-Egyptian spoken script lines before ElevenLabs. All keyframes and clips preserved.'});
   const res=await q('UPDATE ec_ai_runs SET doc=?,ver=ver+1 WHERE id=? AND ver=?',[JSON.stringify(latest),entry.runId,current.ver]);if(res.affectedRows!==1)throw new Error('Run changed during script repair.');
   console.log(`W41 ${entry.itemId}: corrected script-only scenes ${invalid.map(i=>i+1).join(',')}; assets retained.`);
  }
  console.log(`Bound durable owner revision job ${jobId}.`);
 }
}
main().catch(e=>{console.error(String(e.message).replace(/https?:\/\/\S+/g,'[asset]'));process.exitCode=1;}).finally(()=>p.end());
