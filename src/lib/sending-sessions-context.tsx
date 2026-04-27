import { createContext, useContext } from "react";

/**
 * Set of session IDs whose agent stream is currently active. Sourced
 * from `use-streaming` via `App.tsx` and exposed through context so
 * downstream consumers (sidebar hover card, status indicators, …) can
 * answer "is *this* session streaming right now?" without prop drilling
 * through every intermediate render layer.
 *
 * Default value is a stable empty Set so consumers can be used outside
 * of a provider (e.g. in tests) without crashing.
 */
const EMPTY_SET: ReadonlySet<string> = new Set();

const SendingSessionsContext = createContext<ReadonlySet<string>>(EMPTY_SET);

export const SendingSessionsProvider = SendingSessionsContext.Provider;

export function useSendingSessionIds(): ReadonlySet<string> {
	return useContext(SendingSessionsContext);
}
