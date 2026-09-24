import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAgent, type PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { hostFontEscape } from "./components/host-font-escape";
import { buildThemeTokens } from "./components/theme-tokens";
import { useEnhancerPreferences } from "./preferences";
import { useActiveAgent } from "./active-agent";
import { TaskChecklist } from "./task-views";

/**
 * The checklist as a panel Paseo can pin beside the conversation.
 *
 * Paseo scopes an Explorer pane to a workspace, not to an agent, so this reads
 * the agent whose stream is being drawn — which is the chat this panel sits
 * next to — and follows it when the reader moves to another agent.
 */
export function TasksPanel({ theme, layout }: PluginWorkspacePanelProps) {
  const preferences = useEnhancerPreferences();
  const tokens = useMemo(
    () => buildThemeTokens(theme.colors, preferences),
    [theme.colors, preferences],
  );
  const agentId = useActiveAgent();
  const agentTitle = useAgent(agentId ?? "", (agent) => agent.title ?? agent.id);

  return (
    <View {...hostFontEscape} style={[styles.screen, { backgroundColor: theme.colors.surface0 }]}>
      {agentId ? (
        <>
          {agentTitle ? (
            <Text
              numberOfLines={1}
              style={[
                styles.agent,
                {
                  color: tokens.foregroundMuted,
                  fontFamily: tokens.fontUi,
                  paddingHorizontal: layout.compact ? 12 : 16,
                },
              ]}
            >
              {agentTitle}
            </Text>
          ) : null}
          <TaskChecklist agentId={agentId} tokens={tokens} compact={layout.compact} />
        </>
      ) : (
        <View style={[styles.empty, { padding: layout.compact ? 20 : 28 }]}>
          <Text style={[styles.emptyBody, { color: tokens.foregroundMuted, fontFamily: tokens.fontUi }]}>
            Open an agent to see the checklist it is working through.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  agent: {
    fontSize: 11,
    paddingTop: 10,
    paddingBottom: 4,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBody: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
    maxWidth: 320,
  },
});
