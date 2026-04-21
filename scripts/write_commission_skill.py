skill_content = """\
---
name: elevay-commission-receipts
description: "Builds and maintains the Commission Receipts page in the Elevay Financial module. Use this skill when: (1) adding or rebuilding the commission receipts feature, (2) fixing commission receipt creation, PDF generation, or mark-as-paid auto-expense, (3) granting or revoking commission receipt access for team members, or (4) fixing edit/delete visibility on paid receipts."
---

# Elevay Commission Receipts Skill

## Overview

Commission Receipts live at `/financial/commission-receipts`. Each receipt belongs to one **employee** and contains multiple **client items** (one row per client). On mark-as-paid, one expense entry per client is created in `finTransactions`.

---

## Database Schema

Two tables added to `drizzle/schema.ts`:

- `commissionReceipts`: id, employeeId, employeeName, forMonth, eurToEgpRate, totalAmountEur, totalAmountEgp, receiptDate, status (draft|paid), createdAt
- `commissionReceiptItems`: id, receiptId, clientId (links to finClients.id), clientName, commissionFor, amountEur, amountEgp, linkedTransactionId

After adding: `pnpm drizzle-kit generate` then apply migration via `webdev_execute_sql`.

---

## Commission For Options (11 roles)

Paralegal First, Paralegal Second, Paralegal Third, Consultant First, Consultant Second, Consultant Third, Qualifier, Qualifier TL, Operation Manager, Operation TL, Country Manager

---

## Backend Procedures (finRouter.ts)

Add `commissionReceiptsRouter` to `financialRouter` export. Import both tables from schema.

Key IDs (verified in DB): Cash EGP account id=1, Commissions category id=1.

Procedures needed: list (join items), create (insert receipt + items), update (replace items), delete (items first then receipt), markAsPaid (one expense per item).

### Critical: markAsPaid — Client Link

MUST pass `finClientId` on each `createTransaction` call, or expenses will not appear when filtering by client:

```ts
const txResult = await createTransaction({
  type: "expense",
  accountId: 1,
  categoryId: 1,
  employeeId: cur.employeeId,
  finClientId: item.clientId,   // CRITICAL
  amount: item.amountEgp,
  convertedAmount: item.amountEgp,
  description: `Commission for ${cur.forMonth}`,
  note: `Commission for ${cur.forMonth}`,
  transactionDate: new Date(),
  createdBy: ctx.user?.email ?? "",
});
```

After all items: call `recalcAccountBalance(1)` to update Cash EGP balance.

---

## Frontend Page (CommissionReceipts.tsx)

Form fields: Employee picker, Month selector, EUR-to-EGP rate (one for all), client items table (client picker + commission role dropdown + EUR amount), live totals.

### Edit/Delete Visibility Rule

Edit and Delete must always be visible (both draft and paid). Only Mark as Paid is draft-only:

```tsx
<Button onClick={() => openEdit(r)}><Pencil /></Button>
{r.status === "draft" && <Button onClick={() => markPaid(r.id)}><CheckCircle /></Button>}
<Button onClick={() => deleteReceipt(r.id)}><Trash2 /></Button>
```

### PDF Generation

Use `window.open("", "_blank")` + `win.document.write(html)` + `win.print()`. Layout: dark blue header (#1a1a6e), ELEVAY title, employee name, month, table of all clients (Client Name | Commission For | Amount EUR | Amount EGP), total row, exchange rate note.

---

## Route and Sidebar

App.tsx: `<Route path="/financial/commission-receipts" component={CommissionReceipts} />`

DashboardLayout.tsx: Add nav item after Salary Receipts with `pageKey: "fin_commission_receipts"`.

---

## Access Grant Script

Authorized users: Ziad elshurafa, Mohamed Abdelfatah, Waleed Mamdouh.

```js
// userPermissions table has NO canDelete column
await db.execute(sql`
  INSERT INTO userPermissions (userId, pageKey, canAccess, canCreate, canEdit)
  VALUES (${userId}, 'fin_commission_receipts', 1, 1, 1)
  ON DUPLICATE KEY UPDATE canAccess=1, canCreate=1, canEdit=1
`);
```

Waleed Mamdouh may not have logged in yet. Run grant script after his first login.

---

## Common Pitfalls

| Pitfall | Fix |
|---|---|
| Expenses not linked to client when filtering | Pass `finClientId: item.clientId` in `createTransaction` |
| Edit/Delete hidden on paid receipts | Remove `r.status === "draft"` guard from Edit and Delete buttons |
| `canDelete` column error | `userPermissions` has no `canDelete` — omit from INSERT |
| Totals not updating live | Recalculate `amountEgp = amountEur * rate` on every item change |
| `window.open` blocked | Show toast: Pop-up blocked. Please allow pop-ups for PDF download. |
| Waleed not found in DB | Not logged in yet — run grant script after first login |
"""

with open('/home/ubuntu/skills/elevay-commission-receipts/SKILL.md', 'w') as f:
    f.write(skill_content)
print('Done')
