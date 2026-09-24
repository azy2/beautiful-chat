import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { TaskListData } from "../shared/contracts";
import { useAgentTasks } from "./agent-tasks";
import { TaskList } from "./components/task-list";
import { type ExtendedThemeTokens } from "./components/theme-tokens";

interface TaskChecklistProps {
  agentId: string;
  tokens: ExtendedThemeTokens;
  /** Tightens the padding for a popover or a narrow window. */
  compact: boolean;
}

/**
 * The live checklist for one agent, shared by the panel and the composer pill
 * so both draw the same list from the same source.
 *
 * Read-only: a checklist belongs to the agent that wrote it, and a status
 * toggled here would look like an instruction the agent never received.
 */
export function TaskChecklist({ agentId, tokens, compact }: TaskChecklistProps) {
  const snapshot = useAgentTasks(agentId);
  const tasks = snapshot?.tasks ?? [];

  const data: TaskListData = useMemo(
    () => ({ id: `tasks-${agentId}`, phaseName: "Checklist Progress", tasks }),
    [agentId, tasks],
  );

  if (tasks.length === 0) {
    return (
      <View style={[styles.empty, { padding: compact ? 20 : 28 }]}>
        <Text
          style={[styles.emptyTitle, { color: tokens.foreground, fontFamily: tokens.fontUi }]}
        >
          No checklist yet
        </Text>
        <Text
          style={[
            styles.emptyBody,
            { color: tokens.foregroundMuted, fontFamily: tokens.fontUi },
          ]}
        >
          A todo list the agent writes lands here and stays put while the chat scrolls past it.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingHorizontal: compact ? 8 : 12, paddingBottom: 16 }}
    >
      <TaskList data={data} tokens={tokens} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  emptyBody: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
    maxWidth: 320,
  },
});
