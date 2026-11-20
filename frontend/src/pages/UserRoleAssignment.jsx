import { useState } from 'react'
import { toast } from 'sonner'
import api from '@/lib/api'
import ManagementLayout from '@/components/layout/ManagementLayout'
import FormDialog from '@/components/FormDialog'
import ConfirmDialog from '@/components/ConfirmDialog'
import ResourceStatus from '@/components/ResourceStatus'
import { useAdminResource, useAdminMutation } from '@/hooks/useAdminApi'
import { useAuth } from '@/context/useAuth'
import { useMenus } from '@/context/useMenus'
import { Button } from '@/components/ui/button'

function UserRow({ target, roles, reload }) {
  const [roleId, setRoleId] = useState(target.roleId || '')
  const [open, setOpen] = useState(false), [confirmSelf, setConfirmSelf] = useState(false)
  const mutation = useAdminMutation(), { user, checkAuth } = useAuth(), { refreshMenus } = useMenus()
  function submit(event) {
    event.preventDefault()
    if (target.id === user.id) { setConfirmSelf(true); return }
    save()
  }
  function save() {
    void mutation.run(() => api.put(`/users/${target.id}/role`, { roleId }), async () => {
      setConfirmSelf(false); setOpen(false)
      // Target responses never replace the signed-in administrator's identity.
      if (target.id === user.id) { toast.success('Your role was updated.'); await checkAuth(); await refreshMenus() }
      else await reload()
    }, target.id === user.id ? '' : 'User role updated.')
  }
  return <tr><td>{target.username}{target.id === user.id ? ' (you)' : ''}</td><td>{target.email}</td><td>{target.role || 'Not configured'}</td><td>{target.isActive ? 'Active' : 'Inactive'}</td><td>
    <Button variant="outline" size="sm" disabled={mutation.busy} aria-label={`Edit role for ${target.username}`} onClick={() => { mutation.clearError(); setRoleId(target.roleId || ''); setOpen(true) }}>Edit Role</Button>
    <FormDialog open={open} onOpenChange={setOpen} title="Edit User Role" description={`Change the role for ${target.username} (${target.email}).`} busy={mutation.busy}>
    <form onSubmit={submit} className="dialog-form" aria-label={`Change role for ${target.username}`}>
      <p className="mb-3 text-sm text-muted-foreground">Current role: {target.role || 'Not configured'}</p>
      <label className="mb-2 block text-sm" htmlFor={`user-role-${target.id}`}>New role</label>
      <select id={`user-role-${target.id}`} aria-label={`Role for ${target.username}`} required value={roleId} disabled={mutation.busy} onChange={(e) => setRoleId(e.target.value)}>
        <option value="" disabled>Select role</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
      </select>{mutation.error && <p role="alert" className="field-error">{mutation.error}</p>}
      <div className="management-actions"><Button type="submit" disabled={mutation.busy || !roleId || roleId === target.roleId}>{mutation.busy ? 'Saving…' : 'Save role'}</Button><Button type="button" variant="outline" disabled={mutation.busy} onClick={() => setOpen(false)}>Cancel</Button></div>
    </form></FormDialog>
    <ConfirmDialog open={confirmSelf} onOpenChange={setConfirmSelf} title="Change your own role?" description="You may lose access to administration pages after saving." action="Change my role" busy={mutation.busy} error={mutation.error} onConfirm={save} />
  </td></tr>
}
export default function UserRoleAssignment() {
  const [page, setPage] = useState(1)
  const resource = useAdminResource(`/users?page=${page}&pageSize=10`), roleResource = useAdminResource('/roles')
  const data = resource.data
  return <ManagementLayout title="User Role Assignment" description="Assign one role to each existing user.">
    <ResourceStatus resource={resource} /><ResourceStatus resource={roleResource} />
    {data && roleResource.data && <><div className="management-panel table-scroll"><table><caption className="sr-only">User roles</caption><thead><tr><th>Username</th><th>Email</th><th>Current role</th><th>Status</th><th>Assign role</th></tr></thead><tbody>
      {data.users.map((target) => <UserRow key={`${target.id}:${target.roleId}`} target={target} roles={roleResource.data.roles} reload={resource.reload} />)}
      {!data.users.length && <tr><td colSpan={5}>No users found.</td></tr>}
    </tbody></table></div><div className="management-pagination"><span>Page {page} · {data.total} users</span>
      <Button variant="outline" disabled={page <= 1 || resource.loading} onClick={() => setPage((p) => p - 1)}>Previous</Button>
      <Button variant="outline" disabled={page * data.pageSize >= data.total || resource.loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
    </div></>}
  </ManagementLayout>
}
