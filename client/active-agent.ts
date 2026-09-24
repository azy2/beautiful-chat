import { useEffect, useSyncExternalStore } from "react";

/**
 * The agent whose conversation is on screen.
 *
 * Paseo hands a plugin no "focused agent": a pill, a panel, and a composer are
 * each addressed by an id, and the one place the id of the agent being read is
 * available is the timeline row the plugin is drawing for it. Those rows are
 * the honest signal — a row only mounts when the host is rendering that
 * agent's stream.
 *
 * It is deliberately cheap to write: the pill manager keeps the screen agent's
 * checklist live, and a scroll that mounts rows of the same agent must not
 * restart that read.
 */
let activeAgentId: string | null = null;
const listeners = new Set<() => void>();

export function getActiveAgentId(): string | null {
  return activeAgentId;
}

export function subscribeActiveAgent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function noteActiveAgent(agentId: string): void {
  if (activeAgentId === agentId) return;
  activeAgentId = agentId;
  for (const listener of listeners) listener();
}

/** Records the drawn row's agent as the one on screen for as long as it stands. */
export function useNoteActiveAgent(agentId: string): void {
  useEffect(() => {
    noteActiveAgent(agentId);
  }, [agentId]);
}

/**
 * The agent being read, for a surface Paseo scopes to a workspace rather than
 * an agent — the Explorer panel, whose props carry no agent at all.
 */
export function useActiveAgent(): string | null {
  return useSyncExternalStore(subscribeActiveAgent, getActiveAgentId, getActiveAgentId);
}
