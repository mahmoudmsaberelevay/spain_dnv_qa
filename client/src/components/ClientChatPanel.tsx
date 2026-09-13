import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Activity,
  Archive,
  AtSign,
  Ban,
  Bell,
  BellOff,
  CalendarClock,
  Check,
  CheckCheck,
  Clock3,
  EyeOff,
  FileText,
  Download,
  Flag,
  FolderDown,
  Info,
  LockKeyhole,
  MessageCircle,
  Mic,
  MoreVertical,
  Paperclip,
  Pencil,
  Pin,
  Reply,
  Search,
  Send,
  ShieldCheck,
  Square,
  Star,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

type Props = { clientCaseId: number; active: boolean };
const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";
const REACTIONS = ["👍", "❤️", "🙏", "✅", "🎉", "👀"] as const;

function formatTime(value: number) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function makeClientMessageId() {
  return `web:${crypto.randomUUID()}`;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Unable to read the selected file"));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatReceiptNames(receipts: Array<{ displayName: string; deliveredAt: number | null; readAt: number | null; listenedAt: number | null }> | undefined) {
  if (!receipts?.length) return null;
  const uniqueNames = (items: string[]) => Array.from(new Set(items)).join(", ");
  const listened = uniqueNames(receipts.filter(receipt => receipt.listenedAt).map(receipt => receipt.displayName));
  const read = uniqueNames(receipts.filter(receipt => receipt.readAt && !receipt.listenedAt).map(receipt => receipt.displayName));
  const delivered = uniqueNames(receipts.filter(receipt => receipt.deliveredAt && !receipt.readAt && !receipt.listenedAt).map(receipt => receipt.displayName));
  return [
    listened ? `Listened by ${listened}` : null,
    read ? `Read by ${read}` : null,
    delivered ? `Delivered to ${delivered}` : null,
  ].filter(Boolean).join(" · ") || null;
}

type PendingAttachment = { id: string; file: File; durationMs?: number; status: "queued" | "reading" | "uploading" | "failed" | "complete"; error?: string };

function SecureAudioPreview({ src, onPlaybackStart, onListened }: { src: string; onPlaybackStart: () => void; onListened: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [rate, setRate] = useState(1);
  const changeRate = (nextRate: number) => {
    setRate(nextRate);
    if (audioRef.current) audioRef.current.playbackRate = nextRate;
  };
  return <div className="mt-3"><audio ref={audioRef} controls preload="metadata" src={src} onPlay={onPlaybackStart} onEnded={onListened} className="w-full" /><div className="mt-1 flex justify-end gap-1" aria-label="Voice-note playback speed">{[1, 1.5, 2].map(value => <button key={value} type="button" onClick={() => changeRate(value)} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${rate === value ? "bg-[#1e7184] text-white" : "bg-slate-100 text-slate-600"}`}>{value}×</button>)}</div></div>;
}

export function ClientChatPanel({ clientCaseId, active }: Props) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState("");
  const [internal, setInternal] = useState(false);
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [cursor, setCursor] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchFilters, setSearchFilters] = useState({ dateFrom: "", dateTo: "", senderType: "", messageType: "", visibility: "", starredOnly: false, importantOnly: false, pinnedOnly: false, mentionedMeOnly: false });
  const [mentionParticipantPublicIds, setMentionParticipantPublicIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [editBody, setEditBody] = useState("");
  const [reporting, setReporting] = useState<any | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [infoMessagePublicId, setInfoMessagePublicId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<PendingAttachment[]>([]);
  const [uploadingQueue, setUploadingQueue] = useState(false);
  const [recording, setRecording] = useState(false);
  const [attachmentToSave, setAttachmentToSave] = useState<any | null>(null);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState({ inApp: true, email: true, push: true });
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedStaffRole, setSelectedStaffRole] = useState<"consultant" | "paralegal" | "manager" | "observer">("observer");
  const [conversationStatus, setConversationStatus] = useState<"active" | "archived" | "blocked">("active");
  const [waitingOn, setWaitingOn] = useState<"none" | "client" | "staff">("none");
  const [retentionPolicy, setRetentionPolicy] = useState<"indefinite">("indefinite");
  const [legalHold, setLegalHold] = useState(false);
  const [legalHoldReason, setLegalHoldReason] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [governanceOpen, setGovernanceOpen] = useState(false);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [scheduledBody, setScheduledBody] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [scheduledVisibility, setScheduledVisibility] = useState<"client" | "internal">("client");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStartedAt = useRef(0);
  const typingTimer = useRef<number | null>(null);
  const draftHydrated = useRef(false);
  const playbackProofs = useRef(new Map<string, Promise<string | null>>());

  const conversation = trpc.clientChat.getForCase.useQuery(
    { clientCaseId },
    { enabled: active, refetchInterval: active ? 10_000 : false },
  );
  const messages = trpc.clientChat.messages.useQuery(
    { clientCaseId, limit: 100 },
    { enabled: active, refetchInterval: active ? 5_000 : false },
  );
  const poll = trpc.clientChat.poll.useQuery(
    { clientCaseId, afterEventId: cursor },
    { enabled: active, refetchInterval: active ? 2_000 : false, retry: 1 },
  );
  const hasSearchFilter = searchText.trim().length >= 2 || Boolean(searchFilters.dateFrom || searchFilters.dateTo || searchFilters.senderType || searchFilters.messageType || searchFilters.visibility || searchFilters.starredOnly || searchFilters.importantOnly || searchFilters.pinnedOnly || searchFilters.mentionedMeOnly);
  const searchResults = trpc.clientChat.search.useQuery({
    clientCaseId,
    query: searchText.trim().length >= 2 ? searchText.trim() : undefined,
    dateFrom: searchFilters.dateFrom ? new Date(`${searchFilters.dateFrom}T00:00:00`).getTime() : undefined,
    dateTo: searchFilters.dateTo ? new Date(`${searchFilters.dateTo}T23:59:59.999`).getTime() : undefined,
    senderType: (searchFilters.senderType || undefined) as "client" | "staff" | "system" | undefined,
    messageType: (searchFilters.messageType || undefined) as "text" | "image" | "video" | "file" | "voice" | "audio" | "system" | undefined,
    visibility: (searchFilters.visibility || undefined) as "client" | "internal" | undefined,
    starredOnly: searchFilters.starredOnly || undefined,
    importantOnly: searchFilters.importantOnly || undefined,
    pinnedOnly: searchFilters.pinnedOnly || undefined,
    mentionedMeOnly: searchFilters.mentionedMeOnly || undefined,
    limit: 50,
  }, { enabled: active && searchOpen && hasSearchFilter });
  const infoQuery = trpc.clientChat.info.useQuery(
    { clientCaseId, messagePublicId: infoMessagePublicId ?? EMPTY_UUID },
    { enabled: Boolean(infoMessagePublicId) },
  );
  const documentTargets = trpc.clientChat.documentTargets.useQuery(
    { clientCaseId },
    { enabled: active && Boolean(attachmentToSave) },
  );
  const monitoring = trpc.clientChat.monitoring.useQuery(
    { clientCaseId },
    { enabled: active && (settingsOpen || governanceOpen), refetchInterval: active && (settingsOpen || governanceOpen) ? 10_000 : false },
  );
  const assignableStaff = trpc.clientChat.assignableStaff.useQuery(
    { clientCaseId },
    { enabled: active && settingsOpen && Boolean(conversation.data?.participant.canManage) },
  );
  const scheduledMessages = trpc.clientChat.scheduledMessages.useQuery(
    { clientCaseId },
    { enabled: active },
  );
  const messageReports = trpc.clientChat.reports.useQuery(
    { clientCaseId },
    { enabled: active && moderationOpen && Boolean(conversation.data?.participant.canManage) },
  );

  const refreshMessages = () => utils.clientChat.messages.invalidate({ clientCaseId });
  const mutationOptions = {
    onSuccess: () => void refreshMessages(),
    onError: (error: { message: string }) => toast.error(error.message),
  };
  const typingMutation = trpc.clientChat.typing.useMutation();
  const startPlaybackMutation = trpc.clientChat.startPlayback.useMutation();
  const markReadMutation = trpc.clientChat.markRead.useMutation();
  const beginAudioPlayback = (messagePublicId: string) => {
    if (playbackProofs.current.has(messagePublicId)) return;
    playbackProofs.current.set(messagePublicId, startPlaybackMutation.mutateAsync({ clientCaseId, messagePublicId })
      .then(result => result.playbackToken)
      .catch(() => null));
  };
  const completeAudioPlayback = async (messagePublicId: string) => {
    const playbackToken = await playbackProofs.current.get(messagePublicId);
    if (!playbackToken) return;
    markReadMutation.mutate({ clientCaseId, messagePublicId, listened: true, playbackToken });
  };
  const saveDraftMutation = trpc.clientChat.saveDraft.useMutation();
  const starMutation = trpc.clientChat.star.useMutation(mutationOptions);
  const reactionMutation = trpc.clientChat.react.useMutation(mutationOptions);
  const flagMutation = trpc.clientChat.setFlag.useMutation(mutationOptions);
  const hideMutation = trpc.clientChat.hideForMe.useMutation(mutationOptions);
  const deleteMutation = trpc.clientChat.deleteForEveryone.useMutation(mutationOptions);
  const attachmentAccessMutation = trpc.clientChat.attachmentAccess.useMutation({
    onError: error => toast.error(error.message),
  });
  const saveAttachmentMutation = trpc.clientChat.saveAttachmentToDocuments.useMutation({
    onSuccess: () => { setAttachmentToSave(null); void refreshMessages(); toast.success("Attachment saved to Client Documentation"); },
    onError: error => toast.error(error.message),
  });
  const sendAttachmentMutation = trpc.clientChat.sendAttachment.useMutation({
    onSuccess: () => void refreshMessages(),
    onError: error => toast.error(error.message),
  });
  const editMutation = trpc.clientChat.edit.useMutation({
    onSuccess: () => { setEditing(null); setEditBody(""); void refreshMessages(); toast.success("Message updated"); },
    onError: error => toast.error(error.message),
  });
  const reportMutation = trpc.clientChat.report.useMutation({
    onSuccess: () => { setReporting(null); setReportReason(""); toast.success("Message reported for review"); },
    onError: error => toast.error(error.message),
  });
  const preferencesMutation = trpc.clientChat.updatePreferences.useMutation({
    onSuccess: () => {
      void utils.clientChat.getForCase.invalidate({ clientCaseId });
      void utils.clientChat.summaries.invalidate();
      toast.success("Chat notification preferences updated");
    },
    onError: error => toast.error(error.message),
  });
  const participantMutation = trpc.clientChat.setParticipant.useMutation({
    onSuccess: () => {
      setSelectedStaffId("");
      void utils.clientChat.getForCase.invalidate({ clientCaseId });
      void utils.clientChat.assignableStaff.invalidate({ clientCaseId });
      toast.success("Conversation participant updated");
    },
    onError: error => toast.error(error.message),
  });
  const conversationStateMutation = trpc.clientChat.updateConversationState.useMutation({
    onSuccess: data => {
      setConversationStatus(data.status);
      setWaitingOn(data.waitingOn);
      void utils.clientChat.getForCase.invalidate({ clientCaseId });
      void utils.clientChat.monitoring.invalidate({ clientCaseId });
      void utils.clientChat.summaries.invalidate();
      toast.success("Conversation status updated");
    },
    onError: error => toast.error(error.message),
  });
  const governanceMutation = trpc.clientChat.updateGovernance.useMutation({
    onSuccess: data => {
      setRetentionPolicy(data.retentionPolicy);
      setLegalHold(Boolean(data.legalHoldAt));
      setLegalHoldReason(data.legalHoldReason ?? "");
      void utils.clientChat.getForCase.invalidate({ clientCaseId });
      toast.success("Conversation governance updated");
    },
    onError: error => toast.error(error.message),
  });
  const exportMutation = trpc.clientChat.exportConversation.useMutation({
    onSuccess: data => {
      const url = URL.createObjectURL(new Blob([data.content], { type: data.mimeType }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = data.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.recordCount} chat records`);
    },
    onError: error => toast.error(error.message),
  });
  const scheduleMutation = trpc.clientChat.scheduleMessage.useMutation({
    onSuccess: () => {
      setScheduleOpen(false);
      setScheduledBody("");
      setScheduledFor("");
      void utils.clientChat.scheduledMessages.invalidate({ clientCaseId });
      toast.success("Message scheduled securely");
    },
    onError: error => toast.error(error.message),
  });
  const cancelScheduledMutation = trpc.clientChat.cancelScheduledMessage.useMutation({
    onSuccess: () => { void utils.clientChat.scheduledMessages.invalidate({ clientCaseId }); toast.success("Scheduled message cancelled"); },
    onError: error => toast.error(error.message),
  });
  const resolveReportMutation = trpc.clientChat.resolveReport.useMutation({
    onSuccess: () => { void utils.clientChat.reports.invalidate({ clientCaseId }); toast.success("Message report updated"); },
    onError: error => toast.error(error.message),
  });
  const sendMutation = trpc.clientChat.send.useMutation({
    onMutate: async input => {
      await utils.clientChat.messages.cancel({ clientCaseId, limit: 100 });
      const previous = utils.clientChat.messages.getData({ clientCaseId, limit: 100 });
      const participant = conversation.data?.participant;
      utils.clientChat.messages.setData({ clientCaseId, limit: 100 }, old => ([
        ...((old ?? []) as any[]),
        {
          id: -Date.now(),
          publicId: input.clientMessageId,
          conversationId: conversation.data?.conversation.id ?? 0,
          clientMessageId: input.clientMessageId,
          senderParticipantId: participant?.id ?? null,
          senderType: "staff",
          senderNameSnapshot: "You",
          visibility: input.visibility,
          messageType: "text",
          body: input.body,
          replyToMessageId: replyTo?.id ?? null,
          isImportant: false,
          isPinned: false,
          isStarred: false,
          mentionedMe: false,
          reactions: [],
          receiptSummary: { delivered: 0, read: 0, listened: 0 },
          editedAt: null,
          deletedAt: null,
          deletedByParticipantId: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          pending: true,
        },
      ] as any));
      return { previous };
    },
    onError: (error, _input, context) => {
      utils.clientChat.messages.setData({ clientCaseId, limit: 100 }, context?.previous as any);
      toast.error(error.message);
    },
    onSuccess: () => {
      setDraft("");
      setReplyTo(null);
      setInternal(false);
      setMentionParticipantPublicIds([]);
      saveDraftMutation.mutate({ clientCaseId, body: "", replyToMessageId: null });
    },
    onSettled: () => void refreshMessages(),
  });

  useEffect(() => {
    if (draftHydrated.current || !conversation.data) return;
    setDraft(conversation.data.draft?.body ?? "");
    if (conversation.data.draft?.replyToMessageId && messages.data) {
      setReplyTo(messages.data.find(message => message.id === conversation.data?.draft?.replyToMessageId) ?? null);
    }
    draftHydrated.current = true;
  }, [conversation.data, messages.data]);

  useEffect(() => {
    const preferences = conversation.data?.participant.notificationPreferences;
    if (!preferences || typeof preferences !== "object") return;
    const values = preferences as Record<string, boolean>;
    setNotificationPrefs({ inApp: values.inApp !== false, email: values.email !== false, push: values.push !== false });
  }, [conversation.data?.participant.notificationPreferences]);

  useEffect(() => {
    if (!conversation.data?.conversation) return;
    setConversationStatus(conversation.data.conversation.status);
    setWaitingOn(conversation.data.conversation.waitingOn);
    setRetentionPolicy(conversation.data.conversation.retentionPolicy ?? "indefinite");
    setLegalHold(Boolean(conversation.data.conversation.legalHoldAt));
    setLegalHoldReason(conversation.data.conversation.legalHoldReason ?? "");
  }, [conversation.data?.conversation.status, conversation.data?.conversation.waitingOn, conversation.data?.conversation.retentionPolicy, conversation.data?.conversation.legalHoldAt, conversation.data?.conversation.legalHoldReason]);

  useEffect(() => {
    if (!poll.data) return;
    if (poll.data.cursor > cursor) {
      setCursor(poll.data.cursor);
      if (poll.data.events.some(event => event.eventType !== "typing_changed" && event.eventType !== "presence_changed")) {
        void refreshMessages();
      }
      void utils.clientChat.getForCase.invalidate({ clientCaseId });
    }
  }, [poll.data, cursor, clientCaseId, utils]);

  useEffect(() => {
    if (!active || !messages.data?.length) return;
    const newest = messages.data[messages.data.length - 1];
    if (newest?.publicId && newest.senderParticipantId !== conversation.data?.participant.id) {
      markReadMutation.mutate({ clientCaseId, messagePublicId: newest.publicId, listened: false });
    }
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
  }, [messages.data?.length, active]);

  useEffect(() => {
    if (!active) return;
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    if (!draft.trim()) {
      typingMutation.mutate({ clientCaseId, typing: false });
      return;
    }
    typingMutation.mutate({ clientCaseId, typing: true });
    typingTimer.current = window.setTimeout(() => typingMutation.mutate({ clientCaseId, typing: false }), 5_000);
    const draftTimer = window.setTimeout(() => saveDraftMutation.mutate({ clientCaseId, body: draft, replyToMessageId: replyTo?.id ?? null }), 800);
    return () => window.clearTimeout(draftTimer);
  }, [draft, replyTo?.id, active, clientCaseId]);

  const messageById = useMemo(() => new Map((messages.data ?? []).map(message => [message.id, message])), [messages.data]);
  const typingCount = poll.data?.typingParticipantIds.length ?? 0;
  const participant = conversation.data?.participant;
  const muted = Boolean(participant?.muteUntil && participant.muteUntil > Date.now());
  const canWrite = Boolean(participant?.canSend && conversation.data?.conversation.status === "active");
  const mentionedParticipants = (conversation.data?.participants ?? []).filter(item => mentionParticipantPublicIds.includes(item.publicId));
  const availableMentionParticipants = (conversation.data?.participants ?? []).filter(item => item.id !== participant?.id);

  const savePreferences = (muteUntil: number | null) => preferencesMutation.mutate({
    clientCaseId,
    muteUntil,
    inApp: notificationPrefs.inApp,
    email: notificationPrefs.email,
    push: notificationPrefs.push,
  });

  const selectAttachments = (files: File[], durationMs?: number) => {
    setSelectedFiles(current => {
      const available = Math.max(0, 5 - current.length);
      if (files.length > available) toast.error("You can send up to 5 attachments in one batch");
      const accepted: PendingAttachment[] = [];
      for (const file of files.slice(0, available)) {
        const mimeType = file.type.split(";")[0].toLowerCase();
        const audio = mimeType.startsWith("audio/");
        const limit = audio ? 16 * 1024 * 1024 : 25 * 1024 * 1024;
        if (!file.size || file.size > limit) {
          toast.error(`${file.name}: ${audio ? "voice notes must be 16 MB or smaller" : "attachments must be 25 MB or smaller"}`);
          continue;
        }
        accepted.push({ id: crypto.randomUUID(), file, durationMs: files.length === 1 ? durationMs : undefined, status: "queued" });
      }
      return [...current, ...accepted];
    });
  };

  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice recording is not supported by this browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const recorder = preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        const mimeType = (recorder.mimeType || preferredType || "audio/webm").split(";")[0];
        const extension = mimeType === "audio/mp4" ? "m4a" : mimeType === "audio/mpeg" ? "mp3" : "webm";
        const durationMs = Math.max(1, Date.now() - recordingStartedAt.current);
        const voiceFile = new File(chunks, `voice-note-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`, { type: mimeType });
        stream.getTracks().forEach(track => track.stop());
        setRecording(false);
        selectAttachments([voiceFile], durationMs);
      };
      mediaRecorderRef.current = recorder;
      recordingStartedAt.current = Date.now();
      recorder.start();
      setRecording(true);
    } catch {
      toast.error("Microphone permission is required to record a voice note");
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  };

  const openAttachment = async (attachment: any) => {
    const inlinePreview = /^(image|audio|video)\//.test(attachment.mimeType);
    const target = inlinePreview ? null : window.open("about:blank", "_blank");
    try {
      const access = await attachmentAccessMutation.mutateAsync({ clientCaseId, attachmentPublicId: attachment.publicId });
      if (inlinePreview) {
        setAttachmentUrls(current => ({ ...current, [attachment.publicId]: access.url }));
      } else if (target) {
        target.opener = null;
        target.location.href = access.url;
      } else window.location.assign(access.url);
    } catch {
      target?.close();
    }
  };

  const uploadQueuedAttachments = async (onlyIds?: string[]) => {
    const queue = selectedFiles.filter(item => (onlyIds ? onlyIds.includes(item.id) : item.status !== "complete"));
    if (!queue.length) return true;
    setUploadingQueue(true);
    let allSucceeded = true;
    for (const item of queue) {
      try {
        setSelectedFiles(current => current.map(entry => entry.id === item.id ? { ...entry, status: "reading", error: undefined } : entry));
        const base64 = await fileToBase64(item.file);
        setSelectedFiles(current => current.map(entry => entry.id === item.id ? { ...entry, status: "uploading" } : entry));
        await sendAttachmentMutation.mutateAsync({
          clientCaseId,
          clientMessageId: `web:${item.id}`,
          body: draft.trim() || null,
          visibility: internal ? "internal" : "client",
          replyToPublicId: replyTo?.publicId ?? null,
          fileName: item.file.name,
          mimeType: item.file.type.split(";")[0] || "application/octet-stream",
          fileSize: item.file.size,
          base64,
          durationMs: item.durationMs ?? null,
        });
        setSelectedFiles(current => current.map(entry => entry.id === item.id ? { ...entry, status: "complete" } : entry));
      } catch (error) {
        allSucceeded = false;
        const message = error instanceof Error ? error.message : "Upload failed";
        setSelectedFiles(current => current.map(entry => entry.id === item.id ? { ...entry, status: "failed", error: message } : entry));
      }
    }
    setUploadingQueue(false);
    if (allSucceeded) {
      setSelectedFiles([]);
      setDraft("");
      setReplyTo(null);
      setInternal(false);
      setMentionParticipantPublicIds([]);
      saveDraftMutation.mutate({ clientCaseId, body: "", replyToMessageId: null });
      toast.success(queue.length === 1 ? "Attachment sent securely" : `${queue.length} attachments sent securely`);
    } else toast.error("Some attachments could not be sent. Review the failed files and retry.");
    return allSucceeded;
  };

  const submit = async () => {
    const body = draft.trim();
    if ((!body && !selectedFiles.length) || sendMutation.isPending || uploadingQueue) return;
    if (selectedFiles.length) {
      await uploadQueuedAttachments();
      return;
    }
    sendMutation.mutate({
      clientCaseId,
      clientMessageId: makeClientMessageId(),
      body,
      visibility: internal ? "internal" : "client",
      replyToPublicId: replyTo?.publicId ?? null,
      mentionParticipantPublicIds,
    });
  };

  const scrollToMessage = (messageId: number) => {
    setSearchOpen(false);
    requestAnimationFrame(() => document.getElementById(`chat-message-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  if (conversation.isLoading || messages.isLoading) {
    return <div className="flex min-h-[520px] items-center justify-center rounded-2xl border bg-white"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#5ba3b8] border-t-transparent" /></div>;
  }
  if (conversation.error || messages.error) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{conversation.error?.message ?? messages.error?.message ?? "Unable to load chat"}</div>;
  }

  return (
    <>
      <section className="flex min-h-[620px] max-h-[76vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#eef3f3] shadow-sm">
        <header className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-[#1e7184]" /><h3 className="truncate font-semibold text-slate-900">Client conversation</h3></div>
              <p className="mt-0.5 text-xs text-slate-500">{conversation.data?.conversation.clientCode} · one shared history across CRM, Client Portal, and mobile</p>
              <div className="mt-1 flex max-w-full flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">{conversation.data?.participants.slice(0, 5).map(item => <span key={item.publicId} title={item.lastSeenAt ? `Last activity ${new Date(item.lastSeenAt).toLocaleString()}` : "No recent activity"} className="inline-flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${item.presence === "typing" ? "bg-emerald-500" : item.presence === "recently_active" ? "bg-[#5ba3b8]" : "bg-slate-300"}`} />{item.displayName}{item.presence === "typing" ? " · typing" : item.presence === "recently_active" ? " · active recently" : ""}</span>)}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setSearchOpen(value => !value)} className="gap-1.5"><Search className="h-4 w-4" /><span className="hidden sm:inline">Search</span></Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setScheduleOpen(true)} disabled={!canWrite} className="gap-1.5"><CalendarClock className="h-4 w-4" /><span className="hidden lg:inline">Schedule</span></Button>
              <Button type="button" size="sm" variant="outline" onClick={() => exportMutation.mutate({ clientCaseId })} disabled={exportMutation.isPending} className="gap-1.5"><Download className="h-4 w-4" /><span className="hidden lg:inline">Export</span></Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setGovernanceOpen(true)} className="gap-1.5" aria-label="Chat retention and legal hold"><ShieldCheck className="h-4 w-4" /><span className="hidden xl:inline">Governance</span></Button>
              {participant?.canManage ? <Button type="button" size="sm" variant="outline" onClick={() => setModerationOpen(true)} className="gap-1.5" aria-label="Message reports and response target"><Flag className="h-4 w-4" /><span className="hidden xl:inline">Moderation</span></Button> : null}
              <Button type="button" size="sm" variant="outline" onClick={() => setSettingsOpen(true)} className="gap-1.5" aria-label="Chat settings and monitoring">{muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}<span className="hidden sm:inline">Settings</span></Button>
              <div className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex"><Users className="h-4 w-4" />{conversation.data?.participants.length ?? 0}</div>
            </div>
          </div>
          {searchOpen ? <div className="relative mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input autoFocus value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Search message text…" className="bg-white pl-9 pr-9" /><button type="button" onClick={() => { setSearchOpen(false); setSearchText(""); }} className="absolute right-3 top-2.5 text-slate-400" aria-label="Close search"><X className="h-4 w-4" /></button></div>
            <div className="grid gap-2 sm:grid-cols-5">
              <Input type="date" value={searchFilters.dateFrom} onChange={event => setSearchFilters(current => ({ ...current, dateFrom: event.target.value }))} aria-label="Messages from date" className="bg-white" />
              <Input type="date" value={searchFilters.dateTo} onChange={event => setSearchFilters(current => ({ ...current, dateTo: event.target.value }))} aria-label="Messages to date" className="bg-white" />
              <select value={searchFilters.senderType} onChange={event => setSearchFilters(current => ({ ...current, senderType: event.target.value }))} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">Any sender</option><option value="client">Client</option><option value="staff">Staff</option><option value="system">System</option></select>
              <select value={searchFilters.messageType} onChange={event => setSearchFilters(current => ({ ...current, messageType: event.target.value }))} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">Any type</option><option value="text">Text</option><option value="image">Image</option><option value="video">Video</option><option value="file">File</option><option value="voice">Voice</option><option value="audio">Audio</option><option value="system">System</option></select>
              <select value={searchFilters.visibility} onChange={event => setSearchFilters(current => ({ ...current, visibility: event.target.value }))} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">Any visibility</option><option value="client">Client-visible</option>{participant?.canViewInternal ? <option value="internal">Internal notes</option> : null}</select>
            </div>
            <div className="flex flex-wrap gap-2">{([['starredOnly', 'Starred'], ['importantOnly', 'Important'], ['pinnedOnly', 'Pinned'], ['mentionedMeOnly', 'Mentions me']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs text-slate-700"><input type="checkbox" checked={searchFilters[key]} onChange={event => setSearchFilters(current => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}<button type="button" onClick={() => { setSearchText(""); setSearchFilters({ dateFrom: "", dateTo: "", senderType: "", messageType: "", visibility: "", starredOnly: false, importantOnly: false, pinnedOnly: false, mentionedMeOnly: false }); }} className="text-xs font-medium text-[#1e7184]">Clear filters</button></div>
            {hasSearchFilter ? <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border bg-white p-2 shadow-xl">{searchResults.isLoading ? <p className="p-3 text-sm text-slate-500">Searching…</p> : !searchResults.data?.length ? <p className="p-3 text-sm text-slate-500">No messages found.</p> : searchResults.data.map((result: any) => <button key={result.publicId} type="button" onClick={() => scrollToMessage(result.id)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50"><span className="block text-xs font-medium text-slate-700">{result.senderNameSnapshot} · {new Date(result.createdAt).toLocaleString()}</span><span className="block truncate text-sm text-slate-500">{result.deletedAt ? "This message was deleted" : result.body || `Secure ${result.messageType}`}</span></button>)}</div> : <p className="text-xs text-slate-500">Enter at least two characters or choose a filter.</p>}
          </div> : null}
        </header>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-5 sm:px-6">
          {(messages.data ?? []).length === 0 ? (
            <div className="mx-auto mt-20 max-w-sm text-center text-slate-500"><MessageCircle className="mx-auto mb-3 h-10 w-10 text-[#5ba3b8]" /><p className="font-medium text-slate-700">Start the client conversation</p><p className="mt-1 text-sm">Messages sent to the client will appear in the same secure history on every authorized device.</p></div>
          ) : (messages.data ?? []).map((message: any) => {
            const mine = message.senderParticipantId === participant?.id;
            const reply = message.replyToMessageId ? messageById.get(message.replyToMessageId) : null;
            const canEdit = mine && !message.deletedAt && !message.pending && Date.now() - message.createdAt <= 15 * 60_000;
            const canDelete = !message.deletedAt && !message.pending && (mine || participant?.canManage);
            const loadedAudio = message.attachments?.find((attachment: any) => attachment.mimeType.startsWith("audio/") && attachmentUrls[attachment.publicId]);
            return <div key={`${message.id}:${message.clientMessageId}`} id={`chat-message-${message.id}`} className={`flex scroll-mt-20 ${mine ? "justify-end" : "justify-start"}`}>
              <article aria-label={message.mentionedMe ? "Message mentioning you" : undefined} className={`group relative max-w-[92%] rounded-2xl px-3.5 py-2.5 shadow-sm sm:max-w-[72%] ${message.mentionedMe ? "ring-2 ring-[#5ba3b8]/50" : ""} ${message.visibility === "internal" ? "border border-amber-200 bg-amber-50" : mine ? "bg-[#d9eef2] text-slate-900" : "bg-white text-slate-900"}`}>
                <div className="mb-1 flex items-center gap-2 pr-7 text-[11px] font-medium text-slate-500"><span>{mine ? "You" : message.senderNameSnapshot}</span>{message.visibility === "internal" ? <Badge className="h-5 bg-amber-100 px-1.5 text-[10px] text-amber-800 hover:bg-amber-100"><LockKeyhole className="mr-1 h-3 w-3" />Internal</Badge> : null}{message.isPinned ? <Pin className="h-3 w-3 text-[#1e7184]" /> : null}{message.isImportant ? <Badge className="h-5 bg-red-50 px-1.5 text-[9px] text-red-700 hover:bg-red-50">Important</Badge> : null}{message.isStarred ? <Star className="h-3.5 w-3 fill-[#c9a84c] text-[#c9a84c]" /> : null}</div>
                {!message.pending ? <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="absolute right-2 top-2 rounded-full p-1 text-slate-400 opacity-100 hover:bg-white/70 hover:text-slate-700 sm:opacity-0 sm:group-hover:opacity-100" aria-label="Message actions"><MoreVertical className="h-4 w-4" /></button></DropdownMenuTrigger><DropdownMenuContent align={mine ? "end" : "start"} className="w-52"><DropdownMenuItem onSelect={() => setReplyTo(message)}><Reply />Reply</DropdownMenuItem>{canEdit ? <DropdownMenuItem onSelect={() => { setEditing(message); setEditBody(message.body ?? ""); }}><Pencil />Edit</DropdownMenuItem> : null}<DropdownMenuSub><DropdownMenuSubTrigger>React</DropdownMenuSubTrigger><DropdownMenuSubContent>{REACTIONS.map(reaction => <DropdownMenuItem key={reaction} onSelect={() => reactionMutation.mutate({ clientCaseId, messagePublicId: message.publicId, reaction })}><span className="text-base">{reaction}</span>{reaction}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub><DropdownMenuItem onSelect={() => starMutation.mutate({ clientCaseId, messagePublicId: message.publicId })}><Star />{message.isStarred ? "Remove star" : "Star"}</DropdownMenuItem><DropdownMenuItem onSelect={() => flagMutation.mutate({ clientCaseId, messagePublicId: message.publicId, flag: "important", value: !message.isImportant })}><Flag />{message.isImportant ? "Remove important" : "Mark important"}</DropdownMenuItem>{participant?.canManage ? <DropdownMenuItem onSelect={() => flagMutation.mutate({ clientCaseId, messagePublicId: message.publicId, flag: "pinned", value: !message.isPinned })}><Pin />{message.isPinned ? "Unpin" : "Pin"}</DropdownMenuItem> : null}<DropdownMenuItem onSelect={() => setInfoMessagePublicId(message.publicId)}><Info />Message info</DropdownMenuItem><DropdownMenuItem onSelect={() => hideMutation.mutate({ clientCaseId, messagePublicId: message.publicId })}><EyeOff />Hide for me</DropdownMenuItem>{!mine ? <DropdownMenuItem onSelect={() => { setReporting(message); setReportReason(""); }}><Flag />Report</DropdownMenuItem> : null}{canDelete ? <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => { if (window.confirm("Delete this message for everyone? Its previous content remains protected in the audit history.")) deleteMutation.mutate({ clientCaseId, messagePublicId: message.publicId }); }}><Trash2 />Delete for everyone</DropdownMenuItem></> : null}</DropdownMenuContent></DropdownMenu> : null}
                {reply ? <button type="button" onClick={() => scrollToMessage(reply.id)} className="mb-2 w-full rounded-lg border-l-4 border-[#5ba3b8] bg-white/60 px-2 py-1.5 text-left text-xs text-slate-600"><span className="font-medium">Replying to {reply.senderNameSnapshot}</span><span className="block truncate">{reply.deletedAt ? "This message was deleted" : reply.body}</span></button> : null}
                <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.deletedAt ? <span className="italic text-slate-400">This message was deleted</span> : message.body}</p>
                {message.attachments?.map((attachment: any) => <div key={attachment.publicId} className="mt-2 rounded-xl border border-slate-200 bg-white/80 p-3"><button type="button" onClick={() => void openAttachment(attachment)} className="flex w-full items-center gap-3 text-left"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e4f2f5] text-[#1e7184]">{attachment.mimeType.startsWith("audio/") ? <Mic className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{attachment.originalFileName}</span><span className="block text-[11px] text-slate-500">{formatFileSize(attachment.fileSize)} · {attachmentUrls[attachment.publicId] ? "Preview loaded" : "Open secure preview"}</span></span></button>{attachmentUrls[attachment.publicId] && attachment.mimeType.startsWith("image/") ? <img src={attachmentUrls[attachment.publicId]} alt={attachment.originalFileName} className="mt-3 max-h-72 w-full rounded-lg object-contain" /> : null}{attachmentUrls[attachment.publicId] && attachment.mimeType.startsWith("audio/") ? <SecureAudioPreview src={attachmentUrls[attachment.publicId]} onPlaybackStart={() => { if (!mine) beginAudioPlayback(message.publicId); }} onListened={() => { if (!mine) void completeAudioPlayback(message.publicId); }} /> : null}{attachmentUrls[attachment.publicId] && attachment.mimeType.startsWith("video/") ? <video controls preload="metadata" src={attachmentUrls[attachment.publicId]} className="mt-3 max-h-80 w-full rounded-lg bg-black" /> : null}{attachment.transcriptStatus === "pending" ? <p className="mt-2 text-xs text-[#1e7184]">Transcribing voice note…</p> : attachment.transcriptStatus === "failed" ? <p className="mt-2 text-xs text-amber-700">Voice transcript is unavailable; the recording is still accessible.</p> : attachment.transcriptOriginal ? <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer font-medium">Voice transcript</summary><div className="mt-2 space-y-2"><p dir="auto">{attachment.transcriptOriginal}</p>{attachment.transcriptArabic && attachment.transcriptArabic !== attachment.transcriptOriginal ? <p dir="rtl"><span className="font-medium">Arabic:</span> {attachment.transcriptArabic}</p> : null}{attachment.transcriptEnglish && attachment.transcriptEnglish !== attachment.transcriptOriginal ? <p><span className="font-medium">English:</span> {attachment.transcriptEnglish}</p> : null}</div></details> : null}<div className="mt-2 flex justify-end"><Button type="button" size="sm" variant="outline" disabled={attachment.savedToDocuments} onClick={() => setAttachmentToSave(attachment)} className="h-7 gap-1 text-xs"><FolderDown className="h-3.5 w-3.5" />{attachment.savedToDocuments ? "Saved to Docs" : "Save to Docs"}</Button></div></div>)}
                {message.reactions?.length ? <div className="mt-2 flex flex-wrap gap-1">{message.reactions.map((aggregate: any) => <button key={aggregate.reaction} type="button" onClick={() => reactionMutation.mutate({ clientCaseId, messagePublicId: message.publicId, reaction: aggregate.reaction })} className={`rounded-full border px-2 py-0.5 text-xs ${aggregate.reactedByMe ? "border-[#5ba3b8] bg-[#e7f5f8]" : "border-slate-200 bg-white/70"}`}>{aggregate.reaction} {aggregate.count}</button>)}</div> : null}
                {loadedAudio ? <div className="mt-1 flex justify-end gap-1" aria-label="Voice-note playback speed">{[1, 1.5, 2].map(rate => <button key={rate} type="button" onClick={() => { const audio = document.querySelector(`#chat-message-${message.id} audio`); if (audio instanceof HTMLAudioElement) audio.playbackRate = rate; }} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-[#e7f5f8] hover:text-[#1e7184]">{rate}×</button>)}</div> : null}
                <footer className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-slate-400"><span>{formatTime(message.createdAt)}</span>{message.editedAt ? <span>edited</span> : null}{message.pending ? <Clock3 className="h-3 w-3" /> : mine && message.visibility === "client" ? message.receiptSummary?.read > 0 ? <CheckCheck className="h-3.5 w-3.5 text-blue-500" aria-label="Read" /> : message.receiptSummary?.delivered > 0 ? <CheckCheck className="h-3.5 w-3.5" aria-label="Delivered" /> : <Check className="h-3.5 w-3.5" aria-label="Sent" /> : null}</footer>
                {mine && formatReceiptNames(message.receiptDetails) ? <button type="button" onClick={() => setInfoMessagePublicId(message.publicId)} className="mt-1 block max-w-full truncate text-right text-[10px] font-medium text-[#1e7184] underline-offset-2 hover:underline" title={formatReceiptNames(message.receiptDetails) ?? undefined}>{formatReceiptNames(message.receiptDetails)}</button> : null}
              </article>
            </div>;
          })}
        </div>

        <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
          {typingCount > 0 ? <p className="mb-2 text-xs font-medium text-[#1e7184]">{typingCount === 1 ? "A participant is typing…" : `${typingCount} participants are typing…`}</p> : null}
          {replyTo ? <div className="mb-2 flex items-center justify-between rounded-lg border-l-4 border-[#5ba3b8] bg-slate-50 px-3 py-2 text-xs text-slate-600"><div className="min-w-0"><span className="font-medium">Reply to {replyTo.senderNameSnapshot}</span><span className="block truncate">{replyTo.deletedAt ? "This message was deleted" : replyTo.body}</span></div><button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X className="h-4 w-4" /></button></div> : null}
          {selectedFiles.length ? <div className="mb-2 space-y-2 rounded-xl border bg-slate-50 p-2">{selectedFiles.map(item => <div key={item.id} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2"><FileText className="h-5 w-5 shrink-0 text-[#1e7184]" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{item.file.name}</p><p className={`text-xs ${item.status === "failed" ? "text-red-600" : "text-slate-500"}`}>{formatFileSize(item.file.size)}{item.durationMs ? ` · ${Math.ceil(item.durationMs / 1000)} seconds` : ""} · {item.status === "reading" ? "Preparing" : item.status === "uploading" ? "Uploading" : item.status === "complete" ? "Sent" : item.status === "failed" ? item.error || "Failed" : "Queued"}</p>{item.status === "reading" || item.status === "uploading" ? <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full bg-[#5ba3b8] ${item.status === "reading" ? "w-1/3" : "w-2/3"}`} /></div> : null}</div>{item.status === "failed" ? <Button type="button" size="sm" variant="outline" className="h-7" disabled={uploadingQueue} onClick={() => void uploadQueuedAttachments([item.id])}>Retry</Button> : null}{item.status === "queued" || item.status === "failed" ? <button type="button" onClick={() => setSelectedFiles(current => current.filter(entry => entry.id !== item.id))} aria-label={`Remove ${item.file.name}`} className="rounded-full p-1 text-slate-500 hover:bg-slate-200"><X className="h-4 w-4" /></button> : null}</div>)}</div> : null}
          {!canWrite ? <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{conversation.data?.conversation.status === "blocked" ? <Ban className="h-4 w-4" /> : <Archive className="h-4 w-4" />}This conversation is {conversation.data?.conversation.status}. Existing history remains available, but new changes are disabled.</div> : null}
          <div className="mb-2 flex flex-wrap items-center gap-2"><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" disabled={!canWrite || !availableMentionParticipants.length}><AtSign className="h-3.5 w-3.5" />Mention</Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-64 w-64 overflow-y-auto">{availableMentionParticipants.map(item => { const selected = mentionParticipantPublicIds.includes(item.publicId); return <DropdownMenuItem key={item.publicId} onSelect={() => { setMentionParticipantPublicIds(current => selected ? current.filter(id => id !== item.publicId) : [...current, item.publicId]); if (!selected && !draft.includes(`@${item.displayName}`)) setDraft(current => `${current}${current && !current.endsWith(" ") ? " " : ""}@${item.displayName} `); }}><AtSign />{item.displayName}<span className="ml-auto text-[10px] capitalize text-slate-400">{selected ? "Selected" : item.role}</span></DropdownMenuItem>; })}</DropdownMenuContent></DropdownMenu>{mentionedParticipants.map(item => <Badge key={item.publicId} className="gap-1 bg-[#e7f5f8] text-[#1e7184] hover:bg-[#e7f5f8]">@{item.displayName}<button type="button" onClick={() => setMentionParticipantPublicIds(current => current.filter(id => id !== item.publicId))} aria-label={`Remove mention ${item.displayName}`}><X className="h-3 w-3" /></button></Badge>)}</div>
          <div className="flex items-end gap-2">
            <input ref={fileInputRef} type="file" multiple className="hidden" accept="application/pdf,.doc,.docx,image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm,video/mp4,video/webm" onChange={event => { selectAttachments(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
            <div className="flex shrink-0 gap-1"><Button type="button" variant="outline" className="h-11 w-11 rounded-full p-0" onClick={() => fileInputRef.current?.click()} disabled={!canWrite || recording || uploadingQueue || selectedFiles.length >= 5} aria-label="Attach files"><Paperclip className="h-5 w-5" /></Button><Button type="button" variant={recording ? "destructive" : "outline"} className="h-11 w-11 rounded-full p-0" onClick={recording ? stopVoiceRecording : () => void startVoiceRecording()} disabled={!canWrite || uploadingQueue || selectedFiles.length >= 5} aria-label={recording ? "Stop voice recording" : "Record voice note"}>{recording ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}</Button></div>
            <div className="flex-1">
              <Textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder={internal ? "Write an internal note…" : "Write a message to the client…"} className="min-h-[48px] max-h-32 resize-none bg-white" maxLength={10_000} disabled={!canWrite} />
              <div className="mt-2 flex items-center justify-between gap-2"><button type="button" onClick={() => setInternal(value => !value)} disabled={!participant?.canViewInternal} className={`rounded-full px-3 py-1 text-xs font-medium ${internal ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}><LockKeyhole className="mr-1 inline h-3 w-3" />{internal ? "Internal note" : "Send to client"}</button><span className="text-[10px] text-slate-400">{draft.length}/10,000</span></div>
            </div>
            <Button type="button" onClick={() => void submit()} disabled={(!draft.trim() && !selectedFiles.length) || sendMutation.isPending || uploadingQueue || !canWrite || recording} className="h-12 w-12 rounded-full bg-[#1e7184] p-0 hover:bg-[#165d6d]" aria-label="Send message"><Send className="h-5 w-5" /></Button>
          </div>
        </div>
      </section>

      <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open) { setEditing(null); setEditBody(""); } }}><DialogContent><DialogHeader><DialogTitle>Edit message</DialogTitle><DialogDescription>You can edit your own message for 15 minutes after sending. The previous version remains in the protected audit history.</DialogDescription></DialogHeader><Textarea value={editBody} onChange={event => setEditBody(event.target.value)} maxLength={10_000} className="min-h-28" /><DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button disabled={!editBody.trim() || editMutation.isPending} onClick={() => editing && editMutation.mutate({ clientCaseId, messagePublicId: editing.publicId, body: editBody.trim() })}>Save changes</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(reporting)} onOpenChange={open => { if (!open) { setReporting(null); setReportReason(""); } }}><DialogContent><DialogHeader><DialogTitle>Report message</DialogTitle><DialogDescription>Send this message to authorized administrators for review. The client is not notified.</DialogDescription></DialogHeader><Textarea value={reportReason} onChange={event => setReportReason(event.target.value)} placeholder="Reason for reporting…" maxLength={500} className="min-h-24" /><DialogFooter><Button variant="outline" onClick={() => setReporting(null)}>Cancel</Button><Button disabled={reportReason.trim().length < 5 || reportMutation.isPending} onClick={() => reporting && reportMutation.mutate({ clientCaseId, messagePublicId: reporting.publicId, reason: reportReason.trim() })}>Submit report</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(infoMessagePublicId)} onOpenChange={open => { if (!open) setInfoMessagePublicId(null); }}><DialogContent><DialogHeader><DialogTitle>Message information</DialogTitle><DialogDescription>Delivery, read, listening, and edit-history information for authorized staff.</DialogDescription></DialogHeader>{infoQuery.isLoading ? <p className="py-8 text-center text-sm text-slate-500">Loading message information…</p> : infoQuery.error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{infoQuery.error.message}</p> : <div className="space-y-4 text-sm"><div className="grid grid-cols-3 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Delivered</p><p className="mt-1 text-xl font-semibold">{infoQuery.data?.message?.receiptSummary.delivered ?? 0}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Read</p><p className="mt-1 text-xl font-semibold">{infoQuery.data?.message?.receiptSummary.read ?? 0}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Listened</p><p className="mt-1 text-xl font-semibold">{infoQuery.data?.message?.receiptSummary.listened ?? 0}</p></div></div><div><p className="font-medium">Recipients</p>{infoQuery.data?.receiptDetails.length ? <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">{infoQuery.data.receiptDetails.map(receipt => { const state = receipt.listenedAt ? "Listened" : receipt.readAt ? "Read" : "Delivered"; const timestamp = receipt.listenedAt || receipt.readAt || receipt.deliveredAt; return <div key={receipt.participantPublicId} className="flex items-start justify-between gap-3 rounded-lg border p-3"><div className="min-w-0"><p className="truncate font-medium text-slate-800">{receipt.displayName}</p><p className="mt-0.5 text-xs capitalize text-slate-500">{receipt.participantType} · {receipt.role}</p></div><div className="shrink-0 text-right"><p className="font-medium text-[#1e7184]">{state}</p><p className="mt-0.5 text-[10px] text-slate-500">{timestamp ? new Date(timestamp).toLocaleString() : ""}</p></div></div>; })}</div> : <p className="mt-1 text-xs text-slate-500">Waiting for a recipient device to receive this message.</p>}</div><div><p className="font-medium">Version history</p>{infoQuery.data?.versions.length ? <div className="mt-2 space-y-2">{infoQuery.data.versions.map(version => <div key={version.versionNumber} className="rounded-lg border p-2 text-xs text-slate-600">Version {version.versionNumber} · {version.editReason?.replaceAll("_", " ") || "updated"} · {new Date(version.createdAt).toLocaleString()}</div>)}</div> : <p className="mt-1 text-xs text-slate-500">No previous versions.</p>}</div></div>}</DialogContent></Dialog>

      <Dialog open={Boolean(attachmentToSave)} onOpenChange={open => { if (!open) setAttachmentToSave(null); }}><DialogContent><DialogHeader><DialogTitle>Save attachment to Client Documentation</DialogTitle><DialogDescription>Select the exact checklist item. The existing secure file is linked without copying or exposing its storage key.</DialogDescription></DialogHeader><div className="max-h-80 space-y-2 overflow-y-auto">{documentTargets.isLoading ? <p className="py-6 text-center text-sm text-slate-500">Loading document checklist…</p> : !documentTargets.data?.length ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This folder has no checklist items.</p> : documentTargets.data.map(target => <button key={target.documentKey} type="button" disabled={saveAttachmentMutation.isPending} onClick={() => attachmentToSave && saveAttachmentMutation.mutate({ clientCaseId, attachmentPublicId: attachmentToSave.publicId, documentKey: target.documentKey })} className="flex w-full items-center gap-3 rounded-xl border p-3 text-left hover:border-[#5ba3b8] hover:bg-[#f3fafb]"><FolderDown className="h-5 w-5 text-[#1e7184]" /><span><span className="block text-sm font-medium text-slate-800">{target.documentName}</span><span className="text-xs capitalize text-slate-500">{target.category}</span></span></button>)}</div><DialogFooter><Button variant="outline" onClick={() => setAttachmentToSave(null)}>Cancel</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Chat settings and monitoring</DialogTitle><DialogDescription>These controls affect only this Client Documentation conversation. Adaptive polling runs while the chat is open; this is not a WebSocket connection.</DialogDescription></DialogHeader>
        <div className="space-y-5">
          {participant?.canManage ? <section className="space-y-3"><div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Archive className="h-4 w-4 text-[#1e7184]" />Conversation state</div><div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><select value={conversationStatus} onChange={event => setConversationStatus(event.target.value as typeof conversationStatus)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="active">Active</option><option value="archived">Archived</option><option value="blocked">Blocked</option></select><select value={waitingOn} onChange={event => setWaitingOn(event.target.value as typeof waitingOn)} disabled={conversationStatus !== "active"} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="none">Waiting on: none</option><option value="client">Waiting on: client</option><option value="staff">Waiting on: staff</option></select><Button type="button" disabled={conversationStateMutation.isPending} onClick={() => conversationStateMutation.mutate({ clientCaseId, status: conversationStatus, waitingOn })}>Save state</Button></div><p className="text-xs text-slate-500">Archived and blocked conversations remain readable but cannot accept new messages. Every state change is audited.</p></section> : null}
          <section><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800"><Activity className="h-4 w-4 text-[#1e7184]" />Conversation health</div>{monitoring.isLoading ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Loading monitoring data…</p> : monitoring.error ? <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">Monitoring data is unavailable.</p> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Status</p><p className="mt-1 text-sm font-semibold capitalize">{monitoring.data?.status}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Waiting on</p><p className="mt-1 text-sm font-semibold capitalize">{monitoring.data?.waitingOn}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Messages</p><p className="mt-1 text-sm font-semibold">{monitoring.data?.messageCount ?? 0}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Unread</p><p className="mt-1 text-sm font-semibold">{monitoring.data?.unreadCount ?? 0}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Attachments</p><p className="mt-1 text-sm font-semibold">{monitoring.data?.attachmentCount ?? 0}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Internal notes</p><p className="mt-1 text-sm font-semibold">{monitoring.data?.internalMessageCount ?? 0}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Transcripts pending</p><p className="mt-1 text-sm font-semibold">{monitoring.data?.pendingTranscriptCount ?? 0}</p></div><div className={`rounded-xl p-3 ${monitoring.data?.failedTranscriptCount ? "bg-red-50" : "bg-slate-50"}`}><p className="text-[11px] text-slate-500">Transcript failures</p><p className="mt-1 text-sm font-semibold">{monitoring.data?.failedTranscriptCount ?? 0}</p></div></div>}</section>

          <section className="space-y-3 border-t pt-4"><div className="flex items-center gap-2 text-sm font-semibold text-slate-800">{muted ? <BellOff className="h-4 w-4 text-[#1e7184]" /> : <Bell className="h-4 w-4 text-[#1e7184]" />}Notifications</div><div className="grid gap-2 sm:grid-cols-3">{([['inApp', 'In-app alerts'], ['email', 'Email alerts'], ['push', 'Mobile push']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-xl border p-3 text-sm"><input type="checkbox" checked={notificationPrefs[key]} onChange={event => setNotificationPrefs(current => ({ ...current, [key]: event.target.checked }))} className="h-4 w-4" />{label}</label>)}</div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => savePreferences(null)}>Unmute</Button><Button type="button" size="sm" variant="outline" onClick={() => savePreferences(Date.now() + 60 * 60_000)}>Mute 1 hour</Button><Button type="button" size="sm" variant="outline" onClick={() => savePreferences(Date.now() + 8 * 60 * 60_000)}>Mute 8 hours</Button><Button type="button" size="sm" variant="outline" onClick={() => savePreferences(Date.now() + 3650 * 24 * 60 * 60_000)}>Mute until changed</Button><Button type="button" size="sm" onClick={() => savePreferences(participant?.muteUntil ?? null)} disabled={preferencesMutation.isPending}>Save channels</Button></div><p className="text-xs text-slate-500">Muted conversations still keep unread counts and secure history; only interruptive delivery is suppressed.</p></section>

          {participant?.canManage ? <section className="space-y-3 border-t pt-4"><div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><UserPlus className="h-4 w-4 text-[#1e7184]" />Assign staff participant</div><div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]"><select value={selectedStaffId} onChange={event => setSelectedStaffId(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">Select staff member</option>{assignableStaff.data?.map(staff => <option key={staff.id} value={staff.id}>{staff.name}</option>)}</select><select value={selectedStaffRole} onChange={event => setSelectedStaffRole(event.target.value as typeof selectedStaffRole)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="observer">Observer</option><option value="consultant">Consultant</option><option value="paralegal">Paralegal</option><option value="manager">Manager</option></select><Button type="button" disabled={!selectedStaffId || participantMutation.isPending} onClick={() => selectedStaffId && participantMutation.mutate({ clientCaseId, staffUserId: Number(selectedStaffId), role: selectedStaffRole, active: true, makeAssignee: true })}>Assign</Button></div><p className="text-xs text-slate-500">Only staff with Client Documentation access can be added. Assignment changes are audited.</p></section> : null}
        </div><DialogFooter><Button variant="outline" onClick={() => setSettingsOpen(false)}>Close</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Schedule a chat message</DialogTitle><DialogDescription>The message is stored securely and delivered by the platform Heartbeat at the selected time. Delivery remains idempotent if the callback retries.</DialogDescription></DialogHeader><div className="space-y-3"><Textarea value={scheduledBody} onChange={event => setScheduledBody(event.target.value)} placeholder="Write the scheduled message…" maxLength={10_000} className="min-h-28" /><div className="grid gap-3 sm:grid-cols-2"><Input type="datetime-local" value={scheduledFor} onChange={event => setScheduledFor(event.target.value)} aria-label="Scheduled delivery date and time" /><select value={scheduledVisibility} onChange={event => setScheduledVisibility(event.target.value as "client" | "internal")} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="client">Send to client</option>{participant?.canViewInternal ? <option value="internal">Internal note</option> : null}</select></div><p className="text-xs text-slate-500">Times use your device timezone and are stored as UTC. Schedule between one minute and one year from now.</p>{scheduledMessages.data?.length ? <div className="max-h-48 space-y-2 overflow-y-auto border-t pt-3"><p className="text-xs font-semibold text-slate-700">Recent scheduled messages</p>{scheduledMessages.data.map(item => <div key={item.publicId} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs"><div className="min-w-0 flex-1"><p className="truncate font-medium text-slate-700">{item.body}</p><p className="text-slate-500">{new Date(item.scheduledFor).toLocaleString()} · {item.visibility} · {item.status}</p></div>{item.status === "scheduled" ? <Button type="button" size="sm" variant="outline" className="h-7" disabled={cancelScheduledMutation.isPending} onClick={() => cancelScheduledMutation.mutate({ clientCaseId, scheduledMessagePublicId: item.publicId })}>Cancel</Button> : null}</div>)}</div> : null}</div><DialogFooter><Button variant="outline" onClick={() => setScheduleOpen(false)}>Close</Button><Button disabled={!scheduledBody.trim() || !scheduledFor || scheduleMutation.isPending} onClick={() => scheduleMutation.mutate({ clientCaseId, body: scheduledBody.trim(), visibility: scheduledVisibility, scheduledFor: new Date(scheduledFor).getTime() })}>Schedule message</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={governanceOpen} onOpenChange={setGovernanceOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Chat retention and legal hold</DialogTitle><DialogDescription>Messages, attachments, and old chat history are retained indefinitely. There is no automatic deletion, expiration, TTL, retention cutoff, or quota cleanup. Only an authorized person can manually remove a message; legal hold disables even that manual action.</DialogDescription></DialogHeader><div className="space-y-4"><div className="rounded-xl bg-slate-50 p-3 text-sm"><div className="flex items-center justify-between gap-3"><span className="text-slate-600">Secure attachment storage</span><span className="font-semibold text-slate-800">{formatFileSize(monitoring.data?.storageBytesUsed ?? 0)} / {formatFileSize(monitoring.data?.storageQuotaBytes ?? 500 * 1024 * 1024)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#5ba3b8]" style={{ width: `${Math.min(100, ((monitoring.data?.storageBytesUsed ?? 0) / Math.max(1, monitoring.data?.storageQuotaBytes ?? 500 * 1024 * 1024)) * 100)}%` }} /></div></div>{participant?.canManage ? <><label className="block space-y-1 text-sm"><span className="font-medium text-slate-700">Retention policy</span><select value={retentionPolicy} onChange={event => setRetentionPolicy(event.target.value as typeof retentionPolicy)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3"><option value="indefinite">Permanent retention — manual removal only</option></select><span className="block text-xs text-slate-500">Permanent system rule: storage quotas may block new uploads, but never delete existing messages or attachments.</span></label><label className="flex items-start gap-3 rounded-xl border p-3 text-sm"><input type="checkbox" checked={legalHold} onChange={event => setLegalHold(event.target.checked)} className="mt-0.5 h-4 w-4" /><span><span className="block font-medium text-slate-800">Legal hold</span><span className="text-xs text-slate-500">Prevent authorized users from manually removing messages while the legal hold is active.</span></span></label>{legalHold ? <Textarea value={legalHoldReason} onChange={event => setLegalHoldReason(event.target.value)} placeholder="Reason for legal hold…" maxLength={500} className="min-h-24" /> : null}</> : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Only conversation managers can change retention or legal hold. You can still create an audited export.</p>}</div><DialogFooter><Button variant="outline" onClick={() => exportMutation.mutate({ clientCaseId })} disabled={exportMutation.isPending}><Download className="mr-2 h-4 w-4" />Export CSV</Button><Button variant="outline" onClick={() => setGovernanceOpen(false)}>Close</Button>{participant?.canManage ? <Button disabled={governanceMutation.isPending || (legalHold && legalHoldReason.trim().length < 5)} onClick={() => governanceMutation.mutate({ clientCaseId, retentionPolicy, legalHold, legalHoldReason: legalHold ? legalHoldReason.trim() : null })}>Save governance</Button> : null}</DialogFooter></DialogContent></Dialog>
      <Dialog open={moderationOpen} onOpenChange={setModerationOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Message reports and response target</DialogTitle><DialogDescription>Only conversation managers can review reports. The client is not notified of internal moderation decisions.</DialogDescription></DialogHeader><div className="space-y-4"><div className={`rounded-xl p-3 text-sm ${monitoring.data?.responseOverdue ? "bg-red-50 text-red-800" : "bg-slate-50 text-slate-700"}`}><p className="font-medium">Staff response target: {monitoring.data?.responseTargetMinutes ?? 240} minutes</p><p className="mt-1 text-xs">{monitoring.data?.responseDueAt ? `${monitoring.data.responseOverdue ? "Overdue since" : "Response due"} ${new Date(monitoring.data.responseDueAt).toLocaleString()}` : "No client message is currently waiting for a staff response."}</p></div><div className="max-h-80 space-y-2 overflow-y-auto">{messageReports.isLoading ? <p className="py-6 text-center text-sm text-slate-500">Loading reported messages…</p> : !messageReports.data?.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No message reports in this conversation.</p> : messageReports.data.map(report => <div key={report.publicId} className="rounded-xl border p-3 text-sm"><div className="flex items-center justify-between gap-3"><span className="font-medium text-slate-800">{report.senderName}</span><Badge variant="outline" className="capitalize">{report.status}</Badge></div><p className="mt-2 text-slate-600">{report.reason}</p><p className="mt-1 text-xs text-slate-400">Reported {new Date(report.createdAt).toLocaleString()}</p>{report.status === "open" ? <div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={resolveReportMutation.isPending} onClick={() => resolveReportMutation.mutate({ clientCaseId, reportPublicId: report.publicId, status: "reviewed" })}>Reviewed</Button><Button type="button" size="sm" variant="outline" disabled={resolveReportMutation.isPending} onClick={() => resolveReportMutation.mutate({ clientCaseId, reportPublicId: report.publicId, status: "dismissed" })}>Dismiss</Button><Button type="button" size="sm" disabled={resolveReportMutation.isPending} onClick={() => resolveReportMutation.mutate({ clientCaseId, reportPublicId: report.publicId, status: "actioned" })}>Actioned</Button></div> : null}</div>)}</div></div><DialogFooter><Button variant="outline" onClick={() => setModerationOpen(false)}>Close</Button></DialogFooter></DialogContent></Dialog>
    </>
  );
}
