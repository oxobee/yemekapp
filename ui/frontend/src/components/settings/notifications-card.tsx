import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BellIcon } from 'lucide-react'

import {
  currentSubscription,
  disablePush,
  enablePush,
  isPushSupported,
  permissionState,
} from '@/lib/push'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

/**
 * Per-browser notification opt-in. Shown to every user, admin or not — this is
 * a personal preference, not instance configuration.
 *
 * Subscriptions are per browser, not per account, so the state here is read
 * from the PushManager rather than the server: signing in elsewhere should not
 * make this device claim it is subscribed.
 */
export function NotificationsCard() {
  const supported = isPushSupported()

  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(supported)

  const refresh = useCallback(async () => {
    try {
      setSubscribed((await currentSubscription()) !== null)
    } catch {
      setSubscribed(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!supported) return
    void refresh()
  }, [supported, refresh])

  async function handleToggle(next: boolean) {
    setBusy(true)
    try {
      if (next) {
        await enablePush()
        toast.success('Bu tarayıcı için bildirimler açıldı')
      } else {
        await disablePush()
        toast.success('Bu tarayıcı için bildirimler kapatıldı')
      }
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bildirimler değiştirilemedi')
      // Re-read rather than assuming the toggle failed cleanly: permission may
      // have been granted even though registering the endpoint did not finish.
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const blocked = permissionState() === 'denied'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellIcon className="size-4" />
          Bildirimler
        </CardTitle>
        <CardDescription>
          Bir tarif tamamlandığında, hata verdiğinde veya onayınızı beklediğinde bildirim alın.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 max-w-md">
          <Label htmlFor="push-toggle" className="font-normal">
            Bu tarayıcı için bildirimleri etkinleştir
          </Label>
          <Switch
            id="push-toggle"
            checked={subscribed}
            disabled={!supported || blocked || busy || loading}
            onCheckedChange={handleToggle}
          />
        </div>

        {!supported && (
          <p className="text-xs text-muted-foreground">
            Bu tarayıcı web bildirimlerini desteklemiyor. iOS'ta önce uygulamayı Ana Ekrana ekleyin.
          </p>
        )}

        {supported && blocked && (
          <p className="text-xs text-destructive">
            Bu site için bildirimler engellendi. Tarayıcı ayarlarından izin verip sayfayı yenileyin.
          </p>
        )}

        {supported && !blocked && (
          <p className="text-xs text-muted-foreground">
            Yalnızca bu tarayıcı için geçerlidir — bildirim almak istediğiniz her cihazda açabilirsiniz.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
