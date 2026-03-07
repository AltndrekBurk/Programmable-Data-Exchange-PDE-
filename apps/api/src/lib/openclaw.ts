// ---------------------------------------------------------------------------
// OpenClaw dispatch helpers
//
// OpenClaw endpoint: POST {openclawUrl}/hooks/agent
// Docs: AGENT.md
// ---------------------------------------------------------------------------

export interface DispatchParams {
  openclawUrl: string
  openclawToken: string
  channel: 'whatsapp' | 'telegram' | 'discord'
  to: string
  message: string
  sessionKey: string
}

/**
 * Send a message to a provider via their OpenClaw bot.
 * Returns true if the notification was delivered successfully.
 */
export async function notifyViaOpenClaw(params: DispatchParams): Promise<boolean> {
  try {
    const res = await fetch(`${params.openclawUrl}/hooks/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.openclawToken}`,
      },
      body: JSON.stringify({
        message: params.message,
        name: 'DataEconomy',
        agentId: 'main',
        sessionKey: params.sessionKey,
        wakeMode: 'now',
        deliver: true,
        channel: params.channel,
        to: params.to,
      }),
    })

    if (!res.ok) {
      console.warn(`[openclaw] Notify failed for ${params.to}: ${res.status}`)
      return false
    }

    console.log(`[openclaw] Notified ${params.channel}:${params.to}`)
    return true
  } catch (err) {
    console.warn(`[openclaw] Unreachable for ${params.to}:`, err)
    return false
  }
}

/**
 * Dispatch a new skill task to all matching providers.
 * Providers that have a bot config (openclawUrl + token) will receive a notification.
 */
export async function dispatchSkillToProviders(
  storage: import('@dataeconomy/storage').StorageService,
  skillId: string,
  dataSource: string,
  rewardPerUser: number,
  title: string,
  ipfsHash?: string,
  mcpId?: string
): Promise<{ notified: number; skipped: number }> {
  const providers = await storage.listProviders(dataSource)
  let notified = 0
  let skipped = 0

  const gatewayBase = process.env.PINATA_GATEWAY_URL ?? 'https://gateway.pinata.cloud'
  const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3001'

  for (const provider of providers) {
    const botConfig = await storage.getBotConfig(provider.pseudoId)
    if (!botConfig?.openclawUrl || !botConfig.openclawToken) {
      skipped++
      continue
    }

    // Build message with IPFS hash so OpenClaw can fetch full skill JSON directly
    const ipfsUrl = ipfsHash ? `${gatewayBase}/ipfs/${ipfsHash}` : null
    const mcpLine = mcpId ? `MCP: ${mcpId.slice(0, 8)}...\n` : ''
    const ipfsLine = ipfsUrl ? `Skill JSON: ${ipfsUrl}\n` : ''

    const message =
      `📊 *New Data Task*\n\n` +
      `Task: ${title}\n` +
      `Data source: ${dataSource}\n` +
      `Reward: ${rewardPerUser.toFixed(2)} USDC\n` +
      `Skill ID: ${skillId.slice(0, 8)}...\n` +
      mcpLine +
      ipfsLine +
      `Proof submit: ${apiBase}/api/proofs/submit\n` +
      `Note: include *delivery.encryptedPayload* in proof body (for buyer HTTPS callback delivery).\n` +
      `\nReply *yes* to accept, *no* to decline.`

    const ok = await notifyViaOpenClaw({
      openclawUrl: botConfig.openclawUrl,
      openclawToken: botConfig.openclawToken,
      channel: provider.channel,
      to: provider.contactInfo,
      message,
      sessionKey: `skill:${skillId}:${provider.pseudoId}`,
    })

    ok ? notified++ : skipped++
  }

  return { notified, skipped }
}

/**
 * Notify a provider that their proof was accepted and escrow released.
 */
export async function notifyProofAccepted(
  storage: import('@dataeconomy/storage').StorageService,
  pseudoId: string,
  skillId: string,
  proofHash: string,
  providerShare: number
): Promise<void> {
  const botConfig = await storage.getBotConfig(pseudoId)
  if (!botConfig?.openclawUrl) return

  const provider = await storage.getProvider(pseudoId)
  if (!provider) return

  const message =
    `✅ *Proof Accepted!*\n\n` +
    `Skill: ${skillId.slice(0, 8)}...\n` +
    `Proof: ${proofHash.slice(0, 16)}...\n` +
    `Your earnings: ${providerShare.toFixed(4)} USDC\n\n` +
    `Payment sent to your Stellar wallet.`

  await notifyViaOpenClaw({
    openclawUrl: botConfig.openclawUrl,
    openclawToken: botConfig.openclawToken,
    channel: provider.channel,
    to: provider.contactInfo,
    message,
    sessionKey: `proof-accepted:${proofHash.slice(0, 16)}`,
  })
}
