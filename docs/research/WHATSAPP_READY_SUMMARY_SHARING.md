# WhatsApp Ready Summary Sharing — Official Reference Notes

**Author:** Manus AI  
**Reviewed:** 9 September 2026

Meta’s official WhatsApp Business Platform documentation states that document messages can carry a PDF by uploaded media ID or a hosted media URL, with an optional filename and caption. PDF files are officially supported up to 100 MB.[1]

Meta also states that free-form service messages can be sent only during an open 24-hour customer-service window after the WhatsApp user messages or calls the business. Outside that window, an approved template is required, and recipients must have opted in.[2]

The user selected a different workflow for Ready Summaries: the CRM prepares a secure PDF link and opens `wa.me` with a prefilled title and link. The CRM user then chooses the WhatsApp recipient and presses Send manually. The CRM therefore does not call the Cloud API, does not select or store a recipient number, and does not claim delivery.

## References

[1]: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/document-messages "Meta for Developers — Document messages"
[2]: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages "Meta for Developers — Service messages and customer service windows"
