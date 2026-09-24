import { useCallback, useEffect, useSyncExternalStore } from "react";
import { usePaseo } from "@getpaseo/plugin/client";
/** Type-only: the host supplies this module at runtime, never to plugin code. */
import type { PaseoApi } from "@getpaseo/client";
import type { TaskItemData, TaskStatus } from "../shared/contracts";

/**
 * Where the checklist the panel, the pill and the inline card all read from.
 *
 * A `todo` timeline item is the only place an agent's checklist exists. Paseo
 * hands one to the render model of the agent being looked at, but the panel
 * and the pill outlive any single render: the panel can be open over an agent
 * whose rows are scrolled off screen, and the pill needs a count before its
 * chat has drawn a single row. So the source is the timeline itself — one
 * recent page for the current state, then the live stream for every later
 * revision. Both carry the same `todo` item for the whole turn, so the newest
 * one wins rather than accumulating.
 */

/**
 * A checklist row as the daemon puts it on a `todo` timeline item, declared
 * here because plugin client code may only import the modules the host
 * provides and the protocol package is not one of them.
 */
interface TodoTask {
  text: string;
  completed: boolean;
  id?: string;
  status?: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

export interface AgentTasks {
  /** The agent's latest checklist, in the order the agent wrote it. */
  tasks: TaskItemData[];
  /** When this snapshot was last replaced. */
  updatedAt: number;
}

interface Entry {
  snapshot: AgentTasks | null;
  consumers: number;
  listeners: Set<() => void>;
  stop: (() => void) | null;
}

const entries = new Map<string, Entry>();

function entryFor(agentId: string): Entry {
  const existing = entries.get(agentId);
  if (existing) return existing;
  const created: Entry = { snapshot: null, consumers: 0, listeners: new Set(), stop: null };
  entries.set(agentId, created);
  return created;
}

function publish(entry: Entry): void {
  for (const listener of entry.listeners) listener();
}

/** The checklist as the panel renders it. */
function taskItemsFromTodo(items: readonly TodoTask[]): TaskItemData[] {
  return items.map((task, index) => ({
    id: typeof task.id === "string" && task.id.length > 0 ? task.id : `todo-${index}`,
    title: typeof task.text === "string" && task.text.length > 0 ? task.text : "Untitled task",
    phase: "Execution",
    status: todoStatus(task),
  }));
}

function todoStatus(task: TodoTask): TaskStatus {
  if (task.completed === true || task.status === "completed") return "completed";
  if (task.status === "in_progress") return "in_progress";
  return "pending";
}

function sameTasks(left: readonly TaskItemData[], right: readonly TaskItemData[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((task, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      task.id === other.id &&
      task.title === other.title &&
      task.status === other.status
    );
  });
}

/**
 * The daemon sends the whole session message (`{type: "agent_stream", payload}`)
 * while the SDK's own type describes the payload alone. Read both shapes: a
 * dropped event would freeze the panel with no visible fault.
 */
function streamEventOf(message: unknown): { type: string; item?: unknown; error?: unknown } | null {
  if (!message || typeof message !== "object") return null;
  const record = message as Record<string, unknown>;
  const envelope = record.payload ?? record;
  if (!envelope || typeof envelope !== "object") return null;
  const event = (envelope as Record<string, unknown>).event;
  if (!event || typeof event !== "object") return null;
  return event as { type: string; item?: unknown; error?: unknown };
}

function applyTodo(entry: Entry, items: unknown): void {
  if (!Array.isArray(items)) return;
  const tasks = taskItemsFromTodo(items as readonly TodoTask[]);
  if (entry.snapshot && sameTasks(entry.snapshot.tasks, tasks)) return;
  entry.snapshot = { tasks, updatedAt: Date.now() };
  publish(entry);
}

/**
 * Starts the page read and the live stream for one agent. Streaming todos are
 * the fast path and history is the catch-up, so subscribe first and read
 * second: a checklist written between the two still lands.
 */
function start(source: PaseoApi, agentId: string, entry: Entry): () => void {
  const handle = source.agents.ref(agentId);
  let stopped = false;

  const read = () => {
    void handle.timeline
      .refetch({ direction: "tail", limit: 0, projection: "projected" })
      .then((page) => {
        if (stopped) return;
        for (let index = page.entries.length - 1; index >= 0; index -= 1) {
          const item = page.entries[index]?.item;
          if (item?.type === "todo") {
            applyTodo(entry, item.items);
            return;
          }
        }
      })
      .catch((error: unknown) => {
        console.warn(`[beautiful-chat] Could not read the checklist for ${agentId}`, error);
      });
  };

  const subscription = handle.timeline.subscribe((message) => {
    if (stopped) return;
    const event = streamEventOf(message);
    if (!event) return;
    if (event.type === "timeline") {
      const item = event.item as { type?: string; items?: unknown } | undefined;
      if (item?.type === "todo") applyTodo(entry, item.items);
      return;
    }
    // A replacement invalidates the page already read, and a restored
    // subscription may have missed revisions while the socket was down.
    if (event.type === "replacement" || event.type === "subscription_restored") read();
    if (event.type === "error") {
      console.warn(`[beautiful-chat] Checklist stream for ${agentId} stopped`, event.error);
    }
  });

  subscription.ready.catch((error: unknown) => {
    console.warn(`[beautiful-chat] Checklist stream for ${agentId} failed to open`, error);
  });

  read();

  return () => {
    stopped = true;
    subscription();
  };
}

/**
 * Holds one agent's checklist live for as long as something is reading it. The
 * snapshot outlives the last consumer, so reopening the panel paints the list
 * it last knew while the fresh page is in flight.
 */
function retainAgentTasks(source: PaseoApi, agentId: string): () => void {
  const entry = entryFor(agentId);
  entry.consumers += 1;
  if (entry.consumers === 1) entry.stop = start(source, agentId, entry);

  return () => {
    entry.consumers -= 1;
    if (entry.consumers > 0) return;
    entry.stop?.();
    entry.stop = null;
  };
}

function getAgentTasks(agentId: string): AgentTasks | null {
  return entries.get(agentId)?.snapshot ?? null;
}

function subscribeAgentTasks(agentId: string, listener: () => void): () => void {
  const entry = entryFor(agentId);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

/** The live checklist for one agent, or `null` until the first snapshot. */
export function useAgentTasks(agentId: string | undefined): AgentTasks | null {
  const source = usePaseo();

  useEffect(() => {
    if (!agentId) return undefined;
    return retainAgentTasks(source, agentId);
  }, [source, agentId]);

  const subscribe = useCallback(
    (listener: () => void) => (agentId ? subscribeAgentTasks(agentId, listener) : () => {}),
    [agentId],
  );
  const getSnapshot = useCallback(
    () => (agentId ? getAgentTasks(agentId) : null),
    [agentId],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
