// @ts-nocheck
/** Separate-process worker. Run on a disk-backed VPS, NOT the website container (unless the website has enough memory; see embeddedRenderWorker.ts). */
import mysql from 'mysql2/promise';
import { renderReel } from './elevay-reel-render.mjs';
import { createRenderWorker } from '../server/commandCenter/renderWorkerCore';

const args=process.argv.slice(2);
const allowed=(args.find(a=>a.startsWith('--runs='))||'').slice(7).split(',').filter(Boolean).map(Number);
const once=args.includes('--once');
const root=process.env.ELEVAY_RENDER_WORK_DIR||'/var/tmp/elevay-render-worker';
const pool=mysql.createPool(process.env.DATABASE_URL);
const q=async(sql,a=[])=> (await pool.query(sql,a))[0];
const worker=createRenderWorker({q,root,renderReel});

async function main(){
  do{
    const did=await worker.runNext(allowed);
    if(once) break;
    if(!did) await new Promise(r=>setTimeout(r,5000));
  }while(true);
}
main().catch(e=>{console.error('Worker failed: '+String(e.code||e.message).slice(0,200));process.exitCode=1;}).finally(()=>pool.end());
