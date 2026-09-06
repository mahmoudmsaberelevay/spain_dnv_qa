# Temporary Meta and CRM Monitoring Schedule

**Configured:** 6 September 2026, 15:56 Africa/Cairo  
**Mode:** Read-only AI review inside the current Manus task

| Field | Verified value |
|---|---|
| Active trigger type | `SCHEDULE_TYPE_INTERVAL` |
| Interval | `28,800` seconds / 8 hours |
| Expected review 1 | 6 September 2026, approximately 23:56 Africa/Cairo |
| Expected review 2 | 7 September 2026, approximately 07:56 Africa/Cairo |
| Expected review 3 | 7 September 2026, approximately 15:56 Africa/Cairo |
| Expiry | 7 September 2026, 16:06 Africa/Cairo |
| Status | Active |
| Connectors | Meta Ads Manager, ELEVAY CRM, My Browser |
| Write actions | Prohibited by the schedule detail |

The status payload still retains a historical `cronExpression` value, but the active discriminator is `scheduleTime.type = SCHEDULE_TYPE_INTERVAL` with `intervalSeconds = 28800`. The interval mode therefore governs the temporary monitor.

The normal weekly configuration is preserved in `/home/ubuntu/elevay_weekly_schedule_restore_detail.txt`. The third run is instructed to restore title `Elevay Spain and Malta Meta Ads Weekly Review`, cron `0 0 9 * * 0`, timezone `Africa/Cairo`, repeated and enabled status, and long-term expiry `2099-12-31T21:59:59Z`, then verify the restored status.
