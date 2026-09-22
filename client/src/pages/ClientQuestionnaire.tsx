import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, ClipboardList, Loader2, LogOut, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CARIBBEAN_QUESTIONNAIRE_STEPS,
  normalizeCaribbeanQuestionnaireAnswers,
  questionnaireStepSummary,
  validateCaribbeanQuestionnaire,
  type CaribbeanQuestionnaireAnswers,
  type QuestionnaireRowField,
  type QuestionnaireStep,
} from "@shared/caribbeanQuestionnaire";
import { isCaribbeanDocumentationProgram } from "@shared/clientDocumentationPrograms";

const SESSION_KEY = "elevay_client_questionnaire_session";
const DRAFT_SAVE_MAX_ATTEMPTS = 3;
const DRAFT_SAVE_RETRY_DELAY_MS = 700;
const LOCAL_DRAFT_KEY_PREFIX = "elevay_questionnaire_pending_v1:";

type LocalQuestionnaireDraft = {
  applicationId: string;
  answers: CaribbeanQuestionnaireAnswers;
  currentStepKey: string;
  updatedAt: number;
};

function localDraftKey(applicationId: string) {
  return `${LOCAL_DRAFT_KEY_PREFIX}${applicationId}`;
}

function readLocalDraft(applicationId: string): LocalQuestionnaireDraft | null {
  try {
    const raw = localStorage.getItem(localDraftKey(applicationId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<LocalQuestionnaireDraft>;
    if (value.applicationId !== applicationId || typeof value.updatedAt !== "number" || typeof value.currentStepKey !== "string" || !value.answers || typeof value.answers !== "object") return null;
    return { applicationId, answers: value.answers as CaribbeanQuestionnaireAnswers, currentStepKey: value.currentStepKey, updatedAt: value.updatedAt };
  } catch {
    return null;
  }
}

function writeLocalDraft(applicationId: string, answers: CaribbeanQuestionnaireAnswers, currentStepKey: string) {
  try {
    localStorage.setItem(localDraftKey(applicationId), JSON.stringify({ applicationId, answers, currentStepKey, updatedAt: Date.now() } satisfies LocalQuestionnaireDraft));
  } catch {
    // The CRM retry path remains authoritative if browser storage is blocked.
  }
}

function clearLocalDraft(applicationId: string) {
  try { localStorage.removeItem(localDraftKey(applicationId)); } catch { /* storage may be unavailable */ }
}

function launchTokenFromLocation() {
  const queryToken = new URLSearchParams(window.location.search).get("launch");
  if (queryToken) return queryToken;
  return new URLSearchParams(window.location.hash.replace(/^#/, "")).get("launch");
}

type PortalSession = { accessToken: string; refreshToken: string; sessionId: string };
type PortalApplication = { publicId: string; label: string; clientCode: string; program: string; programLabel: string; stage: string; questionnaireStatus: string };
type QuestionnaireState = { status: "not_started" | "draft" | "submitted"; answers: CaribbeanQuestionnaireAnswers; currentStepKey: string | null; lastSavedAt: string | null; programLabel: string; journeyStage: string; submittedAt: string | null; stepCount?: number; steps?: QuestionnaireStep[] };
type ClientWorkflow = { progressPercent: number; stages: Array<{ key: string; order: number; titleEn: string; status: "completed" | "active" | "pending"; date: string | null; dueDate?: string | null; detailEn: string }> };

function readSession(): PortalSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as PortalSession : null;
  } catch {
    return null;
  }
}

function saveSession(session: PortalSession | null) {
  if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);
}

function fieldInputType(field: QuestionnaireRowField) {
  return field.type === "date" || field.type === "month" || field.type === "email" || field.type === "tel" || field.type === "number" ? field.type : "text";
}

function blankRow(step: QuestionnaireStep) {
  return Object.fromEntries((step.fields ?? []).map(field => [field.key, ""]));
}

function pause(ms: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, ms));
}

function stepComplete(step: QuestionnaireStep, answers: CaribbeanQuestionnaireAnswers) {
  const value = answers[step.key];
  if (step.type === "repeatable") {
    const rows = Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
    if (step.optional && rows.length === 0) return true;
    if (!rows.length) return false;
    return rows.every(row => (step.fields ?? []).every(field => typeof row[field.key] === "string" && Boolean(String(row[field.key]).trim())));
  }
  if (step.type === "yes_no") {
    if (value !== "yes" && value !== "no") return false;
    if (step.confirmationRequired && value !== "yes") return false;
    if (step.detailRequiredWhenYes && value === "yes") return Boolean(String(answers[`${step.key}.details`] ?? "").trim());
    return true;
  }
  if (step.type === "acknowledgement") return value === true;
  if (step.type === "signature") {
    const signature = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    return Boolean(String(signature.fullName ?? "").trim() && String(signature.date ?? "").trim() && signature.confirmed === true);
  }
  return step.optional || Boolean(String(value ?? "").trim());
}

export default function ClientQuestionnaire() {
  const [session, setSession] = useState<PortalSession | null>(() => readSession());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [applications, setApplications] = useState<PortalApplication[]>([]);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [questionnaire, setQuestionnaire] = useState<QuestionnaireState | null>(null);
  const [workflow, setWorkflow] = useState<ClientWorkflow | null>(null);
  const [answers, setAnswers] = useState<CaribbeanQuestionnaireAnswers>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [rowIndex, setRowIndex] = useState(0);
  const [loading, setLoading] = useState(Boolean(session) || Boolean(launchTokenFromLocation()));
  const [saving, setSaving] = useState(false);
  const [syncState, setSyncState] = useState<"saved" | "pending" | "saving" | "local">("saved");
  const [reviewing, setReviewing] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const pendingSaveCountRef = useRef(0);
  const questionnaireLoadedRef = useRef(false);
  const editVersionRef = useRef(0);
  const savedVersionRef = useRef(0);

  const api = async (path: string, init: RequestInit = {}, allowRefresh = true): Promise<Response> => {
    const active = session ?? readSession();
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}), ...(active?.accessToken ? { Authorization: `Bearer ${active.accessToken}` } : {}) } });
    if (response.status !== 401 || !allowRefresh || !active?.refreshToken || !active.sessionId) return response;
    const refreshed = await fetch("/client-api/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: active.sessionId, refreshToken: active.refreshToken }) });
    if (!refreshed.ok) return response;
    const next = await refreshed.json() as PortalSession;
    setSession(next);
    saveSession(next);
    return fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}), Authorization: `Bearer ${next.accessToken}` } });
  };

  const loadApplications = async () => {
    setLoading(true);
    try {
      const response = await api("/client-api/me/applications");
      if (!response.ok) throw new Error("session_expired");
      const rows = (await response.json() as PortalApplication[]).filter(application => isCaribbeanDocumentationProgram(application.program));
      setApplications(rows);
      const requested = new URLSearchParams(window.location.search).get("application");
      const selected = rows.find(application => application.publicId === requested)?.publicId ?? (rows.length === 1 ? rows[0].publicId : null);
      setApplicationId(selected);
    } catch {
      setSession(null);
      saveSession(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const launchToken = launchTokenFromLocation();
    if (!launchToken) {
      if (session) void loadApplications();
      return;
    }
    setLoading(true);
    fetch("/client-api/questionnaire/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: launchToken }),
    }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || body?.error || "This questionnaire link is invalid or has expired.");
      const next: PortalSession = { accessToken: body.accessToken, refreshToken: body.refreshToken, sessionId: body.sessionId };
      saveSession(next);
      setSession(next);
      setApplicationId(body.applicationId);
      window.history.replaceState({}, "", body.redirectPath || "/client-questionnaire");
    }).catch(() => {
      saveSession(null);
      setSession(null);
      setLaunchError("This secure questionnaire link is invalid, expired, already used, or no longer authorized.");
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!applicationId) return;
    questionnaireLoadedRef.current = false;
    setQuestionnaire(null);
    setLoading(true);
    api(`/client-api/applications/${applicationId}/questionnaire`)
      .then(async response => {
        if (!response.ok) throw new Error("questionnaire_unavailable");
        const data = await response.json() as QuestionnaireState;
        const localDraft = readLocalDraft(applicationId);
        const serverSavedAt = data.lastSavedAt ? Date.parse(data.lastSavedAt) : 0;
        const hasNewerLocalDraft = Boolean(localDraft && localDraft.updatedAt > serverSavedAt && data.status !== "submitted");
        if (localDraft && !hasNewerLocalDraft) clearLocalDraft(applicationId);
        const effectiveData = hasNewerLocalDraft && localDraft
          ? { ...data, answers: normalizeCaribbeanQuestionnaireAnswers(localDraft.answers), currentStepKey: localDraft.currentStepKey }
          : data;
        const normalizedAnswers = normalizeCaribbeanQuestionnaireAnswers(effectiveData.answers);
        const definedSteps = effectiveData.steps?.length ? effectiveData.steps : CARIBBEAN_QUESTIONNAIRE_STEPS;
        const visible = definedSteps.filter(step => !step.appliesWhen || normalizedAnswers[step.appliesWhen.key] === step.appliesWhen.equals);
        setQuestionnaire(effectiveData);
        setAnswers(normalizedAnswers);
        const resumedIndex = Math.max(0, visible.findIndex(step => step.key === effectiveData.currentStepKey));
        setStepIndex(resumedIndex);
        setRowIndex(0);
        setReviewing(false);
        editVersionRef.current = hasNewerLocalDraft ? 1 : 0;
        savedVersionRef.current = 0;
        setSyncState(hasNewerLocalDraft ? "pending" : "saved");
        questionnaireLoadedRef.current = true;
      })
      .catch(() => toast.error("The questionnaire could not be loaded."))
      .finally(() => setLoading(false));
  }, [applicationId]);

  useEffect(() => {
    if (!applicationId || questionnaire?.status !== "submitted") return;
    api(`/client-api/applications/${applicationId}/workflow`).then(async response => {
      if (response.ok) setWorkflow(await response.json() as ClientWorkflow);
    }).catch(() => undefined);
  }, [applicationId, questionnaire?.status]);

  const definedSteps = questionnaire?.steps?.length ? questionnaire.steps : CARIBBEAN_QUESTIONNAIRE_STEPS;
  const visibleSteps = useMemo(() => definedSteps.filter(step => !step.appliesWhen || answers[step.appliesWhen.key] === step.appliesWhen.equals), [answers, definedSteps]);
  const currentStep = visibleSteps[Math.min(stepIndex, Math.max(0, visibleSteps.length - 1))];
  const progress = visibleSteps.length ? Math.round(((stepIndex + 1) / visibleSteps.length) * 100) : 0;

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/client-api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: username, password, deviceName: "Questionnaire Web", platform: "web" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || body?.error || "Login failed");
      if (body.mustChangePassword) throw new Error("Please change your temporary password in the ELEVAY Client App, then return here.");
      const next: PortalSession = { accessToken: body.accessToken, refreshToken: body.refreshToken, sessionId: body.sessionId };
      setSession(next);
      saveSession(next);
      setPassword("");
      setTimeout(() => void loadApplications(), 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed");
      setLoading(false);
    }
  };

  const logout = async () => {
    try { if (session) await api("/client-api/auth/logout", { method: "POST", body: "{}" }, false); } catch { /* local logout still succeeds */ }
    saveSession(null);
    setSession(null);
    setQuestionnaire(null);
    setApplications([]);
    setApplicationId(null);
  };

  const updateAnswer = (key: string, value: unknown) => {
    editVersionRef.current += 1;
    setSyncState("pending");
    setAnswers(current => {
      const next = { ...current, [key]: value };
      if (applicationId && currentStep?.key) writeLocalDraft(applicationId, next, currentStep.key);
      return next;
    });
  };

  const saveDraftWithRetry = async (snapshot: CaribbeanQuestionnaireAnswers, nextStepKey: string) => {
    let lastFailure: unknown;
    for (let attempt = 1; attempt <= DRAFT_SAVE_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await api(`/client-api/applications/${applicationId}/questionnaire/draft`, {
          method: "PUT",
          body: JSON.stringify({ answers: snapshot, currentStepKey: nextStepKey }),
        });
        if (response.ok) return await response.json() as QuestionnaireState;
        // Invalid data, a submitted questionnaire, or an authorization loss
        // must be surfaced rather than retried. Short network/server pressure
        // failures are safe to retry because the whole draft is idempotent.
        if (response.status !== 429 && response.status < 500) {
          throw new Error("Your draft could not be saved");
        }
        lastFailure = new Error("Your draft could not be saved");
      } catch (error) {
        lastFailure = error;
      }
      if (attempt < DRAFT_SAVE_MAX_ATTEMPTS) await pause(DRAFT_SAVE_RETRY_DELAY_MS * attempt);
    }
    throw lastFailure instanceof Error ? lastFailure : new Error("Your draft could not be saved");
  };

  const persistDraft = (snapshot: CaribbeanQuestionnaireAnswers, nextStepKey = currentStep?.key, silent = false) => {
    if (!applicationId || !nextStepKey || questionnaire?.status === "submitted") return Promise.resolve(false);
    const snapshotVersion = editVersionRef.current;
    const run = async () => {
      pendingSaveCountRef.current += 1;
      setSaving(true);
      setSyncState("saving");
      const localAtStart = applicationId ? readLocalDraft(applicationId)?.updatedAt ?? 0 : 0;
      try {
        const data = await saveDraftWithRetry(snapshot, nextStepKey);
        setQuestionnaire(data);
        savedVersionRef.current = Math.max(savedVersionRef.current, snapshotVersion);
        const localAfterSave = applicationId ? readLocalDraft(applicationId) : null;
        if (!localAfterSave || localAfterSave.updatedAt <= localAtStart) {
          if (applicationId) clearLocalDraft(applicationId);
          setSyncState("saved");
        } else {
          setSyncState("pending");
        }
        return true;
      } catch (error) {
        setSyncState("local");
        if (!silent) toast.error(error instanceof Error ? error.message : "Your draft could not be saved");
        return false;
      } finally {
        pendingSaveCountRef.current = Math.max(0, pendingSaveCountRef.current - 1);
        if (pendingSaveCountRef.current === 0) setSaving(false);
      }
    };
    const queued = saveQueueRef.current.then(run, run);
    saveQueueRef.current = queued;
    return queued;
  };

  const saveDraft = (nextStepKey = currentStep?.key) => persistDraft(answers, nextStepKey);

  useEffect(() => {
    if (!questionnaireLoadedRef.current || editVersionRef.current <= savedVersionRef.current || !currentStep || questionnaire?.status === "submitted") return;
    const autosave = window.setTimeout(() => {
      if (editVersionRef.current > savedVersionRef.current) void persistDraft(answers, currentStep.key, true);
    }, 2500);
    return () => window.clearTimeout(autosave);
  }, [answers, applicationId, currentStep?.key, questionnaire?.status]);

  useEffect(() => {
    if (!questionnaireLoadedRef.current || editVersionRef.current <= savedVersionRef.current || !currentStep || questionnaire?.status === "submitted") return;
    const periodicSave = window.setInterval(() => {
      if (editVersionRef.current > savedVersionRef.current) void persistDraft(answers, currentStep.key, true);
    }, 20_000);
    return () => window.clearInterval(periodicSave);
  }, [answers, applicationId, currentStep?.key, questionnaire?.status]);

  useEffect(() => {
    const retryPendingDraft = () => {
      if (!applicationId || questionnaire?.status === "submitted") return;
      const localDraft = readLocalDraft(applicationId);
      if (localDraft) void persistDraft(localDraft.answers, localDraft.currentStepKey, true);
    };
    window.addEventListener("online", retryPendingDraft);
    return () => window.removeEventListener("online", retryPendingDraft);
  }, [applicationId, questionnaire?.status]);

  const next = async () => {
    if (!currentStep || !stepComplete(currentStep, answers)) {
      toast.error("Please complete this question before continuing.");
      return;
    }
    const nextStep = visibleSteps[stepIndex + 1];
    if (nextStep && await saveDraft(nextStep.key)) {
      setStepIndex(index => index + 1);
      setRowIndex(0);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const previous = async () => {
    if (!currentStep || stepIndex === 0) return;
    const previousStep = visibleSteps[stepIndex - 1];
    if (!previousStep || !await persistDraft(answers, previousStep.key)) return;
    setStepIndex(index => Math.max(0, index - 1));
    setRowIndex(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const skipCurrent = async () => {
    if (!currentStep?.optional) return;
    const nextAnswers = { ...answers, [currentStep.key]: currentStep.type === "repeatable" ? [] : "" };
    delete nextAnswers[`${currentStep.key}.details`];
    const nextVisibleSteps = definedSteps.filter(step => !step.appliesWhen || nextAnswers[step.appliesWhen.key] === step.appliesWhen.equals);
    const nextStep = nextVisibleSteps[stepIndex + 1];
    editVersionRef.current += 1;
    setSyncState("pending");
    if (applicationId && nextStep?.key) writeLocalDraft(applicationId, nextAnswers, nextStep.key);
    setAnswers(nextAnswers);
    if (nextStep && await persistDraft(nextAnswers, nextStep.key)) {
      setStepIndex(index => index + 1);
      setRowIndex(0);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const openReview = async () => {
    if (!currentStep || !stepComplete(currentStep, answers)) {
      toast.error("Please complete this required question before reviewing your answers.");
      return;
    }
    const validation = validateCaribbeanQuestionnaire(answers);
    if (!validation.valid) {
      const missingPath = validation.missing[0] ?? "";
      const missingIndex = visibleSteps.findIndex(step => missingPath === step.key || missingPath.startsWith(`${step.key}.`));
      if (missingIndex >= 0) setStepIndex(missingIndex);
      toast.error("Please complete all required questions before final review.");
      return;
    }
    if (!await persistDraft(answers, currentStep.key)) return;
    setReviewing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    if (!applicationId || !currentStep || !stepComplete(currentStep, answers)) {
      toast.error("Please complete the declaration before submitting.");
      return;
    }
    setSaving(true);
    try {
      const response = await api(`/client-api/applications/${applicationId}/questionnaire/submit`, { method: "POST", body: JSON.stringify({ answers }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || "The questionnaire could not be submitted");
      setQuestionnaire(body);
      toast.success("Questionnaire submitted securely.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The questionnaire could not be submitted");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-[#f4f8fa] grid place-items-center"><Loader2 className="h-8 w-8 animate-spin text-[#5BA3B8]" /></div>;

  if (launchError) {
    return <div className="min-h-screen bg-[#f4f8fa] p-4 flex items-center justify-center"><Card className="w-full max-w-md border-0 shadow-xl"><CardContent className="space-y-4 p-8 text-center"><ShieldCheck className="mx-auto h-12 w-12 text-rose-600" /><h1 className="text-2xl font-bold text-[#1A3A5C]">Questionnaire link unavailable</h1><p className="text-sm text-slate-600">{launchError}</p><p className="text-xs text-slate-500">Return to the ELEVAY app and open Client Questionnaire again to receive a fresh secure link.</p></CardContent></Card></div>;
  }

  if (!session) {
    return <div className="min-h-screen bg-[#f4f8fa] p-4 flex items-center justify-center">
      <Card className="w-full max-w-md border-0 shadow-xl">
        <CardHeader className="space-y-3 text-center"><div className="mx-auto h-12 w-12 rounded-2xl bg-[#1A3A5C] text-white grid place-items-center font-bold">E</div><CardTitle className="text-2xl text-[#1A3A5C]">ELEVAY Client Questionnaire</CardTitle><p className="text-sm text-slate-500">Use your existing ELEVAY Client Portal username and password.</p></CardHeader>
        <CardContent><form onSubmit={login} autoComplete="off" className="space-y-4">
          <div className="space-y-2"><Label>Username</Label><Input value={username} onChange={event => setUsername(event.target.value)} autoComplete="off" data-lpignore="true" required /></div>
          <div className="space-y-2"><Label>Password</Label><Input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" data-lpignore="true" required /></div>
          <Button type="submit" disabled={loading} className="w-full bg-[#1A3A5C] hover:bg-[#14304e]">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Sign in securely</Button>
        </form></CardContent>
      </Card>
    </div>;
  }

  if (!applicationId) {
    return <div className="min-h-screen bg-[#f4f8fa] p-4 md:p-10"><div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between"><div><p className="text-sm font-semibold tracking-[0.2em] text-[#5BA3B8]">ELEVAY</p><h1 className="text-3xl font-bold text-[#1A3A5C]">Choose an application</h1></div><Button variant="outline" onClick={logout}><LogOut className="mr-2 h-4 w-4" />Sign out</Button></div>
      {applications.length === 0 ? <Card><CardContent className="p-8 text-center text-slate-600">No Caribbean citizenship application is assigned to this Client Portal account.</CardContent></Card> : applications.map(application => <button key={application.publicId} onClick={() => setApplicationId(application.publicId)} className="w-full rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-slate-200 hover:ring-[#5BA3B8]"><p className="font-semibold text-[#1A3A5C]">{application.programLabel}</p><p className="text-sm text-slate-500">{application.label} · {application.clientCode}</p></button>)}
    </div></div>;
  }

  if (questionnaire?.status === "submitted") {
    return <div className="min-h-screen bg-[#f4f8fa] p-4 md:p-10"><div className="mx-auto max-w-3xl space-y-5"><Card className="border-0 shadow-xl"><CardContent className="p-8 text-center space-y-5"><div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 grid place-items-center"><Check className="h-8 w-8 text-emerald-700" /></div><p className="text-sm font-semibold tracking-[0.2em] text-[#5BA3B8]">{questionnaire.programLabel}</p><h1 className="text-3xl font-bold text-[#1A3A5C]">Questionnaire submitted</h1><p className="text-slate-600">Your information was sent securely to your ELEVAY Client Documentation file.</p><div className="rounded-xl bg-cyan-50 p-5 text-left"><p className="font-semibold text-cyan-900">Next step: Document Collection</p><p className="mt-1 text-sm text-cyan-800">Your checklist is based on your family size and dependant ages. Your consultant and paralegal will guide you through every required document.</p></div></CardContent></Card>
      {workflow && <Card className="border-0 shadow-lg"><CardHeader><div className="flex items-center justify-between"><CardTitle className="text-[#1A3A5C]">Your Application Journey</CardTitle><span className="text-sm font-semibold text-[#5BA3B8]">{workflow.progressPercent}%</span></div></CardHeader><CardContent className="space-y-3">{workflow.stages.map(step => <div key={step.key} className={`rounded-xl border p-4 ${step.status === "completed" ? "border-emerald-200 bg-emerald-50" : step.status === "active" ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-white"}`}><div className="flex gap-3">{step.status === "completed" ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /> : <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 ${step.status === "active" ? "border-cyan-600" : "border-slate-300"}`} />}<div><p className="font-semibold text-slate-900">{step.order}. {step.titleEn}</p><p className="mt-1 text-sm text-slate-600">{step.detailEn}</p>{(step.date || step.dueDate) && <p className="mt-1 text-xs font-medium text-slate-500">{step.date ? `Completed: ${new Date(step.date).toLocaleDateString()}` : `Due: ${new Date(`${step.dueDate}T12:00:00`).toLocaleDateString()}`}</p>}</div></div></div>)}</CardContent></Card>}
      <div className="flex justify-center gap-3"><Button variant="outline" onClick={() => { setApplicationId(null); setQuestionnaire(null); setWorkflow(null); }}>My applications</Button><Button variant="outline" onClick={logout}><LogOut className="mr-2 h-4 w-4" />Sign out</Button></div></div></div>;
  }

  if (reviewing && questionnaire) {
    return <div className="min-h-screen bg-[#f4f8fa] text-slate-900"><header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3"><div><p className="text-sm font-bold tracking-[0.22em] text-[#5BA3B8]">ELEVAY</p><p className="text-xs text-slate-500">{questionnaire.programLabel} Citizenship</p></div><Button size="sm" variant="ghost" onClick={logout}><LogOut className="mr-2 h-4 w-4" />Sign out</Button></div></header><main className="mx-auto max-w-5xl space-y-5 px-4 py-6 md:py-10"><div><p className="text-sm font-semibold tracking-[0.18em] text-[#5BA3B8]">FINAL REVIEW · المراجعة النهائية</p><h1 className="mt-2 text-3xl font-bold text-[#1A3A5C]">Review your questionnaire</h1><p className="mt-2 text-sm text-slate-600">Confirm every answer before secure submission. You may return to any question to edit it.</p></div><div className="space-y-3">{visibleSteps.map((step, index) => <Card key={step.key} className="border-0 shadow-sm"><CardContent className="flex items-start justify-between gap-4 p-4"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[#5BA3B8]">{index + 1}. {step.section}</p><p className="mt-1 font-medium text-slate-900">{step.prompt}</p>{step.promptAr && <p dir="rtl" className="mt-1 text-sm text-slate-600">{step.promptAr}</p>}<p className="mt-2 break-words text-sm text-slate-600">{questionnaireStepSummary(step, answers[step.key], answers)}</p></div><Button variant="outline" size="sm" onClick={() => { setReviewing(false); setStepIndex(index); setRowIndex(0); }}>Edit</Button></CardContent></Card>)}</div><div className="sticky bottom-3 flex flex-col-reverse gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:flex-row sm:justify-between"><Button variant="outline" disabled={saving} onClick={() => setReviewing(false)}><ArrowLeft className="mr-2 h-4 w-4" />Back to questionnaire</Button><Button disabled={saving} onClick={() => void submit()} className="bg-emerald-700 hover:bg-emerald-800">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit questionnaire securely</Button></div></main></div>;
  }

  if (!currentStep || !questionnaire) return <div className="min-h-screen bg-[#f4f8fa] grid place-items-center"><Card><CardContent className="p-8">The questionnaire is unavailable.</CardContent></Card></div>;

  const repeatRows = currentStep.type === "repeatable" ? (Array.isArray(answers[currentStep.key]) ? answers[currentStep.key] as Array<Record<string, string>> : []) : [];
  const activeRows = repeatRows.length ? repeatRows : currentStep.optional ? [] : [blankRow(currentStep)];
  const activeRow = activeRows[Math.min(rowIndex, Math.max(0, activeRows.length - 1))];

  const updateRow = (field: string, value: string) => {
    const rows = activeRows.length ? activeRows.map(row => ({ ...row })) : [blankRow(currentStep)];
    const index = Math.min(rowIndex, rows.length - 1);
    rows[index] = { ...rows[index], [field]: value };
    updateAnswer(currentStep.key, rows);
  };

  const addRow = () => {
    const rows = activeRows.length ? activeRows : [];
    updateAnswer(currentStep.key, [...rows, blankRow(currentStep)]);
    setRowIndex(rows.length);
  };

  const removeRow = () => {
    if (!activeRows.length) return;
    const nextRows = activeRows.filter((_, index) => index !== rowIndex);
    updateAnswer(currentStep.key, nextRows);
    setRowIndex(index => Math.max(0, Math.min(index, nextRows.length - 1)));
  };

  return <div className="min-h-screen bg-[#f4f8fa] text-slate-900">
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3"><div><p className="text-sm font-bold tracking-[0.22em] text-[#5BA3B8]">ELEVAY</p><p className="text-xs text-slate-500">{questionnaire.programLabel} Citizenship</p></div><Button size="sm" variant="ghost" onClick={logout}><LogOut className="mr-2 h-4 w-4" />Sign out</Button></div><div className="h-1 bg-slate-100"><div className="h-full bg-[#5BA3B8] transition-all" style={{ width: `${progress}%` }} /></div></header>
    <main className="mx-auto max-w-5xl px-4 py-6 md:py-10">
      <div className="mb-5 flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between"><div><span>{currentStep.section}</span>{currentStep.sectionAr && <span dir="rtl" className="ml-2 text-slate-400">· {currentStep.sectionAr}</span>}</div><span>Question {stepIndex + 1} of {visibleSteps.length} · {progress}%</span></div>
      <Card className="border-0 shadow-lg"><CardHeader className="border-b border-slate-100 bg-white"><div className="mb-2 flex flex-wrap items-center gap-2 text-[#5BA3B8]"><ClipboardList className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-widest">One question at a time</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${currentStep.optional ? "bg-slate-100 text-slate-600" : "bg-rose-50 text-rose-700"}`}>{currentStep.optional ? "Optional" : "Required"}</span></div><CardTitle className="text-xl md:text-2xl text-[#1A3A5C] leading-snug">{currentStep.prompt}</CardTitle>{currentStep.promptAr && <p dir="rtl" className="text-lg font-semibold leading-relaxed text-[#1A3A5C]">{currentStep.promptAr}</p>}{currentStep.help && <p className="text-sm text-slate-500">{currentStep.help}</p>}{currentStep.helpAr && <p dir="rtl" className="text-sm text-slate-500">{currentStep.helpAr}</p>}</CardHeader>
        <CardContent className="space-y-5 p-5 md:p-8">
          {(currentStep.type === "text" || currentStep.type === "email" || currentStep.type === "tel" || currentStep.type === "number" || currentStep.type === "date" || currentStep.type === "month") && <Input type={currentStep.type} value={String(answers[currentStep.key] ?? "")} onChange={event => updateAnswer(currentStep.key, event.target.value)} className="h-12 text-base" autoFocus />}
          {currentStep.type === "textarea" && <Textarea value={String(answers[currentStep.key] ?? "")} onChange={event => updateAnswer(currentStep.key, event.target.value)} className="min-h-36 text-base" autoFocus />}
          {currentStep.type === "select" && <Select value={String(answers[currentStep.key] ?? "")} onValueChange={value => updateAnswer(currentStep.key, value)}><SelectTrigger className="h-12"><SelectValue placeholder="Choose one option" /></SelectTrigger><SelectContent>{currentStep.options?.map((option, index) => <SelectItem key={option} value={option}><span>{option}</span>{currentStep.optionsAr?.[index] && <span dir="rtl" className="ml-2 text-slate-500">· {currentStep.optionsAr[index]}</span>}</SelectItem>)}</SelectContent></Select>}
          {currentStep.type === "yes_no" && <div className="grid grid-cols-2 gap-3"><Button type="button" variant={answers[currentStep.key] === "yes" ? "default" : "outline"} className={answers[currentStep.key] === "yes" ? "h-14 bg-[#1A3A5C]" : "h-14"} onClick={() => updateAnswer(currentStep.key, "yes")}>Yes · نعم</Button><Button type="button" variant={answers[currentStep.key] === "no" ? "default" : "outline"} className={answers[currentStep.key] === "no" ? "h-14 bg-[#1A3A5C]" : "h-14"} onClick={() => updateAnswer(currentStep.key, "no")}>No · لا</Button></div>}
          {currentStep.type === "yes_no" && currentStep.detailRequiredWhenYes && answers[currentStep.key] === "yes" && <Textarea value={String(answers[`${currentStep.key}.details`] ?? "")} onChange={event => updateAnswer(`${currentStep.key}.details`, event.target.value)} placeholder="Provide full details, including dates, places, authorities, and outcomes." className="min-h-32" />}
          {currentStep.type === "acknowledgement" && <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"><Checkbox checked={answers[currentStep.key] === true} onCheckedChange={checked => updateAnswer(currentStep.key, checked === true)} /><span className="text-sm text-slate-700">I have read, understood, and accept these undertakings.</span></label>}
          {currentStep.type === "signature" && (() => { const signature = answers[currentStep.key] && typeof answers[currentStep.key] === "object" ? answers[currentStep.key] as Record<string, unknown> : {}; const update = (key: string, value: unknown) => updateAnswer(currentStep.key, { ...signature, [key]: value }); return <div className="space-y-4"><div className="space-y-2"><Label>Full legal name</Label><Input value={String(signature.fullName ?? "")} onChange={event => update("fullName", event.target.value)} /></div><div className="space-y-2"><Label>Date</Label><Input type="date" value={String(signature.date ?? "")} onChange={event => update("date", event.target.value)} /></div><label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"><Checkbox checked={signature.confirmed === true} onCheckedChange={checked => update("confirmed", checked === true)} /><span className="text-sm text-slate-700">I confirm that this typed name is my electronic signature and that the information provided is complete and correct.</span></label></div>; })()}
          {currentStep.type === "repeatable" && <div className="space-y-5">
            {activeRows.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center"><p className="text-sm text-slate-500">No entries added. You may continue because this table is optional.</p></div> : <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold text-[#1A3A5C]">Row {rowIndex + 1} of {activeRows.length}</span><div className="flex gap-1"><Button size="icon" variant="outline" disabled={rowIndex === 0} onClick={() => setRowIndex(index => Math.max(0, index - 1))}><ChevronLeft className="h-4 w-4" /></Button><Button size="icon" variant="outline" disabled={rowIndex >= activeRows.length - 1} onClick={() => setRowIndex(index => Math.min(activeRows.length - 1, index + 1))}><ChevronRight className="h-4 w-4" /></Button><Button size="icon" variant="outline" aria-label="Remove this row" onClick={removeRow}><Trash2 className="h-4 w-4 text-rose-600" /></Button></div></div>{currentStep.fields?.map(field => <div key={field.key} className="space-y-2"><Label>{field.label}{field.labelAr && <span dir="rtl" className="ml-2 font-normal text-slate-500">· {field.labelAr}</span>}</Label>{field.type === "select" ? <Select value={String(activeRow?.[field.key] ?? "")} onValueChange={value => updateRow(field.key, value)}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{field.options?.map((option, index) => <SelectItem key={option} value={option}><span>{option}</span>{field.optionsAr?.[index] && <span dir="rtl" className="ml-2 text-slate-500">· {field.optionsAr[index]}</span>}</SelectItem>)}</SelectContent></Select> : field.type === "textarea" ? <Textarea value={String(activeRow?.[field.key] ?? "")} onChange={event => updateRow(field.key, event.target.value)} /> : <Input type={fieldInputType(field)} value={String(activeRow?.[field.key] ?? "")} onChange={event => updateRow(field.key, event.target.value)} />}</div>)}</div>}
            <Button type="button" variant="outline" onClick={addRow}><Plus className="mr-2 h-4 w-4" />{currentStep.addRowLabel || "Add another row"}{currentStep.addRowLabelAr && <span dir="rtl" className="ml-2">· {currentStep.addRowLabelAr}</span>}</Button>
          </div>}
          <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-600 flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-[#5BA3B8]" /><span>Your answers are kept on this device until ELEVAY confirms them. {syncState === "saved" ? "Saved to ELEVAY." : syncState === "saving" ? "Saving to ELEVAY…" : syncState === "local" ? "Saved on this device; ELEVAY will retry automatically." : "Pending sync with ELEVAY."} Autosave continues while you type and when you move between questions.</span></div>
          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><Button variant="outline" disabled={stepIndex === 0 || saving} onClick={() => void previous()}><ArrowLeft className="mr-2 h-4 w-4" />Previous</Button><div className="flex flex-wrap justify-end gap-2">{currentStep.optional && stepIndex < visibleSteps.length - 1 && <Button variant="outline" disabled={saving} onClick={() => void skipCurrent()}>Skip optional question</Button>}<Button variant="ghost" disabled={saving} onClick={() => void saveDraft()}><Save className="mr-2 h-4 w-4" />Save draft</Button>{stepIndex < visibleSteps.length - 1 ? <Button disabled={saving} onClick={() => void next()} className="bg-[#1A3A5C] hover:bg-[#14304e]">Next<ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button disabled={saving} onClick={() => void openReview()} className="bg-[#1A3A5C] hover:bg-[#14304e]">Review answers<ArrowRight className="ml-2 h-4 w-4" /></Button>}</div></div>
        </CardContent>
      </Card>
    </main>
  </div>;
}
