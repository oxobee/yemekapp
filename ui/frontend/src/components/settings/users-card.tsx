import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { KeyRoundIcon, Trash2Icon, UserPlusIcon, UsersIcon } from 'lucide-react'

import { api } from '@/lib/api'
import type { ManagedUser } from '@/types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

const MIN_PASSWORD_LENGTH = 10

function AddUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  const reset = () => {
    setUsername('')
    setPassword('')
    setIsAdmin(false)
  }

  const create = useMutation({
    mutationFn: () => api.createUser(username.trim(), password, isAdmin),
    onSuccess: async ({ user }) => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success(`${user.username} oluşturuldu`)
      reset()
      onOpenChange(false)
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Hesap oluşturulamadı')
    },
  })

  const canSubmit =
    username.trim().length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    !create.isPending

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hesap Ekle</DialogTitle>
          <DialogDescription>
            Şifreyi siz belirlersiniz — harici kayıt veya davet e-postası yoktur.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={e => {
            e.preventDefault()
            if (canSubmit) create.mutate()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-username">Kullanıcı Adı</Label>
            <Input
              id="new-username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoCapitalize="none"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-user-password">Şifre</Label>
            <Input
              id="new-user-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
            />
            <p className="text-xs text-muted-foreground">
              En az {MIN_PASSWORD_LENGTH} karakter olmalıdır.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <Label htmlFor="new-user-admin">Yönetici (Admin)</Label>
              <p className="text-xs text-muted-foreground">
                Ayarları değiştirebilir, tüm görevleri görebilir ve hesapları yönetebilir.
              </p>
            </div>
            <Switch
              id="new-user-admin"
              checked={isAdmin}
              onCheckedChange={setIsAdmin}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              İptal
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {create.isPending ? 'Oluşturuluyor…' : 'Hesap Oluştur'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({
  user,
  onClose,
}: {
  user: ManagedUser | null
  onClose: () => void
}) {
  const [password, setPassword] = useState('')

  const reset = useMutation({
    mutationFn: () => api.resetUserPassword(user!.username, password),
    onSuccess: () => {
      toast.success(`Password set for ${user!.username}`)
      setPassword('')
      onClose()
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Could not set the password')
    },
  })

  return (
    <Dialog
      open={user !== null}
      onOpenChange={next => {
        if (!next) {
          setPassword('')
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yeni şifre belirle</DialogTitle>
          <DialogDescription>
            {user?.username} için yeni bir şifre belirleyin. Mevcut oturumları açık kalır; yeni şifre bir sonraki girişte geçerli olur.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={e => {
            e.preventDefault()
            if (password.length >= MIN_PASSWORD_LENGTH) reset.mutate()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reset-password">Yeni şifre</Label>
            <Input
              id="reset-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              İptal
            </Button>
            <Button
              type="submit"
              disabled={password.length < MIN_PASSWORD_LENGTH || reset.isPending}
            >
              {reset.isPending ? 'Kaydediliyor…' : 'Şifreyi Kaydet'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function UserRow({
  user,
  isSelf,
  lastAdmin,
  onResetPassword,
  onDelete,
}: {
  user: ManagedUser
  isSelf: boolean
  lastAdmin: boolean
  onResetPassword: () => void
  onDelete: () => void
}) {
  const queryClient = useQueryClient()

  const toggleAdmin = useMutation({
    mutationFn: (next: boolean) => api.setUserAdmin(user.username, next),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Yetkiler değiştirilemedi')
    },
  })

  // Guarded here as well as on the server, so the control explains itself
  // instead of only failing when pressed.
  const adminLocked = isSelf || (user.is_admin && lastAdmin)

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{user.username}</span>
          {isSelf && <Badge variant="secondary">siz</Badge>}
          {user.is_oidc && <Badge variant="outline">SSO</Badge>}
          {!user.has_password && !user.is_oidc && (
            <Badge variant="outline">şifresiz</Badge>
          )}
        </div>
        {user.email && (
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Label
          htmlFor={`admin-${user.username}`}
          className="text-xs text-muted-foreground"
        >
          Yönetici
        </Label>
        <Switch
          id={`admin-${user.username}`}
          checked={user.is_admin}
          disabled={adminLocked || toggleAdmin.isPending}
          onCheckedChange={next => toggleAdmin.mutate(next)}
        />
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={onResetPassword}
        title="Yeni şifre belirle"
      >
        <KeyRoundIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        disabled={isSelf || (user.is_admin && lastAdmin)}
        title={isSelf ? 'Kendi hesabınızı silemezsiniz' : 'Hesabı sil'}
      >
        <Trash2Icon />
      </Button>
    </div>
  )
}

/**
 * Account management. Admin-only, and local-mode only: under OIDC the
 * identity provider owns accounts and group membership owns admin rights.
 */
export function UsersCard({ currentUsername }: { currentUsername: string }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [resetting, setResetting] = useState<ManagedUser | null>(null)
  const [deleting, setDeleting] = useState<ManagedUser | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: api.listUsers,
  })

  const remove = useMutation({
    mutationFn: (username: string) => api.deleteUser(username),
    onSuccess: async ({ username }) => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success(`${username} silindi`)
      setDeleting(null)
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Hesap silinemedi')
    },
  })

  const lastAdmin = (data?.admin_count ?? 0) <= 1

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersIcon className="size-4" />
          Kullanıcı Hesapları
        </CardTitle>
        <CardDescription>
          Sisteme giriş yapabilen kullanıcılar. Yalnızca yöneticiler hesap ekleyebilir veya silebilir.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <div className="h-9 w-full animate-pulse rounded-lg bg-muted" />
        ) : (
          <div className="flex flex-col">
            {data?.users.map(user => (
              <UserRow
                key={user.username}
                user={user}
                isSelf={user.username === currentUsername}
                lastAdmin={lastAdmin}
                onResetPassword={() => setResetting(user)}
                onDelete={() => setDeleting(user)}
              />
            ))}
          </div>
        )}

        <Button
          variant="outline"
          className="self-start"
          onClick={() => setAdding(true)}
        >
          <UserPlusIcon />
          Hesap Ekle
        </Button>
      </CardContent>

      <AddUserDialog open={adding} onOpenChange={setAdding} />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={next => {
          if (!next) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleting?.username} silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              Kullanıcının sıradaki görevleri hesapla birlikte silinir. Geçmişte kaydedilen tarifler korunur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && remove.mutate(deleting.username)}
            >
              Hesabı Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
