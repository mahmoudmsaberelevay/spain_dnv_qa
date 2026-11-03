import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Source-only tests deliberately do not import server routers or connect to a DB.
// AST assertions keep automatic mutations from hiding in effects/event handlers.
const rawSource = readFileSync(
  new URL("../client/src/components/HrEmployeeOnboarding.tsx", import.meta.url),
  "utf8"
);
const source = rawSource.replace(/\s+/g, " ");
const file = ts.createSourceFile(
  "HrEmployeeOnboarding.tsx",
  rawSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);

function nodesWhere<T extends ts.Node>(
  root: ts.Node,
  guard: (node: ts.Node) => node is T
): T[] {
  const matches: T[] = [];
  function visit(node: ts.Node) {
    if (guard(node)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return matches;
}

const calls = nodesWhere(file, ts.isCallExpression);
function functionSource(name: string) {
  const node = nodesWhere(file, ts.isFunctionDeclaration).find(
    declaration => declaration.name?.text === name
  );
  if (!node) throw new Error(`Missing function ${name}`);
  return node.getText(file).replace(/\s+/g, " ");
}
function enclosingFunctionName(node: ts.Node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionDeclaration(parent)) return parent.name?.text;
    if (ts.isArrowFunction(parent) || ts.isFunctionExpression(parent))
      return "anonymous";
  }
  return undefined;
}
const callTargets = calls.map(call => call.expression.getText(file));
const handler = functionSource("handleLink");

describe("HR employee onboarding UI safety and wiring", () => {
  it("mounts the employee directory only after exact named-admin and server verification", () => {
    const gate = functionSource("HrEmployeeOnboarding");
    expect(source).toContain('from "@shared/hrAccess"');
    expect(gate).toContain("isHrAdministrator(user)");
    expect(gate).toContain("enabled: namedAdministrator");
    expect(gate).toContain("!access.isError");
    expect(gate).toContain("access.data?.isHrAdmin === true");
    expect(gate).toContain("if (!canAdmin) return null;");
    expect(gate.indexOf("if (!canAdmin) return null;")).toBeLessThan(
      gate.indexOf("<VerifiedEmployeeOnboarding />")
    );
    expect(gate).not.toContain("hr.admin.onboarding");
    expect(gate).not.toMatch(/user\??\.role|role\s*===\s*["']admin/);
    const query = calls.find(
      call =>
        call.expression.getText(file) === "trpc.hr.admin.onboarding.useQuery"
    );
    expect(query).toBeDefined();
    expect(enclosingFunctionName(query!)).toBe("VerifiedEmployeeOnboarding");
  });

  it("uses the onboarding query and audited link contract", () => {
    expect(callTargets).toContain("trpc.hr.admin.onboarding.useQuery");
    expect(callTargets).toContain("trpc.hr.admin.linkEmployee.useMutation");
    expect(handler).toContain("employeeId: selectedEmployee.id");
    expect(handler).toContain("userId: selectedUser.id");
    expect(handler).toContain("reason: reason.trim()");
    expect(source).toContain("reason.trim().length >= 3");
    expect(source).toContain("minLength={3}");
    expect(handler).toContain("!selectedEmployee || !selectedUser");
  });

  it("keeps employee and account selections empty until explicitly chosen", () => {
    expect(source).toContain(
      'const [employeeId, setEmployeeId] = useState("")'
    );
    expect(source).toContain('const [userId, setUserId] = useState("")');
    expect(source).toContain('const [reason, setReason] = useState("")');
    expect(source).toContain("onValueChange={setEmployeeId}");
    expect(source).toContain("onValueChange={setUserId}");
    expect(source).toContain('placeholder="Select an employee"');
    expect(source).toContain('placeholder="Select a CRM login"');
    expect(source).not.toMatch(
      /useEffect|useLayoutEffect|defaultValue|autoFocus/
    );
    // Only success may reset choices; no mount/query callback may select a match.
    const selectionSetters = calls.filter(call =>
      ["setEmployeeId", "setUserId"].includes(call.expression.getText(file))
    );
    expect(selectionSetters).toHaveLength(2);
    for (const setter of selectionSetters) {
      expect(enclosingFunctionName(setter)).toBe("handleLink");
      expect(setter.arguments[0].getText(file)).toBe('""');
    }
    expect(source).not.toMatch(/\.email\s*===|\.name\s*===|\.find\([^)]*email/);
  });

  it("has exactly one mutation invocation, only in the explicit click handler", () => {
    const mutations = calls.filter(call =>
      /\.mutate(?:Async)?$/.test(call.expression.getText(file))
    );
    expect(mutations).toHaveLength(1);
    expect(mutations[0].expression.getText(file)).toBe(
      "linkEmployee.mutateAsync"
    );
    expect(enclosingFunctionName(mutations[0])).toBe("handleLink");
    expect(ts.isAwaitExpression(mutations[0].parent)).toBe(true);
    const button = nodesWhere(file, ts.isJsxElement).find(
      element =>
        element.openingElement.tagName.getText(file) === "Button" &&
        element.getText(file).includes('"Link CRM login"')
    );
    expect(button).toBeDefined();
    expect(button!.getText(file)).toContain('type="button"');
    expect(button!.getText(file)).toContain("disabled={!canLink}");
    expect(button!.getText(file)).toContain(
      "onClick={() => void handleLink()}"
    );
    expect(source).not.toMatch(/onSubmit|setInterval|setTimeout/);
    const handlerCalls = calls.filter(
      call => call.expression.getText(file) === "handleLink"
    );
    expect(handlerCalls).toHaveLength(1);
    expect(ts.isArrowFunction(handlerCalls[0].parent.parent)).toBe(true);
  });

  it("lists only unlinked active internal employees and genuinely unassigned users", () => {
    expect(source).toContain(
      "employee.isActive && employee.hrSelfServiceRequired"
    );
    expect(source).toContain("employee => employee.crmUserId === null");
    expect(source).toContain("account => account.linkedEmployeeId === null");
    expect(source).toContain("unlinkedEmployees.map(employee");
    expect(source).toContain("employeesNeedingAttention.map(employee");
    expect(source).toContain("employee => !employee.crmUserEmail");
    expect(source).toContain("Existing login unresolved");
    expect(source).toContain("this screen cannot replace a link");
    expect(source).toContain(
      "const selectedEmployee = unlinkedEmployees.find("
    );
    expect(source).toContain("unassignedUsers.map(account");
    expect(source).toContain("String(employee.id) === employeeId");
    expect(source).toContain("String(account.id) === userId");
    expect(source).not.toContain("data.employees.map");
    expect(source).not.toContain("data.users.map");
  });

  it("shows required-staff readiness, server counts, and financial exemptions separately", () => {
    expect(source).toContain("employee => Boolean(employee.crmUserEmail)");
    expect(source).toContain("{readyCount} / {requiredEmployees.length}");
    expect(source).toContain("data.summary.unlinkedEmployees");
    expect(source).toContain("data.summary.unlinkedUsers");
    expect(source).toContain(
      "employee.isActive && !employee.hrSelfServiceRequired"
    );
    expect(source).toContain("Financial-only exemptions");
    expect(source).toContain(
      "Financial-only employees are intentionally exempt"
    );
  });

  it("invalidates all four dependent queries only after a successful mutation", () => {
    const invalidations = calls.filter(call =>
      /\.invalidate$/.test(call.expression.getText(file))
    );
    expect(invalidations.map(call => call.expression.getText(file))).toEqual([
      "utils.hr.admin.onboarding.invalidate",
      "utils.hr.admin.overview.invalidate",
      "utils.hr.attendance.me.invalidate",
      "utils.hr.leave.mine.invalidate",
    ]);
    for (const invalidation of invalidations) {
      expect(enclosingFunctionName(invalidation)).toBe("handleLink");
      expect(
        handler.indexOf(invalidation.expression.getText(file))
      ).toBeGreaterThan(handler.indexOf("await linkEmployee.mutateAsync"));
    }
    expect(handler).toContain("await Promise.all([");
    expect(handler).toContain('setEmployeeId("")');
    expect(handler).toContain('setUserId("")');
    expect(handler).toContain('setReason("")');
  });

  it("prevents duplicate or stale submissions and exposes loading, success, and errors", () => {
    expect(handler).toContain("submissionLock.current || !canLink");
    expect(handler).toContain("submissionLock.current = true");
    expect(handler).toContain("submissionLock.current = false");
    expect(handler).toContain("setIsSaving(true)");
    expect(handler).toContain("setIsSaving(false)");
    expect(source).toContain("isSaving || linkEmployee.isPending");
    expect(source).toContain(
      "busy || onboarding.isFetching || onboarding.isError || !data"
    );
    expect(source).toContain("onboarding.isLoading");
    expect(source).toContain("onboarding.error.message");
    expect(source).toContain('variant="destructive"');
    expect(source).toContain('role="status"');
    expect(source).toContain("Linking CRM login…");
    expect(handler).toContain("do not submit the link again");
    expect(source).toContain("onboarding.refetch()");
  });

  it("never grants admin permissions, creates employees, or invents zero-salary profiles", () => {
    expect(source).toContain("Account choice never grants HR admin access");
    expect(source).toMatch(/accounts may be secondary or external/);
    expect(source).toMatch(/create the proper linked employee in Financial/);
    expect(source).toMatch(/creates employees or zero-salary clones/);
    expect(callTargets.filter(target => target.startsWith("trpc.hr."))).toEqual(
      [
        "trpc.hr.access.useQuery",
        "trpc.hr.admin.onboarding.useQuery",
        "trpc.hr.admin.linkEmployee.useMutation",
      ]
    );
    expect(callTargets).not.toContain("fetch");
    expect(source).not.toMatch(
      /permissions\.[\w]+\.(?:useMutation|mutate)|createEmployee|saveEmployee|salary:\s*0/
    );
  });

  it("uses existing Liquid Glass primitives with labeled responsive tables and controls", () => {
    for (const primitive of [
      "alert",
      "badge",
      "button",
      "card",
      "label",
      "select",
      "table",
      "textarea",
    ])
      expect(source).toContain(`from "@/components/ui/${primitive}"`);
    expect(source).toContain("sm:grid-cols-2 lg:grid-cols-4");
    expect(source).toContain("lg:grid-cols-2");
    expect(source).toContain("whitespace-normal break-all");
    expect(source).toContain("whitespace-normal break-words");
    expect(source).toContain('aria-label="Unassigned CRM accounts"');
    expect(source).toContain(
      'aria-label="Active internal employees needing a CRM link"'
    );
    expect(source).toContain("aria-describedby={`${id}-reason-help`}");
    expect(source).toContain(
      "No active internal employees are waiting for a CRM link."
    );
    expect(source).toContain("No unassigned CRM accounts.");
  });
});
