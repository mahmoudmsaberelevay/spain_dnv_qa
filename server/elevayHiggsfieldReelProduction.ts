import { createElevayOpenAiKeyframe } from "./elevayOpenAiVisuals";
import {
  ELEVAY_ARABIC_VOICE_DEFAULTS,
  generateElevayVideoVoiceOver,
} from "./elevenLabsTts";
import {
  pollElevayHiggsfieldProClipStatus,
  submitElevayHiggsfieldProClip,
  type ElevayHiggsfieldProClipSubmission,
  type ElevayOwnedHiggsfieldClipRequest,
} from "./elevayHiggsfieldProTransport";
import { verifyDownloadedHiggsfieldClip } from "./higgsfieldClipTechnicalQa";
import type { HiggsfieldAcceptedClip } from "./higgsfieldClipRequestContract";
import { requireMediaRenderer } from "./mediaExecutables";
import {
  composeFourHiggsfieldClipsForReview,
  type ReelMediaProbe,
  type ReviewOnlyReelCompositionOutput,
} from "./reelCompositorService";
import { prepareEgyptianReelNarration } from "../shared/elevayVideoNarration";

const SCENE_INDICES = [1, 2, 3, 4] as const;
const sha256Pattern = /^[a-f0-9]{64}$/;
const visibleAscii = /^[\x21-\x7e]{1,255}$/;
const higgsfieldRequestId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Explicit integration boundaries that the parent persistence/UI work must close.
 * This module intentionally does not invent a database schema, download provider
 * output, calculate costs, schedule work, or publish a reel.
 */
export const ELEVAY_HIGGSFIELD_REEL_PRODUCTION_BLOCKERS = [
  "createElevayOpenAiKeyframe stores a server-owned image but does not accept an idempotency key or return a durable parent-step receipt; persist its returned URL, SHA-256, dimensions, and parent step before Higgsfield submission. Never retry an ambiguous OpenAI image POST automatically.",
  "The Higgsfield transport returns a completed provider video URL but has no owned download-and-persist API. A parent integration must download it safely, persist a SHA-256-pinned approved asset, and provide its local verified path before technical QA or composition.",
  "composeFourHiggsfieldClipsForReview owns its downloader, renderer, storage, and official-logo lookup and is not dependency-injectable. This stage injects the complete compositor boundary for unit tests; production uses the existing compositor unchanged.",
  "higgsfieldClipTechnicalQa is technical-only and cannot validate head-to-toe wardrobe, footwear, or text visually. A separately persisted human review is mandatory; this module never represents technical QA as automatic AI vision approval.",
] as const;

export type ElevayApprovedVoice = {
  provider: "elevay_internal_elevenlabs_clone";
  voiceId: typeof ELEVAY_ARABIC_VOICE_DEFAULTS.voiceId;
  ownerApproved: true;
  neverUseHiggsfieldVoice: true;
};

/** Every external provider action needs a parent-persisted durable intent first. */
export type ElevayParentDurableStepIntent = {
  ownerReviewedRunId: number;
  persistedStepId: number;
  alreadyPersistedBeforeNetwork: true;
  /** Immutable parent key. The Higgsfield transport sends this as Idempotency-Key. */
  idempotencyKey: string;
};

export type ElevayReelStageMetadata = {
  weeklyItemId: number;
  ownerReviewedRunId: number;
  /** The one approved spoken script; it is normalized by the existing Egyptian-Arabic policy. */
  approvedEgyptianArabicScript: string;
  approvedVoice: ElevayApprovedVoice;
  inputMetadataApproved: true;
  noContactClientOrLeadDataConfirmed: true;
};

export type ElevaySeparatelyApprovedScenePrompt = {
  sceneIndex: (typeof SCENE_INDICES)[number];
  approvedPrompt: string;
  separatelyApproved: true;
  noReelTextConfirmed: true;
  /** Durable intent for the one OpenAI keyframe creation. It is never retried here. */
  keyframeCreationIntent: ElevayParentDurableStepIntent;
};

export type ElevayCreatedOpenAiKeyframe = Awaited<ReturnType<typeof createElevayOpenAiKeyframe>>;

/**
 * The parent must create this record from a returned OpenAI keyframe before the
 * image is permitted to reach Higgsfield. The transport adds an independent CDN
 * allowlist check when its production default is used.
 */
export type ElevayPersistedApprovedOpenAiFrame = {
  sceneIndex: (typeof SCENE_INDICES)[number];
  ownerReviewedRunId: number;
  persistedFrameId: number;
  sourceKeyframeStepId: number;
  sourceProvider: "openai";
  purpose: "reel_keyframe";
  serverOwned: true;
  provenanceApproved: true;
  trustedCdnUrl: string;
  sha256: string;
  width: 864;
  height: 1536;
};

export type ElevayHiggsfieldSceneSubmission = {
  sceneIndex: (typeof SCENE_INDICES)[number];
  approvedPrompt: string;
  separatelyApproved: true;
  noReelTextConfirmed: true;
  frame: ElevayPersistedApprovedOpenAiFrame;
  clipSubmissionIntent: ElevayParentDurableStepIntent;
};

export type ElevayPersistedOwnedHiggsfieldRequest = {
  sceneIndex: (typeof SCENE_INDICES)[number];
  ownerReviewedRunId: number;
  persistedSubmissionStepId: number;
  persistedRequestReceiptId: number;
  persistedBeforePolling: true;
  requestId: string;
  statusUrl: string;
};

export type ElevayApprovedAsset = {
  url: string;
  sha256: string;
  mimeType: string;
};

export type ElevayHumanHeadToToeReview = {
  approvedByHuman: true;
  reviewedAfterTechnicalQa: true;
  confirmsNoReelText: true;
  confirmsHeadToToeWardrobeAndFootwear: true;
};

/** A completed, downloaded, SHA-pinned Higgsfield clip owned by this same run. */
export type ElevayApprovedDownloadedHiggsfieldClip = {
  sceneIndex: (typeof SCENE_INDICES)[number];
  ownerReviewedRunId: number;
  persistedClipAssetId: number;
  persistedHiggsfieldRequestId: string;
  provider: "higgsfield";
  approvedAsset: ElevayApprovedAsset;
  /** Parent-owned local file produced from the pinned asset, for technical QA only. */
  localVerifiedPath: string;
  technicalQaPersisted: true;
  humanHeadToToeReview: ElevayHumanHeadToToeReview;
};

export type ElevayPersistedApprovedNarration = {
  ownerReviewedRunId: number;
  persistedNarrationId: number;
  sourceNarrationStepId: number;
  provider: "elevay_internal_elevenlabs_clone";
  voiceId: typeof ELEVAY_ARABIC_VOICE_DEFAULTS.voiceId;
  noHiggsfieldVoice: true;
  approvedAsset: ElevayApprovedAsset;
};

type KeyframeCreator = (input: {
  prompt: string;
  purpose: "reel_keyframe";
  size?: string;
}) => Promise<ElevayCreatedOpenAiKeyframe>;
type HiggsfieldSubmitter = (input: ElevayHiggsfieldProClipSubmission) => Promise<HiggsfieldAcceptedClip>;
type HiggsfieldPoller = (input: ElevayOwnedHiggsfieldClipRequest) => ReturnType<typeof pollElevayHiggsfieldProClipStatus>;
type NarrationGenerator = (script: string) => ReturnType<typeof generateElevayVideoVoiceOver>;
type DownloadedClipVerifier = (localPath: string) => ReturnType<typeof verifyDownloadedHiggsfieldClip>;
type FourClipCompositor = (input: {
  weeklyItemId: number;
  clips: readonly ElevayApprovedAsset[];
  narration: ElevayApprovedAsset;
}) => Promise<ReviewOnlyReelCompositionOutput>;

export type ElevayHiggsfieldReelProductionDependencies = {
  createKeyframe?: KeyframeCreator;
  submitHiggsfieldClip?: HiggsfieldSubmitter;
  pollHiggsfieldClip?: HiggsfieldPoller;
  generateNarration?: NarrationGenerator;
  verifyDownloadedClip?: DownloadedClipVerifier;
  composeFourClips?: FourClipCompositor;
  requireRenderer?: () => Promise<void>;
  /** Required only when the real Higgsfield transport is used. */
  trustedKeyframeCdnOrigins?: readonly string[];
};

function positivePersistedId(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive persisted identifier.`);
  }
  return value;
}

function exactScenes<T extends { sceneIndex: number }>(scenes: readonly T[], label: string): readonly T[] {
  if (!Array.isArray(scenes) || scenes.length !== SCENE_INDICES.length) {
    throw new Error(`${label} requires exactly four separately identified scenes.`);
  }
  const indices = scenes.map(scene => scene?.sceneIndex).sort((a, b) => a - b);
  if (indices.some((index, position) => index !== SCENE_INDICES[position])) {
    throw new Error(`${label} requires one scene each for indexes 1, 2, 3, and 4.`);
  }
  return scenes;
}

function assertNoContactClientOrLeadData(value: string, label: string) {
  const unsafe = /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d(?:[\s().-]*\d){6,}|\b(?:client|lead)\b)/i.test(value);
  if (unsafe) throw new Error(`${label} must not contain contact, client, or Lead data.`);
}

function credentialFreeHttpsUrl(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a credential-free HTTPS URL.`);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${label} must be a credential-free HTTPS URL.`); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) {
    throw new Error(`${label} must be a credential-free HTTPS URL.`);
  }
  return url.href;
}

function assertDurableIntent(intent: ElevayParentDurableStepIntent, ownerReviewedRunId: number, label: string) {
  if (!intent || typeof intent !== "object") throw new Error(`${label} needs a persisted parent step intent.`);
  if (positivePersistedId(intent.ownerReviewedRunId, `${label}.ownerReviewedRunId`) !== ownerReviewedRunId) {
    throw new Error(`${label} must belong to this same owner-reviewed run.`);
  }
  positivePersistedId(intent.persistedStepId, `${label}.persistedStepId`);
  if (intent.alreadyPersistedBeforeNetwork !== true) {
    throw new Error(`${label} must be durably persisted before a provider call.`);
  }
  if (!visibleAscii.test(intent.idempotencyKey)) {
    throw new Error(`${label} needs an immutable visible-ASCII idempotency key supplied by the parent.`);
  }
}

function preparedEgyptianScript(metadata: ElevayReelStageMetadata): string {
  if (!metadata || typeof metadata !== "object") throw new Error("Approved reel metadata is required.");
  positivePersistedId(metadata.weeklyItemId, "weeklyItemId");
  positivePersistedId(metadata.ownerReviewedRunId, "ownerReviewedRunId");
  if (metadata.inputMetadataApproved !== true || metadata.noContactClientOrLeadDataConfirmed !== true) {
    throw new Error("Approved, complete, non-contact/non-client/non-Lead reel metadata is required.");
  }
  if (!metadata.approvedVoice || metadata.approvedVoice.provider !== "elevay_internal_elevenlabs_clone" ||
    metadata.approvedVoice.voiceId !== ELEVAY_ARABIC_VOICE_DEFAULTS.voiceId ||
    metadata.approvedVoice.ownerApproved !== true || metadata.approvedVoice.neverUseHiggsfieldVoice !== true) {
    throw new Error("Only the owner-approved ELEVAY internal ElevenLabs clone nc8XQG8lRYRZDnjvKW0H may narrate this reel; Higgsfield voices are forbidden.");
  }
  if (typeof metadata.approvedEgyptianArabicScript !== "string" || metadata.approvedEgyptianArabicScript.trim().length > 2_000) {
    throw new Error("One bounded approved Egyptian-Arabic narration script is required.");
  }
  assertNoContactClientOrLeadData(metadata.approvedEgyptianArabicScript, "The approved narration script");
  const prepared = prepareEgyptianReelNarration(metadata.approvedEgyptianArabicScript);
  if (!prepared) throw new Error("One non-empty approved Egyptian-Arabic narration script is required.");
  assertNoContactClientOrLeadData(prepared, "The prepared narration script");
  return prepared;
}

function assertApprovedPrompt(scene: Pick<ElevaySeparatelyApprovedScenePrompt, "approvedPrompt" | "separatelyApproved" | "noReelTextConfirmed">, label: string) {
  if (scene.separatelyApproved !== true || scene.noReelTextConfirmed !== true) {
    throw new Error(`${label} must be separately approved and explicitly confirmed to contain no reel text.`);
  }
  if (typeof scene.approvedPrompt !== "string" || scene.approvedPrompt.trim().length < 80 || scene.approvedPrompt.length > 4_000) {
    throw new Error(`${label} requires a detailed 80–4,000 character approved scene prompt.`);
  }
  assertNoContactClientOrLeadData(scene.approvedPrompt, label);
}

function assertOpenAiFrame(frame: ElevayPersistedApprovedOpenAiFrame, metadata: ElevayReelStageMetadata, sceneIndex: number) {
  if (!frame || typeof frame !== "object") throw new Error(`Scene ${sceneIndex} needs persisted approved OpenAI frame provenance.`);
  if (frame.sceneIndex !== sceneIndex || frame.ownerReviewedRunId !== metadata.ownerReviewedRunId) {
    throw new Error(`Scene ${sceneIndex} frame provenance must belong to this same owner-reviewed run.`);
  }
  positivePersistedId(frame.persistedFrameId, `Scene ${sceneIndex} persistedFrameId`);
  positivePersistedId(frame.sourceKeyframeStepId, `Scene ${sceneIndex} sourceKeyframeStepId`);
  if (frame.sourceProvider !== "openai" || frame.purpose !== "reel_keyframe" || frame.serverOwned !== true || frame.provenanceApproved !== true) {
    throw new Error(`Scene ${sceneIndex} needs approved server-owned OpenAI reel-keyframe provenance.`);
  }
  credentialFreeHttpsUrl(frame.trustedCdnUrl, `Scene ${sceneIndex} trusted keyframe URL`);
  if (!sha256Pattern.test(frame.sha256) || frame.width !== 864 || frame.height !== 1536) {
    throw new Error(`Scene ${sceneIndex} frame provenance must include a SHA-256-pinned native 864×1536 keyframe.`);
  }
}

function resolveKeyframeCreator(dependencies: ElevayHiggsfieldReelProductionDependencies): KeyframeCreator {
  return dependencies.createKeyframe ?? ((input) => createElevayOpenAiKeyframe(input));
}

function resolveSubmitter(dependencies: ElevayHiggsfieldReelProductionDependencies): HiggsfieldSubmitter {
  if (dependencies.submitHiggsfieldClip) return dependencies.submitHiggsfieldClip;
  if (!dependencies.trustedKeyframeCdnOrigins?.length) {
    throw new Error("Trusted keyframe CDN origins must be configured before real Higgsfield submission.");
  }
  return (input) => submitElevayHiggsfieldProClip(input, { trustedKeyframeCdnOrigins: dependencies.trustedKeyframeCdnOrigins });
}

function resolvePoller(dependencies: ElevayHiggsfieldReelProductionDependencies): HiggsfieldPoller {
  return dependencies.pollHiggsfieldClip ?? ((input) => pollElevayHiggsfieldProClipStatus(input));
}

function resolveNarrationGenerator(dependencies: ElevayHiggsfieldReelProductionDependencies): NarrationGenerator {
  return dependencies.generateNarration ?? generateElevayVideoVoiceOver;
}

function resolveVerifier(dependencies: ElevayHiggsfieldReelProductionDependencies): DownloadedClipVerifier {
  return dependencies.verifyDownloadedClip ?? verifyDownloadedHiggsfieldClip;
}

function resolveCompositor(dependencies: ElevayHiggsfieldReelProductionDependencies): FourClipCompositor {
  return dependencies.composeFourClips ?? composeFourHiggsfieldClipsForReview;
}

/**
 * Creates the four server-owned OpenAI keyframes once. The returned frames are
 * deliberately not eligible for Higgsfield until the parent persists approved
 * provenance as ElevayPersistedApprovedOpenAiFrame.
 */
export async function createFourServerOwnedElevayKeyframes(
  input: { metadata: ElevayReelStageMetadata; scenes: readonly ElevaySeparatelyApprovedScenePrompt[] },
  dependencies: ElevayHiggsfieldReelProductionDependencies = {},
) {
  preparedEgyptianScript(input.metadata); // Validate the approved voice before any of the four calls.
  const scenes = exactScenes(input.scenes, "OpenAI keyframe production");
  for (const scene of scenes) {
    assertApprovedPrompt(scene, `Scene ${scene.sceneIndex}`);
    assertDurableIntent(scene.keyframeCreationIntent, input.metadata.ownerReviewedRunId, `Scene ${scene.sceneIndex} keyframe intent`);
  }
  const creator = resolveKeyframeCreator(dependencies);
  const created = await Promise.all(scenes.map(async scene => {
    const keyframe = await creator({ prompt: scene.approvedPrompt, purpose: "reel_keyframe", size: "864x1536" });
    if (keyframe.provider !== "openai" || keyframe.width !== 864 || keyframe.height !== 1536 || !sha256Pattern.test(keyframe.sha256)) {
      throw new Error(`Scene ${scene.sceneIndex} did not return a server-owned SHA-256-pinned 864×1536 OpenAI keyframe.`);
    }
    credentialFreeHttpsUrl(keyframe.url, `Scene ${scene.sceneIndex} returned keyframe URL`);
    return {
      sceneIndex: scene.sceneIndex,
      keyframeCreationStepId: scene.keyframeCreationIntent.persistedStepId,
      keyframe,
      parentMustPersistApprovedFrameProvenanceBeforeHiggsfield: true as const,
    };
  }));
  return { scenes: created, providerCalls: 4 as const, automaticRetryPerformed: false as const };
}

/**
 * Sends exactly four one-time five-second Pro image-to-video submissions after
 * every frame, voice, no-text, and durable-intent precondition has passed.
 * It does not generate narration, poll, download, retry, or compose anything.
 */
export async function submitFourApprovedHiggsfieldProScenes(
  input: { metadata: ElevayReelStageMetadata; scenes: readonly ElevayHiggsfieldSceneSubmission[] },
  dependencies: ElevayHiggsfieldReelProductionDependencies = {},
) {
  preparedEgyptianScript(input.metadata); // No provider POST before approved-voice validation.
  const scenes = exactScenes(input.scenes, "Higgsfield Pro submission");
  const idempotencyKeys = new Set<string>();
  const submissions = scenes.map(scene => {
    assertApprovedPrompt(scene, `Scene ${scene.sceneIndex}`);
    assertOpenAiFrame(scene.frame, input.metadata, scene.sceneIndex);
    assertDurableIntent(scene.clipSubmissionIntent, input.metadata.ownerReviewedRunId, `Scene ${scene.sceneIndex} Higgsfield intent`);
    if (idempotencyKeys.has(scene.clipSubmissionIntent.idempotencyKey)) {
      throw new Error("Each of the four Higgsfield scenes needs a distinct parent-supplied idempotency key.");
    }
    idempotencyKeys.add(scene.clipSubmissionIntent.idempotencyKey);
    return {
      sceneIndex: scene.sceneIndex,
      input: {
        ownerReviewedRunId: scene.clipSubmissionIntent.ownerReviewedRunId,
        persistedStepId: scene.clipSubmissionIntent.persistedStepId,
        alreadyPersistedBeforeNetwork: true as const,
        idempotencyKey: scene.clipSubmissionIntent.idempotencyKey,
        prompt: scene.approvedPrompt,
        keyframe: {
          trustedCdnUrl: scene.frame.trustedCdnUrl,
          sha256: scene.frame.sha256,
          width: scene.frame.width,
          height: scene.frame.height,
        },
      } satisfies ElevayHiggsfieldProClipSubmission,
    };
  });
  const submit = resolveSubmitter(dependencies);
  const accepted = await Promise.all(submissions.map(async ({ sceneIndex, input: submission }) => ({
    sceneIndex,
    persistedSubmissionStepId: submission.persistedStepId,
    accepted: await submit(submission),
  })));
  return {
    scenes: accepted,
    providerCalls: 4 as const,
    durationSecondsEach: 5 as const,
    noAutomaticRetryPerformed: true as const,
    parentMustPersistAcceptedRequestReceiptsBeforePolling: true as const,
  };
}

/** Performs one read-only status poll per exact persisted same-owner request. */
export async function pollFourOwnedHiggsfieldSceneRequests(
  input: { metadata: ElevayReelStageMetadata; requests: readonly ElevayPersistedOwnedHiggsfieldRequest[] },
  dependencies: ElevayHiggsfieldReelProductionDependencies = {},
) {
  preparedEgyptianScript(input.metadata);
  const requests = exactScenes(input.requests, "Higgsfield status polling");
  for (const request of requests) {
    if (request.ownerReviewedRunId !== input.metadata.ownerReviewedRunId || request.persistedBeforePolling !== true) {
      throw new Error(`Scene ${request.sceneIndex} may be polled only from a persisted request owned by this same run.`);
    }
    positivePersistedId(request.persistedSubmissionStepId, `Scene ${request.sceneIndex} persistedSubmissionStepId`);
    positivePersistedId(request.persistedRequestReceiptId, `Scene ${request.sceneIndex} persistedRequestReceiptId`);
    if (!higgsfieldRequestId.test(request.requestId)) throw new Error(`Scene ${request.sceneIndex} has no valid persisted Higgsfield request ID.`);
    if (new URL(request.statusUrl).pathname !== `/requests/${request.requestId}/status`) {
      throw new Error(`Scene ${request.sceneIndex} status URL does not match its same-owner request ID.`);
    }
  }
  const poll = resolvePoller(dependencies);
  return {
    scenes: await Promise.all(requests.map(async request => ({
      sceneIndex: request.sceneIndex,
      result: await poll({ requestId: request.requestId, statusUrl: request.statusUrl }),
    }))),
    providerCalls: 4 as const,
    automaticRetryPerformed: false as const,
  };
}

/** Generates one narration with the exact approved clone; no Higgsfield voice exists in this path. */
export async function generateApprovedElevayReelNarration(
  input: { metadata: ElevayReelStageMetadata; narrationIntent: ElevayParentDurableStepIntent },
  dependencies: ElevayHiggsfieldReelProductionDependencies = {},
) {
  const script = preparedEgyptianScript(input.metadata);
  assertDurableIntent(input.narrationIntent, input.metadata.ownerReviewedRunId, "ElevenLabs narration intent");
  const generate = resolveNarrationGenerator(dependencies);
  const narration = await generate(script);
  credentialFreeHttpsUrl(narration.url, "Generated ELEVAY narration URL");
  if (!sha256Pattern.test(narration.sha256)) throw new Error("Generated ELEVAY narration must be SHA-256 pinned before composition.");
  return {
    narration: { url: narration.url, sha256: narration.sha256, mimeType: "audio/mpeg" as const },
    preparedEgyptianArabicScript: script,
    voiceId: ELEVAY_ARABIC_VOICE_DEFAULTS.voiceId,
    providerCalls: 1 as const,
    noHiggsfieldVoiceUsed: true as const,
    automaticRetryPerformed: false as const,
    parentMustPersistNarrationBeforeComposition: true as const,
  };
}

function assertApprovedAsset(asset: ElevayApprovedAsset, label: string, expectedMime: "video/mp4" | "audio/mpeg") {
  if (!asset || typeof asset !== "object" || asset.mimeType !== expectedMime || !sha256Pattern.test(asset.sha256)) {
    throw new Error(`${label} must be a SHA-256-pinned ${expectedMime} approved asset.`);
  }
  credentialFreeHttpsUrl(asset.url, `${label} URL`);
}

function assertCompositionOutput(output: ReviewOnlyReelCompositionOutput) {
  const probe = output?.outputProbe;
  if (!probe?.videoCodec || !probe.audioCodec || probe.width !== 1080 || probe.height !== 1920 || Math.abs(probe.durationMs - 23_000) > 400) {
    throw new Error("The assembled review reel must be a playable 1080×1920 audio/video MP4 totaling exactly 23 seconds.");
  }
  const manifest = output.inputManifest;
  if (manifest?.fourScenesSeconds !== 20 || manifest?.silentWhiteLogoOutroSeconds !== 3 || manifest?.providers === undefined) {
    throw new Error("The runtime compositor did not attest to four 5-second scenes and the exact silent white 3-second logo outro.");
  }
}

/**
 * Technical QA is re-run from each local pinned clip. It remains strictly
 * technical; only the supplied persisted human review can approve head-to-toe
 * wardrobe, footwear continuity, and absence of visible reel text.
 */
export async function composeHumanApprovedFourSceneElevayReel(
  input: {
    metadata: ElevayReelStageMetadata;
    clips: readonly ElevayApprovedDownloadedHiggsfieldClip[];
    narration: ElevayPersistedApprovedNarration;
  },
  dependencies: ElevayHiggsfieldReelProductionDependencies = {},
) {
  preparedEgyptianScript(input.metadata);
  const clips = exactScenes(input.clips, "Four-scene review composition");
  const requestIds = new Set<string>();
  for (const clip of clips) {
    if (clip.ownerReviewedRunId !== input.metadata.ownerReviewedRunId || clip.provider !== "higgsfield") {
      throw new Error(`Scene ${clip.sceneIndex} clip must belong to this same owner-reviewed Higgsfield run.`);
    }
    positivePersistedId(clip.persistedClipAssetId, `Scene ${clip.sceneIndex} persistedClipAssetId`);
    if (!higgsfieldRequestId.test(clip.persistedHiggsfieldRequestId) || requestIds.has(clip.persistedHiggsfieldRequestId)) {
      throw new Error("Composition needs four distinct persisted same-owner Higgsfield request IDs.");
    }
    requestIds.add(clip.persistedHiggsfieldRequestId);
    assertApprovedAsset(clip.approvedAsset, `Scene ${clip.sceneIndex} Higgsfield clip`, "video/mp4");
    if (typeof clip.localVerifiedPath !== "string" || !clip.localVerifiedPath) throw new Error(`Scene ${clip.sceneIndex} has no local pinned clip path for technical QA.`);
    if (clip.technicalQaPersisted !== true || !clip.humanHeadToToeReview ||
      clip.humanHeadToToeReview.approvedByHuman !== true ||
      clip.humanHeadToToeReview.reviewedAfterTechnicalQa !== true ||
      clip.humanHeadToToeReview.confirmsNoReelText !== true ||
      clip.humanHeadToToeReview.confirmsHeadToToeWardrobeAndFootwear !== true) {
      throw new Error(`Scene ${clip.sceneIndex} requires persisted technical QA plus an explicit human head-to-toe/footwear and no-text approval; automatic AI vision is not accepted.`);
    }
  }
  if (input.narration.ownerReviewedRunId !== input.metadata.ownerReviewedRunId ||
    input.narration.provider !== "elevay_internal_elevenlabs_clone" ||
    input.narration.voiceId !== ELEVAY_ARABIC_VOICE_DEFAULTS.voiceId || input.narration.noHiggsfieldVoice !== true) {
    throw new Error("Composition requires narration from the same run using only the approved ELEVAY internal ElevenLabs clone.");
  }
  positivePersistedId(input.narration.persistedNarrationId, "persistedNarrationId");
  positivePersistedId(input.narration.sourceNarrationStepId, "sourceNarrationStepId");
  assertApprovedAsset(input.narration.approvedAsset, "ELEVAY narration", "audio/mpeg");

  const verify = resolveVerifier(dependencies);
  const technicalQa = await Promise.all(clips.map(async clip => ({ sceneIndex: clip.sceneIndex, qa: await verify(clip.localVerifiedPath) })));
  for (const result of technicalQa) {
    if (result.qa.technicallyValid !== true || result.qa.needsHeadToToeFrameReview !== true) {
      throw new Error(`Scene ${result.sceneIndex} did not pass the required technical QA; it cannot be composed.`);
    }
  }

  await (dependencies.requireRenderer ?? requireMediaRenderer)();
  const compose = resolveCompositor(dependencies);
  const output = await compose({
    weeklyItemId: input.metadata.weeklyItemId,
    clips: clips.map(clip => clip.approvedAsset),
    narration: input.narration.approvedAsset,
  });
  assertCompositionOutput(output);
  return {
    output,
    technicalQa,
    totalSeconds: 23 as const,
    fourSilentHiggsfieldClipsSeconds: 20 as const,
    exactSilentWhiteLogoOutroSeconds: 3 as const,
    requiresIndividualFinalPreviewApproval: true as const,
    publicationEnabled: false as const,
  };
}

/** Narrow type retained for consumers that need to persist QA results without importing the compositor. */
export type ElevayHiggsfieldTechnicalQa = ReturnType<typeof verifyDownloadedHiggsfieldClip> extends Promise<infer T> ? T : never;
export type ElevayReelOutputProbe = ReelMediaProbe;
