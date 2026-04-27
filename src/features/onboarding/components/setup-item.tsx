import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ReadyStatus } from "./ready-status";

export function SetupItem({
	icon,
	label,
	description,
	actionLabel = "Set up",
	onAction,
	disabled = false,
	busy = false,
	ready = false,
}: {
	icon: ReactNode;
	label: string;
	description: ReactNode;
	actionLabel?: string;
	onAction?: () => void;
	disabled?: boolean;
	busy?: boolean;
	ready?: boolean;
}) {
	return (
		<div
			role="group"
			aria-label={label}
			className="flex items-center gap-3 rounded-lg border border-border/55 bg-card px-4 py-3"
		>
			<div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background text-foreground">
				{icon}
			</div>
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium text-foreground">{label}</div>
				<p className="mt-0.5 text-xs leading-5 text-muted-foreground">
					{description}
				</p>
			</div>
			{ready ? (
				<ReadyStatus />
			) : (
				<Button
					type="button"
					size="sm"
					className="h-7 shrink-0 px-2 text-xs"
					onClick={onAction}
					disabled={disabled || busy}
				>
					{busy ? <Loader2 className="size-3 animate-spin" /> : null}
					{actionLabel}
				</Button>
			)}
		</div>
	);
}
