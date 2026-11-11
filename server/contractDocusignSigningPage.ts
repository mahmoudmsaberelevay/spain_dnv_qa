import crypto from "node:crypto";
import type { Express, Request, Response } from "express";

/** A minimal public page: no CRM providers, analytics, contract names or credentials.
 * The invitation stays in a URL fragment until this inline closure removes it.
 * Data operations use the existing tRPC endpoint, not a separate public data API.
 */
export function registerContractDocusignSigningPage(app: Express) {
  app.get("/sign-contract/:id", (req: Request, res: Response) => {
    const returning = req.params.id === "return";
    const validId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        req.params.id
      );
    const nonce = crypto.randomBytes(24).toString("base64");
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`
    );
    res.status(validId || returning ? 200 : 404).type("html")
      .send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow"><title>ELEVAY — Secure contract signing</title>
<style nonce="${nonce}">
:root{color-scheme:light;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f1f7f8;color:#1a3a5c}*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;align-items:center;padding:24px}main{width:100%;max-width:540px;margin:auto;background:rgba(255,255,255,.92);border:1px solid #dce9ec;border-radius:28px;padding:clamp(24px,6vw,44px);box-shadow:0 16px 55px #1a3a5c12}.brand{font-size:26px;letter-spacing:.17em;font-weight:700;color:#5ba3b8}h1{font-size:26px;line-height:1.3;margin:28px 0 16px}p{font-size:16px;line-height:1.65;color:#425a70}.notice{font-size:14px;border-top:1px solid #e1ebee;padding-top:20px;margin-top:26px}button{font:inherit;font-weight:600;background:#1a3a5c;color:white;border:0;border-radius:14px;padding:15px 20px;width:100%;cursor:pointer;transition:transform .16s}button:active{transform:scale(.98)}button:focus-visible{outline:3px solid #5ba3b8;outline-offset:4px}button:disabled{opacity:.55;cursor:not-allowed}#status{min-height:28px;font-size:14px}a{color:#1a3a5c;overflow-wrap:anywhere}.hidden{display:none}
</style></head><body><main><div class="brand">ELEVAY</div><h1>${returning ? "You have returned from DocuSign" : "Secure contract signing"}</h1><p>${returning ? "Thank you. Returning to this page does not confirm that your contract has been signed. ELEVAY will verify the document status directly with DocuSign." : "Continue to DocuSign to review the contract and decide whether to sign it. You do not need an ELEVAY CRM account to open your invitation."}</p>
${returning ? "" : `<button id="continue" type="button" disabled>Continue to DocuSign</button><p id="status" role="status" aria-live="polite">Checking invitation format…</p><p class="notice">This invitation is confidential. Anyone with its complete link may be able to open the intended recipient's signing session. Do not forward it. If you are not the intended recipient, please contact ELEVAY.</p><noscript><p>JavaScript is required to open this private signing session. Please enable it or contact ELEVAY for help.</p></noscript>`}
</main><script nonce="${nonce}">
(()=>{'use strict';
const button=document.getElementById('continue'),status=document.getElementById('status');
let token=location.hash.slice(1);const id=location.pathname.split('/').pop();
history.replaceState(null,'',location.pathname);
if(!button||!status){token='';return;}
const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||'')&&/^[0-9a-f]{64}$/i.test(token);
if(!valid){token='';status.textContent='This invitation is incomplete or unavailable. Ask ELEVAY for a new link.';return;}
button.disabled=false;status.textContent='Ready to open your private DocuSign session.';
button.addEventListener('click',async()=>{
button.disabled=true;status.textContent='Opening DocuSign…';
try{
const response=await fetch('/api/trpc/contractDocusign.startSigning',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({json:{id,token}}),cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(25000)});
const body=await response.json();const url=body&&body.result&&body.result.data&&body.result.data.json&&body.result.data.json.url;
if(!response.ok||typeof url!=='string')throw new Error('unavailable');
const target=new URL(url);if(target.protocol!=='https:'||target.username||target.password||!(target.hostname==='docusign.net'||target.hostname.endsWith('.docusign.net')||target.hostname==='docusign.com'||target.hostname.endsWith('.docusign.com')))throw new Error('unavailable');
token='';location.replace(target.href);
}catch{status.textContent='This signing session could not be opened. The link may have expired, been revoked, or the document may no longer be available. Contact ELEVAY before trying again.';button.disabled=false;}
});
})();
</script></body></html>`);
  });
}
