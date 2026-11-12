import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile, mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import {
  fetchPlaudTranscriptDownload, formatPlaudDate, formatPlaudDuration, plaudRangeError,
  plaudSafeError, safePlaudAuthorizationUrl, validPlaudDate, PlaudDownloadError,
} from "../client/src/lib/plaudUi";
import { PLAUD_SHARED_NOTICE } from "../shared/plaud";

const project = path.resolve(import.meta.dirname, "..");
const range = { from: "2026-11-01", to: "2026-11-12" };
const transcript = "المتحدث ١: مرحباً\nEnglish speaker: Keep <script>alert(1)</script> literal.\n\nSecond paragraph.";

function streamingResponse(bytes: Uint8Array, count = "2") {
  return new Response(new ReadableStream({ start(controller) {
    // Intentionally split a UTF-8 Arabic codepoint and use a backed subarray.
    const storage = new Uint8Array(bytes.length + 4);
    storage.set(bytes, 2);
    controller.enqueue(storage.subarray(2, 3));
    controller.enqueue(storage.subarray(3, 8));
    controller.enqueue(storage.subarray(8, bytes.length + 2));
    controller.close();
  } }), { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Plaud-Transcript-Count": count } });
}

describe("Plaud UI pure helpers (synthetic only)", () => {
  it("accepts complete real dates and rejects incomplete, impossible or reversed export ranges", () => {
    expect(validPlaudDate("2024-02-29")).toBe(true);
    for (const value of ["2026-02-29", "2026-11-31", "2026-2-01", "0000-01-01", "not a date"]) expect(validPlaudDate(value)).toBe(false);
    expect(plaudRangeError({})).toBeNull();
    expect(plaudRangeError({}, true)).toMatch(/both/);
    expect(plaudRangeError({ from: range.from })).toMatch(/both/);
    expect(plaudRangeError({ from: "2026-11-20", to: range.to })).toMatch(/before/);
    expect(plaudRangeError(range, true)).toBeNull();
  });
  it("formats the backend business timezone rather than the employee timezone, including DST", () => {
    expect(formatPlaudDate(Date.parse("2026-11-12T22:30:00Z"), "Africa/Cairo")).toContain("13 Nov 2026");
    expect(formatPlaudDate(Date.parse("2026-03-08T06:30:00Z"), "America/New_York")).toContain("01:30");
    expect(formatPlaudDate(Date.parse("2026-03-08T07:30:00Z"), "America/New_York")).toContain("03:30");
    expect(formatPlaudDate(null, "Africa/Cairo")).toBe("Date unavailable");
    expect(formatPlaudDate(0, "invalid-timezone")).toBe("Date unavailable");
    expect(formatPlaudDuration(61000)).toBe("1m 1s");
    expect(formatPlaudDuration(null)).toBeNull();
  });
  it("allows only the exact HTTPS Plaud authorization origin and path", () => {
    expect(safePlaudAuthorizationUrl("https://mcp.plaud.ai/authorize?state=test")).toBe("https://mcp.plaud.ai/authorize?state=test");
    for (const value of ["javascript:alert(1)", "https://evil.example/authorize", "http://mcp.plaud.ai/authorize", "https://mcp.plaud.ai.evil.example/authorize", "https://mcp.plaud.ai@evil.example/authorize", "https://user:secret@mcp.plaud.ai/authorize", "https://mcp.plaud.ai/mcp", "https://mcp.plaud.ai/authorize#secret"]) expect(safePlaudAuthorizationUrl(value)).toBeNull();
  });
  it("renders fixed failure vocabulary, never provider profiles, stacks, or arbitrary error text", () => {
    expect(plaudSafeError({ message: "PLAUD_TRANSCRIPT_NOT_READY" })).toMatch(/ready transcript/);
    expect(plaudSafeError({ message: "PLAUD_LEAD_IMPORT_DENIED" })).toMatch(/not authorized/);
    expect(plaudSafeError({ message: "PLAUD_SHARING_POLICY_CONFLICT" })).toMatch(/Company policy prevents/);
    expect(plaudSafeError({ message: "stack: secret@example.com token=abc" })).not.toMatch(/stack|secret|token|abc/);
    expect(plaudSafeError({ data: { code: "UNAUTHORIZED" } })).toMatch(/session has expired/);
  });
  it("downloads all server bytes exactly, reports honest byte progress and server count without scope parameters", async () => {
    const text = `${transcript}\n\n\n${"نص طويل mixed language\n".repeat(20000)}`;
    const bytes = new TextEncoder().encode(text);
    const fetcher = vi.fn(async () => streamingResponse(bytes, "87"));
    const progress: number[] = [];
    const result = await fetchPlaudTranscriptDownload(range, { fetcher, onProgress: value => progress.push(value) });
    expect(fetcher).toHaveBeenCalledWith("/api/plaud/transcripts/export?from=2026-11-01&to=2026-11-12", expect.objectContaining({ method: "GET", credentials: "include", mode: "same-origin", redirect: "error" }));
    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(bytes);
    expect(await result.blob.text()).toBe(text);
    expect(result.blob.type).toBe("text/plain;charset=utf-8");
    expect(result.count).toBe(87);
    expect(result.bytes).toBe(bytes.length);
    expect(progress).toEqual([1, 6, bytes.length]);
    expect(result.filename).toBe("plaud_transcripts_2026-11-01_to_2026-11-12.txt");
  });
  it.each([400, 401, 403, 404, 503, 500])("sanitizes HTTP %i without reading or displaying its response body", async status => {
    const fetcher = vi.fn(async () => new Response("private provider credentials and stack", { status }));
    try { await fetchPlaudTranscriptDownload(range, { fetcher }); throw new Error("expected rejection"); }
    catch (error) { expect(error).toBeInstanceOf(PlaudDownloadError); expect((error as Error).message).not.toContain("credentials"); }
  });
  it("rejects invalid ranges before fetch and malformed or absent count/type headers without producing a file", async () => {
    const fetcher = vi.fn();
    await expect(fetchPlaudTranscriptDownload({ from: range.to, to: range.from }, { fetcher })).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
    for (const count of ["", "0", "abc", "2.5", "-1"]) await expect(fetchPlaudTranscriptDownload(range, { fetcher: async () => streamingResponse(new TextEncoder().encode("text"), count) })).rejects.toMatchObject({ status: 503 });
    await expect(fetchPlaudTranscriptDownload(range, { fetcher: async () => new Response("<html>login</html>", { headers: { "Content-Type": "text/html", "X-Plaud-Transcript-Count": "1" } }) })).rejects.toMatchObject({ status: 503 });
  });
  it("fails a broken stream clearly and permits cancellation without downloading partial bytes", async () => {
    await expect(fetchPlaudTranscriptDownload(range, { fetcher: async () => new Response(new ReadableStream({ start(c) { c.error(new Error("synthetic retrieval failure")); } }), { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Plaud-Transcript-Count": "2" } }) })).rejects.toThrow("synthetic retrieval failure");
    const controller = new AbortController(); controller.abort();
    await expect(fetchPlaudTranscriptDownload(range, { signal: controller.signal, fetcher: async () => streamingResponse(new TextEncoder().encode("text")) })).rejects.toThrow();
  });
  it("adds one authenticated route and module entries without weakening existing guards", async () => {
    const app = await readFile(path.join(project, "client/src/App.tsx"), "utf8");
    const route = app.match(/<Route path="\/train-your-ai-agent">([\s\S]*?)<\/Route>/)?.[1];
    expect(route).toContain("<MobileRoute><TrainYourAiAgent /></MobileRoute>");
    expect(route).not.toContain("PageGuard");
    expect(app).toContain('<PageGuard pageKey="contracts">');
    for (const file of ["components/DashboardLayout.tsx", "components/MobileLayout.tsx", "pages/ElevayHome.tsx", "pages/MobileHome.tsx"]) {
      const source = await readFile(path.join(project, "client/src", file), "utf8");
      expect(source).toContain('"Train Your AI Agent"'); expect(source).toContain('"/train-your-ai-agent"');
    }
    const lead = await readFile(path.join(project, "client/src/pages/leads/LeadProfile.tsx"), "utf8");
    expect(lead).toContain("Import from Plaud");
    expect(lead).toContain("open={showPlaudImport}");
    expect(lead).toContain("useState(false)");
  });
});

// Optional local Chromium runner; no package changes and absolutely no real
// CRM/Plaud/API requests. Set PLAUD_PLAYWRIGHT_MODULE for another installation.
let chromium: any;
try {
  const modulePath = process.env.PLAUD_PLAYWRIGHT_MODULE ?? "/home/ubuntu/controlled-tests/node_modules/playwright-core/index.mjs";
  chromium = (await import(/* @vite-ignore */ pathToFileURL(modulePath).href)).chromium;
} catch { /* Pure tests still run in CI without browser tooling. */ }

describe.skipIf(!chromium)("Plaud UI isolated Chromium responsive/a11y interactions (fake tRPC only)", () => {
  let temporary: string;
  let server: any;
  let browser: any;
  let origin: string;

  beforeAll(async () => {
    temporary = await mkdtemp(path.join(tmpdir(), "plaud-ui-fake-"));
    await symlink(path.join(project, "node_modules"), path.join(temporary, "node_modules"));
    await writeFile(path.join(temporary, "index.html"), '<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
    const cataloguePath = path.join(project, "client/src/pages/TrainYourAiAgent.tsx");
    const importPath = path.join(project, "client/src/components/PlaudImportDialog.tsx");
    await writeFile(path.join(temporary, "harness.css"), `@import "${project}/client/src/index.css";\n@source "${project}/client/src";\n`);
    await writeFile(path.join(temporary, "main.tsx"), `
      import React, {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
      import {observable} from '@trpc/server/observable';
      import {TRPCClientError} from '@trpc/client';
      import {trpc} from '${project}/client/src/lib/trpc';
      import Catalogue from '${cataloguePath}';
      import PlaudImportDialog from '${importPath}';
      import './harness.css';
      const text = ${JSON.stringify(transcript)};
      const f = window.fixture = { mode: 'normal', connected: false, reconnect: false, signedIn: true, calls: [], invalidations: [], authorizationUrl: 'javascript:alert(1)', alreadyImported: false, total: 21 };
      const qc = new QueryClient({defaultOptions:{queries:{retry:false}, mutations:{retry:false}}});
      qc.getQueryCache().subscribe(e => { if(e.type === 'updated' && e.action?.type === 'invalidate') f.invalidations.push(e.query.queryKey); });
      window.setFixture = async updates => { Object.assign(f, updates); await qc.invalidateQueries(); };
      window.privateCacheCount = () => qc.getQueryCache().getAll().filter(q=>q.queryKey[0]?.[0]==='plaud' && ['recordings','connection'].includes(q.queryKey[0]?.[1])).length;
      const client = trpc.createClient({links:[()=>({op})=>observable(observer=>{
        f.calls.push({path:op.path,input:op.input});
        const timer=setTimeout(()=>{
          if (f.mode === 'loading' && op.path==='plaud.catalogue') return;
          if ((f.mode==='error' && op.path==='plaud.catalogue') || (f.mode==='recordings-error' && op.path==='plaud.recordings')) { observer.error(new TRPCClientError('secret provider profile stack token abc')); return; }
          let value;
          if(op.path==='auth.me') value=f.signedIn?{id:7,name:'Synthetic employee',email:'synthetic@example.test',role:'user'}:null;
          else if(op.path==='plaud.connection') value={connected:f.connected,needsReconnect:f.reconnect};
          else if(op.path==='plaud.connect') value={authorizationUrl:f.authorizationUrl};
          else if(op.path==='plaud.disconnect') { f.connected=false; value={success:true}; }
          else if(op.path==='plaud.recordings') value={page:op.input.page,hasMore:op.input.page<2,items:f.mode==='recordings-empty'?[]:[{id:'own-recording-'+op.input.page,title:'My private call '+op.input.page,callAt:null,durationMs:61000}]};
          else if(op.path==='plaud.importRecording') value={noteId:77,alreadyImported:f.alreadyImported};
          else if(op.path==='plaud.catalogue') {
            const total=f.mode==='empty'?0:f.total;
            const start=(op.input.page-1)*op.input.pageSize;
            value={total,page:op.input.page,pageSize:op.input.pageSize,timeZone:'Africa/Cairo',items:Array.from({length:Math.max(0,Math.min(op.input.pageSize,total-start))},(_,i)=>({id:start+i+1,title:'Call '+(start+i+1),callAt:i===1?null:1794522600000,importedAt:1794522600000,effectiveAt:1794522600000,usesImportDate:i===1,importerName:'Synthetic importer',durationMs:i===1?null:61000,transcript:text,lead:i===0?{name:'Allowed Lead',code:'L-001',path:'/leads/42'}:null}))};
          } else value=[];
          observer.next({result:{data:value}}); observer.complete();
        },10);
        return ()=>clearTimeout(timer);
      })]});
      // Seed the exact CRM caches import must invalidate, without calling a backend.
      for(const key of [[['leads','notes','list'],{input:{leadId:42},type:'query'}],[['leads','activities','list'],{input:{leadId:42},type:'query'}],[['plaud','catalogue'],{input:{page:1,pageSize:20},type:'query'}]]) qc.setQueryData(key,key[0][0]==='plaud'?{items:[],total:0,page:1,pageSize:20,timeZone:'Africa/Cairo'}:[]);
      function Harness(){const [open,setOpen]=useState(false); return new URLSearchParams(location.search).has('import')?<main style={{padding:16}}><button onClick={()=>setOpen(true)}>Open import</button><PlaudImportDialog leadId={42} open={open} onOpenChange={setOpen}/></main>:<Catalogue/>;}
      createRoot(document.getElementById('root')).render(<trpc.Provider client={client} queryClient={qc}><QueryClientProvider client={qc}><Harness/></QueryClientProvider></trpc.Provider>);
    `);
    const { createServer } = await import("vite");
    const { default: react } = await import("@vitejs/plugin-react");
    const { default: tailwindcss } = await import("@tailwindcss/vite");
    server = await createServer({ configFile: false, root: temporary, logLevel: "error", plugins: [react(), tailwindcss()], resolve: { alias: { "@": path.join(project, "client/src"), "@shared": path.join(project, "shared") } }, server: { host: "127.0.0.1", port: 0, fs: { allow: [temporary, project] } } });
    await server.listen();
    origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ executablePath: process.env.PLAUD_CHROMIUM_PATH ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
  }, 120000);
  afterAll(async () => { await browser?.close(); await server?.close(); if (temporary) await rm(temporary, { recursive: true, force: true }); });

  async function openPage(width: number, suffix = "") {
    const context = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true, timezoneId: "America/Los_Angeles" });
    const page = await context.newPage();
    const external: string[] = [];
    await page.route("**/*", (route: any) => { if (route.request().url().startsWith(origin)) return route.continue(); external.push(route.request().url()); return route.abort(); });
    await page.goto(`${origin}/${suffix}`);
    await page.waitForFunction(() => !!(window as any).fixture);
    return { context, page, external };
  }

  it.each([390, 1280])("renders separate, accessible literal mixed-language transcripts and filters/paginates without overflow at %ipx", async width => {
    const { context, page, external } = await openPage(width);
    try {
      await page.getByRole("heading", { name: "Train Your AI Agent", exact: true }).waitFor();
      await page.getByText("21 matching transcripts", { exact: true }).waitFor();
      expect(await page.locator("details").count()).toBe(20);
      expect(await page.getByRole("link", { name: /View Lead.*Allowed Lead/ }).count()).toBe(1);
      await page.getByText("Import date used:", { exact: false }).first().waitFor();
      await page.getByText("Africa/Cairo", { exact: true }).waitFor();
      expect(await page.getByRole("button", { name: "Export TXT", exact: true }).isDisabled()).toBe(true);
      const summary = page.locator("summary").first();
      await summary.focus(); await page.keyboard.press("Enter");
      expect(await page.locator("details").first().getAttribute("open")).not.toBeNull();
      const pre = page.locator("pre").first();
      expect(await pre.textContent()).toBe(transcript);
      expect(await pre.getAttribute("dir")).toBe("auto");
      expect(await pre.locator("script").count()).toBe(0);
      expect(await pre.evaluate((element: HTMLElement) => getComputedStyle(element).whiteSpace)).toBe("pre-wrap");
      await page.getByLabel("From date", { exact: true }).fill(range.from);
      await page.getByLabel("To date", { exact: true }).fill(range.to);
      expect(await page.getByRole("button", { name: "Export TXT", exact: true }).isDisabled()).toBe(true);
      await page.getByRole("button", { name: "Apply", exact: true }).click();
      await page.getByText(`Applied range: ${range.from} to ${range.to}`).waitFor();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByText("Page 2 of 2", { exact: true }).waitFor();
      expect(await page.locator("details").count()).toBe(1);
      expect(await page.getByLabel("From date", { exact: true }).inputValue()).toBe(range.from);
      const calls = await page.evaluate(() => (window as any).fixture.calls.filter((c: any) => c.path === "plaud.catalogue"));
      expect(calls.at(-1).input).toMatchObject({ ...range, page: 2, pageSize: 20 });
      const exportBody = `${transcript}\n\n\nSecond genuine note on the same Lead.`;
      await page.route("**/api/plaud/transcripts/export?**", async (route: any) => {
        await new Promise(resolve => setTimeout(resolve, 500));
        return route.fulfill({ status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Plaud-Transcript-Count": "21" }, body: exportBody });
      });
      const downloadEvent = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export TXT", exact: true }).click();
      await page.getByRole("button", { name: "Receiving export…", exact: true }).waitFor();
      await page.getByText("0 bytes received.", { exact: false }).waitFor();
      const download = await downloadEvent;
      expect(download.suggestedFilename()).toBe("plaud_transcripts_2026-11-01_to_2026-11-12.txt");
      expect(await readFile(await download.path(), "utf8")).toBe(exportBody);
      await page.getByText("Download prepared: 21 transcripts", { exact: false }).waitFor();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const callsAll = await page.evaluate(() => (window as any).fixture.calls);
      expect(callsAll.some((c: any) => ["plaud.recordings", "plaud.connection"].includes(c.path))).toBe(false);
      expect(external.filter(url => url.includes("plaud.ai"))).toEqual([]);
      await page.getByLabel("From date", { exact: true }).fill("2026-11-02");
      expect(await page.getByRole("button", { name: "Export TXT", exact: true }).isDisabled()).toBe(true);
      await page.getByText("Apply your changed dates before exporting.", { exact: true }).waitFor();
    } finally { await context.close(); }
  }, 60000);

  it("shows invalid/incomplete ranges, clear, loading, empty, sanitized error, no-match/auth/snapshot export states", async () => {
    const { context, page } = await openPage(390);
    try {
      await page.getByText("21 matching transcripts", { exact: true }).waitFor();
      await page.getByLabel("From date", { exact: true }).fill("2026-11-20");
      await page.getByLabel("To date", { exact: true }).fill(range.to);
      await page.getByRole("button", { name: "Apply", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "From date must" }).waitFor();
      expect(await page.getByLabel("From date", { exact: true }).getAttribute("aria-invalid")).toBe("true");
      await page.getByRole("button", { name: "Clear filters", exact: true }).click();
      expect(await page.getByLabel("From date", { exact: true }).inputValue()).toBe("");
      await page.getByLabel("From date", { exact: true }).fill(range.from);
      await page.getByRole("alert").filter({ hasText: "Choose both" }).waitFor();
      await page.getByLabel("To date", { exact: true }).fill(range.to);
      await page.getByRole("button", { name: "Apply", exact: true }).click();
      for (const status of [404, 400, 401, 503]) {
        await page.route("**/api/plaud/transcripts/export?**", (route: any) => route.fulfill({ status, body: "secret provider stack" }));
        await page.getByRole("button", { name: "Export TXT", exact: true }).click();
        await page.getByRole("alert").waitFor();
        expect(await page.getByRole("alert").textContent()).not.toContain("secret");
        if (status === 404) expect(await page.getByRole("alert").textContent()).toBe("No Plaud transcripts found for this date range");
        await page.unroute("**/api/plaud/transcripts/export?**");
      }
      await page.evaluate(() => (window as any).setFixture({ mode: "empty" }));
      await page.getByText("No Plaud transcripts found for this date range", { exact: true }).last().waitFor();
      expect(await page.getByRole("button", { name: "Export TXT", exact: true }).isDisabled()).toBe(true);
      await page.evaluate(() => (window as any).setFixture({ mode: "error" }));
      await page.getByRole("button", { name: "Try again", exact: true }).waitFor();
      expect(await page.locator("body").textContent()).not.toContain("secret provider");
      await page.evaluate(() => (window as any).setFixture({ mode: "normal" }));
      await page.getByText("21 matching transcripts", { exact: true }).waitFor();
      await page.evaluate(() => { (window as any).fixture.mode = "loading"; });
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByText("Loading Plaud transcripts…", { exact: true }).waitFor();
    } finally { await context.close(); }
  }, 60000);

  it.each([390, 1280])("gates private recordings behind explicit dialog/connection, consent and selection; paginates, imports once and disconnects at %ipx", async width => {
    const { context, page, external } = await openPage(width, "?import");
    try {
      await page.getByRole("button", { name: "Open import" }).waitFor();
      expect(await page.evaluate(() => (window as any).fixture.calls.some((c: any) => c.path.startsWith("plaud.")))).toBe(false);
      await page.getByRole("button", { name: "Open import" }).click();
      await page.getByRole("button", { name: "Connect my Plaud account", exact: true }).waitFor();
      expect(await page.getByRole("button", { name: "Connect my Plaud account", exact: true }).isDisabled()).toBe(true);
      await page.getByText(PLAUD_SHARED_NOTICE, { exact: true }).waitFor();
      expect(await page.evaluate(() => (window as any).fixture.calls.some((c: any) => c.path === "plaud.recordings"))).toBe(false);
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Connect my Plaud account", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "safe Plaud authorization" }).waitFor();
      expect(await page.evaluate(() => (window as any).fixture.calls.find((c: any) => c.path === "plaud.connect").input)).toEqual({ leadId: 42, acknowledgedSharing: true });
      await page.getByRole("button", { name: "Close", exact: true }).last().click();
      await page.evaluate(() => { (window as any).fixture.connected = true; });
      await page.getByRole("button", { name: "Open import" }).click();
      await page.getByRole("radio").waitFor();
      expect(await page.getByRole("checkbox").isChecked()).toBe(false);
      expect(await page.getByRole("button", { name: "Import selected recording", exact: true }).isDisabled()).toBe(true);
      await page.getByRole("radio").check();
      await page.getByRole("button", { name: "Next recordings", exact: true }).click();
      await page.getByText("My private call 2", { exact: true }).waitFor();
      expect(await page.getByRole("radio").isChecked()).toBe(false);
      await page.getByRole("radio").check();
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Import selected recording", exact: true }).click();
      await page.getByText("Transcript imported into this Lead's notes", { exact: false }).waitFor();
      const calls = await page.evaluate(() => (window as any).fixture.calls.filter((c: any) => c.path === "plaud.importRecording"));
      expect(calls).toHaveLength(1);
      expect(calls[0].input).toEqual({ leadId: 42, recordingId: "own-recording-2", acknowledgedSharing: true });
      expect(await page.getByRole("checkbox").isChecked()).toBe(false);
      const invalidations = JSON.stringify(await page.evaluate(() => (window as any).fixture.invalidations));
      expect(invalidations).toContain('"notes"'); expect(invalidations).toContain('"activities"'); expect(invalidations).toContain('"catalogue"');
      await page.evaluate(() => { (window as any).fixture.alreadyImported = true; });
      await page.getByRole("radio").check(); await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Import selected recording", exact: true }).click();
      await page.getByText("This recording was already imported. No duplicate note was created.", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Disconnect", exact: true }).click();
      await page.getByText("Your Plaud account is disconnected.", { exact: false }).waitFor();
      expect(await page.getByRole("radio").count()).toBe(0);
      expect(await page.locator('input[type="password"]').count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole("button", { name: "Close", exact: true }).last().click();
      expect(await page.evaluate(() => (window as any).privateCacheCount())).toBe(0);
      expect(external.filter(url => url.includes("plaud.ai"))).toEqual([]);
    } finally { await context.close(); }
  }, 60000);

  it("hides the shared catalogue and disables further catalogue reads when the CRM session signs out", async () => {
    const { context, page } = await openPage(390);
    try {
      await page.getByText("21 matching transcripts", { exact: true }).waitFor();
      await page.evaluate(() => (window as any).setFixture({ signedIn: false }));
      await page.getByRole("alert").filter({ hasText: "Sign in to view the shared transcript catalogue." }).waitFor();
      expect(await page.locator("pre, details").count()).toBe(0);
      expect(await page.getByRole("button", { name: "Export TXT", exact: true }).count()).toBe(0);
      expect(await page.evaluate(() => (window as any).fixture.calls.some((call: any) => call.path === "plaud.recordings"))).toBe(false);
    } finally { await context.close(); }
  }, 60000);

  it("handles reconnect, private empty/error and logout clearing without exposing a previous account's recordings", async () => {
    const { context, page } = await openPage(390, "?import");
    try {
      await page.evaluate(() => { Object.assign((window as any).fixture, {connected:true,reconnect:true}); });
      await page.getByRole("button", { name: "Open import" }).click();
      await page.getByRole("button", { name: "Reconnect my Plaud account", exact: true }).waitFor();
      expect(await page.getByRole("radio").count()).toBe(0);
      await page.getByRole("button", { name: "Close", exact: true }).last().click();
      await page.evaluate(() => { Object.assign((window as any).fixture, {reconnect:false,mode:'recordings-empty'}); });
      await page.getByRole("button", { name: "Open import" }).click();
      await page.getByText("No recordings found on this page.", { exact: false }).waitFor();
      await page.evaluate(() => (window as any).setFixture({mode:'recordings-error'}));
      await page.getByRole("button", { name: "Retry recordings", exact: true }).waitFor();
      expect(await page.locator("body").textContent()).not.toContain("secret provider");
      await page.evaluate(() => (window as any).setFixture({mode:'normal'}));
      await page.getByRole("radio").waitFor();
      await page.evaluate(() => (window as any).setFixture({signedIn:false}));
      await page.getByRole("dialog").waitFor({state:'hidden'});
      expect(await page.evaluate(() => (window as any).privateCacheCount())).toBe(0);
    } finally { await context.close(); }
  }, 60000);
});
