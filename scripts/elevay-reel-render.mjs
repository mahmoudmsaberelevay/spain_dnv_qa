import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const THREADS = 1;
const FFMPEG = process.env.ELEVAY_FFMPEG_BIN || '/usr/bin/ffmpeg';
const FFPROBE = process.env.ELEVAY_FFPROBE_BIN || '/usr/bin/ffprobe';
const encode = ['-an','-c:v','libx264','-preset','veryfast','-tune','zerolatency','-profile:v','baseline','-crf','18','-g','150','-keyint_min','150','-sc_threshold','0','-bf','0','-pix_fmt','yuv420p','-threads',String(THREADS),'-x264-params','rc-lookahead=0:sync-lookahead=0:threads=1','-video_track_timescale','90000','-movflags','+faststart'];
const audioFormat = 'aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo';

export async function downloadFile(url, file, maxBytes = 100 * 1024 * 1024) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[|172\.(1[6-9]|2\d|3[01])\.)/i.test(u.hostname)) throw new Error('Render input must be a public HTTPS stored asset.');
  const r = await fetch(url, { signal: AbortSignal.timeout(120000), redirect: 'error' });
  if (!r.ok || !r.body) throw new Error(`Saved asset fetch failed (HTTP ${r.status}); no generation was attempted.`);
  const length = Number(r.headers.get('content-length'));
  if (length > maxBytes) throw new Error('Render asset exceeds its disk size cap.');
  let n = 0;
  await pipeline(Readable.fromWeb(r.body), new Transform({ transform(chunk, _, cb) { n += chunk.length; cb(n > maxBytes ? new Error('Render asset exceeds its disk size cap.') : null, chunk); } }), fs.createWriteStream(file));
  return file;
}

export async function shaFile(file) {
  const h = crypto.createHash('sha256');
  for await (const b of fs.createReadStream(file)) h.update(b);
  return h.digest('hex');
}

function rss(pid) {
  try { return Number(fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/^VmRSS:\s+(\d+)/m)?.[1] || 0) * 1024; } catch { return 0; }
}
function descendants(pid) {
  try { return fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean).flatMap(p => [Number(p), ...descendants(Number(p))]); } catch { return []; }
}
function memoryTree(pid) { return [pid, ...descendants(pid)].reduce((n, p) => n + rss(p), 0); }

export async function renderReel({ manifest, directory, logoFile, savedParts = {}, onPart = async () => {}, onProgress = async () => {} }) {
  await fsp.mkdir(directory, { recursive: true });
  const metrics = { method: 'Linux /proc RSS sampled every 25 ms; isolated worker and all child processes', peakRssBytes: 0, peakFfmpegRssBytes: 0, threads: THREADS, stages: [] };
  const sample = () => { metrics.peakRssBytes = Math.max(metrics.peakRssBytes, memoryTree(process.pid)); };
  const timer = setInterval(sample, 25); sample();
  const parts = { ...savedParts };
  const files = {};
  let stage = '';
  async function run(bin, args, timeout = 300000, capture = false) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { stdio: ['ignore', capture ? 'pipe' : 'ignore', 'pipe'], env: { ...process.env, ELEVAY_REEL_THREADS: '1', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1' } });
      let err = '', out = '';
      const t = setTimeout(() => child.kill('SIGKILL'), timeout);
      const m = setInterval(() => { sample(); metrics.peakFfmpegRssBytes = Math.max(metrics.peakFfmpegRssBytes, memoryTree(child.pid)); }, 25);
      child.stdout?.on('data', d => { out = (out + d).slice(-65536); });
      child.stderr.on('data', d => { err = (err + d).slice(-2500); });
      child.on('error', e => { clearTimeout(t); clearInterval(m); reject(e); });
      child.on('close', (code, signal) => { clearTimeout(t); clearInterval(m); sample(); metrics.stages.push({ stage, seconds: (Date.now()-started)/1000, code, signal }); code === 0 ? resolve(out) : reject(new Error(`${stage}: renderer ${signal || code}: ${err.replace(/https?:\/\/\S+/g, '[asset]').slice(-1800)}`)); });
    });
  }
  const ff = args => run(FFMPEG, ['-y','-hide_banner','-loglevel','error','-filter_threads','1','-filter_complex_threads','1', ...args]);
  async function probe(file) {
    const text = await run(FFPROBE, ['-v','error','-show_format','-show_streams','-of','json',file], 30000, true);
    return JSON.parse(text);
  }
  async function publish(name, file, type) {
    files[name] = file;
    const sha256 = await shaFile(file);
    const stored = await onPart({ name, file, type, sha256, metrics: { ...metrics } });
    parts[name] = stored?.url || file;
    await onProgress({ stage: name, parts, metrics });
  }
  async function restore(name, type) {
    if (!parts[name]) return false;
    const f = path.join(directory, `${name}.${type}`);
    if (String(parts[name]).startsWith('https:')) await downloadFile(parts[name], f);
    else await fsp.copyFile(parts[name], f);
    files[name] = f;
    return true;
  }
  try {
    for (let i = 0; i < 4; i++) {
      stage = `normalize scene ${i+1}`;
      if (await restore(`seg${i}`, 'mp4')) continue;
      const source = path.join(directory, `clip${i}.mp4`), out = path.join(directory, `seg${i}.mp4`);
      await downloadFile(manifest.clipUrls[i], source);
      await ff(['-threads','1','-i',source,'-vf','scale=1080:1920:force_original_aspect_ratio=increase:flags=bicubic,crop=1080:1920,setsar=1,fps=30,trim=duration=5,setpts=PTS-STARTPTS,format=yuv420p','-t','5',...encode,out]);
      const p = await probe(out), v = p.streams.find(s => s.codec_type === 'video');
      if (v?.width !== 1080 || v?.height !== 1920 || v.r_frame_rate !== '30/1' || Math.abs(Number(p.format.duration)-5) > 0.05) throw new Error(`Scene ${i+1} did not normalize to 1080x1920 / 30fps / 5 seconds.`);
      await publish(`seg${i}`, out, 'video/mp4');
      await fsp.rm(source, { force: true });
    }
    stage = 'white logo outro';
    if (!(await restore('outro', 'mp4'))) {
      const out = path.join(directory, 'outro.mp4');
      await ff(['-f','lavfi','-i','color=c=white:s=1080x1920:r=30:d=3','-threads','1','-loop','1','-framerate','30','-i',logoFile,'-filter_complex','[1:v]scale=300:-1:flags=lanczos[lg];[0:v][lg]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuv420p,setsar=1[v]','-map','[v]','-t','3',...encode,out]);
      await publish('outro', out, 'video/mp4');
    }
    stage = 'voice and music audio mix';
    let musicDropped = null;
    if (!(await restore('audio', 'm4a'))) {
      const voices = [], tempos = [];
      for (let i=0;i<4;i++) {
        const src=path.join(directory,`voice${i}.src`), wav=path.join(directory,`voice${i}.wav`);
        await downloadFile(manifest.voiceUrls[i],src,15*1024*1024);
        await ff(['-threads','1','-i',src,'-vn','-af',audioFormat,'-c:a','pcm_s16le',wav]);
        const d=Number((await probe(wav)).format.duration);
        if (!(d>0.2)) throw new Error(`Scene ${i+1} saved voice take is empty.`);
        const tempo=d>4.85?d/4.85:1;
        if (tempo>1.12) throw new Error(`Scene ${i+1} saved narration is ${d.toFixed(2)}s and cannot fit naturally; needs owner review, no regeneration performed.`);
        voices.push(wav);tempos.push(tempo);
        await fsp.rm(src,{force:true});
      }
      let musicFile=null;
      if(manifest.musicUrl) try { musicFile=path.join(directory,'music.src');await downloadFile(manifest.musicUrl,musicFile,25*1024*1024); } catch { musicDropped='Music source unavailable; saved voice takes retained.';musicFile=null; }
      const mix=async withMusic => {
        const args=voices.flatMap(f=>['-threads','1','-i',f]);
        if(withMusic)args.push('-stream_loop','-1','-threads','1','-i',musicFile);
        const filters=voices.map((_,i)=>`[${i}:a]${audioFormat},${tempos[i]>1?`atempo=${tempos[i].toFixed(5)},`:''}atrim=duration=4.85,adelay=${Math.round((i*5+0.1)*1000)}|${Math.round((i*5+0.1)*1000)},apad=whole_dur=23[n${i}]`);
        filters.push('[n0][n1][n2][n3]amix=inputs=4:duration=longest:normalize=0[voice]');
        if(withMusic) filters.push('[4:a]'+audioFormat+',atrim=duration=23,volume=0.16,afade=t=in:d=0.8,afade=t=out:st=20:d=3[bed]','[voice][bed]amix=inputs=2:duration=longest:normalize=0,atrim=duration=23,alimiter=limit=0.95[a]');
        else filters.push('[voice]atrim=duration=23,alimiter=limit=0.95[a]');
        await ff([...args,'-filter_complex',filters.join(';'),'-map','[a]','-t','23','-c:a','aac','-b:a','192k','-threads','1',path.join(directory,'audio.m4a')]);
      };
      if(musicFile)try{await mix(true);}catch{musicDropped='Music could not be mixed; finished with saved voice takes only.';await mix(false);}else await mix(false);
      await publish('audio',path.join(directory,'audio.m4a'),'audio/mp4');
      parts.music=!!musicFile&&!musicDropped; parts.musicDropped=musicDropped;
    }
    stage = 'stream-copy concat';
    const concat=path.join(directory,'concat.txt');
    await fsp.writeFile(concat,['seg0','seg1','seg2','seg3','outro'].map(n=>`file '${files[n].replace(/'/g,"'\\''")}'`).join('\n')+'\n');
    const joined=path.join(directory,'joined.mp4');
    await ff(['-f','concat','-safe','0','-i',concat,'-map','0:v:0','-c:v','copy','-an','-movflags','+faststart',joined]);
    stage = 'final audio mux (no video encoding)';
    const out=path.join(directory,'final.mp4');
    await ff(['-i',joined,'-i',files.audio,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','copy','-t','23','-movflags','+faststart',out]);
    const p=await probe(out),v=p.streams.find(s=>s.codec_type==='video'),a=p.streams.find(s=>s.codec_type==='audio');
    if(v?.width!==1080||v?.height!==1920||v.r_frame_rate!=='30/1'||!a||Math.abs(Number(p.format.duration)-23)>0.05)throw new Error('Final MP4 failed dimensions, frame rate, audio or 23-second duration checks.');
    sample();
    const final={file:out,seconds:Number(p.format.duration),sha256:await shaFile(out),music:!!parts.music,musicDropped:parts.musicDropped||musicDropped,mode:'cuts',peakRssBytes:metrics.peakRssBytes,peakFfmpegRssBytes:metrics.peakFfmpegRssBytes,metrics};
    return {parts,final};
  }finally{clearInterval(timer);}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const config=JSON.parse(await fsp.readFile(process.argv[2],'utf8'));
  try { const result=await renderReel(config);await fsp.writeFile(path.join(config.directory,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({ok:true,file:result.final.file,seconds:result.final.seconds,peakRssBytes:result.final.peakRssBytes,peakFfmpegRssBytes:result.final.peakFfmpegRssBytes})); }
  catch(e){console.error('Render failed: '+e.message);process.exitCode=1;}
}
