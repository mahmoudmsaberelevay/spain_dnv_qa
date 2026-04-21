content = '''---
name: elevay-salary-receipts
description: "Builds and maintains the Salary Receipts page in the Elevay Financial module. Use this skill when: (1) adding or rebuilding the salary receipts feature, (2) fixing salary receipt creation, PDF generation, or mark-as-paid auto-expense, (3) granting or revoking salary receipt access for team members, or (4) updating the salary receipt PDF template."
---

# Elevay Salary Receipts Skill

## Overview

The Salary Receipts page lives under Financial → Salary Receipts. Authorized users create salary receipts for employees, download a PDF, edit/delete receipts, and mark them as paid — which automatically creates a real expense entry in `finTransactions` (visible in Expenses page, affects account balance).

---

## Key Files

| File | Purpose |
|---|---|
| `drizzle/schema.ts` | `salaryReceipts` table definition |
| `server/finRouter.ts` | `salary.*` tRPC procedures |
| `client/src/pages/SalaryReceipts.tsx` | Full page UI |
| `client/src/App.tsx` | Route: `/financial/salary-receipts` |
| `client/src/components/DashboardLayout.tsx` | Sidebar nav item |

---

## 1. Database Schema

Add to `drizzle/schema.ts`:

```ts
export const salaryReceipts = mysqlTable("salaryReceipts", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  employeeName: varchar("employeeName", { length: 255 }).notNull(),
  grossSalary: decimal("grossSalary", { precision: 14, scale: 2 }).notNull(),
  deductionAmount: decimal("deductionAmount", { precision: 14, scale: 2 }).default("0"),
  deductionReason: varchar("deductionReason", { length: 500 }),
  netPaidSalary: decimal("netPaidSalary", { precision: 14, scale: 2 }).notNull(),
  forMonth: varchar("forMonth", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  linkedTransactionId: int("linkedTransactionId"),
  createdBy: varchar("createdBy", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SalaryReceipt = typeof salaryReceipts.$inferSelect;
export type InsertSalaryReceipt = typeof salaryReceipts.$inferInsert;
```

After adding: `pnpm drizzle-kit generate` then apply via `webdev_execute_sql`.

---

## 2. Backend Procedures (finRouter.ts)

Add a `salary` sub-router with these procedures:

**`salary.list`** — returns all receipts ordered by `createdAt desc`.

**`salary.create`** — input: `{ employeeId, deductionAmount?, deductionReason?, forMonth }`
- Look up employee from `finEmployees` to get `salary` and `name`
- Compute `netPaidSalary = grossSalary - (deductionAmount ?? 0)`
- Insert into `salaryReceipts`

**`salary.update`** — input: `{ id, deductionAmount?, deductionReason?, forMonth? }`
- Block if `status === "paid"`
- Recompute `netPaidSalary`

**`salary.delete`** — block if `status === "paid"`

**`salary.markAsPaid`** — input: `{ id }`
- Guard: throw CONFLICT if already paid
- Create expense in `finTransactions`:

```ts
await createTransaction({
  type: "expense",
  accountId: 1,        // Cash EGP (always id=1)
  categoryId: 2,       // Salaries (always id=2)
  employeeId: receipt.employeeId,
  amount: receipt.netPaidSalary,
  convertedAmount: receipt.netPaidSalary,
  description: `Salary for ${receipt.forMonth}`,
  note: `Salary for ${receipt.forMonth}`,
  transactionDate: new Date(),   // MUST be Date object, NOT Date.now()
  createdBy: ctx.user?.email ?? "",
});
```

- Call `recalcAccountBalance(1)` after creating
- Update receipt: `status = "paid"`, `linkedTransactionId = txResult.id`

---

## 3. Frontend Page

Key UI elements:
- **List table**: Employee, Month, Gross, Deduction, Net Paid, Status badge, Actions
- **Create modal**: employee dropdown (`trpc.fin.getEmployees`), month selector (default = current month + year), deduction amount + reason, live net salary preview
- **Edit modal**: same fields, disabled if status=paid
- **Delete**: confirm dialog, disabled if status=paid
- **Mark as Paid**: amber button with spinner
- **PDF download**: client-side print of a hidden styled div

### PDF Layout (Elevay template)
```
ELEVAY logo + "Salary Receipt" heading
Employee: [name]          Month: [forMonth]
Gross Salary: [EGP amount]
Deduction: [EGP amount]   Reason: [reason]
Net Paid: [EGP amount]
Status: PAID / PENDING
Date: [createdAt]
Signature line
```

---

## 4. Route and Sidebar

**App.tsx**:
```tsx
import SalaryReceipts from "@/pages/SalaryReceipts";
<Route path="/financial/salary-receipts" component={SalaryReceipts} />
```

**DashboardLayout.tsx** — add after Upcoming Payments nav item:
```tsx
{ label: "Salary Receipts", path: "/financial/salary-receipts", pageKey: "fin_salary_receipts", icon: <Receipt size={16} /> }
```

---

## 5. Granting Access

Page key: `fin_salary_receipts`. Default users: Mohamed Abdelfatah, Ziad Elshurafa, Waleed Mamdouh.

```sql
-- userPermissions has NO canDelete column — omit it always
INSERT INTO userPermissions (userId, pageKey, canAccess, canCreate, canEdit)
VALUES (?, "fin_salary_receipts", 1, 1, 1)
ON DUPLICATE KEY UPDATE canAccess=1, canCreate=1, canEdit=1;
```

Find user IDs:
```sql
SELECT id, name, email FROM users WHERE email IN (
  "mohamed.abdelfatah@elevay.com",
  "ziad.elshurafa@elevay.com",
  "walid.mamdouh@elevay.com"
);
```

If a user is not found they have not logged in yet — grant access after first login via Permissions Manager page.

---

## 6. Fixed IDs

| Resource | Name | ID |
|---|---|---|
| Account | Cash EGP | 1 |
| Category | Salaries | 2 |

Verify with:
```sql
SELECT id, name FROM finAccounts WHERE name LIKE "%Cash%EGP%";
SELECT id, name FROM finCategories WHERE name LIKE "%Salari%";
```

---

## Common Pitfalls

- `transactionDate: Date.now()` is **wrong** (number type). Always use `new Date()`.
- `canDelete` does NOT exist in `userPermissions` — omit from all INSERT/UPDATE queries or you get `ER_BAD_FIELD_ERROR`.
- Block edit/delete on paid receipts — always check `status === "pending"` before mutations.
- The auto-created expense is a normal `finTransactions` row — it appears in Expenses page and affects account balance automatically via `recalcAccountBalance`.
- `finCategories` table name is camelCase — not `fin_categories`.
- If `salary.list` returns empty after creation, verify the `salary` sub-router is exported from `finRouter` and merged in `routers.ts`.
'''

with open("/home/ubuntu/skills/elevay-salary-receipts/SKILL.md", "w") as f:
    f.write(content)
print("Written successfully, length:", len(content))
