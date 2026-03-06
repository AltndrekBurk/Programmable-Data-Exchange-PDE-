import { Hono } from 'hono'
import { readAccountData } from '@dataeconomy/stellar'
import { generatePseudonym } from '@dataeconomy/pseudonym'
import type { StorageService } from '@dataeconomy/storage'

/**
 * Dashboard API — reads DIRECTLY from Stellar on-chain data
 * and resolves IPFS CIDs to real data.
 *
 * Flow: Stellar manage_data → extract CIDs → fetch IPFS → return to frontend
 */
export function createDashboardRouter(storage: StorageService) {
  const router = new Hono()

  // GET /api/dashboard/chain-state?address=G...
  // Reads platform's Stellar manage_data, filters by user, resolves IPFS CIDs
  router.get('/chain-state', async (c) => {
    const address = c.req.query('address')
    if (!address) return c.json({ error: 'address query param required' }, 400)

    const platformAddress = process.env.STELLAR_PLATFORM_PUBLIC
    if (!platformAddress) {
      return c.json({ error: 'STELLAR_PLATFORM_PUBLIC not configured', onChain: false }, 500)
    }

    const secret = process.env.PSEUDONYM_SECRET
    if (!secret) return c.json({ error: 'PSEUDONYM_SECRET not configured' }, 500)
    const pseudoId = generatePseudonym(secret, address).pseudonym

    const gateway = process.env.PINATA_GATEWAY_URL || 'https://gateway.pinata.cloud'

    try {
      // Step 1: Read ALL manage_data from platform Stellar account
      const accountData = await readAccountData(platformAddress)

      // Step 2: Categorize entries by prefix
      const skills: Array<{ key: string; cid: string; data?: any }> = []
      const proofs: Array<{ key: string; cid: string; data?: any }> = []
      const providers: Array<{ key: string; cid: string; data?: any }> = []
      const escrows: Array<{ key: string; cid: string; data?: any }> = []
      const mcps: Array<{ key: string; cid: string; data?: any }> = []
      const volumes: Array<{ key: string; value: string }> = []

      for (const [key, value] of accountData) {
        if (key.startsWith('sk:')) skills.push({ key, cid: value })
        else if (key.startsWith('pf:')) proofs.push({ key, cid: value })
        else if (key.startsWith('pr:')) providers.push({ key, cid: value })
        else if (key.startsWith('es:')) escrows.push({ key, cid: value })
        else if (key.startsWith('mc:')) mcps.push({ key, cid: value })
        else if (key.startsWith('mv:')) volumes.push({ key, value })
      }

      // Step 3: Resolve IPFS CIDs for skills (max 10 to avoid timeout)
      const resolvedSkills = await Promise.all(
        skills.slice(0, 10).map(async (s) => {
          try {
            const res = await fetch(`${gateway}/ipfs/${s.cid}`, { signal: AbortSignal.timeout(5000) })
            if (res.ok) s.data = await res.json()
          } catch { /* timeout or error — skip */ }
          return s
        })
      )

      // Step 4: Resolve IPFS for escrows relevant to this user
      const resolvedEscrows = await Promise.all(
        escrows.slice(0, 10).map(async (e) => {
          try {
            const res = await fetch(`${gateway}/ipfs/${e.cid}`, { signal: AbortSignal.timeout(5000) })
            if (res.ok) e.data = await res.json()
          } catch { /* skip */ }
          return e
        })
      )

      // Step 5: Filter user-relevant items
      const userEscrows = resolvedEscrows.filter(
        (e) => e.data?.depositor === pseudoId || e.data?.depositorAddress === address
      )

      // Step 6: Resolve provider record for this user
      let providerData: any = null
      const userProviderKey = `pr:${pseudoId.slice(0, 24)}`
      const providerEntry = providers.find((p) => p.key === userProviderKey)
      if (providerEntry) {
        try {
          const res = await fetch(`${gateway}/ipfs/${providerEntry.cid}`, { signal: AbortSignal.timeout(5000) })
          if (res.ok) providerData = await res.json()
        } catch { /* skip */ }
      }

      // Step 7: Find pending consent tasks (skills where user hasn't responded yet)
      const pendingConsent = resolvedSkills.filter((s) => {
        if (!s.data) return false
        if (s.data.status !== 'active') return false
        // If user is a provider, show skills matching their data sources
        if (providerData?.dataSources?.length > 0) {
          return providerData.dataSources.some(
            (ds: string) => ds.toLowerCase() === s.data?.dataSource?.toLowerCase()
          )
        }
        return true
      })

      // Step 8: Resolve proofs for this user
      const resolvedProofs = await Promise.all(
        proofs.slice(0, 10).map(async (p) => {
          try {
            const res = await fetch(`${gateway}/ipfs/${p.cid}`, { signal: AbortSignal.timeout(5000) })
            if (res.ok) p.data = await res.json()
          } catch { /* skip */ }
          return p
        })
      )

      const userProofs = resolvedProofs.filter(
        (p) => p.data?.providerPseudoId === pseudoId
      )

      return c.json({
        onChain: true,
        platformAddress,
        userPseudoId: pseudoId,
        stellarIndexCount: accountData.size,
        summary: {
          totalSkills: skills.length,
          totalProofs: proofs.length,
          totalProviders: providers.length,
          totalEscrows: escrows.length,
          totalMcps: mcps.length,
        },
        userSkills: resolvedSkills.map((s) => ({
          key: s.key,
          cid: s.cid,
          title: s.data?.title,
          dataSource: s.data?.dataSource,
          rewardPerUser: s.data?.rewardPerUser,
          status: s.data?.status,
          createdAt: s.data?.createdAt,
          ipfsResolved: !!s.data,
        })),
        userEscrows: userEscrows.map((e) => ({
          key: e.key,
          cid: e.cid,
          title: e.data?.title,
          totalBudget: e.data?.totalBudget,
          locked: e.data?.locked,
          released: e.data?.released,
          status: e.data?.status,
          txHash: e.data?.depositTxHash,
          ipfsResolved: !!e.data,
        })),
        userProofs: userProofs.map((p) => ({
          key: p.key,
          cid: p.cid,
          proofHash: p.data?.proofHash,
          skillId: p.data?.skillId,
          metric: p.data?.metric,
          status: p.data?.status,
          timestamp: p.data?.timestamp,
          ipfsResolved: !!p.data,
        })),
        pendingConsent: pendingConsent.map((s) => ({
          key: s.key,
          cid: s.cid,
          skillId: s.data?.id,
          title: s.data?.title,
          description: s.data?.description,
          dataSource: s.data?.dataSource,
          metrics: s.data?.metrics,
          rewardPerUser: s.data?.rewardPerUser,
          durationDays: s.data?.durationDays,
          totalBudget: s.data?.totalBudget,
          policy: s.data?.policy,
          ipfsResolved: !!s.data,
        })),
        providerStatus: providerData
          ? {
              registered: true,
              cid: providerEntry?.cid,
              dataSources: providerData.dataSources,
              policy: providerData.policy,
              openclawUrl: providerData.openclawUrl,
              status: providerData.status,
            }
          : { registered: false },
      })
    } catch (err) {
      console.error('[dashboard] chain-state error:', err)
      return c.json({ error: 'Failed to read on-chain state', onChain: false }, 500)
    }
  })

  // GET /api/dashboard/resolve-cid?cid=Qm...
  // Fetches a single IPFS CID and returns the data
  router.get('/resolve-cid', async (c) => {
    const cid = c.req.query('cid')
    if (!cid || !/^[a-zA-Z0-9]{46,64}$/.test(cid)) {
      return c.json({ error: 'Invalid CID' }, 400)
    }
    const gateway = process.env.PINATA_GATEWAY_URL || 'https://gateway.pinata.cloud'
    try {
      const res = await fetch(`${gateway}/ipfs/${cid}`, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) return c.json({ error: 'IPFS fetch failed', status: res.status }, 502)
      const data = await res.json()
      return c.json({ cid, data, resolved: true })
    } catch {
      return c.json({ error: 'IPFS fetch timeout', resolved: false }, 502)
    }
  })

  return router
}
