# Client Portal Account Passwords and Documentation Assignments

## Account Creation

Administrators now enter the initial Client Portal password directly when creating client access. The form requires password confirmation and displays the active security rules: at least 10 characters, uppercase, lowercase, number, symbol, no spaces, and no more than 72 UTF-8 bytes. Browser password-manager suppression attributes are applied to the administration form.

The server validates the same policy, immediately hashes the password with the existing bcrypt cost, and stores only the hash. The password is never returned by the account-creation API, added to audit records, or displayed after creation.

## Existing Account Password Editing

Every client account card includes **Edit password**. The administrator enters and confirms a new custom password under the same strong-password policy used during account creation. Saving hashes the password server-side, clears failed-login locks and outstanding reset tokens, sets the account to use the custom password directly, and revokes all active Client Portal sessions. The API returns only a success result; it never returns or displays the new password.

## Documentation Assignment Editing

Every client account card includes **Edit documentation**. Administrators can search Client Documentation folders by client name, code, or programme; add or remove selections; and choose one selected folder as the primary application. At least one active folder and one primary folder are required.

Saving replaces the account's active documentation access. Removed folders are soft-revoked instead of deleted, preserving assignment history. A previously removed folder can be restored without creating a duplicate user-case mapping. All active Client Portal sessions for the account are revoked after a change so removed access stops immediately and the client must sign in again.

## Access and Audit Safeguards

Client-visible application lists, application details, documents, document review, stage evidence, lifecycle notifications, and ownership checks all require an active assignment. Revoked folders are excluded from every Client Portal access path.

Account creation, custom password changes, and assignment changes write count-only audit descriptions. Password values and client-document contents are never included. Review-account scope remains restricted to the configured review client.

## Validation Evidence

The additive migration introduced assignment revocation metadata and an active-access index while reusing the existing unique portal-user/client-case constraint. Production verification preserved four client accounts, six active assignments, four active primary assignments, ten active sessions, zero duplicate user-case mappings, zero accounts without active folders, and zero invalid primary mappings. No production account or assignment was changed during browser validation.

Nineteen focused Client Portal regression tests passed, covering manual-password creation and editing, bcrypt length boundaries, account input validation, assignment add/restore/revoke planning, API non-disclosure, UI controls, migration safety, and existing security protections. The production build also completed successfully.
