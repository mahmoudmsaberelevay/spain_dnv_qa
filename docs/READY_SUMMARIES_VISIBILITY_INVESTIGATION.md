# Ready Summaries Visibility Investigation

**Author:** Manus AI  
**Date:** 9 September 2026

The live Marketing dashboard at `https://elevay.vip/marketing` currently includes a **Ready Summaries** card and a desktop sidebar entry. Selecting either navigates to `https://elevay.vip/marketing/ready-summaries` successfully. The published route renders the Ready Summaries page shell and starts loading the shared library.[1] [2]

The page, desktop navigation, mobile navigation, and route wrapper are not protected by a Ready-Summaries-specific permission. Any authenticated user who can open the CRM receives the same route and navigation entry; the **Add summary** and delete controls remain administrator-only.[2] [3] [4]

The initial live screenshot briefly displayed `0 PDFs` with a loading indicator while the list request was still pending. The page extraction completed with all 21 imported records, so the remaining investigation is focused on whether a slow or failed list request can leave some users believing that the page is missing or empty.

The Marketing summary workspace now includes a persistent two-tab switcher on both pages: **Ready Summaries — Download approved PDFs** and **Summary Generator — Create and edit summaries**. This directly implements the requested tab inside the summary area instead of relying only on the sidebar and Marketing dashboard card.[5]

Authenticated development verification confirmed that the new Ready Summaries tab is visibly active, the Summary Generator peer tab is available, and all 21 PDFs load beneath the tab switcher after the request completes.

Mobile verification at 375 × 812 confirmed that the two tabs stack cleanly at the top of both pages, retain a clear active state, and remain above the primary page action and content. The Ready Summaries page displayed the 21-PDF count and the Summary Generator retained its existing creation and edit controls.

## References

[1]: ../client/src/pages/marketing/MarketingDashboard.tsx "Marketing dashboard Ready Summaries card"
[2]: ../client/src/App.tsx "Ready Summaries authenticated route"
[3]: ../client/src/components/DashboardLayout.tsx "Desktop Marketing navigation"
[4]: ../client/src/components/MobileLayout.tsx "Mobile Marketing navigation"
[5]: ../client/src/pages/marketing/MarketingSummaryTabs.tsx "Shared Ready Summaries and Summary Generator tab switcher"
