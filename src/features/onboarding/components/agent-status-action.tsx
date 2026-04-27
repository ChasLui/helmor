import { Button } from "@/components/ui/button";
import { type AgentLoginProvider, openAgentLoginTerminal } from "@/lib/api";
import type { AgentLoginStatus } from "../types";
import { ReadyStatus } from "./ready-status";

export function AgentStatusAction({
	provider,
	status,
}: {
	provider: AgentLoginProvider;
	status: AgentLoginStatus;
}) {
	if (status === "ready") {
		return <ReadyStatus />;
	}

	return (
		<Button
			type="button"
			size="sm"
			className="h-7 shrink-0 px-2 text-xs"
			onClick={() => {
				void openAgentLoginTerminal(provider);
			}}
		>
			Log in
		</Button>
	);
}
