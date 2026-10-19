import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChefHat, ShieldCheck, TriangleAlert } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

/**
 * First-run account creation.
 *
 * Reachable only while the instance has no account. The server closes the
 * endpoint the moment one exists, so a stale tab left on this page gets a 409
 * rather than a second admin.
 */
export function SetupPage() {
  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['setupInfo'],
    queryFn: api.setupInfo,
    retry: false,
  })

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Null until the user types, so the server's suggestion can show through
  // without an effect copying it into state. Clearing the field keeps it empty
  // ('' is not null) rather than springing back to the suggestion.
  const [typedUsername, setTypedUsername] = useState<string | null>(null)
  const username = typedUsername ?? data?.suggested_username ?? ''

  // Somebody claimed the account while this page was open, or it was loaded on
  // an instance that never needed setup.
  const alreadySetUp = loadError instanceof ApiError && loadError.status === 409
  useEffect(() => {
    if (alreadySetUp) {
      window.location.href = '/login'
    }
  }, [alreadySetUp])

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await api.createFirstAccount(username, password, confirm)
      // Full reload rather than client-side navigation: the session cookie is
      // new, and every cached query was populated while signed out.
      window.location.href = '/'
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        window.location.href = '/login'
        return
      }
      setError(err instanceof Error ? err.message : 'Hesap oluşturulamadı.')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <ChefHat className="size-8" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Hoş Geldiniz
            </h1>
            <p className="text-sm text-muted-foreground">
              YemekApp için yönetici hesabını oluşturun
            </p>
          </div>
        </div>

        <Card className="w-full">
          <CardContent className="pt-4">
            {isLoading || alreadySetUp ? (
              <div className="flex flex-col gap-3">
                <div className="h-9 w-full animate-pulse rounded-lg bg-muted" />
                <div className="h-9 w-full animate-pulse rounded-lg bg-muted" />
                <div className="h-9 w-full animate-pulse rounded-lg bg-muted" />
              </div>
            ) : (
              <form onSubmit={onSubmit} className="flex flex-col gap-3">
                {error && (
                  <div
                    role="alert"
                    className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive dark:border-destructive/30 dark:bg-destructive/20"
                  >
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="username"
                    className="text-sm font-medium text-foreground"
                  >
                    Kullanıcı Adı
                  </label>
                  <Input
                    id="username"
                    name="username"
                    value={username}
                    onChange={(e) => setTypedUsername(e.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    autoFocus
                  />
                  {data?.adopting && (
                    <p className="text-xs text-muted-foreground">
                      Bu uygulamada zaten{' '}
                      <span className="font-medium text-foreground">
                        {data.adopting}
                      </span>{' '}
                      adıyla kayıtlı tarifler var. Onları korumak için aynı ismi kullanabilirsiniz.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="password"
                    className="text-sm font-medium text-foreground"
                  >
                    Şifre
                  </label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={10}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    En az 10 karakter. Sembollerden ziyade uzunluk ve akılda kalıcılık önemlidir.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="confirm_password"
                    className="text-sm font-medium text-foreground"
                  >
                    Şifreyi Onayla
                  </label>
                  <Input
                    id="confirm_password"
                    name="confirm_password"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    minLength={10}
                    required
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={submitting}
                >
                  <ShieldCheck />
                  {submitting ? 'Hesap oluşturuluyor…' : 'Hesap Oluştur'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="max-w-sm text-center text-xs text-muted-foreground">
          Bir yönetici hesabı oluşturulduğunda bu kurulum sayfası otomatik olarak kapanır.
        </p>
      </div>
    </div>
  )
}
