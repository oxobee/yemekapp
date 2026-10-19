import type { IncomingMessage, ServerResponse } from 'http'

export const config = {
  maxDuration: 60,
}

let serverConfig: Record<string, string> = {
  ai_extraction_provider: 'gemini-flash',
  recipe_lang: 'turkish',
  target_language: 'tr',
  apify_enabled: 'true',
}

function sendJson(res: any, status: number, data: any) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE, PATCH')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.end(JSON.stringify(data))
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { ok: true })
  }

  const urlPath = req.url || ''

  // 1. /api/me
  if (urlPath.includes('/api/me')) {
    return sendJson(res, 200, {
      user: 'admin',
      is_admin: true,
      local_auth_enabled: false,
      auth_mode: 'local',
      shared_url: null,
      auto_start: false,
    })
  }

  // 2. /api/config
  if (urlPath.includes('/api/config')) {
    if (req.method === 'POST') {
      let body = req.body
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body)
        } catch {}
      }
      serverConfig = { ...serverConfig, ...(body || {}) }
      return sendJson(res, 200, {
        status: 'ok',
        saved_keys: Object.keys(body || {}),
      })
    }
    return sendJson(res, 200, serverConfig)
  }

  // 3. /api/ai/providers
  if (urlPath.includes('/api/ai/providers')) {
    return sendJson(res, 200, {
      providers: [
        {
          id: 'gemini-flash',
          name: 'Google Gemini 1.5 Flash (Ücretsiz)',
          api_type: 'gemini',
          api_key: serverConfig.gemini_api_key || '',
          base_url: '',
          model: 'gemini-1.5-flash',
        },
        {
          id: 'groq-llama',
          name: 'Groq Cloud Llama 3.3 (Hızlı)',
          api_type: 'openai-compatible',
          api_key: serverConfig.groq_api_key || '',
          base_url: 'https://api.groq.com/openai/v1',
          model: 'llama-3.3-70b-versatile',
        },
      ],
      api_types: {
        gemini: {
          label: 'Google Gemini (En Uygun / Ücretsiz)',
          needs_base_url: false,
          default_base_url: '',
          catalog: 'google',
          example_model: 'gemini-1.5-flash',
          key_placeholder: 'AIzaSy...',
          key_hint: 'Google AI Studio üzerinden ücretsiz alabilirsiniz.',
          key_url: 'https://aistudio.google.com/app/apikey',
          key_link_label: 'Google AI Studio',
        },
        'openai-compatible': {
          label: 'OpenAI Uyumlu / Groq / OpenRouter',
          needs_base_url: true,
          default_base_url: 'https://api.groq.com/openai/v1',
          catalog: '',
          example_model: 'llama-3.3-70b-versatile',
          key_placeholder: 'gsk_...',
          key_hint: 'Groq Cloud üzerinden ücretsiz alabilirsiniz.',
          key_url: 'https://console.groq.com/keys',
          key_link_label: 'Groq Cloud',
        },
        openai: {
          label: 'OpenAI (GPT-4o)',
          needs_base_url: false,
          default_base_url: '',
          catalog: 'openai',
          example_model: 'gpt-4o-mini',
          key_placeholder: 'sk-...',
        },
      },
      compatible_catalogs: {},
    })
  }

  // 4. /api/jobs/queue
  if (urlPath.includes('/api/jobs/queue')) {
    return sendJson(res, 200, {
      max_concurrent: 3,
      queued_count: 0,
      active_count: 0,
      running_count: 0,
    })
  }

  // 5. /api/history
  if (urlPath.includes('/api/history')) {
    return sendJson(res, 200, {
      items: [],
      total: 0,
    })
  }

  // 6. /api/recipes
  if (urlPath.includes('/api/recipes')) {
    return sendJson(res, 200, {
      items: [],
      total: 0,
    })
  }

  // 7. /api/tasks
  if (urlPath.includes('/api/tasks')) {
    return sendJson(res, 200, {
      tasks: [],
      counts: { active: 0, queued: 0, completed: 0 },
    })
  }

  // 8. /api/pending-uploads
  if (urlPath.includes('/api/pending-uploads')) {
    return sendJson(res, 200, { pending_uploads: [] })
  }

  // 9. /api/push/vapid-key
  if (urlPath.includes('/api/push/vapid-key')) {
    return sendJson(res, 200, { key: '' })
  }

  // Default fallback for any other api route
  return sendJson(res, 200, { ok: true })
}
