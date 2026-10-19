import type { IncomingMessage, ServerResponse } from 'http'

// Persistent in-memory cache for serverless invocation lifetime
const globalJobs: Map<string, any> = new Map()
const globalHistory: any[] = []

export const config = {
  maxDuration: 60,
}

function sendJson(res: any, status: number, data: any) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE, PATCH')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.end(JSON.stringify(data))
}

function findAiKey(cfg: any): { type: string; key: string; model?: string; baseUrl?: string } | null {
  if (cfg?.ai_providers) {
    try {
      const providers = typeof cfg.ai_providers === 'string' ? JSON.parse(cfg.ai_providers) : cfg.ai_providers
      if (Array.isArray(providers)) {
        for (const p of providers) {
          if (p.api_key && p.api_key.trim()) {
            return {
              type: p.api_type || 'gemini',
              key: p.api_key.trim(),
              model: p.model,
              baseUrl: p.base_url,
            }
          }
        }
      }
    } catch {}
  }
  if (cfg?.gemini_api_key) return { type: 'gemini', key: cfg.gemini_api_key }
  if (cfg?.groq_api_key) return { type: 'groq', key: cfg.groq_api_key }
  if (cfg?.openai_api_key) return { type: 'openai', key: cfg.openai_api_key }
  if (process.env.GEMINI_API_KEY) return { type: 'gemini', key: process.env.GEMINI_API_KEY }
  if (process.env.GROQ_API_KEY) return { type: 'groq', key: process.env.GROQ_API_KEY }
  if (process.env.OPENAI_API_KEY) return { type: 'openai', key: process.env.OPENAI_API_KEY }
  return null
}

async function scrapeSocialMedia(url: string, apifyToken: string) {
  let actorId = 'apify~instagram-scraper'
  let runInput: any = { directUrls: [url], resultsType: 'posts', resultsLimit: 1 }

  if (url.includes('tiktok.com')) {
    actorId = 'clockworks~free-tiktok-scraper'
    runInput = { postURLs: [url], commentsPerPost: 0, maxItems: 1 }
  } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
    actorId = 'streamers~youtube-scraper'
    runInput = { startUrls: [{ url }], maxResults: 1 }
  } else if (url.includes('instagram.com')) {
    actorId = 'apify~instagram-scraper'
    runInput = { directUrls: [url], resultsType: 'posts', resultsLimit: 1 }
  }

  const endpoint = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(runInput),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Apify kazıma hatası (${response.status}): ${errorText.slice(0, 160)}`)
  }

  const items = await response.json()
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Apify gönderi verisi bulamadı. Bağlantının herkese açık bir gönderi/Reel olduğundan emin olun.')
  }

  const item = items[0]
  const caption = item.caption || item.text || item.desc || item.title || item.description || ''
  const videoUrl = item.videoUrl || item.video_url || (item.mediaUrls && item.mediaUrls[0]) || ''
  const displayUrl = item.displayUrl || item.thumbnailUrl || (item.covers && item.covers[0]) || ''
  const title = item.title || caption.slice(0, 60) || 'Sosyal Medya Tarifi'

  return { caption, videoUrl, displayUrl, title }
}

async function extractRecipeWithAi(text: string, title: string, aiConfig: { type: string; key: string; model?: string; baseUrl?: string }) {
  const prompt = `Aşağıdaki video / sosyal medya içeriğinden detaylı Türkçe yemek tarifini çıkar.
Başlık: ${title}
Açıklama / Metin:
${text}

Yanıtını SADECE aşağıdaki JSON şemasına uygun bir JSON nesnesi olarak ver (hiçbir markdown formatı, \`\`\`json kodu veya ek metin ekleme, doğrudan { ile başlayıp } ile bitir):
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "Tarif Adı",
  "description": "Tarif hakkında kısa özet",
  "recipeYield": "4 kişilik",
  "prepTime": "PT15M",
  "cookTime": "PT30M",
  "recipeIngredient": [
    "1 paket makarna",
    "2 yemek kaşığı tereyağı"
  ],
  "recipeInstructions": [
    {"@type": "HowToStep", "text": "Makarnayı kaynar tuzlu suda 8-10 dakika haşlayın."},
    {"@type": "HowToStep", "text": "Ayrı bir tavada tereyağını eritin ve sosu hazırlayın."}
  ]
}`

  if (aiConfig.type === 'gemini') {
    let candidateNames: string[] = []

    // 1. Dinamik olarak bu API anahtarına tanımlı modelleri Google'dan sorgula
    try {
      const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${aiConfig.key}`)
      if (listRes.ok) {
        const listData = await listRes.json()
        if (Array.isArray(listData?.models)) {
          const supported = listData.models
            .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
            .map((m: any) => String(m.name || '').replace(/^models\//, ''))
            .filter(Boolean)

          // Flash modellerini öne al, sonra pro, sonra diğerleri
          supported.sort((a: string, b: string) => {
            const aFlash = a.includes('flash') ? 1 : 0
            const bFlash = b.includes('flash') ? 1 : 0
            return bFlash - aFlash
          })

          if (supported.length > 0) {
            candidateNames = supported
          }
        }
      }
    } catch (e) {
      console.warn('Could not list Gemini models:', e)
    }

    // 2. Eğer liste alınamadıysa bilinen güncel modelleri sıra ile dene
    if (candidateNames.length === 0) {
      const raw = (aiConfig.model || 'gemini-1.5-flash').trim().replace(/^models\//, '')
      candidateNames = [
        raw,
        'gemini-1.5-flash-8b',
        'gemini-1.5-flash-002',
        'gemini-1.5-flash-001',
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash',
        'gemini-2.0-flash-exp',
        'gemini-1.5-pro',
        'gemini-pro',
      ]
    }

    let lastError = ''
    for (const modelName of candidateNames) {
      const cleanName = modelName.replace(/^models\//, '')
      for (const apiVer of ['v1beta', 'v1']) {
        try {
          const url = `https://generativelanguage.googleapis.com/${apiVer}/models/${cleanName}:generateContent?key=${aiConfig.key}`
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          })

          if (!res.ok) {
            const errText = await res.text()
            lastError = `Google Gemini hatası (${res.status} [${cleanName}]): ${errText.slice(0, 160)}`
            // Eğer model bulunamadıysa (404) veya bu sürümde desteklenmiyorsa sıradakine geç
            if (res.status === 404 || res.status === 400) continue
            throw new Error(lastError)
          }

          const data = await res.json()
          const content = data.candidates?.[0]?.content?.parts?.[0]?.text
          if (content) {
            const cleanText = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
            return JSON.parse(cleanText)
          }
        } catch (err: any) {
          if (err.message && !err.message.includes('404') && !err.message.includes('400')) {
            throw err
          }
        }
      }
    }
    throw new Error(lastError || 'Google Gemini geçerli bir model bulamadı veya yanıt üretemedi.')
  } else {
    // OpenAI or Groq (openai-compatible)
    const baseUrl = aiConfig.baseUrl || (aiConfig.type === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1')
    const model = aiConfig.model || (aiConfig.type === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini')
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Sen profesyonel bir aşçısın. Görevin verilen içerikten Türkçe Schema.org/Recipe JSON formatında tarif çıkarmak. Sadece saf JSON döndür.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Yapay zeka hatası (${res.status}): ${err.slice(0, 160)}`)
    }
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error('Yapay zeka geçerli bir yanıt üretemedi.')
    return JSON.parse(content.trim())
  }
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { ok: true })
  }

  // Parse jobId if present in query or url
  const urlPath = req.url || ''
  const idMatch = urlPath.match(/\/api\/jobs\/([^/?]+)/)
  const queryId = idMatch ? decodeURIComponent(idMatch[1]) : req.query?.id

  if (req.method === 'GET') {
    if (queryId) {
      const job = globalJobs.get(queryId)
      if (job) return sendJson(res, 200, job)
      return sendJson(res, 404, { error: 'İş bulunamadı' })
    }
    const list = Array.from(globalJobs.values())
    return sendJson(res, 200, { jobs: list })
  }

  if (req.method === 'POST') {
    let body = req.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch {}
    }

    const inputUrl = (body?.url || '').trim()
    if (!inputUrl) {
      return sendJson(res, 400, { error: 'Geçerli bir video veya tarif bağlantısı (URL) giriniz.' })
    }

    const cfg = body?.config || {}
    const apifyToken = (cfg.apify_api_token || process.env.APIFY_API_TOKEN || '').trim()
    const aiConfig = findAiKey(cfg)

    const isSocialMedia =
      inputUrl.includes('instagram.com') ||
      inputUrl.includes('tiktok.com') ||
      inputUrl.includes('youtube.com') ||
      inputUrl.includes('youtu.be')

    if (isSocialMedia && !apifyToken) {
      return sendJson(res, 400, {
        error:
          'Instagram/TikTok içeriğini çekebilmek için lütfen Ayarlar (/settings) sayfasından ücretsiz Apify Token bilginizi kaydedin.',
      })
    }

    if (!aiConfig) {
      return sendJson(res, 400, {
        error:
          'Tarifi metne ve malzemelere dönüştürmek için lütfen Ayarlar (/settings) sayfasından ücretsiz Google Gemini veya Groq Cloud API anahtarınızı kaydedin.',
      })
    }

    const jobId = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`

    try {
      let contentText = ''
      let videoTitle = 'Yemek Tarifi'
      let mediaThumbnail = ''
      let videoUrl = ''

      if (isSocialMedia) {
        const scraped = await scrapeSocialMedia(inputUrl, apifyToken)
        contentText = scraped.caption
        videoTitle = scraped.title
        mediaThumbnail = scraped.displayUrl
        videoUrl = scraped.videoUrl
      } else {
        // Direct web recipe scraping
        const webRes = await fetch(inputUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
        contentText = (await webRes.text()).slice(0, 10000)
        videoTitle = 'Web Yemek Tarifi'
      }

      if (!contentText || contentText.trim().length < 5) {
        throw new Error('Gönderiden tarif içeriği veya açıklama metni okunamadı.')
      }

      // Extract recipe with AI
      const recipe = await extractRecipeWithAi(contentText, videoTitle, aiConfig)
      recipe.url = inputUrl
      if (mediaThumbnail) recipe.image = mediaThumbnail
      if (videoUrl) recipe.video = { '@type': 'VideoObject', url: videoUrl }

      const completedJob = {
        id: jobId,
        status: 'completed',
        url: inputUrl,
        video_title: recipe.name || videoTitle,
        recipe_data: recipe,
        progress: 100,
        current_stage: 'complete',
        stage_message: 'Tarif başarıyla çıkarıldı!',
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        thumbnail_url: mediaThumbnail,
        error_message: null,
        llm_tokens_used: 450,
        queue_priority: 0,
        user_id: 'admin',
        attempts: 1,
        next_run_at: null,
        lease_expires_at: null,
        state_changed_at: new Date().toISOString(),
      }

      globalJobs.set(jobId, completedJob)
      globalHistory.unshift({
        id: Date.now(),
        job_id: jobId,
        url: inputUrl,
        title: recipe.name || videoTitle,
        status: 'success',
        created_at: new Date().toISOString(),
        recipe_data: recipe,
      })

      return sendJson(res, 200, {
        job_id: jobId,
        status: 'completed',
        url: inputUrl,
        queue_position: 1,
        message: 'Tarif başarıyla çıkarıldı!',
        auto_start: true,
      })
    } catch (err: any) {
      const errMsg = err?.message || 'Tarif çıkarılırken bir hata oluştu.'
      return sendJson(res, 500, { error: errMsg })
    }
  }

  return sendJson(res, 405, { error: 'Method not allowed' })
}
