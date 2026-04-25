import type { ReactNode } from "react";
import { TrafficLightSpacer } from "@/components/chrome/traffic-light-spacer";

/**
 * Pure-UI shell for the workspace sidebar — the outer flex column, the
 * traffic-light-safe top strip, and the "Workspaces" title row. The scrolling
 * body is left to the caller (real container provides a virtualizer; mockup
 * provides a plain static list) since it owns the ref / scroll behavior.
 *
 * Used by:
 * - the real `WorkspacesSidebar`
 * - the onboarding mockup
 */
export function WorkspaceSidebarShellUI({
	headerActions,
	children,
}: {
	headerActions?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
			<div
				data-slot="window-safe-top"
				className="flex h-9 shrink-0 items-center pr-3"
			>
				<TrafficLightSpacer side="left" width={94} />
				<div data-tauri-drag-region className="h-full flex-1" />
			</div>

			<div className="flex items-center justify-between px-3">
				<h2 className="text-[14px] font-medium tracking-[-0.01em] text-muted-foreground">
					Workspaces
				</h2>
				<div className="flex items-center gap-1 text-muted-foreground">
					{headerActions}
				</div>
			</div>

			{children}
		</div>
	);
}
