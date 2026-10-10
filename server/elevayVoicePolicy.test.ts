import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('./_core/env',()=>({ENV:{elevenLabsApiKey:'test-only-not-a-credential'}}));
vi.mock('./storage',()=>({storagePut:vi.fn(async()=>({url:'https://test.example/audio.mp3'}))}));
vi.mock('./_core/notification',()=>({notifyOwner:vi.fn(async()=>true)}));
import {generateElevayArabicVoiceOver,parseElevenLabsErrorCode} from './elevenLabsTts';
import {ELEVAY_LOCKED_VOICE_POLICY,requireElevayVoiceId} from '../shared/elevayVoicePolicy';
import {notifyOwner} from './_core/notification';
const voice='nc8XQG8lRYRZDnjvKW0H';
const script='خلينا نرتب خطوتك الجاية مع ELEVAY.';
beforeEach(()=>{vi.stubEnv('ELEVAY_VOICE_ID',voice);vi.clearAllMocks();});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('locked shared voice requests',()=>{
 it('is immutable and rejects missing/mismatched managed identity',()=>{
  expect(Object.isFrozen(ELEVAY_LOCKED_VOICE_POLICY)).toBe(true);
  expect(()=>requireElevayVoiceId(undefined)).toThrow('no alternate voice');
  expect(()=>requireElevayVoiceId('other-voice')).toThrow('no alternate voice');
 });
 it('sends one approved voice input to documented v4/ar endpoint and records provenance',async()=>{
  const fetcher=vi.fn(async()=>new Response(new Uint8Array([0x49,0x44,0x33,0x04,0x00]),{headers:{'content-type':'audio/mpeg','request-id':'test-request'}}));
  vi.stubGlobal('fetch',fetcher);
  const r=await generateElevayArabicVoiceOver(script);
  const [url,opts]=fetcher.mock.calls[0] as any;
  expect(url).toContain('/v1/text-to-dialogue?output_format=mp3_44100_128');
  expect(JSON.parse(opts.body)).toEqual({inputs:[{text:`[thoughtful] ${script}`,voice_id:voice}],model_id:'eleven_v4',language_code:'ar',settings:{stability:0.5}});
  expect(r).toMatchObject({voiceId:voice,model:'eleven_v4',languageCode:'ar',dialect:'Egyptian Arabic',requestId:'test-request'});
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it.each([[404,'voice_not_found'],[401,'quota_exceeded'],[403,'missing_permissions']])('HTTP %s/%s stops and alerts once without replacement',async(status,code)=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({detail:{status:code,message:'untrusted upstream detail'}}),{status}));vi.stubGlobal('fetch',fetcher);
  await expect(generateElevayArabicVoiceOver(script)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);expect(notifyOwner).toHaveBeenCalledTimes(1);
 });
 it('does not call a provider if an agent changes the managed voice',async()=>{
  vi.stubEnv('ELEVAY_VOICE_ID','other-voice');const f=vi.fn();vi.stubGlobal('fetch',f);
  await expect(generateElevayArabicVoiceOver(script)).rejects.toMatchObject({name:'ElevenLabsVoiceConfigurationError'});expect(f).not.toHaveBeenCalled();expect(notifyOwner).toHaveBeenCalledTimes(1);
 });
 it('recognizes both documented status and legacy code fields without passing arbitrary provider messages',()=>{
  expect(parseElevenLabsErrorCode('{"detail":{"status":"quota_exceeded"}}')).toBe('quota_exceeded');
  expect(parseElevenLabsErrorCode('{"detail":{"code":"voice_not_found"}}')).toBe('voice_not_found');
  expect(parseElevenLabsErrorCode('{"detail":{"status":"unsafe <html> value"}}')).toBeNull();
 });
});
