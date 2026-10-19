import { useState } from 'react'
import { toast } from 'sonner'
import { KeyRoundIcon } from 'lucide-react'

import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const MIN_PASSWORD_LENGTH = 10

/** Change your own password. Shown to every user, admin or not. */
export function AccountCard({ username }: { username: string }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  const mismatch = confirm.length > 0 && next !== confirm
  const canSubmit =
    current.length > 0 &&
    next.length >= MIN_PASSWORD_LENGTH &&
    next === confirm &&
    !saving

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await api.changeOwnPassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      toast.success('Şifre değiştirildi')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Şifre değiştirilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-4" />
          Hesabınız
        </CardTitle>
        <CardDescription>
          <span className="font-medium text-foreground">{username}</span> olarak giriş yapıldı. Şifrenizi aşağıdan değiştirebilirsiniz.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="current-password">Mevcut şifre</Label>
            <Input
              id="current-password"
              type="password"
              value={current}
              onChange={e => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">Yeni şifre</Label>
            <Input
              id="new-password"
              type="password"
              value={next}
              onChange={e => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
            />
            <p className="text-xs text-muted-foreground">
              En az {MIN_PASSWORD_LENGTH} karakter olmalıdır.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-password">Yeni şifreyi onayla</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              aria-invalid={mismatch}
            />
            {mismatch && (
              <p className="text-xs text-destructive">
                Şifreler birbiriyle eşleşmiyor.
              </p>
            )}
          </div>
          <Button type="submit" disabled={!canSubmit} className="self-start">
            {saving ? 'Değiştiriliyor…' : 'Şifreyi Değiştir'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
