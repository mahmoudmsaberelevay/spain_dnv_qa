# ELEVAY owner-authorized content revisions

An authenticated owner's explicit change request is content approval for the resulting scope-limited revision, not permission to publish or spend. The Command Center keeps the active version visible until the final Claude check succeeds. It then saves the previous complete snapshot, increments the version and replaces the active content with a short change note. Failed QC leaves the active item untouched.

## Revision flow

`POST /admin/api/items/:id/revision` accepts only `comment`, `scope` and optional `clip`. The server derives identity and authority from the signed-in owner; it does not trust caller-provided approval fields. A durable `revise_item` job is saved before production, bound to the run ID and checked again at the final atomic commit. Optimistic base-version comparison prevents overwriting a newer revision.

| Scope | New work | Saved output reused |
| --- | --- | --- |
| Caption | Revised MSA caption + final Claude check | All images, clips, voice takes, final video |
| Schedule | New intended Cairo time + final Claude check | All content/media; no Meta schedule operation |
| Reel scene | Selected keyframe + selected Higgsfield clip + sandbox/external render + final check | Other scenes and all narration |
| Voice | Selected Egyptian Arabic line/take + render + final check | All keyframes and clips; unaffected voice takes |
| Static design | Affected static design + final review | Caption and schedule |
| Carousel slide | Selected slide image/headline + full-carousel final review | All unaffected slides, caption and schedule |
| Whole concept | Complete fresh production + final review | Old active version retained until checked |

Structured carousel revisions use `carousel.slides` with durable `slide`, `headline_en`, `image_prompt` and `image_url` fields and ordered `media.image_urls`. Unknown/unstructured legacy carousel assets fail closed rather than being silently replaced.

## History and rollback

History retains full snapshots without the former 8/20-version trim. Every content item offers version previews, comparison with the active version, and owner-only Restore. Restoring an earlier snapshot creates another new version and preserves the version that was active before restoring. It does not publish.

## Content approval is distinct from publication

Reviewed versions use `revision_approved` and a versioned `publish.revision_hold`. They are not sent back to the content approval queue. This state cannot be mistaken for an `approved` posting job by older publishing code. The current Meta module also excludes held revisions and the publication-status domain helper rejects them. No change request, final QC, version restore or W41 rebuild triggers a Meta publishing/spending/scheduling job.

## Render boundary

The 512 MB website process never runs reel FFmpeg rendering. Production revisions that require a new render wait in the durable render queue as “Waiting for render worker.” The authorized W41 rebuild runs as a finite sandbox dispatcher, using one isolated disk-based single-thread render at a time. Its sandbox-only run states are excluded from website startup/tick execution. No production render worker is deployed by this implementation.
