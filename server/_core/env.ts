export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  oAuthPortalUrl: process.env.VITE_OAUTH_PORTAL_URL ?? "https://manus.im",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // ElevenLabs text-to-speech — server-side only
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? "",
  // Meta Pixel & Conversions API
  metaPixelId: process.env.META_PIXEL_ID ?? "",
  metaCapiToken: process.env.META_CAPI_TOKEN ?? "",
  metaCapiTestCode: process.env.META_CAPI_TEST_CODE ?? "",
  // Google Drive backup
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN ?? "",
  newsGmailClientId: process.env.NEWS_GMAIL_CLIENT_ID ?? "",
  newsGmailClientSecret: process.env.NEWS_GMAIL_CLIENT_SECRET ?? "",
  // Administrative AI Council — server-only provider credentials
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  // Managed secret forms can preserve an accidental trailing newline or space.
  // Normalize centrally so every API v2 caller receives the same credential bytes.
  manusApiKey: (process.env.MANUS_API_KEY ?? "").trim(),
};
