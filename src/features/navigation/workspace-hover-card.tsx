import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
	ArrowDown,
	ArrowUp,
	FileDiff,
	GitBranch,
	GitPullRequest,
	type LucideIcon,
	MessageSquare,
} from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { HelmorThinkingIndicator } from "@/components/helmor-thinking-indicator";
import {
	HoverCardContent,
	HoverCard as HoverCardRoot,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	LazyStreamdown,
	preloadStreamdown,
} from "@/features/panel/message-components/streamdown-loader";
import type {
	ExtendedMessagePart,
	ThreadMessageLike,
	ToolCallPart,
	WorkspaceRow,
	WorkspaceSessionSummary,
} from "@/lib/api";
import {
	workspaceGitActionStatusQueryOptions,
	workspaceSessionsQueryOptions,
} from "@/lib/query-client";
import { useSendingSessionIds } from "@/lib/sending-sessions-context";
import {
	readSessionThread,
	sessionThreadCacheKey,
} from "@/lib/session-thread-cache";
import { cn } from "@/lib/utils";
import { WorkspaceAvatar } from "./avatar";
import { humanizeBranch } from "./shared";

const STATUS_LABEL: Record<NonNullable<WorkspaceRow["status"]>, string> = {
	"in-progress": "In progress",
	review: "In review",
	done: "Done",
	backlog: "Backlog",
	canceled: "Canceled",
};

const STATUS_DOT_CLASS: Record<NonNullable<WorkspaceRow["status"]>, string> = {
	"in-progress": "bg-[var(--workspace-sidebar-status-progress)]",
	review: "bg-[var(--workspace-sidebar-status-review)]",
	done: "bg-[var(--workspace-sidebar-status-done)]",
	backlog: "bg-[var(--workspace-sidebar-status-backlog)]",
	canceled: "bg-[var(--workspace-sidebar-status-canceled)]",
};

function relativeTime(iso?: string | null): string | null {
	if (!iso) return null;
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	return formatDistanceToNow(date, { addSuffix: true });
}

/**
 * Single tiny stat chip used in the top-right cluster: an icon + a
 * compact number. Tuned for ~10px size so it sits flush next to the
 * workspace status dot without hijacking visual weight.
 */
function CompactStat({
	icon: Icon,
	value,
	label,
	tone,
}: {
	icon: LucideIcon;
	value: string;
	label: string;
	tone: "warning" | "danger" | "default";
}) {
	const toneClass =
		tone === "warning"
			? "text-amber-500"
			: tone === "danger"
				? "text-destructive"
				: "text-foreground/75";
	return (
		<span
			className={cn("flex items-center gap-0.5", toneClass)}
			title={label}
			aria-label={label}
		>
			<Icon className="size-2.5 shrink-0" strokeWidth={2.2} />
			<span className="text-[10px] tabular-nums leading-none">{value}</span>
		</span>
	);
}

/**
 * Compact git status, designed to live inline next to the status dot
 * in the top-right corner of the card. When the branch is clean we
 * collapse to a single tiny green branch icon (state visible at a
 * glance, no text). When there are changes we show stat chips:
 * `±N` uncommitted, `↓N` behind target, `↑N` unpushed.
 */
function GitStats({ workspaceId }: { workspaceId: string }) {
	const { data, isLoading, isError } = useQuery(
		workspaceGitActionStatusQueryOptions(workspaceId),
	);

	// Stay silent while loading / on error — the status dot still
	// communicates workspace state, no need for placeholder text.
	if (isLoading || isError || !data) return null;

	const uncommitted = data.uncommittedCount;
	const behind = data.behindTargetCount;
	const ahead = data.aheadOfRemoteCount;
	const targetLabel = data.syncTargetBranch ?? "main";

	const chips: React.ReactNode[] = [];
	if (uncommitted > 0) {
		chips.push(
			<CompactStat
				key="uncommitted"
				icon={FileDiff}
				value={String(uncommitted)}
				label={`${uncommitted} uncommitted change${uncommitted === 1 ? "" : "s"}`}
				tone="warning"
			/>,
		);
	}
	if (behind > 0) {
		chips.push(
			<CompactStat
				key="behind"
				icon={ArrowDown}
				value={String(behind)}
				label={`${behind} commit${behind === 1 ? "" : "s"} behind ${targetLabel}`}
				tone="danger"
			/>,
		);
	}
	if (ahead > 0) {
		chips.push(
			<CompactStat
				key="ahead"
				icon={ArrowUp}
				value={String(ahead)}
				label={`${ahead} unpushed commit${ahead === 1 ? "" : "s"}`}
				tone="default"
			/>,
		);
	}

	if (chips.length === 0) {
		// Clean — single small icon, tooltip carries the explanation.
		return (
			<span
				className="inline-flex shrink-0 items-center"
				title={`Branch up to date with ${targetLabel} · no uncommitted changes`}
				aria-label={`Branch up to date with ${targetLabel}`}
			>
				<GitBranch className="size-3 text-emerald-500/90" strokeWidth={2} />
			</span>
		);
	}

	return <span className="flex items-center gap-1.5">{chips}</span>;
}

/** Strip path → basename for compact tool-call labels. */
function basename(path: string): string {
	const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
	return idx >= 0 ? path.slice(idx + 1) : path;
}

/**
 * Compact one-line summary of a tool call for the live preview pane.
 * Inlined (rather than reusing `getToolInfo` from the panel feature) so
 * the navigation feature stays self-contained — and because we want
 * very short, scannable text rather than the panel's rich rendering.
 */
function summarizeToolCall(part: ToolCallPart): string {
	const args = part.args ?? {};
	const filePath = typeof args.file_path === "string" ? args.file_path : null;
	const path = typeof args.path === "string" ? args.path : null;
	const command = typeof args.command === "string" ? args.command : null;
	const pattern = typeof args.pattern === "string" ? args.pattern : null;
	const url = typeof args.url === "string" ? args.url : null;
	const query = typeof args.query === "string" ? args.query : null;
	const file = filePath ?? path;

	switch (part.toolName) {
		case "Read":
			return file ? `Reading ${basename(file)}` : "Reading file";
		case "Edit":
			return file ? `Editing ${basename(file)}` : "Editing file";
		case "Write":
			return file ? `Writing ${basename(file)}` : "Writing file";
		case "apply_patch":
			return "Applying patch";
		case "Bash":
			return command ? `$ ${command.slice(0, 80)}` : "Running shell";
		case "Grep":
			return pattern ? `Grep "${pattern}"` : "Searching";
		case "Glob":
			return pattern ? `Glob ${pattern}` : "Listing files";
		case "WebFetch":
			return url ? `Fetching ${url}` : "Fetching URL";
		case "WebSearch":
			return query ? `Searching "${query}"` : "Web search";
		case "Task":
		case "Agent":
			return "Running sub-agent";
		case "TodoWrite":
			return "Updating todos";
		default: {
			if (part.toolName.startsWith("mcp__")) {
				const segments = part.toolName.split("__");
				const tool = segments.slice(2).join("__") || part.toolName;
				return `MCP ${tool}`;
			}
			return part.toolName;
		}
	}
}

/**
 * Pick the session whose stream should drive the live preview pane.
 *
 * Priority:
 *   1. Sessions in this workspace that are currently streaming (per
 *      `sendingSessionIds`), excluding hidden / one-off action sessions.
 *      - Exactly one match → use it.
 *      - Multiple matches → the one whose loaded thread has the most
 *        messages wins (best proxy for "the main conversation"). Falls
 *        back to id-stable order on ties.
 *   2. No streaming match → fall back to `primarySessionId` so we still
 *      show the most-recently-active conversation if data is around.
 *
 * Pure & cheap: scans the cached session list (already prefetched on
 * mouseEnter) and reads thread cache lengths via `readSessionThread`.
 */
function chooseLiveSessionId({
	workspaceSessions,
	sendingSessionIds,
	primarySessionId,
	queryClient,
}: {
	workspaceSessions: WorkspaceSessionSummary[] | undefined;
	sendingSessionIds: ReadonlySet<string>;
	primarySessionId: string | null | undefined;
	queryClient: ReturnType<typeof useQueryClient>;
}): string | null {
	const candidates = (workspaceSessions ?? []).filter(
		(session) =>
			!session.isHidden &&
			!session.actionKind &&
			sendingSessionIds.has(session.id),
	);

	if (candidates.length === 0) {
		return primarySessionId ?? null;
	}
	if (candidates.length === 1) {
		return candidates[0]?.id ?? primarySessionId ?? null;
	}

	let best = candidates[0];
	let bestCount = readSessionThread(queryClient, best?.id ?? "")?.length ?? 0;
	for (let i = 1; i < candidates.length; i++) {
		const candidate = candidates[i];
		if (!candidate) continue;
		const count = readSessionThread(queryClient, candidate.id)?.length ?? 0;
		if (count > bestCount) {
			best = candidate;
			bestCount = count;
		}
	}
	return best?.id ?? primarySessionId ?? null;
}

/** A single visible block in the live preview pane. */
type LiveBlock =
	| { kind: "markdown"; key: string; text: string; reasoning: boolean }
	| { kind: "tool"; key: string; label: string };

/**
 * Cap markdown text fed to Streamdown so long reasoning blocks (which
 * Claude can stretch into thousands of tokens) don't blow up parse time
 * on every streaming tick. Keeps the **tail** since that's what the
 * user actually sees through the bottom-anchored flex layout, prefixed
 * with an ellipsis so they know there's more above.
 */
const LIVE_BLOCK_CHAR_BUDGET = 600;
function truncateLiveText(text: string): string {
	if (text.length <= LIVE_BLOCK_CHAR_BUDGET) return text;
	return `…${text.slice(-LIVE_BLOCK_CHAR_BUDGET)}`;
}

/**
 * Build a "live activity log" from the most recent assistant message:
 * one block per content part (text, reasoning, tool call, or collapsed
 * group), in original order. This matches what the user sees streaming
 * in the main panel — text, thinking, and tool calls all surface here
 * so the hover card never sits stuck on a "Thinking…" placeholder
 * just because the model happens to be mid-tool-call.
 */
function extractLiveActivity(
	thread: ThreadMessageLike[] | undefined,
): LiveBlock[] {
	if (!thread?.length) return [];
	let lastAssistant: ThreadMessageLike | undefined;
	for (let i = thread.length - 1; i >= 0; i--) {
		const message = thread[i];
		if (message?.role === "assistant") {
			lastAssistant = message;
			break;
		}
	}
	if (!lastAssistant) return [];

	const blocks: LiveBlock[] = [];
	for (const part of lastAssistant.content as ExtendedMessagePart[]) {
		switch (part.type) {
			case "text":
				if (part.text) {
					blocks.push({
						kind: "markdown",
						key: part.id,
						text: truncateLiveText(part.text),
						reasoning: false,
					});
				}
				break;
			case "reasoning":
				if (part.text) {
					blocks.push({
						kind: "markdown",
						key: part.id,
						text: truncateLiveText(part.text),
						reasoning: true,
					});
				}
				break;
			case "tool-call":
				blocks.push({
					kind: "tool",
					key: part.toolCallId,
					label: summarizeToolCall(part),
				});
				break;
			case "collapsed-group":
				if (part.summary) {
					blocks.push({
						kind: "tool",
						key: part.id,
						label: part.summary,
					});
				}
				break;
			default:
				break;
		}
	}
	return blocks;
}

/**
 * Format a millisecond duration into a compact "stopwatch" string:
 * `42s`, `2m 34s`, `1h 5m`. Designed for narrow display next to the
 * Helmor logo in the streaming title row.
 */
function formatElapsed(ms: number): string {
	const totalSec = Math.max(0, Math.floor(ms / 1000));
	if (totalSec < 60) return `${totalSec}s`;
	const totalMin = Math.floor(totalSec / 60);
	const sec = totalSec % 60;
	if (totalMin < 60) return sec > 0 ? `${totalMin}m ${sec}s` : `${totalMin}m`;
	const hr = Math.floor(totalMin / 60);
	const remMin = totalMin % 60;
	return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

/**
 * Live "running for X" indicator pinned next to the Helmor logo while
 * a workspace is streaming. Reuses the same session-selection logic as
 * `LiveSessionPreview` so the timer always tracks the *streaming*
 * session (not just primary).
 *
 * Start time is read from the **thread cache**, not the session
 * summary's `lastUserMessageAt` — the optimistic user message is
 * appended to the thread the instant the user clicks Send, so its
 * `createdAt` is the most reliable "this turn started at" marker
 * (and is available immediately, without waiting for DB persistence
 * to bubble back up through the workspace-sessions IPC).
 *
 * Ticks once per second via setInterval. Only mounted while the hover
 * card is open *and* `isSending` is true (see WorkspaceHoverCard), so
 * the timer is dormant the rest of the time.
 */
function StreamingElapsed({
	workspaceId,
	primarySessionId,
}: {
	workspaceId: string;
	primarySessionId: string | null | undefined;
}) {
	const queryClient = useQueryClient();
	const sendingSessionIds = useSendingSessionIds();
	const { data: workspaceSessions } = useQuery({
		...workspaceSessionsQueryOptions(workspaceId),
		staleTime: 5_000,
	});

	const sessionId = chooseLiveSessionId({
		workspaceSessions,
		sendingSessionIds,
		primarySessionId,
		queryClient,
	});

	// Subscribe to the same thread cache `LiveSessionPreview` reads from.
	// Re-renders when the latest user message arrives in the optimistic
	// snapshot so the timer can start as soon as the prompt is sent.
	const { data: thread } = useQuery({
		queryKey: sessionThreadCacheKey(sessionId ?? "__none__"),
		queryFn: () =>
			sessionId ? (readSessionThread(queryClient, sessionId) ?? []) : [],
		enabled: Boolean(sessionId),
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: 30_000,
	});

	// Walk the thread in reverse to find the most recent user message —
	// its `createdAt` is when the current turn kicked off. Falls back to
	// the cached session summary's `lastUserMessageAt` if the thread is
	// empty (e.g. opened the hover card before the first stream tick
	// repopulated the cache).
	let startedAtIso: string | null = null;
	if (thread?.length) {
		for (let i = thread.length - 1; i >= 0; i--) {
			const message = thread[i];
			if (message?.role === "user" && message.createdAt) {
				startedAtIso = message.createdAt;
				break;
			}
		}
	}
	if (!startedAtIso && sessionId) {
		startedAtIso =
			workspaceSessions?.find((session) => session.id === sessionId)
				?.lastUserMessageAt ?? null;
	}

	// Drive a 1-second tick so the elapsed value updates live. A single
	// setInterval per open hover card; cleaned up on unmount.
	const [, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(id);
	}, []);

	if (!startedAtIso) return null;
	const startedAt = new Date(startedAtIso).getTime();
	if (Number.isNaN(startedAt)) return null;
	const elapsed = Date.now() - startedAt;
	if (elapsed < 0) return null;

	return (
		<span
			className="mt-0.5 shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/80"
			title={`Running for ${formatElapsed(elapsed)}`}
			aria-label={`Running for ${formatElapsed(elapsed)}`}
		>
			{formatElapsed(elapsed)}
		</span>
	);
}

/** Plain-text fallback for a markdown block while Streamdown lazy-loads. */
function MarkdownFallback({
	text,
	reasoning,
}: {
	text: string;
	reasoning: boolean;
}) {
	return (
		<div
			className={cn(
				"whitespace-pre-wrap break-words",
				reasoning ? "italic text-foreground/60" : "text-foreground/80",
			)}
		>
			{text}
		</div>
	);
}

/**
 * Live, streaming-aware preview pane. Subscribes to the relevant
 * session's thread cache (which `use-streaming` updates on every
 * delta) and renders the latest assistant message's parts in order:
 *
 *   - text & reasoning → markdown via streamdown
 *   - tool calls / collapsed groups → compact monospace label
 *
 * Blocks are stacked at the bottom of a fixed-height container with a
 * top-fade mask, so older content gracefully clips out as new tokens
 * stream in.
 *
 * NOTE: All React Query hooks live inside this component (which is
 * only mounted while the HoverCard is *open* — see Radix Portal). That
 * keeps the parent `WorkspaceHoverCard` zero-cost and zero-dependency
 * for tests that don't open the hover.
 */
function LiveSessionPreview({
	workspaceId,
	primarySessionId,
}: {
	workspaceId: string;
	primarySessionId: string | null | undefined;
}) {
	const queryClient = useQueryClient();
	const sendingSessionIds = useSendingSessionIds();

	// Prime the streamdown chunk eagerly while the user is still inside
	// the hover-open delay. By the time `LazyStreamdown` mounts below,
	// the chunk is usually warm and Suspense never visibly fires.
	useEffect(() => {
		preloadStreamdown();
	}, []);

	// Cached session list — already prefetched on row mouseEnter via
	// `prefetchWorkspace` in `use-controller`. Override the global
	// `staleTime: 0` with a short hover-scoped window so re-opening the
	// card doesn't re-fire `loadWorkspaceSessions` IPC every time.
	const { data: workspaceSessions } = useQuery({
		...workspaceSessionsQueryOptions(workspaceId),
		staleTime: 5_000,
	});

	// Choose which session's stream to follow: prefer a non-hidden,
	// non-action session that's currently sending; tiebreak on most
	// loaded messages; fall back to primary when nothing's streaming.
	const sessionId =
		chooseLiveSessionId({
			workspaceSessions,
			sendingSessionIds,
			primarySessionId,
			queryClient,
		}) ?? null;

	// `useQuery` against the same cache key the streaming pipeline writes
	// to — every `setQueryData` from `use-streaming` triggers a re-render
	// here. queryFn is essentially a no-op that returns whatever's
	// currently cached, since the data is owned externally.
	const { data: thread } = useQuery({
		queryKey: sessionThreadCacheKey(sessionId ?? "__none__"),
		queryFn: () =>
			sessionId ? (readSessionThread(queryClient, sessionId) ?? []) : [],
		enabled: Boolean(sessionId),
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: 30_000,
	});

	// `shareMessages` (in session-thread-cache) keeps the thread array
	// reference stable when nothing changed, so this memo bails out for
	// every "noise" tick that doesn't touch the latest assistant message.
	const blocks = useMemo(() => extractLiveActivity(thread), [thread]);

	if (blocks.length === 0) {
		return (
			<span className="text-[11px] italic text-muted-foreground/70">
				Thinking…
			</span>
		);
	}

	// Render reversed (newest → DOM[0]) and use `flex-col-reverse` so the
	// flex container fills bottom-up: the newest block sits at the bottom,
	// older blocks pile up above. The container has `max-height` only —
	// it shrinks to fit a single short response and only starts clipping
	// (and fading via mask) once content actually exceeds the cap.
	const reversed = [...blocks].reverse();

	return (
		<div
			className={cn(
				"flex max-h-32 flex-col-reverse gap-1.5 overflow-hidden text-[11px] leading-[1.4]",
				// Compact prose tweaks so streamdown's default vertical
				// rhythm doesn't blow out the small pane.
				"[&_p]:my-0 [&_pre]:my-1 [&_pre]:max-h-20 [&_pre]:overflow-hidden",
				"[&_ul]:my-1 [&_ol]:my-1 [&_h1]:text-[12px] [&_h2]:text-[12px] [&_h3]:text-[12px]",
				"[&_h1]:my-1 [&_h2]:my-1 [&_h3]:my-1 [&_code]:text-[10px]",
			)}
			style={{
				// Gentle fade at the very top of the container — proportional
				// to current container height. Stays subtle when content is
				// short (just a few px shimmer), becomes a clear "more above"
				// hint at full height. Only the top ~12% fades.
				maskImage: "linear-gradient(to top, black 88%, transparent 100%)",
				WebkitMaskImage: "linear-gradient(to top, black 88%, transparent 100%)",
			}}
		>
			{reversed.map((block) => {
				if (block.kind === "tool") {
					return (
						<div
							key={block.key}
							className="flex items-baseline gap-1 font-mono text-[10px] text-muted-foreground"
						>
							<span className="text-muted-foreground/50">›</span>
							<span className="truncate">{block.label}</span>
						</div>
					);
				}
				return (
					<div
						key={block.key}
						className={cn(
							"break-words",
							block.reasoning && "italic text-foreground/60",
						)}
					>
						<Suspense
							fallback={
								<MarkdownFallback
									text={block.text}
									reasoning={block.reasoning}
								/>
							}
						>
							<LazyStreamdown>{block.text}</LazyStreamdown>
						</Suspense>
					</div>
				);
			})}
		</div>
	);
}

/** Small visual gap between the sidebar's right edge and the card's left edge. */
const HOVER_CARD_DIVIDER_GAP = 8;
/** Default fallback when we can't locate the sidebar (e.g. row not yet in DOM). */
const HOVER_CARD_DEFAULT_SIDE_OFFSET = 10;

export function WorkspaceHoverCard({
	row,
	isSending,
	children,
}: {
	row: WorkspaceRow;
	isSending?: boolean;
	children: React.ReactNode;
}) {
	// `sideOffset` distance is measured at open time so the card's left edge
	// snaps to the sidebar/main-pane divider regardless of row width or
	// internal sidebar padding. Falls back to a small static offset if we
	// can't find the sidebar element (defensive — shouldn't happen).
	const [sideOffset, setSideOffset] = useState(HOVER_CARD_DEFAULT_SIDE_OFFSET);
	const handleOpenChange = useCallback(
		(open: boolean) => {
			if (!open) return;
			const rowEl = document.querySelector<HTMLElement>(
				`[data-workspace-row-id="${row.id}"]`,
			);
			if (!rowEl) return;
			const sidebarEl = rowEl.closest<HTMLElement>(
				'aside[aria-label="Workspace sidebar"]',
			);
			if (!sidebarEl) return;
			const rowRight = rowEl.getBoundingClientRect().right;
			const sidebarRight = sidebarEl.getBoundingClientRect().right;
			const offset = Math.max(
				HOVER_CARD_DIVIDER_GAP,
				sidebarRight - rowRight + HOVER_CARD_DIVIDER_GAP,
			);
			setSideOffset(offset);
		},
		[row.id],
	);

	const branch = row.branch ?? null;
	const repoLabel = row.repoName ?? row.directoryName ?? null;
	const subtitle = repoLabel
		? branch
			? `${repoLabel} › ${branch}`
			: repoLabel
		: branch;

	// Title preference: PR title (most authoritative) > primary session
	// (the long-running conversation) > active session (last opened) >
	// humanized branch > raw row title.
	const primarySessionTitle =
		row.primarySessionTitle && row.primarySessionTitle !== "Untitled"
			? row.primarySessionTitle
			: null;
	const activeSessionTitleRaw =
		row.activeSessionTitle && row.activeSessionTitle !== "Untitled"
			? row.activeSessionTitle
			: null;
	const title = row.prTitle?.trim()
		? row.prTitle
		: (primarySessionTitle ??
			activeSessionTitleRaw ??
			(branch ? humanizeBranch(branch) : row.title));

	const status = row.status ?? "in-progress";

	// Prefer "last user message" — that's the human-meaningful "I last
	// touched this" signal. Fall back to workspace `updatedAt` (bumped by
	// status/pin/sync changes too) and finally `createdAt`.
	const lastActivityIso =
		row.lastUserMessageAt ?? row.updatedAt ?? row.createdAt ?? null;
	const lastActivity = relativeTime(lastActivityIso);
	const lastActivityLabel = row.lastUserMessageAt
		? "Last message"
		: row.updatedAt
			? "Last changed"
			: "Created";
	const createdAt = relativeTime(row.createdAt);
	const sessionCount = row.sessionCount ?? 0;
	const messageCount = row.messageCount ?? 0;

	return (
		<HoverCardRoot
			openDelay={400}
			closeDelay={80}
			onOpenChange={handleOpenChange}
		>
			<HoverCardTrigger asChild>{children}</HoverCardTrigger>
			<HoverCardContent
				side="right"
				align="start"
				sideOffset={sideOffset}
				className="w-72 p-3"
			>
				<div className="flex flex-col gap-2.5">
					{/* Header: repo › branch on the left, compact git status +
					    workspace status dot clustered tightly on the right. */}
					<div className="flex items-start justify-between gap-2">
						<div className="flex min-w-0 items-center gap-2">
							<WorkspaceAvatar
								repoIconSrc={row.repoIconSrc}
								repoInitials={row.repoInitials ?? row.avatar ?? null}
								repoName={row.repoName}
								title={title}
								className="size-4 rounded-[4px]"
							/>
							{subtitle ? (
								<span className="truncate text-[11px] text-muted-foreground">
									{subtitle}
								</span>
							) : null}
						</div>
						<div className="mt-0.5 flex shrink-0 items-center gap-2">
							<GitStats workspaceId={row.id} />
							<span
								aria-label={STATUS_LABEL[status]}
								title={STATUS_LABEL[status]}
								className={cn(
									"size-2 shrink-0 rounded-full",
									STATUS_DOT_CLASS[status],
								)}
							/>
						</div>
					</div>

					{/* Title — paired with the Helmor logo while the workspace is
					    actively sending so users get an at-a-glance "this one is
					    working right now" signal even before the live preview
					    pane below has any text to show. The elapsed timer on
					    the right surfaces "how long has this been running" at a
					    glance, which is the most-asked question for a streaming
					    workspace you're not currently watching. */}
					<div className="flex items-start gap-2">
						{isSending ? (
							<HelmorThinkingIndicator size={14} className="mt-0.5 shrink-0" />
						) : null}
						<div className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground line-clamp-2">
							{title}
						</div>
						{isSending ? (
							<StreamingElapsed
								workspaceId={row.id}
								primarySessionId={row.primarySessionId}
							/>
						) : null}
					</div>

					{/* Live streaming preview — picks the right session inside
					    (preferring one that's actually sending, with max-message
					    tiebreak) and reads its thread cache, which `use-streaming`
					    keeps current regardless of which workspace is selected. */}
					{isSending ? (
						<LiveSessionPreview
							workspaceId={row.id}
							primarySessionId={row.primarySessionId}
						/>
					) : null}

					{/* PR row (only when there's a PR title and it isn't the main title) */}
					{row.prTitle && row.prTitle !== title ? (
						<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
							<GitPullRequest className="size-3 shrink-0" strokeWidth={1.8} />
							<span className="truncate">{row.prTitle}</span>
						</div>
					) : null}

					{/* Footer meta */}
					<div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground/80">
						<div className="flex items-center gap-2.5">
							{sessionCount > 0 ? (
								<span className="tabular-nums">
									{sessionCount} {sessionCount === 1 ? "session" : "sessions"}
								</span>
							) : null}
							{messageCount > 0 ? (
								<span className="flex items-center gap-1 tabular-nums">
									<MessageSquare className="size-3" strokeWidth={1.8} />
									{messageCount}
								</span>
							) : null}
						</div>
						{lastActivity ? (
							<span
								title={
									createdAt
										? `${lastActivityLabel} · created ${createdAt}`
										: lastActivityLabel
								}
							>
								{lastActivity}
							</span>
						) : null}
					</div>
				</div>
			</HoverCardContent>
		</HoverCardRoot>
	);
}
