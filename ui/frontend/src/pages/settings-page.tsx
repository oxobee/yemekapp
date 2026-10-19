import { useCallback, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  BrainIcon,
  LanguagesIcon,
  SendIcon,
  MicIcon,
  VideoIcon,
  ListIcon,
  DatabaseBackupIcon,
  SaveIcon,
  UploadIcon,
  Trash2Icon,
  DownloadIcon,
  UtensilsIcon,
} from 'lucide-react'

import { api } from '@/lib/api'
import type { AiProvider, AppConfig } from '@/types'
import { useSession } from '@/hooks/use-session'
import { AccountCard } from '@/components/settings/account-card'
import { NotificationsCard } from '@/components/settings/notifications-card'
import { UsersCard } from '@/components/settings/users-card'
import { AiProvidersCard } from '@/components/settings/ai-providers-card'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

type Draft = Partial<AppConfig>

// The dialects that expose an OpenAI-compatible /audio/transcriptions endpoint.
const AUDIO_API_TYPES = ['openai', 'openai-compatible']

/** Picks one of the configured providers by id, showing its name. */
function ProviderPicker({
  providers,
  value,
  onChange,
  emptyLabel = 'No provider configured',
}: {
  providers: AiProvider[]
  value: string
  onChange: (value: string) => void
  emptyLabel?: string
}) {
  const named = providers.filter(p => p.name.trim())
  if (named.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>
  }
  // A provider that was renamed or removed leaves the saved id pointing
  // nowhere; falling back to the first keeps the select from rendering blank.
  const current = named.some(p => p.id === value) ? value : named[0].id
  return (
    <Select value={current} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {named.map(provider => (
          <SelectItem key={provider.id} value={provider.id}>
            {provider.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function useDraft(loaded: AppConfig | undefined) {
  const [draft, setDraft] = useState<Draft>({})

  function get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    if (key in draft) return draft[key] as AppConfig[K]
    return (loaded?.[key] ?? '') as AppConfig[K]
  }

  function set<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  function reset() {
    setDraft({})
  }

  const dirty = Object.keys(draft).length > 0

  return { get, set, reset, draft, dirty }
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground mt-1">{children}</p>
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <FieldHint>{hint}</FieldHint>}
    </div>
  )
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const { data: session, isLoading: sessionLoading } = useSession()
  const isAdmin = session?.is_admin ?? false
  const localAuth = session?.local_auth_enabled ?? false

  const { data: loaded, isLoading: configLoading } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
    // Instance configuration holds the API keys, so the server refuses it to
    // non-admins. Not asking avoids a pointless 403 on every visit.
    enabled: isAdmin,
  })

  const { get, set, reset, draft, dirty } = useDraft(loaded)

  const [providers, setProvidersState] = useState<AiProvider[] | null>(null)

  const setProviders = useCallback(
    (next: AiProvider[]) => {
      // Adopting the server's registry on first render is not an edit, so
      // only a later change marks the form dirty and gets saved.
      if (providers !== null) set('ai_providers', JSON.stringify(next))
      setProvidersState(next)
    },
    [providers, set],
  )

  const [saving, setSaving] = useState(false)
  const [cookiesUploading, setCookiesUploading] = useState(false)
  const cookiesFileRef = useRef<HTMLInputElement>(null)
  const importFileRef = useRef<HTMLInputElement>(null)

  async function handleSave() {
    if (!dirty) return
    setSaving(true)
    try {
      await api.saveConfig(draft)
      toast.success('Settings saved')
      if (providers) {
        queryClient.setQueryData(
          ['aiProviders'],
          (current: { providers: AiProvider[] } | undefined) =>
            current ? { ...current, providers } : current,
        )
      }
      reset()
      await queryClient.invalidateQueries({ queryKey: ['config'] })
      await queryClient.invalidateQueries({ queryKey: ['aiProviders'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  async function handleCookiesUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setCookiesUploading(true)
    try {
      const result = await api.uploadCookies(file)
      toast.success(result.message)
      await queryClient.invalidateQueries({ queryKey: ['config'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload cookies file')
    } finally {
      setCookiesUploading(false)
    }
  }

  async function handleDeleteCookies() {
    try {
      const result = await api.deleteCookies()
      toast.success(result.message)
      await queryClient.invalidateQueries({ queryKey: ['config'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete cookies')
    }
  }

  async function handleExport() {
    try {
      const data = await api.exportSettings()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      a.href = url
      a.download = `settings-${date}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export settings')
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const text = await file.text()
      const parsed: unknown = JSON.parse(text)
      await api.importSettings(parsed)
      toast.success('Settings imported successfully')
      reset()
      await queryClient.invalidateQueries({ queryKey: ['config'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import settings')
    }
  }

  // null until the providers card has adopted the server's (already migrated)
  // registry, so an unedited page never saves a list it has not seen.
  const providerRows = providers ?? []
  const extractionProvider =
    get('ai_extraction_provider') || get('llm_provider') || providerRows[0]?.id || ''
  const transcriptionMode = get('transcription_mode') || 'local'
  const mealieEnabled = get('mealie_enabled') === 'true'
  const tandoorEnabled = get('tandoor_enabled') === 'true'
  const confirmBeforeUpload = get('confirm_before_upload') === 'true'
  // Default on: the lookup needs no key, so only an explicit 'false' means off.
  const nutritionLookupEnabled = get('nutrition_lookup_enabled') !== 'false'
  const hasCookiesFile = Boolean(loaded?.yt_dlp_cookies_file)

  if (sessionLoading || (isAdmin && configLoading)) {
    return (
      <div className="p-6 text-muted-foreground text-sm">Ayarlar yükleniyor…</div>
    )
  }

  // Non-admins get their own account and nothing else: everything below is
  // instance-wide, and the server refuses it to them anyway.
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold">Ayarlar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tarif çıkarma ve sistem ayarları yönetici tarafından yapılandırılır.
          </p>
        </div>
        <NotificationsCard />
        {localAuth && session && <AccountCard username={session.user} />}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Ayarlar</h1>
        <p className="text-sm text-muted-foreground mt-1">YemekApp uygulamasını yapılandırın</p>
      </div>

      <AiProvidersCard providers={providers} onChange={setProviders} />

      {/* AI Extraction */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainIcon className="size-4" />
            Yapay Zeka ile Tarif Çıkarma
          </CardTitle>
          <CardDescription>
            Ham video ve web içeriğini tarif formatına dönüştürecek sağlayıcı. Ekrandaki yazıları okuyup kapak fotoğrafını seçebilmesi için görsel yetenekli bir model önerilir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field label="Sağlayıcı (Provider)">
            <ProviderPicker
              providers={providerRows}
              value={extractionProvider}
              onChange={v => set('ai_extraction_provider', v)}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Nutrition */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UtensilsIcon className="size-4" />
            Besin Değerleri Analizi
          </CardTitle>
          <CardDescription>
            Malzemeler önce yerel besin tablosundan taranır. Tanınmayan malzemeler Open Food Facts üzerinden canlı olarak sorgulanabilir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Switch
              id="nutrition_lookup_enabled"
              checked={nutritionLookupEnabled}
              onCheckedChange={checked =>
                set('nutrition_lookup_enabled', checked ? 'true' : 'false')
              }
            />
            <div>
              <Label htmlFor="nutrition_lookup_enabled">
                Tanınmayan malzemeleri Open Food Facts ile ara
              </Label>
              <p className="text-xs text-muted-foreground">
                Dünya çapında açık gıda veritabanı. API anahtarı gerektirmez.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recipe Language */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LanguagesIcon className="size-4" />
            Tarif Dili
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Tarif Dili"
            hint="Oluşturulan nihai tarifin yazılacağı dil (örn: turkish, english)."
          >
            <Input
              type="text"
              placeholder="turkish"
              value={get('recipe_lang')}
              onChange={e => set('recipe_lang', e.target.value)}
            />
          </Field>
          <Field
            label="Transkripsiyon / Dil Kodu"
            hint={
              <>
                Tarif diline karşılık gelen iki harfli kod (örn. <code className="font-mono text-xs">tr</code>, <code className="font-mono text-xs">en</code>).
              </>
            }
          >
            <Input
              type="text"
              placeholder="tr"
              value={get('target_language')}
              onChange={e => set('target_language', e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Recipe Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SendIcon className="size-4" />
            Tarif Aktarımı (Mealie / Tandoor)
          </CardTitle>
          <CardDescription>
            Hazırlanan tariflerin otomatik olarak yükleneceği tarif yöneticileri.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Mealie */}
            <Card className={mealieEnabled ? '' : 'opacity-60'}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Mealie</CardTitle>
                  <Switch
                    checked={mealieEnabled}
                    onCheckedChange={checked =>
                      set('mealie_enabled', checked ? 'true' : 'false')
                    }
                    aria-label="Mealie aktarımını etkinleştir"
                  />
                </div>
                <CardDescription className="text-xs">
                  {mealieEnabled ? 'Etkin' : 'Devre Dışı'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Field label="Mealie Adresi (URL)">
                  <Input
                    type="url"
                    placeholder="http://localhost:9925"
                    autoComplete="off"
                    value={get('mealie_host')}
                    onChange={e => set('mealie_host', e.target.value)}
                  />
                </Field>
                <Field label="Mealie API Anahtarı">
                  <Input
                    type="password"
                    placeholder="Mealie API anahtarınız"
                    autoComplete="off"
                    value={get('mealie_api_key')}
                    onChange={e => set('mealie_api_key', e.target.value)}
                  />
                </Field>
              </CardContent>
            </Card>

            {/* Tandoor */}
            <Card className={tandoorEnabled ? '' : 'opacity-60'}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Tandoor</CardTitle>
                  <Switch
                    checked={tandoorEnabled}
                    onCheckedChange={checked =>
                      set('tandoor_enabled', checked ? 'true' : 'false')
                    }
                    aria-label="Tandoor aktarımını etkinleştir"
                  />
                </div>
                <CardDescription className="text-xs">
                  {tandoorEnabled ? 'Etkin' : 'Devre Dışı'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Field label="Tandoor Adresi (URL)">
                  <Input
                    type="url"
                    placeholder="https://tandoor.example.com"
                    autoComplete="off"
                    value={get('tandoor_host')}
                    onChange={e => set('tandoor_host', e.target.value)}
                  />
                </Field>
                <Field label="Tandoor API Anahtarı">
                  <Input
                    type="password"
                    placeholder="Tandoor API anahtarınız"
                    autoComplete="off"
                    value={get('tandoor_api_key')}
                    onChange={e => set('tandoor_api_key', e.target.value)}
                  />
                </Field>
              </CardContent>
            </Card>
          </div>

          {!mealieEnabled && !tandoorEnabled && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              <strong>Herhangi bir tarif yöneticisi seçilmedi.</strong> Mealie veya Tandoor etkinleştirilmediği sürece tarifler sadece bu uygulama içinde saklanır.
            </div>
          )}

          <div className="flex items-center gap-3">
            <Switch
              id="confirm_before_upload"
              checked={confirmBeforeUpload}
              onCheckedChange={checked =>
                set('confirm_before_upload', checked ? 'true' : 'false')
              }
            />
            <div>
              <Label htmlFor="confirm_before_upload">Aktarmadan önce onayımı iste</Label>
              <FieldHint>Önce tarifin önizlemesini gösterir, onayınızdan sonra dış sisteme aktarır.</FieldHint>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Speech to text */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MicIcon className="size-4" />
            Ses Tanıma (Konuşmayı Metne Dönüştürme)
          </CardTitle>
          <CardDescription>
            Videodaki konuşmayı metne çevirme ayarları. Yerel Whisper makinenizde çalışır ve API gerektirmez. İsteğe bağlı olarak bir bulut AI sağlayıcısı da kullanabilirsiniz.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field label="Ses Tanıma Yöntemi">
            <Select
              value={transcriptionMode}
              onValueChange={v => set('transcription_mode', v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Kapalı (yalnızca ekrandaki metinler)</SelectItem>
                <SelectItem value="local">Bu sunucuda yerel Whisper (API gerekmez)</SelectItem>
                <SelectItem value="provider">Yukarıdaki yapay zeka sağlayıcılarından biri</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {transcriptionMode === 'off' ? (
            <p className="text-xs text-muted-foreground">
              Ses yoksayılır. Tarifler yalnızca ekrandaki metin ve video açıklamasından çıkarılır.
            </p>
          ) : transcriptionMode === 'local' ? (
            <>
              <Field
                label="Whisper model"
                hint="Larger models are more accurate but slower. 'Small' is recommended for mixed-language content."
              >
                <Select
                  value={get('whisper_model') || 'small'}
                  onValueChange={v => set('whisper_model', v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tiny">Tiny (en hızlı, en düşük doğruluk)</SelectItem>
                    <SelectItem value="base">Base</SelectItem>
                    <SelectItem value="small">Small (önerilen)</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large-v3">Large v3 (en yavaş, en yüksek doğruluk)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label="HuggingFace Belirteci (Token)"
                hint={
                  <>
                    İsteğe bağlıdır. Whisper model ağırlıklarını daha hızlı indirmek için bir belirteç ekleyebilirsiniz:{' '}
                    <a
                      href="https://huggingface.co/settings/tokens"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      huggingface.co/settings/tokens
                    </a>
                  </>
                }
              >
                <Input
                  type="password"
                  placeholder="hf_..."
                  value={get('hf_token')}
                  onChange={e => set('hf_token', e.target.value)}
                />
              </Field>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Sağlayıcı"
                  hint="Yalnızca ses uç noktasına sahip sağlayıcılar kullanılabilir."
                >
                  <ProviderPicker
                    providers={providerRows.filter(p => AUDIO_API_TYPES.includes(p.api_type))}
                    value={get('transcription_provider')}
                    onChange={v => set('transcription_provider', v)}
                    emptyLabel="Ses uç noktasına sahip sağlayıcı bulunamadı"
                  />
                </Field>
                <Field
                  label="Model"
                  hint="Örneğin whisper-1 veya whisper-large-v3."
                >
                  <Input
                    type="text"
                    placeholder="whisper-1"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={get('transcription_model')}
                    onChange={e => set('transcription_model', e.target.value)}
                  />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">
                Sağlayıcı hata verirse işlem otomatik olarak sunucudaki yerel Whisper'a devredilir.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Video Downloads */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <VideoIcon className="size-4" />
            Video İndirme Ayarları (YouTube, Instagram vb.)
          </CardTitle>
          <CardDescription>
            İndirme sırasında bot doğrulaması veya oturum gerektiren durumlar için çerez yapılandırması.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field
            label="Tarayıcıdan Çerezleri Çek"
            hint="Sunucuda yüklü tarayıcıdan çerezleri otomatik alır."
          >
            <Select
              value={get('yt_dlp_cookies_browser') || ''}
              onValueChange={v => set('yt_dlp_cookies_browser', v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Yok (Devre dışı)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Yok (Devre dışı)</SelectItem>
                <SelectItem value="chrome">Chrome</SelectItem>
                <SelectItem value="firefox">Firefox</SelectItem>
                <SelectItem value="safari">Safari</SelectItem>
                <SelectItem value="edge">Edge</SelectItem>
                <SelectItem value="opera">Opera</SelectItem>
                <SelectItem value="brave">Brave</SelectItem>
                <SelectItem value="vivaldi">Vivaldi</SelectItem>
                <SelectItem value="chromium">Chromium</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="flex flex-col gap-1.5">
            <Label>Cookies Dosyası Yükle</Label>
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                disabled={cookiesUploading}
                onClick={() => cookiesFileRef.current?.click()}
              >
                <UploadIcon />
                {cookiesUploading ? 'Yükleniyor…' : 'cookies.txt dosyası seçin'}
              </Button>
              {hasCookiesFile && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2Icon />
                      Cookies sil
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cookies dosyası silinsin mi?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Yüklenen çerez dosyası silinir.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>İptal</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={handleDeleteCookies}>
                        Sil
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <span className="text-sm text-muted-foreground">
                {hasCookiesFile ? 'Çerez dosyası yüklü' : 'Çerez dosyası yüklenmedi'}
              </span>
            </div>
            <input
              ref={cookiesFileRef}
              type="file"
              accept=".txt"
              className="hidden"
              onChange={handleCookiesUpload}
            />
          </div>
        </CardContent>
      </Card>

      {/* Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListIcon className="size-4" />
            Görev Kuyruğu
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field
            label="Maksimum Eşzamanlı Görev"
            hint="Aynı anda çalıştırılacak en fazla işlem sayısı."
          >
            <Input
              type="number"
              min={1}
              max={16}
              value={get('max_concurrent_jobs') || '3'}
              onChange={e => {
                const clamped = Math.min(16, Math.max(1, Number(e.target.value)))
                set('max_concurrent_jobs', String(clamped))
              }}
              className="w-28"
            />
          </Field>
        </CardContent>
      </Card>

      <NotificationsCard />

      {localAuth && session && (
        <>
          <AccountCard username={session.user} />
          <UsersCard currentUsername={session.user} />
        </>
      )}

      {/* Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseBackupIcon className="size-4" />
            Yedekleme ve Geri Yükleme
          </CardTitle>
          <CardDescription>
            Tüm ayarlarınızı JSON dosyası olarak indirin veya yedekten geri yükleyin.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1.5">
              <Button variant="outline" onClick={handleExport}>
                <DownloadIcon />
                Dışa Aktar
              </Button>
              <FieldHint>API anahtarları dahil tüm ayarları bir dosyaya kaydeder.</FieldHint>
            </div>
            <div className="flex flex-col gap-1.5">
              <Button variant="outline" onClick={() => importFileRef.current?.click()}>
                <UploadIcon />
                İçe Aktar
              </Button>
              <FieldHint>Önceden dışa aktarılmış bir dosyadan geri yükler.</FieldHint>
              <input
                ref={importFileRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImport}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sticky save bar */}
      {dirty && (
        <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-end border-t border-border bg-background/90 px-4 py-3 backdrop-blur-sm">
          <Button onClick={handleSave} disabled={saving}>
            <SaveIcon />
            {saving ? 'Kaydediliyor…' : 'Ayarları Kaydet'}
          </Button>
        </div>
      )}
    </div>
  )
}
