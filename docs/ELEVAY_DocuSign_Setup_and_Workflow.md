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
- `DOCUSIGN_PRIVATE_KEY_BASE64` (recommended): single-line standard Base64 encoding of the **complete original RSA private-key PEM**, including its begin/end lines and original line breaks. This avoids multiline secret-entry problems. The backend alone decodes it, checks canonical Base64 and UTF-8, and validates an unencrypted RSA private key of at least 2048 bits before JWT signing. Both PKCS8 `BEGIN PRIVATE KEY` and PKCS1 `BEGIN RSA PRIVATE KEY` are accepted. The encoded value remains a secret: Base64 is **encoding, not encryption**.
- `DOCUSIGN_RSA_PRIVATE_KEY` (legacy alternative): the complete original private-key PEM. It is used only if `DOCUSIGN_PRIVATE_KEY_BASE64` is absent or explicitly empty. If a nonempty Base64 setting is invalid, the connection fails closed; it does not silently use an old PEM key. Neither format is ever returned by readiness or the public signing page.
- `DOCUSIGN_LINK_SECRET`: a cryptographically random value of at least 32 characters, dedicated to protecting ELEVAY signing invitations. Keep it stable; replacing it invalidates existing invitations.

Encode the entire original PEM **locally on the owner's computer**, not just its inner key body, and paste the result only into the managed `DOCUSIGN_PRIVATE_KEY_BASE64` secret field. Do not add quotes, a data-URL prefix, or line wrapping. Do not upload the PEM, print the encoded key in Terminal, or paste either representation in chat. Keep the original private key in protected local storage. Encoding must not change the RSA pair registered with DocuSign.

For the Mac key saved by the earlier validated clipboard-save step in a protected `~/.elevay-docusign-*` directory, run the command below. It requires exactly one such directory, validates the existing private key, and copies the **single-line encoded value only to the clipboard**. It displays neither the original nor the encoded key, changes no file, and refuses to guess if multiple saved key directories exist. After it reports success, paste directly into the secret field without copying any other text first.

```bash
node -e '
try {
  const fs = require("node:fs");
  const path = require("node:path");
  const home = require("node:os").homedir();
  const crypto = require("node:crypto");
  const { execFileSync } = require("node:child_process");
  const dirs = fs.readdirSync(home).filter(name => name.startsWith(".elevay-docusign-"));
  if (dirs.length !== 1) throw 0;
  const file = path.join(home, dirs[0], "private-key.pem");
  const info = fs.lstatSync(file);
  if (!info.isFile() || (info.mode & 0o077) !== 0) throw 0;
  const pem = fs.readFileSync(file);
  const key = crypto.createPrivateKey(pem);
  if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw 0;
  execFileSync("/usr/bin/pbcopy", { input: pem.toString("base64"), stdio: ["pipe", "ignore", "ignore"] });
  console.log("BASE64 COPIED SECURELY. Paste directly into DOCUSIGN_PRIVATE_KEY_BASE64. Do not paste in chat.");
} catch {
  console.log("COPY FAILED: exactly one protected saved key is required. No key was displayed.");
  process.exitCode = 1;
}
'
```

Base64 is not encryption: treat the clipboard as confidential. After the secret has been saved, clear the clipboard with `printf "" | pbcopy`.

The backend bounds the decoded PEM to 16 KiB, rejects malformed or noncanonical Base64 (including invalid padding), invalid UTF-8, public keys, encrypted keys, non-RSA keys, multiple PEM blocks, and undersized RSA keys. Readiness exposes only configured/environment/missing-setting **names**. Configuration failures return `SETTINGS_REQUIRED`; raw Base64, decoded PEM, key fragments and OpenSSL errors are never logged or attached as an error cause.

DocuSign requires one-time consent from the configured sender for the `signature` and `impersonation` scopes. Register `https://elevay.vip/sign-contract/return` as an allowed redirect URI in your integration. Open DocuSign's consent URL in your own browser for the correct environment, using your integration key as `client_id`, `response_type=code`, `scope=signature%20impersonation`, and that exact redirect URI. The returned authorization code is not used by this server-side JWT integration and must not be pasted into chat. The standalone return page uses no-store/no-referrer headers and removes the query from the visible address. [2] [3]

After managed settings are saved, redeploy the website so its production server reloads them. A readiness indicator reporting that settings are present is not proof that DocuSign authentication or account entitlement works; credential validation must succeed before a real contract upload.

## Prepare a contract and copy its invitation

1. Open **Contracting → Contracts**, then use the contract's **DocuSign** action. The contract must have a saved generated file and still be pending.
2. Confirm the intended recipient's name and email address and the displayed contract identity. The upload acknowledgement refers to this exact contract and recipient. Do not use a real client's details for initial testing.
3. Choose **Create DocuSign draft**. This uploads the existing file to DocuSign and stores a separate envelope record. It does not automatically send the contract to the client.
4. Open DocuSign's preparation view. For Spain's **12 November 2026** template, required client signatures and initials are placed automatically and checked against the converted document. Review every page and field before using DocuSign's own **Send** action. Other programs retain manual placement of necessary client signature fields. This application never sends an envelope automatically.
5. Return to ELEVAY and refresh the envelope status. Refreshes use a cached status and respect DocuSign's polling limits. Only a sent/delivered envelope with the expected recipient and required signature fields is eligible for a client invitation.
6. Copy the ELEVAY signing link and send it to the intended client by your usual channel. The invitation is valid for up to 30 days, unless revoked, expired or invalidated by a document change. Treat it as confidential: anyone with the complete link may be able to open that recipient's signing session.

### Spain: required client signatures and initials

Only the **Second Party / client** receives these fields. Four mandatory full signatures follow the first page, final main-contract signature, final services-annex signature and final client-acknowledgment signature. The owner approved semantic section matching instead of fixed page numbers, because Word and DocuSign can paginate differently. Every other actual PDF page receives a mandatory bottom-left initial. If the services and acknowledgment signatures share one physical page, both full signatures remain required and that page receives no redundant page-footer initial.

Nine additional mandatory clause initials are beside **6-1 (ب: تقسيم الدفعات; ج: final/non-refundable payments)**, **7-5**, **7-7**, **8-5**, **Article 9**, **10-2**, **12-4** and **12-1 (ج)**. The owner specifically selected 12-1-ج, not 12-2-ج. Company signatures are never assigned to the client.

The revision retains the old `2026-09-23` file and selects the versioned `2026-11-12` file for future generation. It removes thirteen excess empty paragraphs from the identified table spacer and starts the services-annex heading cleanly on a separate page. All legal text, prices, dates, header/footer assets and company/client signature sections are preserved. Invisible unique 1-point white marker runs identify the exact approved field locations; this follows DocuSign's documented anchor-marker practice. See `Spain_Contract_Template_2026_11_12_Revision.json` for editor/date, hashes and paragraph IDs. [6]

Older saved Spain Word documents are **never overwritten or silently regenerated**. Before a new Spain draft can use this policy, an authorized user must explicitly regenerate and review its pending contract with the new template. Existing sent/completed envelopes keep their original history and signing behavior. A completed dummy cannot be modified or reused for a new signing ceremony.

The backend downloads only document 1 of the reserved draft, reads its actual PDF page dimensions and marker coordinates, and rejects missing/duplicate markers, unsupported layouts or out-of-bounds/overlapping fields rather than guessing. It creates four required `signHereTabs` and the exact set of required `initialHereTabs`, with no optional, conditional or grouped escape. Setup is reserved durably in the existing ledger JSON before the one-time tab POST. A lost response is reconciled by reading the same draft, never by blindly recreating an envelope or repeating tab creation. Field removal, movement, optionalization or recipient changes block new CRM signing invitations and fresh recipient sessions even during the normal polling cache. [7]

Source validation requires the exact approved template XML and untouched other document parts, allowing only the generator's client-name, family-size and value substitutions. Saved signing metadata is validated for complete coverage and finite, in-page coordinates before use. Required fields use the fixed reviewed scale; extra existing signature fields stop setup for review before a tab-write reservation is consumed. Before reusing a draft, sharing an invitation or opening a client session, the provider inventory must contain only document 1, and its current canonical text/geometry and recalculated field map must match the saved plan. The checks run outside database locks; short contract/envelope checks share one connection, and a concurrent revocation discards a freshly returned private session URL.

A client does not need an ELEVAY CRM account. The public handoff page uses no CRM providers or third-party analytics. The invitation token is kept in a URL fragment, removed from the browser's visible address before the signing request, and never stored in browser storage. The client clicks **Continue to DocuSign**, which obtains a fresh provider URL. DocuSign's direct recipient-view URLs expire after five minutes and are single-use, so the application must not copy or email those short-lived URLs as permanent invitations. [4]

The sender-preparation URL also expires. Reopen it from ELEVAY if the original tab is no longer valid. The supported sender-view request restricts the view to the individual draft rather than exposing the full DocuSign console. [5]

## Status, preservation and limitations

DocuSign envelope status remains separate from the CRM's contract status. A return URL containing `signing_complete` is not evidence of completion. This release preserves the existing manual **Mark Signed** workflow and does not trigger financial postings, change balances or convert a Lead based on a browser redirect. [4]

Existing contract and envelope histories are preserved. A retry must not silently create duplicate envelopes after an uncertain provider response. If the original source contract is changed, the invitation must be rejected rather than opening a stale document for signing. Revoking the local ELEVAY invitation does not void or delete the envelope in DocuSign.

No real client contract has been sent or signed by this integration setup. The owner-authorized, nonbinding €0 Demo pilot completed before this Spain field-policy revision; that completed envelope is preserved. The new automatic Spain field policy is covered by synthetic provider/service/PDF tests, but a new live Demo ceremony requires separate owner authorization. Production API activation remains separate from Demo configuration.

## References

[1]: https://developers.docusign.com/platform/go-live/ "DocuSign integration promotion and production API requirements"
[2]: https://developers.docusign.com/platform/auth/jwt-get-token "DocuSign server-side JWT authentication"
[3]: https://developers.docusign.com/platform/auth/consent/obtaining-individual-consent/ "DocuSign individual consent for signature and impersonation scopes"
[4]: https://developers.docusign.com/docs/esign-rest-api/reference/envelopes/envelopeviews/createrecipient "DocuSign recipient view expiry and return event limitations"
[5]: https://developers.docusign.com/docs/esign-rest-api/reference/envelopes/envelopeviews/createsender/ "DocuSign scoped sender preparation view"
[6]: https://developers.docusign.com/docs/esign-rest-api/esign101/concepts/tabs/auto-place "DocuSign unique invisible anchor markers for moving layouts"
[7]: https://developers.docusign.com/docs/esign-rest-api/reference/envelopes/enveloperecipienttabs/create "DocuSign required client signature and initial tabs"
