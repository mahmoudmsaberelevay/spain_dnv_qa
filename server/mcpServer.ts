import { z } from "zod/v4";
import { createMcpHandler } from "mcp-handler";
import type { Express, Request as ExpressRequest, Response as ExpressResponse } from "express";

/**
 * ELEVAY CRM MCP Server
 * Exposes CRM data as tools for AI agents (Claude, Manus, ChatGPT, Cursor, etc.)
 * Endpoint: /api/mcp
 */

// Helper: Convert Express request to Web Request
function toWebRequest(req: ExpressRequest): Request {
  const protocol = req.protocol || "http";
  const host = req.headers.host || "localhost:3000";
  const url = `${protocol}://${host}${req.url}`;
  return new Request(url, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: req.method !== "GET" && req.method !== "HEAD"
      ? JSON.stringify(req.body)
      : undefined,
  });
}

export function registerMcpServer(app: Express) {
  const mcpHandler = createMcpHandler(
    (server: any) => {
      // ─── TOOL 1: Search Clients ─────────────────────────────────────────
      server.registerTool("search_clients", {
        description: "Search financial clients by name or client code. Returns client details including contract value, paid amount, remaining balance, consultant, and signing date.",
        inputSchema: z.object({
          query: z.string().describe("Client name or client code to search for"),
          limit: z.number().optional().describe("Max results to return (default 10)"),
        }),
      }, async ({ query, limit = 10 }: { query: string; limit?: number }) => {
        try {
          const { getDb } = await import("./db");
          const { finClients } = await import("../drizzle/schema");
          const { like, or } = await import("drizzle-orm");
          const db = await getDb();
          if (!db) throw new Error("Database unavailable");
          const results = await db.select().from(finClients)
            .where(or(like(finClients.name, `%${query}%`), like(finClients.clientCode, `%${query}%`)))
            .limit(limit);
          const formatted = results.map(c => ({
            id: c.id, name: c.name, clientCode: c.clientCode,
            contractValueEur: c.contractValueEur, paidAmountEur: c.paidAmountEur,
            remainingAmountEur: c.remainingAmountEur, consultant: c.consultant,
            signingDate: c.signingDate, phone: c.phone,
          }));
          return { content: [{ type: "text" as const, text: JSON.stringify(formatted, null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
        }
      });

      // ─── TOOL 2: List Contracts ─────────────────────────────────────────
      server.registerTool("list_contracts", {
        description: "List contracts with optional filters. Returns contract code, client name, value, status, consultant, and creation date.",
        inputSchema: z.object({
          status: z.enum(["active", "completed", "cancelled", "all"]).optional().describe("Filter by status (default: all)"),
          consultant: z.string().optional().describe("Filter by consultant name"),
          limit: z.number().optional().describe("Max results (default 20)"),
        }),
      }, async ({ status = "all", consultant, limit = 20 }: { status?: string; consultant?: string; limit?: number }) => {
        try {
          const { getDb } = await import("./db");
          const { contracts } = await import("../drizzle/schema");
          const { eq, like, desc, and } = await import("drizzle-orm");
          const db = await getDb();
          if (!db) throw new Error("Database unavailable");
          const conditions: any[] = [];
          if (status !== "all") conditions.push(eq(contracts.status, status as any));
          if (consultant) conditions.push(like(contracts.consultantName, `%${consultant}%`));
          const q = conditions.length > 0
            ? db.select().from(contracts).where(and(...conditions)).orderBy(desc(contracts.createdAt)).limit(limit)
            : db.select().from(contracts).orderBy(desc(contracts.createdAt)).limit(limit);
          const results = await q;
          const formatted = results.map(c => ({
            id: c.id, contractCode: c.contractCode, clientName: c.clientName,
            contractValue: c.contractValue, status: c.status,
            consultant: c.consultantName, createdAt: c.createdAt,
          }));
          return { content: [{ type: "text" as const, text: JSON.stringify(formatted, null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
        }
      });

      // ─── TOOL 3: List Receipts ──────────────────────────────────────────
      server.registerTool("list_receipts", {
        description: "List invoices/receipts with optional filters. Returns invoice code, client name, amount EUR/EGP, status (paid/unpaid), and date.",
        inputSchema: z.object({
          status: z.enum(["paid", "unpaid", "all"]).optional().describe("Filter by payment status (default: all)"),
          clientName: z.string().optional().describe("Filter by client name"),
          limit: z.number().optional().describe("Max results (default 20)"),
        }),
      }, async ({ status = "all", clientName, limit = 20 }: { status?: string; clientName?: string; limit?: number }) => {
        try {
          const { getDb } = await import("./db");
          const { invoices } = await import("../drizzle/schema");
          const { eq, like, desc, and } = await import("drizzle-orm");
          const db = await getDb();
          if (!db) throw new Error("Database unavailable");
          const conditions: any[] = [];
          if (status !== "all") conditions.push(eq(invoices.status, status as any));
          if (clientName) conditions.push(like(invoices.clientName, `%${clientName}%`));
          const q = conditions.length > 0
            ? db.select().from(invoices).where(and(...conditions)).orderBy(desc(invoices.createdAt)).limit(limit)
            : db.select().from(invoices).orderBy(desc(invoices.createdAt)).limit(limit);
          const results = await q;
          const formatted = results.map(i => ({
            id: i.id, invoiceCode: i.invoiceCode, clientName: i.clientName,
            amountEur: i.amountEur, amountEgp: i.amountEgp,
            status: i.status, paidAt: i.paidAt, createdAt: i.createdAt,
          }));
          return { content: [{ type: "text" as const, text: JSON.stringify(formatted, null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
        }
      });

      // ─── TOOL 4: Get Financial Summary ──────────────────────────────────
      server.registerTool("get_financial_summary", {
        description: "Get a financial summary: total contract value, total paid, total remaining, number of clients, and breakdown by consultant.",
        inputSchema: z.object({}),
      }, async () => {
        try {
          const { getDb } = await import("./db");
          const { finClients } = await import("../drizzle/schema");
          const { sql } = await import("drizzle-orm");
          const db = await getDb();
          if (!db) throw new Error("Database unavailable");
          const [summary] = await db.select({
            totalClients: sql<number>`COUNT(*)`,
            totalContractValue: sql<string>`COALESCE(SUM(CAST(contractValueEur AS DECIMAL(12,2))), 0)`,
            totalPaid: sql<string>`COALESCE(SUM(CAST(paidAmountEur AS DECIMAL(12,2))), 0)`,
            totalRemaining: sql<string>`COALESCE(SUM(CAST(remainingAmountEur AS DECIMAL(12,2))), 0)`,
          }).from(finClients);
          const byConsultant = await db.select({
            consultant: finClients.consultant,
            clients: sql<number>`COUNT(*)`,
            totalValue: sql<string>`COALESCE(SUM(CAST(contractValueEur AS DECIMAL(12,2))), 0)`,
            totalPaid: sql<string>`COALESCE(SUM(CAST(paidAmountEur AS DECIMAL(12,2))), 0)`,
          }).from(finClients).groupBy(finClients.consultant);
          return { content: [{ type: "text" as const, text: JSON.stringify({ summary, byConsultant }, null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
        }
      });

      // ─── TOOL 5: Search Leads ───────────────────────────────────────────
      server.registerTool("search_leads", {
        description: "Search leads by name, phone, or email. Returns lead details including status, source, assigned consultant, and creation date.",
        inputSchema: z.object({
          query: z.string().describe("Name, phone, or email to search for"),
          status: z.string().optional().describe("Filter by lead status"),
          limit: z.number().optional().describe("Max results (default 20)"),
        }),
      }, async ({ query, status, limit = 20 }: { query: string; status?: string; limit?: number }) => {
        try {
          const { getDb } = await import("./db");
          const { leads } = await import("../drizzle/schema");
          const { like, or, eq, desc, and } = await import("drizzle-orm");
          const db = await getDb();
          if (!db) throw new Error("Database unavailable");
          const searchCond = or(
            like(leads.fullName, `%${query}%`),
            like(leads.phone, `%${query}%`),
            like(leads.email, `%${query}%`)
          );
          const conditions: any[] = [searchCond];
          if (status) conditions.push(eq(leads.status, status));
          const results = await db.select().from(leads)
            .where(and(...conditions)).orderBy(desc(leads.createdAt)).limit(limit);
          const formatted = results.map(l => ({
            id: l.id, name: l.fullName, phone: l.phone, email: l.email,
            status: l.status, source: l.source, consultant: l.assignedTo,
            program: l.program, createdAt: l.createdAt,
          }));
          return { content: [{ type: "text" as const, text: JSON.stringify(formatted, null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
        }
      });

      // ─── TOOL 6: Get Client Details ─────────────────────────────────────
      server.registerTool("get_client_details", {
        description: "Get full details for a specific client by their client code or name, including all receipts and payment history.",
        inputSchema: z.object({
          clientCode: z.string().describe("The client code (e.g. 26072) or client name"),
        }),
      }, async ({ clientCode }: { clientCode: string }) => {
        try {
          const { getDb } = await import("./db");
          const { finClients, invoices } = await import("../drizzle/schema");
          const { like, or, eq, desc } = await import("drizzle-orm");
          const db = await getDb();
          if (!db) throw new Error("Database unavailable");
          const [client] = await db.select().from(finClients)
            .where(or(like(finClients.clientCode, `%${clientCode}%`), like(finClients.name, `%${clientCode}%`)))
            .limit(1);
          if (!client) return { content: [{ type: "text" as const, text: `No client found matching "${clientCode}"` }] };
          const clientInvoices = client.contractId
            ? await db.select().from(invoices).where(eq(invoices.contractId, client.contractId)).orderBy(desc(invoices.createdAt))
            : [];
          const result = {
            client: { id: client.id, name: client.name, clientCode: client.clientCode, phone: client.phone, consultant: client.consultant, contractValueEur: client.contractValueEur, paidAmountEur: client.paidAmountEur, remainingAmountEur: client.remainingAmountEur, signingDate: client.signingDate, familyMembers: client.familyMembers },
            receipts: clientInvoices.map(i => ({ invoiceCode: i.invoiceCode, amountEur: i.amountEur, amountEgp: i.amountEgp, status: i.status, paidAt: i.paidAt, createdAt: i.createdAt })),
          };
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
        }
      });

      // ─── TOOL 7: Get Dashboard Stats ───────────────────────────────────
      server.registerTool("get_dashboard_stats", {
        description: "Get overall CRM dashboard statistics: total leads, contracts, clients, and revenue.",
        inputSchema: z.object({}),
      }, async () => {
        try {
          const { getDb } = await import("./db");
          const { finClients, contracts, leads, invoices } = await import("../drizzle/schema");
          const { sql } = await import("drizzle-orm");
          const db = await getDb();
          if (!db) throw new Error("Database unavailable");
          const [clientStats] = await db.select({ total: sql<number>`COUNT(*)`, totalRevenue: sql<string>`COALESCE(SUM(CAST(paidAmountEur AS DECIMAL(12,2))), 0)` }).from(finClients);
          const [contractStats] = await db.select({ total: sql<number>`COUNT(*)` }).from(contracts);
          const [leadStats] = await db.select({ total: sql<number>`COUNT(*)` }).from(leads);
          const [receiptStats] = await db.select({ total: sql<number>`COUNT(*)`, paid: sql<number>`SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END)`, unpaid: sql<number>`SUM(CASE WHEN status = 'unpaid' THEN 1 ELSE 0 END)` }).from(invoices);
          return { content: [{ type: "text" as const, text: JSON.stringify({ clients: clientStats, contracts: contractStats, leads: leadStats, receipts: receiptStats }, null, 2) }] };
        } catch (error) {
          return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
        }
      });
    },
    {
      serverInfo: { name: "ELEVAY CRM", version: "1.0.0" },
      verboseLogs: true,
    }
  );

  // Mount MCP handler with Express-to-Web adapter
  app.all("/api/mcp", async (req: ExpressRequest, res: ExpressResponse) => {
    try {
      const webRequest = toWebRequest(req);
      const webResponse = await mcpHandler(webRequest);
      res.status(webResponse.status);
      webResponse.headers.forEach((value: string, key: string) => {
        res.setHeader(key, value);
      });
      const body = await webResponse.text();
      res.send(body);
    } catch (error) {
      console.error("[MCP] Handler error:", error);
      res.status(500).json({ error: "MCP server error" });
    }
  });

  console.log("[MCP] Server registered at /api/mcp");
}
