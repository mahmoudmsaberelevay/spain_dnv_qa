import { describe, expect, it, vi } from "vitest";
import {
  composeHumanApprovedFourSceneElevayReel,
  createFourServerOwnedElevayKeyframes,
  generateApprovedElevayReelNarration,
  pollFourOwnedHiggsfieldSceneRequests,
  submitFourApprovedHiggsfieldProScenes,
  type ElevayHiggsfieldSceneSubmission,
  type ElevayParentDurableStepIntent,
  type ElevayReelStageMetadata,
} from "./elevayHiggsfieldReelProduction";

const trustedOrigin = "https://cdn.elevay.example";
const sha = (letter: string) => letter.repeat(64);
const requestIds = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
] as const;

const metadata: ElevayReelStageMetadata = {
  weeklyItemId: 91,
  ownerReviewedRunId: 44,
  approvedEgyptianArabicScript: "بنراجع التفاصيل معاك علشان تاخد قرار مناسب ليك.",
  approvedVoice: {
    provider: "elevay_internal_elevenlabs_clone",
    voiceId: "nc8XQG8lRYRZDnjvKW0H",
    ownerApproved: true,
    neverUseHiggsfieldVoice: true,
  },
  inputMetadataApproved: true,
  noContactClientOrLeadDataConfirmed: true,
};

const durableIntent = (step: number, suffix: string): ElevayParentDurableStepIntent => ({
  ownerReviewedRunId: metadata.ownerReviewedRunId,
  persistedStepId: step,
  alreadyPersistedBeforeNetwork: true,
  idempotencyKey: `parent-persisted-reel-44-${suffix}`,
});

const prompt = (sceneIndex: number) => `Premium cinematic vertical 9:16 scene ${sceneIndex} in an elegant contemporary Cairo setting, Arab professionals in coherent modern attire, natural movement, no visual text, no logo, no dialogue, and no contact details.`;

const frame = (sceneIndex: number) => ({
  sceneIndex: sceneIndex as 1 | 2 | 3 | 4,
  ownerReviewedRunId: metadata.ownerReviewedRunId,
  persistedFrameId: 100 + sceneIndex,
  sourceKeyframeStepId: 10 + sceneIndex,
  sourceProvider: "openai" as const,
  purpose: "reel_keyframe" as const,
  serverOwned: true as const,
  provenanceApproved: true as const,
  trustedCdnUrl: `${trustedOrigin}/marketing/openai/frame-${sceneIndex}.png`,
  sha256: sha(String.fromCharCode(96 + sceneIndex)),
  width: 864 as const,
  height: 1536 as const,
});

const sceneSubmissions = (): ElevayHiggsfieldSceneSubmission[] => [1, 2, 3, 4].map(sceneIndex => ({
  sceneIndex: sceneIndex as 1 | 2 | 3 | 4,
  approvedPrompt: prompt(sceneIndex),
  separatelyApproved: true,
  noReelTextConfirmed: true,
  frame: frame(sceneIndex),
  clipSubmissionIntent: durableIntent(200 + sceneIndex, `clip-${sceneIndex}`),
}));

describe("dependency-injectable ELEVAY Higgsfield one-reel stage", () => {
  it("calls the existing OpenAI keyframe boundary exactly four times only after durable intents and the exact approved ELEVAY voice pass validation", async () => {
    const createKeyframe = vi.fn(async ({ prompt: scenePrompt }: { prompt: string; purpose: "reel_keyframe"; size?: string }) => ({
      provider: "openai" as const,
      model: "gpt-image-2.5-sunburst" as const,
      url: `${trustedOrigin}/marketing/openai/${scenePrompt.length}.png`,
      storageKey: "marketing/openai/reel_keyframe/test.png",
      sha256: sha("a"),
      width: 864,
      height: 1536,
      inputTokens: null,
      outputTokens: null,
      measuredCostUsd: null,
    }));
    const scenes = [1, 2, 3, 4].map(sceneIndex => ({
      sceneIndex: sceneIndex as 1 | 2 | 3 | 4,
      approvedPrompt: prompt(sceneIndex),
      separatelyApproved: true as const,
      noReelTextConfirmed: true as const,
      keyframeCreationIntent: durableIntent(sceneIndex, `keyframe-${sceneIndex}`),
    }));

    await expect(createFourServerOwnedElevayKeyframes({
      metadata: { ...metadata, approvedVoice: { ...metadata.approvedVoice, ownerApproved: false } },
      scenes,
    }, { createKeyframe })).rejects.toThrow(/approved ELEVAY internal ElevenLabs clone/i);
    expect(createKeyframe).not.toHaveBeenCalled();

    const result = await createFourServerOwnedElevayKeyframes({ metadata, scenes }, { createKeyframe });
    expect(result.providerCalls).toBe(4);
    expect(result.automaticRetryPerformed).toBe(false);
    expect(createKeyframe).toHaveBeenCalledTimes(4);
    expect(createKeyframe.mock.calls.map(call => call[0])).toEqual(scenes.map(scene => ({
      prompt: scene.approvedPrompt,
      purpose: "reel_keyframe",
      size: "864x1536",
    })));
    expect(result.scenes.every(scene => scene.parentMustPersistApprovedFrameProvenanceBeforeHiggsfield)).toBe(true);
  });

  it("submits exactly four 5-second Pro clips only after every scene has distinct persisted idempotency, approved frame provenance, no-text approval, and approved voice", async () => {
    const submitHiggsfieldClip = vi.fn(async (input: { idempotencyKey: string }) => {
      const index = Number(input.idempotencyKey.at(-1));
      const requestId = requestIds[index - 1];
      return {
        requestId,
        statusUrl: `https://api.higgsfield.ai/requests/${requestId}/status`,
        cancelUrl: `https://api.higgsfield.ai/requests/${requestId}/cancel`,
      };
    });
    const scenes = sceneSubmissions();

    await expect(submitFourApprovedHiggsfieldProScenes({
      metadata,
      scenes: scenes.map(scene => ({ ...scene, clipSubmissionIntent: { ...scene.clipSubmissionIntent, idempotencyKey: "" } })),
    }, { submitHiggsfieldClip })).rejects.toThrow(/idempotency key/i);
    expect(submitHiggsfieldClip).not.toHaveBeenCalled();

    const result = await submitFourApprovedHiggsfieldProScenes({ metadata, scenes }, { submitHiggsfieldClip });
    expect(result).toMatchObject({ providerCalls: 4, durationSecondsEach: 5, noAutomaticRetryPerformed: true, parentMustPersistAcceptedRequestReceiptsBeforePolling: true });
    expect(submitHiggsfieldClip).toHaveBeenCalledTimes(4);
    expect(submitHiggsfieldClip.mock.calls.map(call => call[0].idempotencyKey)).toEqual(scenes.map(scene => scene.clipSubmissionIntent.idempotencyKey));
    expect(submitHiggsfieldClip.mock.calls.every(call => call[0].keyframe.width === 864 && call[0].keyframe.height === 1536)).toBe(true);
  });

  it("polls only four same-owner request receipts and never makes a generation call while polling", async () => {
    const pollHiggsfieldClip = vi.fn(async ({ requestId }: { requestId: string; statusUrl: string }) => ({
      requestId,
      state: "in_progress" as const,
      videoUrl: null,
    }));
    const requests = requestIds.map((requestId, index) => ({
      sceneIndex: (index + 1) as 1 | 2 | 3 | 4,
      ownerReviewedRunId: metadata.ownerReviewedRunId,
      persistedSubmissionStepId: 201 + index,
      persistedRequestReceiptId: 301 + index,
      persistedBeforePolling: true as const,
      requestId,
      statusUrl: `https://api.higgsfield.ai/requests/${requestId}/status`,
    }));

    const result = await pollFourOwnedHiggsfieldSceneRequests({ metadata, requests }, { pollHiggsfieldClip });
    expect(result.providerCalls).toBe(4);
    expect(result.automaticRetryPerformed).toBe(false);
    expect(pollHiggsfieldClip).toHaveBeenCalledTimes(4);
    expect(pollHiggsfieldClip.mock.calls.map(call => call[0].requestId)).toEqual([...requestIds]);

    await expect(pollFourOwnedHiggsfieldSceneRequests({
      metadata,
      requests: [{ ...requests[0], persistedBeforePolling: false }, ...requests.slice(1)],
    }, { pollHiggsfieldClip })).rejects.toThrow(/persisted request owned/i);
    expect(pollHiggsfieldClip).toHaveBeenCalledTimes(4);
  });

  it("uses the exact approved internal ElevenLabs clone once and cannot route narration through Higgsfield", async () => {
    const generateNarration = vi.fn(async (script: string) => ({
      url: "https://cdn.elevay.example/marketing/voice/narration.mp3",
      fileName: "narration.mp3",
      script,
      model: "eleven_v3",
      outputFormat: "mp3_44100_128",
      bytes: 2000,
      sha256: sha("f"),
    }));
    const result = await generateApprovedElevayReelNarration({
      metadata,
      narrationIntent: durableIntent(500, "elevenlabs-voice"),
    }, { generateNarration });

    expect(generateNarration).toHaveBeenCalledTimes(1);
    expect(result.voiceId).toBe("nc8XQG8lRYRZDnjvKW0H");
    expect(result.noHiggsfieldVoiceUsed).toBe(true);
    expect(result.parentMustPersistNarrationBeforeComposition).toBe(true);
    expect(generateNarration).toHaveBeenCalledWith(result.preparedEgyptianArabicScript);
  });

  it("requires technical QA, human head-to-toe/no-text approval, renderer readiness, and the exact 23-second four-clip compositor output", async () => {
    const verifyDownloadedClip = vi.fn(async () => ({
      technicallyValid: true as const,
      needsHeadToToeFrameReview: true as const,
      sourceWidth: 1080,
      sourceHeight: 1920,
    }));
    const requireRenderer = vi.fn(async () => undefined);
    const composeFourClips = vi.fn(async () => ({
      outputStorageKey: "marketing/reel-compositions/higgsfield-review/test.mp4",
      outputUrl: "https://cdn.elevay.example/marketing/reel/test.mp4",
      outputSha256: sha("9"),
      outputBytes: 1000,
      sourceProbe: { durationMs: 20_000, videoCodec: "h264", audioCodec: null, width: 1080, height: 1920 },
      narrationProbe: { durationMs: 18_000, videoCodec: null, audioCodec: "mp3", width: null, height: null },
      outputProbe: { durationMs: 23_000, videoCodec: "h264", audioCodec: "aac", width: 1080, height: 1920 },
      inputManifest: {
        providers: { footage: "higgsfield", voice: "elevay_internal_elevenlabs", assembly: "manus_ffmpeg" },
        fourScenesSeconds: 20,
        silentWhiteLogoOutroSeconds: 3,
      },
    }));
    const clips = requestIds.map((requestId, index) => ({
      sceneIndex: (index + 1) as 1 | 2 | 3 | 4,
      ownerReviewedRunId: metadata.ownerReviewedRunId,
      persistedClipAssetId: 600 + index,
      persistedHiggsfieldRequestId: requestId,
      provider: "higgsfield" as const,
      approvedAsset: { url: `${trustedOrigin}/marketing/higgsfield/clip-${index + 1}.mp4`, sha256: sha(String(index + 1)), mimeType: "video/mp4" },
      localVerifiedPath: `/secure/pinned/clip-${index + 1}.mp4`,
      technicalQaPersisted: true as const,
      humanHeadToToeReview: {
        approvedByHuman: true as const,
        reviewedAfterTechnicalQa: true as const,
        confirmsNoReelText: true as const,
        confirmsHeadToToeWardrobeAndFootwear: true as const,
      },
    }));
    const narration = {
      ownerReviewedRunId: metadata.ownerReviewedRunId,
      persistedNarrationId: 700,
      sourceNarrationStepId: 500,
      provider: "elevay_internal_elevenlabs_clone" as const,
      voiceId: "nc8XQG8lRYRZDnjvKW0H" as const,
      noHiggsfieldVoice: true as const,
      approvedAsset: { url: `${trustedOrigin}/marketing/voice/narration.mp3`, sha256: sha("a"), mimeType: "audio/mpeg" },
    };

    await expect(composeHumanApprovedFourSceneElevayReel({
      metadata,
      clips: [{ ...clips[0], humanHeadToToeReview: { ...clips[0].humanHeadToToeReview, confirmsHeadToToeWardrobeAndFootwear: false } }, ...clips.slice(1)],
      narration,
    }, { verifyDownloadedClip, requireRenderer, composeFourClips })).rejects.toThrow(/automatic AI vision is not accepted/i);
    expect(verifyDownloadedClip).not.toHaveBeenCalled();
    expect(requireRenderer).not.toHaveBeenCalled();
    expect(composeFourClips).not.toHaveBeenCalled();

    const result = await composeHumanApprovedFourSceneElevayReel({ metadata, clips, narration }, { verifyDownloadedClip, requireRenderer, composeFourClips });
    expect(verifyDownloadedClip).toHaveBeenCalledTimes(4);
    expect(requireRenderer).toHaveBeenCalledTimes(1);
    expect(composeFourClips).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ totalSeconds: 23, fourSilentHiggsfieldClipsSeconds: 20, exactSilentWhiteLogoOutroSeconds: 3, requiresIndividualFinalPreviewApproval: true, publicationEnabled: false });
  });
});
