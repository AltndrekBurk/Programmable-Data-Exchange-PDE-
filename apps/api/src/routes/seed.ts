import { Hono } from 'hono'

export const seedRouter = new Hono()

// POST /api/seed — Populate all stores with demo data for testing
// Only available in development
seedRouter.post('/', async (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json({ error: 'Seed only available in development' }, 403)
  }

  const apiBase = `http://localhost:${process.env.PORT || 3001}`

  const results: Record<string, unknown> = {}

  // 1. Seed marketplace MCP standards
  const mcpStandards = [
    {
      title: 'Fitbit Gunluk Adim Verisi',
      description: 'Fitbit API uzerinden kullanicinin son 30 gunluk adim, kalori ve mesafe verilerini ceker. OAuth2 ile yetkilendirme gerektirir.',
      dataSource: 'fitbit',
      metrics: ['steps', 'calories', 'distance', 'active_minutes'],
      apiEndpoint: 'https://api.fitbit.com/1/user/-/activities/date/today.json',
      authType: 'oauth2',
      responseFormat: '$.summary.steps',
    },
    {
      title: 'Strava Kosu Performansi',
      description: 'Strava API uzerinden son 90 gunluk kosu aktivitelerini toplar. Tempo, mesafe ve yukseklik verisi.',
      dataSource: 'strava',
      metrics: ['distance', 'pace', 'elevation_gain', 'moving_time'],
      apiEndpoint: 'https://www.strava.com/api/v3/athlete/activities',
      authType: 'bearer',
      responseFormat: '$.activities[*].distance',
    },
    {
      title: 'Spotify Dinleme Gecmisi',
      description: 'Spotify Web API ile son 50 dinlenen parcayi listeler. Tur analizi ve dinleme suresi.',
      dataSource: 'spotify',
      metrics: ['track_name', 'artist', 'genre', 'played_at', 'duration_ms'],
      apiEndpoint: 'https://api.spotify.com/v1/me/player/recently-played',
      authType: 'oauth2',
      responseFormat: '$.items[*].track.name',
    },
    {
      title: 'GitHub Commit Analizi',
      description: 'GitHub API ile belirli bir repo icin commit gecmisini analiz eder. Haftalik commit sayisi, toplam katki.',
      dataSource: 'github',
      metrics: ['commits_count', 'additions', 'deletions', 'repos_contributed'],
      apiEndpoint: 'https://api.github.com/repos/{owner}/{repo}/commits',
      authType: 'bearer',
      responseFormat: '$.length',
    },
    {
      title: 'Google Fit Uyku Verisi',
      description: 'Google Fit API ile uyku kalitesi ve suresi verilerini toplar. REM, derin uyku, hafif uyku ayrimi.',
      dataSource: 'google_fit',
      metrics: ['sleep_duration', 'rem_sleep', 'deep_sleep', 'light_sleep'],
      apiEndpoint: 'https://www.googleapis.com/fitness/v1/users/me/sessions',
      authType: 'oauth2',
      responseFormat: '$.session[*].activityType',
    },
  ]

  const mcpResults = []
  for (const mcp of mcpStandards) {
    try {
      const res = await fetch(`${apiBase}/api/marketplace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mcp),
      })
      mcpResults.push(await res.json())
    } catch (e) {
      mcpResults.push({ error: String(e) })
    }
  }
  results.marketplace = { count: mcpResults.length, items: mcpResults }

  // 2. Seed skills (data requests)
  const skills = [
    {
      title: 'Saglik Verisi Toplama — Adim + Kalori',
      description: 'Health research: 30-day step and calorie data from 1000 users. Anonymous, ZK-proven.',
      dataSource: 'fitbit',
      metrics: ['steps', 'calories'],
      durationDays: 30,
      rewardPerUser: 2.5,
      totalBudget: 2500,
      targetCount: 1000,
    },
    {
      title: 'Muzik Trend Analizi — Tur Dagilimi',
      description: 'Muzik platformu icin kullanici dinleme aliskanliklari. Son 3 aylik tur ve artist dagilimi.',
      dataSource: 'spotify',
      metrics: ['genre', 'artist', 'play_count'],
      durationDays: 90,
      rewardPerUser: 1.0,
      totalBudget: 500,
      targetCount: 500,
    },
    {
      title: 'Yazilimci Uretkenlik Olcumu',
      description: 'DevTool startup icin yazilimci commit patterni. Haftalik commit sayisi ve aktif gun analizi.',
      dataSource: 'github',
      metrics: ['commits_count', 'active_days'],
      durationDays: 60,
      rewardPerUser: 3.0,
      totalBudget: 300,
      targetCount: 100,
    },
  ]

  const skillResults = []
  for (const skill of skills) {
    try {
      const res = await fetch(`${apiBase}/api/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skill),
      })
      skillResults.push(await res.json())
    } catch (e) {
      skillResults.push({ error: String(e) })
    }
  }
  results.skills = { count: skillResults.length, items: skillResults }

  // 3. Seed escrow locks for the skills
  const escrowResults = []
  for (const skillRes of skillResults) {
    if (skillRes.skillId) {
      try {
        const res = await fetch(`${apiBase}/api/escrow/lock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skillId: skillRes.skillId,
            title: skills[skillResults.indexOf(skillRes)]?.title || 'Unnamed',
            stellarAddress: 'GBF32DUEXEYEUFEYODWRZQJW4O5ZB2TZ7JA44R4OIMMPWCTRWB42LG6K',
            amount: skills[skillResults.indexOf(skillRes)]?.totalBudget || 100,
          }),
        })
        escrowResults.push(await res.json())
      } catch (e) {
        escrowResults.push({ error: String(e) })
      }
    }
  }
  results.escrows = { count: escrowResults.length, items: escrowResults }

  // 4. Seed some proof submissions
  const proofResults = []
  const prompts = [
    'Fitbit adim verisi 30 gun — ortalama 8500 adim/gun',
    'Spotify dinleme analizi — %40 rock, %30 pop, %20 electronic, %10 klasik',
    'GitHub commit analizi — haftalik 23 commit ortalama',
  ]
  for (const prompt of prompts) {
    try {
      const res = await fetch(`${apiBase}/api/proofs/llm-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          stellarAddress: 'GBF32DUEXEYEUFEYODWRZQJW4O5ZB2TZ7JA44R4OIMMPWCTRWB42LG6K',
        }),
      })
      proofResults.push(await res.json())
    } catch (e) {
      proofResults.push({ error: String(e) })
    }
  }
  results.proofs = { count: proofResults.length, items: proofResults }

  // 5. Seed a provider
  try {
    const provRes = await fetch(`${apiBase}/api/provider/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stellarAddress: 'GBF32DUEXEYEUFEYODWRZQJW4O5ZB2TZ7JA44R4OIMMPWCTRWB42LG6K',
        dataSources: ['fitbit', 'strava', 'github'],
        channel: 'telegram',
        contactInfo: '@dataeconomy_test',
      }),
    })
    results.provider = await provRes.json()
  } catch (e) {
    results.provider = { error: String(e) }
  }

  return c.json({
    status: 'seeded',
    timestamp: new Date().toISOString(),
    results,
  })
})
