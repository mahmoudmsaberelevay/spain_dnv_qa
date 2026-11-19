import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
const read=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');
describe('Finance income-only policy entry points and labels',()=>{
 const router=read('server/finRouter.ts');
 const ui=read('client/src/pages/FinClients.tsx');
 it('rejects nonzero manually supplied paid amount on client creation',()=>{
  const block=router.slice(router.indexOf('const finClientsRouter'),router.indexOf('recordPayment:'));
  expect(block).toContain('max(0, "Record payments as linked Finance Income');
  expect(block).toContain('paidAmountEur: "0.00"');
  expect(block).toContain('paidAmountEgp: "0.00"');
  expect(block).toContain('remainingAmountEur: cvEur.toFixed(2)');
  expect(block).not.toContain('cvEur - paidEur');
 });
 it('does not allow manual remaining balance overrides',()=>{
  expect(router).toContain('Remaining balance is calculated from Finance Income and cannot be overridden.');
 });
 it('removes the old fixed-rate aggregate override dialog',()=>{
  expect(ui).not.toContain('setPaidAmount.useMutation');
  expect(ui).not.toContain('Save Paid Amount');
  expect(ui).not.toContain('/ 55.5');
  expect(ui).toContain('income-only-payment-help');
  expect(ui).toContain('Receipts do not change balances.');
 });
 it('labels incomplete historical EUR totals rather than calling them fully paid',()=>{
  expect(ui).toContain('incomeBalanceStatus !== "verified"');
  expect(ui).toContain('Reconciliation required');
  expect(ui).toContain('(unverified)');
  expect(ui).toContain('incomeBalanceReconciliationCount');
 });
 it('exports exact income EGP and explicitly separates unverified previous balances',()=>{
  expect(router).toContain('"Income Paid (EGP)", "Balance Verification", "Reconciliation Issues"');
  expect(router).toContain('escape(c.incomeBalanceStatus === "verified" ? c.paidAmountEur : "")');
  expect(router).toContain('escape(c.incomeBalanceStatus === "verified" ? c.remainingAmountEur : "")');
  expect(router).toContain('"Previous Unverified Paid (EUR)", "Previous Unverified Remaining (EUR)"');
 });
});
