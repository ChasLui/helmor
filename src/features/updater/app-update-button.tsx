import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AppUpdateStatus } from "@/lib/api";
import { installDownloadedAppUpdate } from "@/lib/api";
import { cn } from "@/lib/utils";

type ButtonSize = ComponentProps<typeof Button>["size"];
type ButtonVariant = ComponentProps<typeof Button>["variant"];
type AppUpdateButtonStyle = "notice" | "solid" | "tag" | "ready";

const APP_UPDATE_BUTTON_STYLES: Record<AppUpdateButtonStyle, string> = {
	notice:
		"border-amber-500/40 bg-amber-500/14 text-amber-900 shadow-[0_0_0_1px_rgba(245,158,11,0.12)] hover:border-amber-500/55 hover:bg-amber-500/22 hover:text-amber-950 dark:border-amber-400/35 dark:bg-amber-400/18 dark:text-amber-100 dark:hover:border-amber-300/50 dark:hover:bg-amber-400/24",
	solid:
		"border-amber-500 bg-amber-500 text-zinc-950 shadow-[0_10px_20px_rgba(245,158,11,0.22)] hover:border-amber-400 hover:bg-amber-400 hover:text-zinc-950 dark:border-amber-400 dark:bg-amber-400 dark:text-zinc-950 dark:hover:border-amber-300 dark:hover:bg-amber-300",
	tag: "border-sky-500/35 bg-sky-500/10 text-sky-800 shadow-none hover:border-sky-500/50 hover:bg-sky-500/16 hover:text-sky-900 dark:border-sky-400/30 dark:bg-sky-400/12 dark:text-sky-100 dark:hover:border-sky-300/45 dark:hover:bg-sky-400/18",
	ready:
		"border-emerald-500/35 bg-emerald-500/12 text-emerald-900 shadow-[0_0_0_1px_rgba(16,185,129,0.10)] hover:border-emerald-500/50 hover:bg-emerald-500/18 hover:text-emerald-950 dark:border-emerald-400/30 dark:bg-emerald-400/14 dark:text-emerald-100 dark:hover:border-emerald-300/45 dark:hover:bg-emerald-400/20",
};

type AppUpdateButtonProps = {
	status: AppUpdateStatus | null;
	className?: string;
	size?: ButtonSize;
	variant?: ButtonVariant;
	style?: AppUpdateButtonStyle;
	label?: string;
};

export function AppUpdateButton({
	status,
	className,
	size = "xs",
	variant = "ghost",
	style = "notice",
	label = "Update",
}: AppUpdateButtonProps) {
	const [installing, setInstalling] = useState(false);

	if (status?.stage !== "downloaded" || !status.update) {
		return null;
	}

	const update = status.update;

	return (
		<Button
			type="button"
			variant={variant}
			size={size}
			aria-label={`Update Helmor to ${update.version}`}
			title={`Update Helmor to ${update.version}`}
			className={cn(APP_UPDATE_BUTTON_STYLES[style], className)}
			onClick={() => {
				setInstalling(true);
				void installDownloadedAppUpdate()
					.catch((error: unknown) => {
						toast.error("Install failed", {
							description:
								error instanceof Error
									? error.message
									: "Unable to install the downloaded update.",
							action: update.releaseUrl
								? {
										label: "Change log",
										onClick: () => void openUrl(update.releaseUrl),
									}
								: undefined,
						});
					})
					.finally(() => setInstalling(false));
			}}
			disabled={installing}
		>
			{installing ? (
				<Loader2 className="size-3.5 animate-spin" />
			) : (
				<Download className="size-3.5" />
			)}
			<span>{label}</span>
		</Button>
	);
}
