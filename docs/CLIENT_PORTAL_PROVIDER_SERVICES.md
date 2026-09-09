# Client Portal Providers and After Settlement Services

## Provider Administration

The **Providers** tab now supports creating, editing, and deleting provider records. Existing providers retain their current details and appear as responsive cards with explicit **Edit** and **Delete** actions. Deletion requires confirmation and writes an audit event. If a deleted provider was linked to an After Settlement Service, the service remains available but its provider link is removed.

Administrators can set the provider type, name, country, city, contact channels, website, price, currency, description, services, languages, availability, display order, and client visibility.

## Provider Cover Photos

The provider editor accepts one JPG, PNG, or WebP cover photo up to 5 MB. The browser validates the basic file type and size, while the server independently validates the declared MIME type, file extension, decoded size, and binary signature before storage.

Validated photos are uploaded through the platform storage layer using a non-enumerable provider-specific key. Only the public image URL is exposed to clients; the storage key remains server-side. Replacing a photo updates the stored reference. Removing a photo drops the database key and URL, which makes the underlying object unreachable through the application. Provider cards fall back to the existing logo or a branded placeholder when no cover photo is assigned.

## After Settlement Services

The **After Settlement Services** tab provides a separate bilingual catalog for services used after approval and settlement. Administrators can create, edit, hide, order, link, and delete service cards.

Each service supports a category, English and Arabic titles, English and Arabic descriptions, an optional linked provider, display order, and client visibility. Optional actions can be configured as phone, WhatsApp, email, or website links with bilingual button labels. Information-only services do not require an action value.

Only active services are exposed through the client content API. Linked provider details are included only when that provider is also active. Provider storage keys and inactive provider details are never returned to clients.

## Authorization and Audit

CRM management procedures are administrator-only. Native Client Portal administration routes retain their existing portal-administrator authorization and review-account scope restrictions. Provider creation, editing, deletion, cover-photo changes, and service catalog changes are recorded in the audit history without storing image bytes or sensitive storage metadata in audit descriptions.

## Validation

Migration `0071_client_portal_provider_services.sql` adds provider cover-photo metadata and the After Settlement Services table without dropping or rewriting legacy provider data. Production verification preserved the existing single provider and created no service or cover-photo record during non-mutating browser checks.

Twenty-nine focused Client Portal tests passed, covering file validation, non-enumerable storage keys, additive schema changes, administrator permissions, audit coverage, provider and service controls, API privacy, native-route parity, and create-mode editor initialization. The production build also completed successfully. Desktop and mobile administration layouts were verified without saving test data.
