import {describe,it,expect} from 'vitest';
import {ENV} from './_core/env';
describe.skipIf(process.env.ELEVAY_LIVE_VOICE_TEST !== '1')('managed ELEVAY voice identifier',()=>{
 it('matches the approved voice and is accessible through the configured workspace',async()=>{
  expect(process.env.ELEVAY_VOICE_ID).toBe('nc8XQG8lRYRZDnjvKW0H');
  const r=await fetch(`https://api.elevenlabs.io/v1/voices/${process.env.ELEVAY_VOICE_ID}`,{headers:{'xi-api-key':ENV.elevenLabsApiKey},signal:AbortSignal.timeout(20000)});
  expect(r.status,'approved voice read permission').toBe(200);
  const v=await r.json();expect(v.voice_id).toBe(process.env.ELEVAY_VOICE_ID);
 },25000);
});
