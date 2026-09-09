# ELEVAY Executive Notification Recipient Matrix

**Author:** Manus AI  
**Effective date:** 9 September 2026

The ELEVAY notification policy now treats **Mahmoud Saber** and **Ziad El Shurafa** as event-specific executive recipients rather than automatically copying them on every system message. The recipient resolver first removes all known Mahmoud and Ziad addresses from an event’s original recipient list and then adds back only the executives authorized for that event.[1]

| Automatic event | Mahmoud | Ziad | Other operational recipients |
| --- | --- | --- | --- |
| New contract created | Yes | Yes | None added by this notification |
| Contract marked as signed | Yes | Yes | None added by this notification |
| New receipt created | Yes | Yes | None added by this notification |
| Receipt marked as paid | Yes | Yes | None added by this notification |
| New Lead assigned | Yes | No | The assigned consultant remains included when a valid consultant email exists |
| Every other automatic category | No | No | Explicit non-executive recipients remain included |

> In the current Contracting module, a receipt’s completed status is named **paid**. Therefore, “receipt marked as signed” is implemented at the existing **Receipt Marked as Paid** transition, without changing financial status terminology or payment calculations.[2]

Contract status messages are sent only when a contract actually transitions to **signed**. Pending and cancelled status changes do not notify Mahmoud or Ziad, and submitting the same signed status again does not duplicate the signed notification or its related workflow actions.[2]

Receipt creation and receipt-paid notifications use the same explicit matrix. Client receipt delivery remains a separate client-facing transaction and does not copy internal recipients. Password-reset emails and other client-facing messages also remain isolated from the executive-recipient policy.[3]

Lead assignment email retains the assigned consultant, adds Mahmoud, and removes Ziad. The CRM notification bell now contains a dedicated `lead_assigned` event. Mahmoud can see that event, while Ziad cannot; both executives can see contract-created, contract-signed, receipt-created, and receipt-paid events. Other staff retain their existing notification visibility.[1] [4]

Unrelated scheduled reports, backup emails, reminders, support messages, Client Portal staff events, document notifications, Meta summaries, finance-client alerts, and operational warnings no longer add Mahmoud or Ziad automatically. Where another employee is explicitly assigned, that non-executive recipient remains eligible. The established rule prohibiting an `@elevay.com` sender address remains unchanged.[1] [3] [5]

The recipient matrix itself was verified through mocked SMTP delivery; no synthetic contract, receipt, or Lead record was created to test it. The tests covered all allowed events, prohibited events, client-facing exclusions, assigned-consultant preservation, case-insensitive deduplication, and CRM notification-bell visibility. The focused suite passed **40 tests**, and the production build completed successfully with only the three documented pre-existing authentication-route import warnings.[6]

## References

[1]: ../server/systemNotificationRecipients.ts "Event-specific executive recipient resolver"
[2]: ../server/routers.ts "Contract and receipt event handlers"
[3]: ../server/emailService.ts "System and client-facing email functions"
[4]: ../server/routers/leads.ts "Lead assignment notification event"
[5]: ../server/clientPortalRoutes.ts "Client Portal staff notification routing"
[6]: ../server/systemNotificationEmailIntegration.test.ts "Notification recipient integration regressions"
