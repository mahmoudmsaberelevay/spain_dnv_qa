# ELEVAY external reel renderer

## Why

The 512 MiB web container shares memory with child processes and its temporary filesystem. A spawned FFmpeg process is not an OOM isolation boundary. The website must never render reels or extract final-review frames. All reel encoding and final visual evidence creation belong on an external worker or a managed render API.

## Website

`createRenderQueue(q)` persists a stable input-manifest hash in `ec_render_jobs`. Four stored clip URLs and four stored voice-take URLs are mandatory. Identical inputs reuse the same job/output. The website returns `Waiting for render worker` until the worker has uploaded and committed its result. There is no website-local FFmpeg fallback.

New reel flow: storyboard → keyframes → clips (existing owner gate) → ELEVAY voice → external final edit → one comprehensive final Claude check → weekly plan. Old runs migrate by action, preserving generated assets and existing approvals.

Failed final scene reviews regenerate only explicitly named scenes, up to two repair rounds. Matching keyframes/clips and normalized segments are invalidated; other clips and all voice takes survive. Manual Higgsfield approval is reopened when applicable. Invalid/non-scene failures stop at `needs_review`, not arbitrary regeneration. No-regeneration sandbox runs never replace a clip or voice.

## Worker

`scripts/elevay-render-worker.ts` is an external disk-backed process, not a website startup task. It leases persisted jobs, renders one at a time, stores each normalized segment/outro/audio as soon as complete, concatenates H.264 segments without re-encoding, then stream-copies video and AAC audio into the final MP4. FFmpeg decoder, encoder and filter thread settings are one. The final result is 1080×1920, 30 fps, 23 seconds.

Input downloads and output uploads are streamed. Temporary files live on worker disk. Linux `/proc` RSS is sampled every 25 ms for the worker process and its descendants; this is sampled process memory, not total host/cgroup memory or filesystem cache. Output metadata includes the observed peak and FFmpeg-only peak.

A 15-minute lease with 30-second renewal prevents simultaneous claims. Expired leases can be reclaimed. Ordinary failures permit three additional attempts separated by two minutes, retaining stored pieces. Terminal failures send dashboard/owner and email notifications, and remain visible in persisted state. Supervisor configuration, least-privilege credentials and disk cleanup must be added during the chosen production deployment. The worker is not production-ready until those controls and failure/restart tests are verified on the chosen host.

75 sequential 4×2 contact sheets cover the 600 narrative frames; two additional images inspect the static outro. Claude receives stored image URLs, script/caption checks and scene labels. This is one model review, not an assurance that AI cannot miss a visible breach. Human review remains applicable: the saved Reel #8 test illustrates a missed headscarf breach that was correctly overridden by operator QC.

## Deployment boundary

As requested on 10 October 2026, no production worker, hosting/billing change, purchase or website publication was performed during this implementation. The new waiting behavior is part of the saved source/checkpoint, not an assertion that old deployed code has changed. It needs a website safety-update publication before it can protect new runs on the live domain. Do not run the worker in this sandbox as unattended production infrastructure.

## Sandbox test

Only Reels #8 and #5 were rendered using their saved clips/voices. Both received one final Claude review. Reel #5 was sent to its weekly-plan item for individual approval. Reel #8 was sent with its completed media but changed to QC failed / Needs review after operator QC found unrequested headwear; it was not regenerated or approved.
