# ELEVAY Contracting — DocuSign setup and workflow

The integration adds a DocuSign action to the existing Contracting → Contracts page. It uploads the exact saved generated contract, keeps an envelope history, and creates a shareable invitation that opens a fresh DocuSign signing session. It does not regenerate the contract or modify its original value, discounts, receipts, payments or Lead conversion.

## Connect your DocuSign account

You need a DocuSign developer account for demo testing. Sending real contracts requires a production account with the eSignature API entitlement and an integration key promoted through DocuSign's Go-Live process. A normal eSignature subscription should not be assumed to include the API entitlement. Confirm the appropriate plan with DocuSign before buying or activating anything. [1]

In DocuSign Apps and Keys or Developer Console, create an ELEVAY integration key. Create an RSA key pair for server-side JWT authentication. Choose the DocuSign user whose account ELEVAY will use; a least-privilege dedicated sender is preferable to a full administrator. Record that user's UUID and the exact account UUID. [2]

Add these settings in the ELEVAY website's managed **Settings → Secrets** panel, never in chat or the repository:

- `DOCUSIGN_ENVIRONMENT`: `demo` for development, or `production` only after production activation.
- `DOCUSIGN_INTEGRATION_KEY`: the integration key UUID from DocuSign.
- `DOCUSIGN_USER_ID`: the UUID of the DocuSign sender user, not their email address.
- `DOCUSIGN_ACCOUNT_ID`: the exact DocuSign account UUID selected for this integration.
- `DOCUSIGN_RSA_PRIVATE_KEY`: the complete RSA private key in PEM format, including its begin/end lines and line breaks.
- `DOCUSIGN_LINK_SECRET`: a cryptographically random value of at least 32 characters, dedicated to protecting ELEVAY signing invitations. Keep it stable; replacing it invalidates existing invitations.

DocuSign requires one-time consent from the configured sender for the `signature` and `impersonation` scopes. Register `https://elevay.vip/contracting/contracts` as an allowed redirect URI in your integration. Open DocuSign's consent URL in your own browser for the correct environment, using your integration key as `client_id`, `response_type=code`, `scope=signature%20impersonation`, and that exact redirect URI. The returned authorization code is not used by this server-side JWT integration and must not be pasted into chat. [2] [3]

After managed settings are saved, redeploy the website so its production server reloads them. A readiness indicator reporting that settings are present is not proof that DocuSign authentication or account entitlement works; credential validation must succeed before a real contract upload.

## Prepare a contract and copy its invitation

1. Open **Contracting → Contracts**, then use the contract's **DocuSign** action. The contract must have a saved generated file and still be pending.
2. Confirm the intended recipient's name and email address and the displayed contract identity. The upload acknowledgement refers to this exact contract and recipient. Do not use a real client's details for initial testing.
3. Choose **Create DocuSign draft**. This uploads the existing file to DocuSign and stores a separate envelope record. It does not automatically send the contract to the client.
4. Open DocuSign's preparation view. Review the converted document carefully, place all necessary client signature fields, and use DocuSign's own **Send** action only after your review. The existing approved contracts have multiple signature areas, so this release does not guess where signatures belong.
5. Return to ELEVAY and refresh the envelope status. Refreshes use a cached status and respect DocuSign's polling limits. Only a sent/delivered envelope with the expected recipient and required signature fields is eligible for a client invitation.
6. Copy the ELEVAY signing link and send it to the intended client by your usual channel. The invitation is valid for up to 30 days, unless revoked, expired or invalidated by a document change. Treat it as confidential: anyone with the complete link may be able to open that recipient's signing session.

A client does not need an ELEVAY CRM account. The public handoff page uses no CRM providers or third-party analytics. The invitation token is kept in a URL fragment, removed from the browser's visible address before the signing request, and never stored in browser storage. The client clicks **Continue to DocuSign**, which obtains a fresh provider URL. DocuSign's direct recipient-view URLs expire after five minutes and are single-use, so the application must not copy or email those short-lived URLs as permanent invitations. [4]

The sender-preparation URL also expires. Reopen it from ELEVAY if the original tab is no longer valid. The supported sender-view request restricts the view to the individual draft rather than exposing the full DocuSign console. [5]

## Status, preservation and limitations

DocuSign envelope status remains separate from the CRM's contract status. A return URL containing `signing_complete` is not evidence of completion. This release preserves the existing manual **Mark Signed** workflow and does not trigger financial postings, change balances or convert a Lead based on a browser redirect. [4]

Existing contract and envelope histories are preserved. A retry must not silently create duplicate envelopes after an uncertain provider response. If the original source contract is changed, the invitation must be rejected rather than opening a stale document for signing. Revoking the local ELEVAY invitation does not void or delete the envelope in DocuSign.

This release has not sent any real contract, performed a client signature, purchased a DocuSign plan or changed existing CRM contract/Lead/financial records. Production connection and a consented demo-envelope test remain dependent on the account configuration above.

## References

[1]: https://developers.docusign.com/platform/go-live/ "DocuSign integration promotion and production API requirements"
[2]: https://developers.docusign.com/platform/auth/jwt-get-token "DocuSign server-side JWT authentication"
[3]: https://developers.docusign.com/platform/auth/consent/obtaining-individual-consent/ "DocuSign individual consent for signature and impersonation scopes"
[4]: https://developers.docusign.com/docs/esign-rest-api/reference/envelopes/envelopeviews/createrecipient "DocuSign recipient view expiry and return event limitations"
[5]: https://developers.docusign.com/docs/esign-rest-api/reference/envelopes/envelopeviews/createsender/ "DocuSign scoped sender preparation view"
