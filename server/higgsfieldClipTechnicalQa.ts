import { probeReelMedia, type ReelMediaProbe } from "./reelCompositorService";

/** Technical checks only. They cannot certify head-to-toe wardrobe or motion. */
export function validateHiggsfieldClipProbe(probe: ReelMediaProbe) {
  if (!probe.videoCodec || !probe.width || !probe.height) throw new Error("Higgsfield clip is missing a playable video stream.");
  if (Math.abs(probe.height / probe.width - 16 / 9) > 0.015) throw new Error("Higgsfield clip is not native vertical 9:16; stretching is forbidden.");
  if (probe.width < 720 || probe.height < 1280) throw new Error("Higgsfield clip resolution is below the 720×1280 premium source minimum.");
  if (probe.durationMs < 4_500 || probe.durationMs > 5_500) throw new Error("Higgsfield clip must be five seconds before the three-second logo outro.");
  if (probe.audioCodec) throw new Error("Higgsfield clip has native audio; no Higgsfield voices or sound may enter the ELEVAY master mix.");
  return { technicallyValid: true as const, needsHeadToToeFrameReview: true as const, sourceWidth: probe.width, sourceHeight: probe.height };
}

export async function verifyDownloadedHiggsfieldClip(localPath: string) {
  return validateHiggsfieldClipProbe(await probeReelMedia(localPath));
}
