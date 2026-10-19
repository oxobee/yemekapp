import { useEffect, useId } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PlusIcon, ServerIcon, Trash2Icon, SparklesIcon, ZapIcon } from 'lucide-react'

import { api } from '@/lib/api'
import type { AiProvider, ApiTypeSpec } from '@/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export const DEFAULT_API_TYPES: Record<string, ApiTypeSpec> = {
  gemini: {
    label: 'Google Gemini (En Uygun / Ücretsiz Kota)',
    needs_base_url: false,
    default_base_url: '',
    catalog: 'google',
    example_model: 'gemini-2.0-flash',
    key_placeholder: 'AIzaSy...',
    key_hint: 'Google AI Studio (aistudio.google.com) üzerinden ücretsiz alabilirsiniz.',
    key_url: 'https://aistudio.google.com/app/apikey',
    key_link_label: 'Google AI Studio Anahtarı Al',
  },
  'openai-compatible': {
    label: 'OpenAI Uyumlu / Groq / OpenRouter',
    needs_base_url: true,
    default_base_url: 'https://api.groq.com/openai/v1',
    catalog: '',
    example_model: 'llama-3.3-70b-versatile',
    key_placeholder: 'gsk_...',
    key_hint: 'Groq Cloud (console.groq.com) üzerinden ücretsiz alabilirsiniz.',
    key_url: 'https://console.groq.com/keys',
    key_link_label: 'Groq API Anahtarı Al',
  },
  openai: {
    label: 'OpenAI (GPT-4o / GPT-4o-mini)',
    needs_base_url: false,
    default_base_url: '',
    catalog: 'openai',
    example_model: 'gpt-4o-mini',
    key_placeholder: 'sk-...',
    key_hint: 'OpenAI platformu üzerinden alınan API anahtarı.',
    key_url: 'https://platform.openai.com/api-keys',
    key_link_label: 'OpenAI API Anahtarı',
  },
  anthropic: {
    label: 'Anthropic Claude',
    needs_base_url: false,
    default_base_url: '',
    catalog: 'anthropic',
    example_model: 'claude-3-5-haiku-latest',
    key_placeholder: 'sk-ant-...',
    key_hint: 'Anthropic Console üzerinden alınan API anahtarı.',
    key_url: 'https://console.anthropic.com/settings/keys',
    key_link_label: 'Anthropic API Anahtarı',
  },
}

function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || `provider-${Math.random().toString(36).slice(2, 10)}`
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Model names are always free text. The datalist only saves people from having
 * to look an id up, so a gateway models.dev has never heard of still works.
 */
function ModelField({
  catalog,
  value,
  onChange,
  placeholder,
}: {
  catalog: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  const listId = useId()
  const { data } = useQuery({
    queryKey: ['modelCatalog', catalog],
    queryFn: () => api.modelCatalog(catalog),
    enabled: Boolean(catalog),
    staleTime: 6 * 60 * 60 * 1000,
    retry: false,
  })

  return (
    <div className="flex flex-col gap-1.5">
      <Label>Model</Label>
      <Input
        type="text"
        list={listId}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {(data?.models ?? []).map(model => (
          <option key={model.id} value={model.id} label={model.name} />
        ))}
      </datalist>
      <p className="text-xs text-muted-foreground">
        İstediğiniz model adını yazabilirsiniz.
      </p>
    </div>
  )
}

export function AiProvidersCard({
  providers,
  onChange,
}: {
  providers: AiProvider[] | null
  onChange: (providers: AiProvider[]) => void
}) {
  const { data } = useQuery({
    queryKey: ['aiProviders'],
    queryFn: api.aiProviders,
    staleTime: 30_000,
  })

  // The server does the legacy-settings migration, so the first render adopts
  // whatever it returns rather than guessing here.
  useEffect(() => {
    if (providers === null && data) onChange(data.providers)
  }, [providers, data, onChange])

  const apiTypes: Record<string, ApiTypeSpec> =
    data?.api_types && Object.keys(data.api_types).length > 0
      ? data.api_types
      : DEFAULT_API_TYPES
  const catalogs: Record<string, string> = data?.compatible_catalogs ?? {}
  const rows = providers ?? data?.providers ?? []

  function update(index: number, patch: Partial<AiProvider>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function catalogFor(provider: AiProvider): string {
    const spec = apiTypes[provider.api_type]
    if (spec?.catalog) return spec.catalog
    return catalogs[hostOf(provider.base_url)] ?? ''
  }

  function add() {
    const firstType = Object.keys(apiTypes)[0] ?? 'openai'
    onChange([
      ...rows,
      { id: '', name: '', api_type: firstType, api_key: '', base_url: '', model: '' },
    ])
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ServerIcon className="size-4" />
          Yapay Zeka Sağlayıcıları (AI)
        </CardTitle>
        <CardDescription>
          Bu uygulamanın tarif çıkarmak için kullanacağı yapay zeka modelleri. OpenAI, Gemini, Claude, OpenRouter, Groq veya yerel Ollama/vLLM modellerini ekleyebilirsiniz.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Henüz sağlayıcı eklenmedi. Tarif çıkarabilmek için lütfen bir sağlayıcı ekleyin.
          </p>
        )}

        {rows.map((provider, index) => {
          const spec = apiTypes[provider.api_type]
          return (
            <div
              key={index}
              className="flex flex-col gap-4 rounded-lg border border-border p-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Sağlayıcı Adı</Label>
                  <Input
                    type="text"
                    placeholder="OpenAI"
                    autoComplete="off"
                    value={provider.name}
                    onChange={e =>
                      update(index, {
                        name: e.target.value,
                        // Ids follow the name until the record has been saved
                        // once; renaming a saved provider must not orphan the
                        // sections pointing at it.
                        id: provider.id && data?.providers.some(p => p.id === provider.id)
                          ? provider.id
                          : slugify(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>API Türü</Label>
                  <Select
                    value={provider.api_type}
                    onValueChange={v => update(index, { api_type: v })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(apiTypes).map(([key, value]) => (
                        <SelectItem key={key} value={key}>
                          {value.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>API Anahtarı</Label>
                  <Input
                    type="password"
                    placeholder={spec?.key_placeholder || 'sk-...'}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={provider.api_key}
                    onChange={e => update(index, { api_key: e.target.value })}
                  />
                  {spec?.key_hint && (
                    <p className="text-xs text-muted-foreground">
                      {spec.key_hint}{' '}
                      {spec.key_url && (
                        <a
                          href={spec.key_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 hover:text-foreground"
                        >
                          {spec.key_link_label || spec.key_url}
                        </a>
                      )}
                    </p>
                  )}
                </div>
                <ModelField
                  catalog={catalogFor(provider)}
                  value={provider.model}
                  onChange={model => update(index, { model })}
                  placeholder={spec?.example_model ?? 'model-adı'}
                />
              </div>

              {spec?.needs_base_url && (
                <div className="flex flex-col gap-1.5">
                  <Label>Temel URL (Base URL)</Label>
                  <Input
                    type="url"
                    placeholder={spec.default_base_url || 'https://api.example.com/v1'}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={provider.base_url}
                    onChange={e => update(index, { base_url: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Uç noktanın adresi. Yerel bir sunucu (Ollama, LM Studio) için API anahtarı gerekmeyebilir.
                  </p>
                </div>
              )}

              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                >
                  <Trash2Icon />
                  Kaldır
                </Button>
              </div>
            </div>
          )
        })}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={add}>
            <PlusIcon />
            Özel Sağlayıcı Ekle
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const id = `gemini-${Date.now().toString(36)}`
              onChange([
                ...rows,
                {
                  id,
                  name: 'Google Gemini 2.0 Flash',
                  api_type: 'gemini',
                  api_key: '',
                  base_url: '',
                  model: 'gemini-2.0-flash',
                },
              ])
            }}
          >
            <SparklesIcon className="size-4 text-blue-500 mr-1.5" />
            + Google Gemini (Ücretsiz)
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const id = `groq-${Date.now().toString(36)}`
              onChange([
                ...rows,
                {
                  id,
                  name: 'Groq Cloud (Llama 3.3)',
                  api_type: 'openai-compatible',
                  api_key: '',
                  base_url: 'https://api.groq.com/openai/v1',
                  model: 'llama-3.3-70b-versatile',
                },
              ])
            }}
          >
            <ZapIcon className="size-4 text-orange-500 mr-1.5" />
            + Groq Cloud (Hızlı & Ücretsiz)
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
