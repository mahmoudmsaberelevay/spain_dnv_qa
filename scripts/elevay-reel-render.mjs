import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

/** Bumped whenever renderer output changes. Version 4 adds the 20-second / four 5-second narration timeline. */
export const RENDERER_VERSION = 11; // v11: chunked uploads wait for the website to finish storing big files (v10: chunked uploads)
const THREADS = 1;
const FFMPEG = process.env.ELEVAY_FFMPEG_BIN || '/usr/bin/ffmpeg';
const FFPROBE = process.env.ELEVAY_FFPROBE_BIN || '/usr/bin/ffprobe';
// Owner rule (26 Oct 2026): master quality. The Mac has the memory for a slow, high-profile x264 encode; every
// segment uses identical settings so the stream-copy join stays seamless. Instagram/Facebook recompress, so a
// cleaner source keeps more detail after upload.
const encode = ['-an','-c:v','libx264','-preset','slow','-tune','film','-profile:v','high','-level','4.2','-crf','15','-maxrate','25M','-bufsize','50M','-g','60','-keyint_min','60','-sc_threshold','0','-bf','2','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-threads',String(THREADS),'-video_track_timescale','90000','-movflags','+faststart'];
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

export async function renderReel({ manifest, directory, savedParts = {}, onPart = async () => {}, onProgress = async () => {} }) {
  await fsp.mkdir(directory, { recursive: true });
  const narrationTargetSeconds = Number(manifest?.narrationTargetSeconds);
  const narrationSceneSeconds = Number(manifest?.narrationSceneSeconds);
  const legacyNarration = narrationTargetSeconds === 18 && narrationSceneSeconds === 4.5;
  const currentNarration = narrationTargetSeconds === 20 && narrationSceneSeconds === 5;
  if (!legacyNarration && !currentNarration) {
    throw new Error('Render manifest must use four voice takes under either the legacy 18-second/4.5-second contract or the current 20-second/5-second contract.');
  }
  const linuxRss = process.platform === 'linux';
  const metrics = { method: linuxRss ? 'Linux /proc RSS sampled every 25 ms; isolated worker and all child processes' : 'Worker-process RSS sampled every 25 ms; macOS FFmpeg RSS unavailable', peakRssBytes: 0, peakFfmpegRssBytes: 0, ffmpegRssAvailable: linuxRss, threads: THREADS, stages: [] };
  const sample = () => { metrics.peakRssBytes = Math.max(metrics.peakRssBytes, linuxRss ? memoryTree(process.pid) : process.memoryUsage().rss); };
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
      const m = setInterval(() => { sample(); if (linuxRss) metrics.peakFfmpegRssBytes = Math.max(metrics.peakFfmpegRssBytes, memoryTree(child.pid)); }, 25);
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
    stage = 'fixed ELEVAYEXTRO.mov outro';
    if (!(await restore('outro', 'mp4'))) {
      if (!manifest.outroUrl) throw new Error('Fixed ELEVAYEXTRO.mov is missing from the render manifest; no generated logo fallback is permitted.');
      const source = path.join(directory, 'ELEVAYEXTRO.mov'), out = path.join(directory, 'outro.mp4');
      await downloadFile(manifest.outroUrl, source, 100 * 1024 * 1024);
      await ff(['-threads','1','-i',source,'-vf','scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1,fps=30,trim=duration=3,setpts=PTS-STARTPTS,format=yuv420p','-map','0:v:0','-an','-t','3',...encode,out]);
      const p = await probe(out), v = p.streams.find(s => s.codec_type === 'video');
      if (v?.width !== 1080 || v?.height !== 1920 || v.r_frame_rate !== '30/1' || Math.abs(Number(p.format.duration)-3) > 0.05) throw new Error('Fixed ELEVAYEXTRO.mov did not normalize to 1080x1920 / 30fps / 3 seconds.');
      await publish('outro', out, 'video/mp4');
      await fsp.rm(source, { force: true });
    }
    stage = 'voice and music audio mix';
    let musicDropped = null;
    // Timing is evidence for the current audio mix, not a reusable source
    // part. Rebuilding audio must replace prior timing rather than append to
    // stale values from a silent or superseded final.
    let rawVoiceSeconds = [];
    let sceneSeconds = Array.isArray(parts.sceneSeconds) && parts.sceneSeconds.length === 4 ? parts.sceneSeconds.map(Number) : [5,5,5,5];
    let narrativeSeconds = sceneSeconds.reduce((a,b)=>a+b,0);
    // A saved mix is reused only with its scene lengths (older mixes without them are rebuilt from the takes).
    if (!(Array.isArray(parts.sceneSeconds) && parts.sceneSeconds.length === 4 && await restore('audio', 'm4a'))) {
      const voices = [], appliedVoiceTempos = [], voicePaddingSeconds = [], wavs = [];
      for (let i=0;i<4;i++) {
        const src=path.join(directory,`voice${i}.src`), wav=path.join(directory,`voice${i}.wav`);
        await downloadFile(manifest.voiceUrls[i],src,15*1024*1024);
        await ff(['-threads','1','-i',src,'-vn','-af',audioFormat,'-c:a','pcm_s16le',wav+'.raw.wav']);
        const rawD=Number((await probe(wav+'.raw.wav')).format.duration);
        // Trim the silence ElevenLabs leaves before and after each take, so the four takes flow as one narration.
        const trim='silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse';
        try { await ff(['-threads','1','-i',wav+'.raw.wav','-af',`${audioFormat},${trim}`,'-c:a','pcm_s16le',wav]); } catch { await fsp.copyFile(wav+'.raw.wav', wav); }
        let d=Number((await probe(wav)).format.duration);
        if (!(d>0.2)) { await fsp.copyFile(wav+'.raw.wav', wav); d=rawD; }
        await fsp.rm(wav+'.raw.wav',{force:true});
        if (!(d>0.2)) throw new Error(`Scene ${i+1} saved voice take is empty.`);
        wavs.push(wav); rawVoiceSeconds.push(d); // spoken length after trimming silence
        await fsp.rm(src,{force:true});
      }
      // The four takes are one continuous narration, so they flow back to back: a take that runs a little past
      // its 5-second scene borrows time from a shorter neighbour instead of failing. Each take starts on its
      // scene when it can, never overlaps the previous one, and the voice always ends before the 20-second
      // outro. Only when the whole narration is longer than 20 s is it sped up evenly (at most 1.12x).
      const GAP=0.1, LEAD=0.05, END=narrationTargetSeconds;
      const room=END-LEAD-3*GAP, spoken=rawVoiceSeconds.reduce((a,b)=>a+b,0);
      // Owner rule (20 Oct 2026): each scene aims for 5 s, but a longer voice never stops production. Up to 1.12x
      // speed keeps 20 s; beyond that the scenes whose voice runs long are lengthened (gentle slow motion) and the
      // reel simply runs longer. The 3-second logo outro always stays silent at the end.
      const tempo=Math.min(1.12, Math.max(1, spoken/room));
      const len=rawVoiceSeconds.map(d=>d/tempo), starts=[];
      const fits = len.reduce((a,b)=>a+b,0) + LEAD + 3*GAP <= END + 0.001;
      if (fits) {
        for (let i=0;i<4;i++) starts.push(Math.max(i*narrationSceneSeconds+(i?0:LEAD), i ? starts[i-1]+len[i-1]+GAP : LEAD));
        for (let i=3;i>=0;i--) starts[i]=Math.min(starts[i], i===3 ? END-len[3] : starts[i+1]-GAP-len[i]);
        sceneSeconds=[5,5,5,5];
      } else {
        sceneSeconds=len.map((l,i)=>Math.max(narrationSceneSeconds, Math.ceil((l + GAP + (i===0?LEAD:0)) * 30) / 30));
        let at=0; for (let i=0;i<4;i++) { starts.push(at + (i===0?LEAD:0)); at+=sceneSeconds[i]; }
      }
      narrativeSeconds=sceneSeconds.reduce((a,b)=>a+b,0);
      for (let i=0;i<4;i++) {
        // Time each take in its own pass. atempo inside the 4-input mix produced broken timestamps that made
        // FFmpeg write a 0.1-second silent track (reels shipped with no voice-over).
        const timed=path.join(directory,`voice${i}.timed.wav`);
        const voiceFilter = tempo > 1.0001 ? `${audioFormat},atempo=${tempo.toFixed(5)},asetpts=N/SR/TB` : `${audioFormat},asetpts=N/SR/TB`;
        await ff(['-threads','1','-i',wavs[i],'-af',voiceFilter,'-c:a','pcm_s16le',timed]);
        voices.push(timed); appliedVoiceTempos.push(tempo);
        voicePaddingSeconds.push(Math.max(0, Math.min(5, (i<3 ? starts[i+1] : narrativeSeconds) - starts[i] - len[i])));
      }
      const voiceStarts=starts.map(x=>Math.round(x*1000));
      let musicFile=null;
      if(manifest.musicUrl) try { musicFile=path.join(directory,'music.src');await downloadFile(manifest.musicUrl,musicFile,25*1024*1024); } catch { musicDropped='Music source unavailable; saved voice takes retained.';musicFile=null; }
      const mix=async withMusic => {
        const T=(narrativeSeconds+3).toFixed(3), fadeAt=narrativeSeconds.toFixed(3);
        const args=voices.flatMap(f=>['-threads','1','-i',f]);
        if(withMusic)args.push('-stream_loop','-1','-threads','1','-i',musicFile);
        const filters=voices.map((_,i)=>`[${i}:a]${audioFormat},adelay=${voiceStarts[i]}|${voiceStarts[i]},apad=whole_dur=${T}[n${i}]`);
        filters.push('[n0][n1][n2][n3]amix=inputs=4:duration=longest:normalize=0[voice]');
        if(withMusic) filters.push('[4:a]'+audioFormat+`,atrim=duration=${T},volume=0.16,afade=t=in:d=0.8,afade=t=out:st=${fadeAt}:d=3[bed]`,`[voice][bed]amix=inputs=2:duration=longest:normalize=0,atrim=duration=${T},alimiter=limit=0.95[a]`);
        else filters.push(`[voice]atrim=duration=${T},alimiter=limit=0.95[a]`);
        await ff([...args,'-filter_complex',filters.join(';'),'-map','[a]','-t',T,'-c:a','aac','-b:a','256k','-threads','1',path.join(directory,'audio.m4a')]);
      };
      if(musicFile)try{await mix(true);}catch{musicDropped='Music could not be mixed; finished with saved voice takes only.';await mix(false);}else await mix(false);
      // Never ship a reel without its voice-over: the mixed track must last the full 23 s and be audible.
      {
        const am=path.join(directory,'audio.m4a');
        const ad=Number((await probe(am)).format.duration);
        if(!(ad>=narrativeSeconds+3-0.1))throw new Error(`Voice-over mix is ${ad.toFixed(2)}s instead of ${(narrativeSeconds+3).toFixed(1)}s; the reel was not finished without its voice.`);
        const peakFile=path.join(directory,'audio-peak.txt');
        await ff(['-i',am,'-af',`astats=metadata=1:reset=0,ametadata=mode=print:key=lavfi.astats.Overall.Peak_level:file=${peakFile}`,'-f','null','-']);
        const peaks=[...(await fsp.readFile(peakFile,'utf8')).matchAll(/Peak_level=(-?inf|-?[\d.]+)/g)];
        const peak=peaks.length?Number(peaks[peaks.length-1][1].replace('inf','Infinity')):NaN;
        if(!(peak>-50))throw new Error('Voice-over mix is silent; the reel was not finished without its voice.');
      }
      await publish('audio',path.join(directory,'audio.m4a'),'audio/mp4');
      parts.music=!!musicFile&&!musicDropped; parts.musicDropped=musicDropped;
      parts.narrationTargetSeconds=narrationTargetSeconds; parts.narrationSceneSeconds=narrationSceneSeconds;
      parts.rawVoiceSeconds=rawVoiceSeconds;
      parts.appliedVoiceTempos=appliedVoiceTempos;
      parts.voicePaddingSeconds=voicePaddingSeconds;
      parts.sceneSeconds=sceneSeconds;
    }
    // A scene lengthened for a longer voice take is slowed gently to its new length (only that scene is re-encoded).
    for (let i=0;i<4;i++) {
      if (!(sceneSeconds[i] > 5.0001)) continue;
      stage = `lengthen scene ${i+1}`;
      const ext=path.join(directory,`seg${i}.ext.mp4`), k=sceneSeconds[i]/5;
      await ff(['-threads','1','-i',files[`seg${i}`],'-vf',`setpts=${k.toFixed(5)}*PTS,fps=30,format=yuv420p`,'-t',sceneSeconds[i].toFixed(3),'-an',...encode,ext]);
      files[`seg${i}`]=ext;
    }
    stage = 'stream-copy concat';
    const concat=path.join(directory,'concat.txt');
    await fsp.writeFile(concat,['seg0','seg1','seg2','seg3','outro'].map(n=>`file '${files[n].replace(/'/g,"'\\''")}'`).join('\n')+'\n');
    const joined=path.join(directory,'joined.mp4');
    await ff(['-f','concat','-safe','0','-i',concat,'-map','0:v:0','-c:v','copy','-an','-movflags','+faststart',joined]);
    stage = 'final audio mux (no video encoding)';
    const out=path.join(directory,'final.mp4');
    await ff(['-i',joined,'-i',files.audio,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','copy','-t',(narrativeSeconds+3).toFixed(3),'-movflags','+faststart',out]);
    const p=await probe(out),v=p.streams.find(s=>s.codec_type==='video'),a=p.streams.find(s=>s.codec_type==='audio');
    if(v?.width!==1080||v?.height!==1920||v.r_frame_rate!=='30/1'||!a||Math.abs(Number(p.format.duration)-(narrativeSeconds+3))>0.1)throw new Error(`Final MP4 failed dimensions, frame rate, audio or ${(narrativeSeconds+3).toFixed(1)}-second duration checks.`);
    sample();
    const final={file:out,seconds:Number(p.format.duration),sha256:await shaFile(out),music:!!parts.music,musicDropped:parts.musicDropped||musicDropped,mode:'cuts',narrativeSeconds,sceneSeconds,narrationTargetSeconds,narrationSceneSeconds,spokenNarrationSeconds:narrationTargetSeconds,rawVoiceSeconds:parts.rawVoiceSeconds||rawVoiceSeconds,peakRssBytes:metrics.peakRssBytes,peakFfmpegRssBytes:metrics.peakFfmpegRssBytes,metrics};
    return {parts,final};
  }finally{clearInterval(timer);}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const config=JSON.parse(await fsp.readFile(process.argv[2],'utf8'));
  try { const result=await renderReel(config);await fsp.writeFile(path.join(config.directory,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({ok:true,file:result.final.file,seconds:result.final.seconds,peakRssBytes:result.final.peakRssBytes,peakFfmpegRssBytes:result.final.peakFfmpegRssBytes})); }
  catch(e){console.error('Render failed: '+e.message);process.exitCode=1;}
}
