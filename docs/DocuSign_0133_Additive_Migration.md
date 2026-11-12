# DocuSign status synchronization migration 0133

`drizzle/0133_contract_docusign_sync_settings.sql` creates only the initially empty `contractDocusignSyncSettings` table, with a unique nullable task UID and fenced lease metadata. It neither updates an existing table nor initializes/enables a schedule.

The ordinary repository-wide Drizzle generator detected pre-existing unrelated `marketing_plans` naming drift. It was stopped before accepting any rename or creating SQL. The migration was generated with `drizzle-kit generate --dialect=mysql` against an isolated schema export containing only `contractDocusignSyncSettings`, and reviewed before application. Historical migration snapshots and SQL files were not rewritten.

The envelope metadata additions are TypeScript descriptions of the existing JSON column, not SQL column changes. Future production envelopes opt into verified completion; existing Demo and production envelope rows retain their original behavior. Owner activation is separate and requires deployed production configuration.
