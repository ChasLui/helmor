import {
	Archive,
	Circle,
	FolderOpen,
	Pin,
	PinOff,
	RotateCcw,
} from "lucide-react";
import { memo, useEffect, useState } from "react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	getScriptState,
	subscribeStatus,
} from "@/features/inspector/script-store";
import type { WorkspaceRow, WorkspaceStatus } from "@/lib/api";
import { recordSidebarRowRender } from "@/lib/dev-render-debug";
import { getWorkspaceBranchTone } from "@/lib/workspace-helpers";
import { GroupIcon, humanizeBranch, STATUS_OPTIONS } from "./shared";
import { WorkspaceRowHoverActionsUI, WorkspaceRowUI } from "./workspace-row.ui";

export type WorkspaceRowItemProps = {
	row: WorkspaceRow;
	selected: boolean;
	isSending?: boolean;
	isInteractionRequired?: boolean;
	rowRef?: (element: HTMLDivElement | null) => void;
	onSelect?: (workspaceId: string) => void;
	onPrefetch?: (workspaceId: string) => void;
	onArchiveWorkspace?: (workspaceId: string) => void;
	onMarkWorkspaceUnread?: (workspaceId: string) => void;
	onOpenInFinder?: (workspaceId: string) => void;
	onRestoreWorkspace?: (workspaceId: string) => void;
	onDeleteWorkspace?: (workspaceId: string) => void;
	onTogglePin?: (workspaceId: string, currentlyPinned: boolean) => void;
	onSetWorkspaceStatus?: (workspaceId: string, status: WorkspaceStatus) => void;
	archivingWorkspaceIds?: Set<string>;
	markingUnreadWorkspaceId?: string | null;
	restoringWorkspaceId?: string | null;
	workspaceActionsDisabled?: boolean;
};

/**
 * Subscribes to this workspace's `run`-script status via the module-level
 * script-store used by the inspector. Returns true only while the script is
 * actively executing (not "idle" or "exited"). Per-row subscription keeps the
 * re-render fan-out narrow — only rows whose status flipped re-render.
 */
function useIsRunScriptRunning(workspaceId: string): boolean {
	const [running, setRunning] = useState(
		() => getScriptState(workspaceId, "run")?.status === "running",
	);
	useEffect(() => {
		// Re-sync when the row is reused for a different workspace (virtual list).
		setRunning(getScriptState(workspaceId, "run")?.status === "running");
		return subscribeStatus(workspaceId, "run", (status) => {
			setRunning(status === "running");
		});
	}, [workspaceId]);
	return running;
}

export const WorkspaceRowItem = memo(
	function WorkspaceRowItem({
		row,
		selected,
		isSending,
		isInteractionRequired,
		rowRef,
		onSelect,
		onPrefetch,
		onArchiveWorkspace,
		onMarkWorkspaceUnread: _onMarkWorkspaceUnread,
		onOpenInFinder,
		onRestoreWorkspace,
		onDeleteWorkspace,
		onTogglePin,
		onSetWorkspaceStatus,
		archivingWorkspaceIds,
		markingUnreadWorkspaceId,
		restoringWorkspaceId,
		workspaceActionsDisabled,
	}: WorkspaceRowItemProps) {
		useEffect(() => {
			recordSidebarRowRender(row.id);
		});
		const isRunScriptRunning = useIsRunScriptRunning(row.id);
		const actionLabel =
			row.state === "archived" ? "Restore workspace" : "Archive workspace";
		const isArchiving = archivingWorkspaceIds?.has(row.id) ?? false;
		const isMarkingUnread = markingUnreadWorkspaceId === row.id;
		const isRestoring = restoringWorkspaceId === row.id;
		const isRestoreAction = row.state === "archived";
		const isBusy = isArchiving || isMarkingUnread || isRestoring;
		const hasActionHandler = isRestoreAction
			? Boolean(onRestoreWorkspace)
			: Boolean(onArchiveWorkspace);
		// Width of the hover action cluster drives the text fade mask. Single icon
		// uses the CSS default (transparent 1.2rem, solid 2rem). Two icons span
		// ~3.25rem from the row's right edge (pr-2.5 + size-5 + gap-0.5 + size-5),
		// so push the fade to end just past that so text hugs the leftmost icon
		// instead of leaving a visible gap.
		const hasTwoActions =
			hasActionHandler && isRestoreAction && Boolean(onDeleteWorkspace);
		const isPinned = Boolean(row.pinnedAt);
		const effectiveStatus = row.status ?? "in-progress";
		const branchTone = getWorkspaceBranchTone({
			workspaceState: row.state,
			status: row.status,
		});
		const displayTitle = row.branch ? humanizeBranch(row.branch) : row.title;

		const rowBody = (
			<WorkspaceRowUI
				displayTitle={displayTitle}
				repoIconSrc={row.repoIconSrc}
				repoInitials={row.repoInitials ?? row.avatar ?? null}
				repoName={row.repoName}
				hasUnread={row.hasUnread}
				isArchived={row.state === "archived"}
				selected={selected}
				isSending={isSending}
				isInteractionRequired={isInteractionRequired}
				isRunScriptRunning={isRunScriptRunning}
				branchTone={branchTone}
				dataWorkspaceRowId={row.id}
				rowRef={rowRef}
				onMouseEnter={() => onPrefetch?.(row.id)}
				onFocus={() => onPrefetch?.(row.id)}
				onClick={() => onSelect?.(row.id)}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						onSelect?.(row.id);
					}
				}}
				hasTwoActions={hasTwoActions}
				isBusy={isBusy}
				hoverActions={
					hasActionHandler ? (
						<WorkspaceRowHoverActionsUI
							actionLabel={actionLabel}
							isRestoreAction={isRestoreAction}
							isBusy={isBusy}
							disabled={Boolean(workspaceActionsDisabled)}
							onPrimaryAction={() => {
								if (isRestoreAction) {
									onRestoreWorkspace?.(row.id);
								} else {
									onArchiveWorkspace?.(row.id);
								}
							}}
							onDelete={
								isRestoreAction && onDeleteWorkspace
									? () => onDeleteWorkspace(row.id)
									: undefined
							}
						/>
					) : null
				}
			/>
		);

		return (
			<ContextMenu>
				<ContextMenuTrigger className="block">{rowBody}</ContextMenuTrigger>
				<ContextMenuContent className="min-w-48">
					<ContextMenuItem onClick={() => onTogglePin?.(row.id, isPinned)}>
						{isPinned ? (
							<PinOff className="size-4 shrink-0" strokeWidth={1.6} />
						) : (
							<Pin className="size-4 shrink-0" strokeWidth={1.6} />
						)}
						<span>{isPinned ? "Unpin" : "Pin"}</span>
					</ContextMenuItem>

					<ContextMenuSub>
						<ContextMenuSubTrigger>
							<Circle className="size-4 shrink-0" strokeWidth={1.6} />
							<span>Set status</span>
						</ContextMenuSubTrigger>
						<ContextMenuSubContent>
							{STATUS_OPTIONS.map((opt) => (
								<ContextMenuItem
									key={opt.value}
									onClick={() => onSetWorkspaceStatus?.(row.id, opt.value)}
								>
									<GroupIcon tone={opt.tone} />
									<span className="flex-1">{opt.label}</span>
									{effectiveStatus === opt.value ? (
										<span className="ml-auto text-foreground">✓</span>
									) : null}
								</ContextMenuItem>
							))}
						</ContextMenuSubContent>
					</ContextMenuSub>

					{_onMarkWorkspaceUnread ? (
						<ContextMenuItem
							disabled={
								row.hasUnread || isBusy || Boolean(workspaceActionsDisabled)
							}
							onClick={() => _onMarkWorkspaceUnread(row.id)}
						>
							<Circle className="size-4 shrink-0" strokeWidth={1.6} />
							<span>Mark as unread</span>
						</ContextMenuItem>
					) : null}

					{onOpenInFinder ? (
						<ContextMenuItem
							disabled={isBusy || Boolean(workspaceActionsDisabled)}
							onClick={() => onOpenInFinder(row.id)}
						>
							<FolderOpen className="size-4 shrink-0" strokeWidth={1.6} />
							<span>Open in Finder</span>
						</ContextMenuItem>
					) : null}

					<ContextMenuSeparator />

					{isRestoreAction ? (
						<ContextMenuItem
							disabled={isBusy || workspaceActionsDisabled}
							onClick={() => onRestoreWorkspace?.(row.id)}
						>
							<RotateCcw className="size-4 shrink-0" strokeWidth={1.6} />
							<span>Restore</span>
						</ContextMenuItem>
					) : (
						<ContextMenuItem
							disabled={isBusy || workspaceActionsDisabled}
							onClick={() => onArchiveWorkspace?.(row.id)}
						>
							<Archive className="size-4 shrink-0" strokeWidth={1.6} />
							<span>Archive</span>
						</ContextMenuItem>
					)}
				</ContextMenuContent>
			</ContextMenu>
		);
	},
	function areWorkspaceRowItemPropsEqual(
		previous: WorkspaceRowItemProps,
		next: WorkspaceRowItemProps,
	) {
		return (
			previous.row === next.row &&
			previous.selected === next.selected &&
			previous.isSending === next.isSending &&
			previous.isInteractionRequired === next.isInteractionRequired &&
			previous.archivingWorkspaceIds === next.archivingWorkspaceIds &&
			previous.markingUnreadWorkspaceId === next.markingUnreadWorkspaceId &&
			previous.restoringWorkspaceId === next.restoringWorkspaceId &&
			previous.workspaceActionsDisabled === next.workspaceActionsDisabled
		);
	},
);
