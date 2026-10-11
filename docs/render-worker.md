# ELEVAY external reel renderer

## Why

The 512 MiB web container shares memory with child processes and its temporary filesystem. A spawned FFmpeg process is not an OOM isolation boundary. The website must never render reels or extract final-review frames. All reel encoding and final visual evidence creation belong on an external worker or a managed render API.

## Website

`createRenderQueue(q)` persists a stable input-manifest hash in `ec_render_jobs`. Four stored clip URLs and four stored voice-take URLs are mandatory. Identical inputs reuse the same job/output. The website returns `Waiting for render worker` until the worker has uploaded and committed its result. There is no website-local FFmpeg fallback.

New reel flow: storyboard → keyframes → clips (existing owner gate) → ELEVAY voice → external final edit → one comprehensive final Claude check → weekly plan. Old runs migrate by action, preserving generated assets and existing approvals.

Failed final scene reviews regenerate only explicitly named scenes, up to two repair rounds. Matching keyframes/clips and normalized segments are invalidated; other clips and all voice takes survive. Manual Higgsfield approval is reopened when applicable. Invalid/non-scene failures stop at `needs_review`, not arbitrary regeneration. No-regeneration sandbox runs never replace a clip or voice.

## Worker

`scripts/elevay-render-worker.ts` is an external disk-backed process, not a website startup task. It uses only `ELEVAY_RENDER_BRIDGE_URL` and `ELEVAY_RENDER_WORKER_TOKEN`: it has no MySQL, storage-master, Meta, OpenAI, Higgsfield, ElevenLabs or Anthropic credential. Use the canonical bridge host `https://elevay.vip/admin/api/render-worker`, not `www.elevay.vip`, because its cross-host redirect intentionally removes Authorization. The worker leases persisted jobs, renders one at a time, uploads each normalized segment/outro/audio through the bridge as soon as complete, concatenates H.264 segments without re-encoding, then stream-copies video and AAC audio into the final MP4. FFmpeg decoder, encoder and filter thread settings are one. The final result is 1080×1920, 30 fps, 23 seconds.

Input downloads and output uploads are streamed. The worker sends artifact bytes only to the narrow authenticated bridge; the website streams those bytes to a temporary file, verifies size/SHA-256/container type, then calls the server-only managed-storage helper. Temporary files live on worker disk. Linux `/proc` RSS is sampled every 25 ms for the worker process and its descendants; this is sampled process memory, not total host/cgroup memory or filesystem cache. On macOS, the worker reports its own RSS and declares FFmpeg RSS unavailable rather than fabricating a value.

A 15-minute lease with 30-second renewal prevents simultaneous claims. Expired leases can be reclaimed. Ordinary failures permit three additional attempts separated by two minutes, retaining stored pieces. Terminal failures send dashboard/owner and email notifications, and remain visible in persisted state. The bridge exposes only worker-authenticated health/status, lease/renew/progress/complete/fail and allowlisted artifact upload endpoints; it provides no CRM, Lead, Meta, provider or generic storage endpoint. The macOS package uses a user LaunchAgent with auto-restart and seven-day local work cleanup. It is ready for production activation only after the live bridge publication and an on-Mac LaunchAgent health/restart check.

75 sequential 4×2 contact sheets cover the 600 narrative frames; two additional images inspect the static outro. Claude receives stored image URLs, script/caption checks and scene labels. This is one model review, not an assurance that AI cannot miss a visible breach. Human review remains applicable: the saved Reel #8 test illustrates a missed headscarf breach that was correctly overridden by operator QC.

## Deployment boundary

The bridge is part of the website deployment and uses the managed `ELEVAY_RENDER_WORKER_TOKEN` secret. The Mac package remains a separate local runtime: it does not make the website container render video and it does not create a cloud-server, billing, or purchase commitment. Do not run the worker in this sandbox as unattended production infrastructure. The current task executor must actually switch to the selected Mac before any agent-led local activation or validation can occur.

## Sandbox test

Only Reels #8 and #5 were rendered using their saved clips/voices. Both received one final Claude review. Reel #5 was sent to its weekly-plan item for individual approval. Reel #8 was sent with its completed media but changed to QC failed / Needs review after operator QC found unrequested headwear; it was not regenerated or approved.
