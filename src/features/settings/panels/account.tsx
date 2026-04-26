import { useQueryClient } from "@tanstack/react-query";
import {
	CheckCircle2,
	CircleHelp,
	Loader2,
	LogOut,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { GithubBrandIcon, GitlabBrandIcon } from "@/components/brand-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	disconnectGithubIdentity,
	type ForgeCliStatus,
	type ForgeProvider,
	type GithubIdentitySession,
	getForgeCliStatus,
	loadGithubIdentitySession,
	openForgeCliAuthTerminal,
	type RepositoryCreateOption,
} from "@/lib/api";
import { FORGE_AUTH_TOOLTIP_LINES } from "@/lib/forge-auth-copy";
import { gitlabHostsForRepositories } from "./cli-install-gitlab-hosts";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000;

export function AccountPanel({
	repositories,
	onSignedOut,
}: {
	repositories: RepositoryCreateOption[];
	onSignedOut?: () => void;
}) {
	const queryClient = useQueryClient();
	const [identity, setIdentity] = useState<GithubIdentitySession | null>(null);
	const [signingOut, setSigningOut] = useState(false);
	const gitlabHosts = useMemo(
		() => gitlabHostsForRepositories(repositories),
		[repositories],
	);

	useEffect(() => {
		void loadGithubIdentitySession().then((snap) => {
			if (snap.status === "connected") setIdentity(snap.session);
		});
	}, []);

	const handleSignOut = useCallback(async () => {
		setSigningOut(true);
		try {
			await disconnectGithubIdentity();
			setIdentity(null);
			await queryClient.invalidateQueries();
			onSignedOut?.();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to sign out.",
			);
		} finally {
			setSigningOut(false);
		}
	}, [onSignedOut, queryClient]);

	return (
		<div className="space-y-4">
			{identity ? <IdentityHeader session={identity} /> : null}

			<CliIntegrationRow
				provider="github"
				host="github.com"
				title="GitHub CLI integration"
				icon={<GithubBrandIcon size={14} />}
			/>

			{gitlabHosts.length > 0
				? gitlabHosts.map((host) => (
						<CliIntegrationRow
							key={host}
							provider="gitlab"
							host={host}
							title={
								gitlabHosts.length > 1
									? `GitLab CLI integration · ${host}`
									: "GitLab CLI integration"
							}
							icon={<GitlabBrandIcon size={14} className="text-[#FC6D26]" />}
						/>
					))
				: null}

			<div className="flex items-center justify-between rounded-xl border border-border/30 bg-muted/30 px-5 py-4">
				<div className="text-[13px] font-medium leading-snug text-foreground">
					Sign out
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => void handleSignOut()}
					disabled={signingOut}
				>
					{signingOut ? (
						<Loader2 className="size-3.5 animate-spin" />
					) : (
						<LogOut className="size-3.5" strokeWidth={1.8} />
					)}
					Sign out
				</Button>
			</div>
		</div>
	);
}

function IdentityHeader({ session }: { session: GithubIdentitySession }) {
	return (
		<div className="flex items-center gap-3 rounded-xl border border-border/30 bg-muted/30 px-5 py-4">
			<Avatar size="lg">
				{session.avatarUrl ? (
					<AvatarImage src={session.avatarUrl} alt={session.login} />
				) : null}
				<AvatarFallback className="bg-muted text-[12px] font-medium text-muted-foreground">
					{session.login.slice(0, 2).toUpperCase()}
				</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex-1">
				<div className="truncate text-[14px] font-semibold text-foreground">
					{session.name?.trim() || session.login}
				</div>
				{session.primaryEmail ? (
					<div className="truncate text-[12px] text-muted-foreground">
						{session.primaryEmail}
					</div>
				) : null}
				<div className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
					<GithubBrandIcon size={12} />
					<span className="truncate">{session.login}</span>
				</div>
			</div>
		</div>
	);
}

function CliIntegrationRow({
	provider,
	host,
	title,
	icon,
}: {
	provider: ForgeProvider;
	host: string;
	title: string;
	icon: React.ReactNode;
}) {
	const [status, setStatus] = useState<ForgeCliStatus | null>(null);
	const [connecting, setConnecting] = useState(false);
	const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inFlightRef = useRef(false);

	const refresh = useCallback(async () => {
		try {
			const next = await getForgeCliStatus(provider, host);
			setStatus(next);
			return next;
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to read CLI status.",
			);
			return null;
		}
	}, [provider, host]);

	useEffect(() => {
		void refresh();
		return () => {
			if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
		};
	}, [refresh]);

	const pollUntilReady = useCallback(
		(startedAt = Date.now()) => {
			if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
			pollTimerRef.current = setTimeout(async () => {
				const next = await refresh();
				if (next?.status === "ready") {
					toast.success(`${next.cliName} connected`);
					setConnecting(false);
					inFlightRef.current = false;
					return;
				}
				if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
					toast("Finish CLI auth in Terminal, then click Connect again.");
					setConnecting(false);
					inFlightRef.current = false;
					return;
				}
				pollUntilReady(startedAt);
			}, POLL_INTERVAL_MS);
		},
		[refresh],
	);

	const handleConnect = useCallback(async () => {
		if (connecting || inFlightRef.current) return;
		inFlightRef.current = true;
		setConnecting(true);
		try {
			await openForgeCliAuthTerminal(provider, host);
			toast("Complete the login in Terminal.");
			pollUntilReady();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to open Terminal.",
			);
			setConnecting(false);
			inFlightRef.current = false;
		}
	}, [connecting, host, pollUntilReady, provider]);

	const isReady = status?.status === "ready";

	return (
		<div className="rounded-xl border border-border/30 bg-muted/30 px-5 py-4">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1.5">
						{icon}
						<div className="text-[13px] font-medium leading-snug text-foreground">
							{title}
						</div>
						<StatusBadge status={status} />
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label="What is this?"
									className="cursor-pointer text-muted-foreground hover:text-foreground"
								>
									<CircleHelp className="size-3.5" strokeWidth={1.8} />
								</button>
							</TooltipTrigger>
							<TooltipContent
								side="top"
								className="max-w-xs space-y-1 whitespace-normal"
							>
								{FORGE_AUTH_TOOLTIP_LINES.map((line) => (
									<div key={line} className="text-[11px] leading-snug">
										{line}
									</div>
								))}
							</TooltipContent>
						</Tooltip>
					</div>
					<StatusMessage status={status} />
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => void handleConnect()}
					disabled={connecting}
					className="shrink-0"
				>
					{connecting ? <Loader2 className="size-3.5 animate-spin" /> : null}
					{isReady ? "Reconnect" : "Connect"}
				</Button>
			</div>
		</div>
	);
}

function StatusBadge({ status }: { status: ForgeCliStatus | null }) {
	if (!status) return null;
	if (status.status === "ready") {
		return (
			<CheckCircle2
				className="size-3.5 text-green-500"
				strokeWidth={2}
				aria-label="Connected"
			/>
		);
	}
	return (
		<XCircle
			className="size-3.5 text-destructive"
			strokeWidth={2}
			aria-label="Not connected"
		/>
	);
}

function StatusMessage({ status }: { status: ForgeCliStatus | null }) {
	if (!status) {
		return (
			<div className="mt-1 text-[12px] leading-snug text-muted-foreground">
				Checking status…
			</div>
		);
	}
	if (status.status === "ready") {
		return (
			<div className="mt-1 text-[12px] leading-snug text-muted-foreground">
				Connected as {status.login}.
			</div>
		);
	}
	return (
		<div className="mt-1 text-[12px] leading-snug text-muted-foreground">
			{status.message}
		</div>
	);
}
