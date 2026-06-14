import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useDeepCompareEffect from 'use-deep-compare-effect'
import {
  useAgentAdapters,
  useHarnessAgents,
} from '@/entrypoints/app/agents/useAgents'
import type { LlmProviderConfig } from '@/lib/llm-providers/types'
import { useLlmProviders } from '@/lib/llm-providers/useLlmProviders'
import {
  isLiveMcpServer,
  type McpServer,
  useMcpServers,
} from '@/lib/mcp/mcpServerStorage'
import { usePersonalization } from '@/lib/personalization/personalizationStorage'
import {
  buildSidepanelChatTargets,
  loadSidepanelChatTargetSelection,
  persistSidepanelChatTargetSelection,
  resolveSidepanelChatTarget,
  type SidepanelChatTarget,
  type SidepanelChatTargetSelection,
} from './sidepanel-chat-targets'

const constructMcpServers = (_servers: McpServer[]): string[] => {
  // Upstream/Klavis-managed app tools are disabled in the private build.
  // Live app tools are sent through customMcpServers once a local connector URL
  // is configured.
  return []
}

const constructCustomServers = (servers: McpServer[]) => {
  return servers.filter(isLiveMcpServer).map((each) => ({
    name: each.displayName,
    url: each.config.url,
  }))
}

export const useChatRefs = () => {
  const { servers: mcpServers } = useMcpServers()
  const {
    providers: llmProviders,
    selectedProvider: selectedLlmProvider,
    setDefaultProvider,
    isLoading: isLoadingProviders,
  } = useLlmProviders()
  const { adapters, loading: isLoadingAdapters } = useAgentAdapters()
  const { harnessAgents, loading: isLoadingAgents } = useHarnessAgents()
  const { personalization } = usePersonalization()
  const [targetSelection, setTargetSelection] =
    useState<SidepanelChatTargetSelection | null>(null)

  useEffect(() => {
    let cancelled = false
    loadSidepanelChatTargetSelection().then((selection) => {
      if (!cancelled) setTargetSelection(selection)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const chatTargets = useMemo(
    () =>
      buildSidepanelChatTargets({
        providers: llmProviders,
        adapters,
        agents: harnessAgents,
      }),
    [llmProviders, adapters, harnessAgents],
  )

  const selectedChatTarget = useMemo(
    () =>
      resolveSidepanelChatTarget({
        targets: chatTargets,
        defaultProviderId: selectedLlmProvider?.id ?? llmProviders[0]?.id ?? '',
        selection: targetSelection,
      }),
    [chatTargets, llmProviders, selectedLlmProvider, targetSelection],
  )

  const selectedLlmProviderRef = useRef<LlmProviderConfig | null>(
    selectedLlmProvider,
  )
  const selectedChatTargetRef = useRef<SidepanelChatTarget | undefined>(
    selectedChatTarget,
  )
  const enabledMcpServersRef = useRef(constructMcpServers(mcpServers))
  const enabledCustomServersRef = useRef(constructCustomServers(mcpServers))
  const personalizationRef = useRef(personalization)

  // Keep request-time refs current during render so URL-triggered initial
  // messages cannot race against useEffect and send with a stale provider.
  selectedLlmProviderRef.current = selectedLlmProvider
  selectedChatTargetRef.current = selectedChatTarget

  useDeepCompareEffect(() => {
    selectedLlmProviderRef.current = selectedLlmProvider
    enabledMcpServersRef.current = constructMcpServers(mcpServers)
    enabledCustomServersRef.current = constructCustomServers(mcpServers)
  }, [selectedLlmProvider, mcpServers])

  useEffect(() => {
    selectedChatTargetRef.current = selectedChatTarget
  }, [selectedChatTarget])

  useEffect(() => {
    personalizationRef.current = personalization
  }, [personalization])

  const selectChatTarget = useCallback(
    async (target: SidepanelChatTarget | undefined) => {
      selectedChatTargetRef.current = target
      setTargetSelection(target ? { kind: target.kind, id: target.id } : null)
      await persistSidepanelChatTargetSelection(target)
    },
    [],
  )

  return {
    selectedLlmProviderRef,
    selectedChatTargetRef,
    enabledMcpServersRef,
    enabledCustomServersRef,
    personalizationRef,
    llmProviders,
    setDefaultProvider,
    chatTargets,
    selectedChatTarget,
    selectChatTarget,
    selectedLlmProvider,
    isLoadingProviders:
      isLoadingProviders || isLoadingAdapters || isLoadingAgents,
  }
}
