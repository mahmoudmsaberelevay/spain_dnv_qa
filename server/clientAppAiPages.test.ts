import express from "express";
import { createServer, type Server } from "http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerClientAppAiPages } from "./clientAppAiPages";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  registerClientAppAiPages(app);
  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test_server_address_unavailable");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe("ELEVAY Client in-app website AI pages", () => {
  it("serves the six-question AI Guide with liquid-glass mobile styling", async () => {
    const response = await fetch(`${baseUrl}/client-app/ai-guide`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-security-policy")).toContain("connect-src 'self'");
    expect(html).toContain("Start the AI questionnaire");
    expect(html).toContain("Question '+(index+1)+' of '+questions.length");
    expect(html).toContain("Your top three program matches");
    expect(html).toContain("backdrop-filter:blur(20px)");
  });

  it("serves Layla chat with safe rendering, bounded input, privacy guidance, and the public API endpoint", async () => {
    const response = await fetch(`${baseUrl}/client-app/ai-chat`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("AI Global Mobility Advisor · ELEVAY");
    expect(html).toContain("maxlength=\"2000\"");
    expect(html).toContain("/public-api/layla/chat");
    expect(html).toContain("Do not send passport, bank, or document details");
    expect(html).toContain("bubble.textContent=content");
    expect(html).not.toContain("innerHTML=content");
  });
});
