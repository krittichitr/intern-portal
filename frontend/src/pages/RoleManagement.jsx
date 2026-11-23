import { useState } from 'react'
import api from '@/lib/api'
import ManagementLayout from '@/components/layout/ManagementLayout'
import FormDialog from '@/components/FormDialog'
import ConfirmDialog from '@/components/ConfirmDialog'
import ResourceStatus from '@/components/ResourceStatus'
import { useAdminResource, useAdminMutation } from '@/hooks/useAdminApi'
import { useMenus } from '@/context/useMenus'
import { useAuth } from '@/context/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function AssignmentForm({ role, initialIds, menus, reload, onClose, mutation }) {
  const [ids, setIds] = useState(initialIds)
  const { refreshMenus } = useMenus(), { user } = useAuth()
  function submit(event) {
    event.preventDefault()
    void mutation.run(() => api.put(`/roles/${role.id}/menus`, { menuIds: ids }), async () => {
      await reload(); if (role.code === user.role) await refreshMenus(); onClose()
    }, 'Menu permissions saved.')
  }
  const depth = (menu) => { const seen = new Set(); let parent = menu.parentId; while (parent && !seen.has(parent)) { seen.add(parent); parent = menus.find((m) => m.id === parent)?.parentId } return seen.size }
  return <form onSubmit={submit} aria-label="Assign menus" className="dialog-form">

    <fieldset disabled={mutation.busy}>
      <div className="assignment-list">{menus.map((m) => <label className="management-check" key={m.id} style={{ paddingInlineStart: `${depth(m) * 18}px` }}>
        <input type="checkbox" checked={ids.includes(m.id)} onChange={(event) => setIds((old) => event.target.checked ? [...old, m.id] : old.filter((id) => id !== m.id))} />
        <span>{m.menuName} <small>{m.menuPath || '(group)'}{!m.isActive ? ' · Inactive' : ''}</small></span>
      </label>)}</div>
      {mutation.error && <p role="alert" className="field-error">{mutation.error}</p>}
      <div className="management-actions"><Button type="submit">{mutation.busy ? 'Saving…' : 'Save permissions'}</Button><Button type="button" variant="outline" onClick={onClose}>Close</Button></div>
    </fieldset>
  </form>
}
function AssignedMenus({ role, menus, onClose }) {
  const resource = useAdminResource(`/roles/${role.id}/menus`), mutation = useAdminMutation()
  return <FormDialog open onOpenChange={(open) => { if (!open) onClose() }} title={`Menus for ${role.name} (${role.code})`} description="Select each menu explicitly. Selecting a parent does not grant its children." busy={mutation.busy}><ResourceStatus resource={resource} />{resource.data && <AssignmentForm mutation={mutation} key={`${role.id}:${resource.data.menuIds.join(',')}`} role={role} initialIds={resource.data.menuIds} menus={menus} reload={resource.reload} onClose={onClose} />}</FormDialog>
}
export default function RoleManagement() {
  const resource = useAdminResource('/roles'), menuResource = useAdminResource('/menus'), mutation = useAdminMutation()
  const [editing, setEditing] = useState(null), [form, setForm] = useState({ code: '', name: '' }), [selected, setSelected] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const roles = resource.data?.roles || []
  function begin(role) { mutation.clearError(); setEditing(role?.id || 'new'); setForm(role ? { code: role.code, name: role.name } : { code: '', name: '' }) }
  function submit(event) {
    event.preventDefault()
    const body = { name: form.name.trim(), ...(editing === 'new' ? { code: form.code.trim().toUpperCase() } : {}) }
    void mutation.run(() => editing === 'new' ? api.post('/roles', body) : api.put(`/roles/${editing}`, body), async () => { setEditing(null); await resource.reload() }, 'Role saved.')
  }
  const role = roles.find((r) => r.id === selected)
  return <ManagementLayout title="Role Management" description="Manage roles and the menus each role may access.">
    <div className="management-actions"><Button disabled={mutation.busy} onClick={() => begin(null)}>Add role</Button></div>
    <ResourceStatus resource={resource} /><ResourceStatus resource={menuResource} />
    <p className="mb-4 text-sm text-muted-foreground">ADMIN cannot be deleted. Other roles can be deleted only when no users, including inactive users, are assigned.</p>
    <FormDialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null) }} title={editing === 'new' ? 'Add role' : 'Edit role'} description="Set the role name. A role code cannot be changed after creation." busy={mutation.busy}>
      <form className="dialog-form" aria-label={editing === 'new' ? 'Add role' : 'Edit role'} onSubmit={submit}>
      <fieldset disabled={mutation.busy}><div className="management-fields">
        <div><Label htmlFor="role-code">Role code</Label><Input id="role-code" required maxLength={20} pattern="[A-Za-z][A-Za-z0-9_]{0,19}" value={form.code} disabled={editing !== 'new'} onChange={(e) => setForm((old) => ({ ...old, code: e.target.value }))} /></div>
        <div><Label htmlFor="role-name">Role name</Label><Input id="role-name" required maxLength={100} value={form.name} onChange={(e) => setForm((old) => ({ ...old, name: e.target.value }))} /></div>
      </div>{mutation.error && <p role="alert" className="field-error">{mutation.error}</p>}<div className="management-actions"><Button type="submit">{mutation.busy ? 'Saving…' : 'Save role'}</Button><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button></div></fieldset>
    </form></FormDialog>
    {!editing && !deleting && mutation.error && <p role="alert" className="field-error">{mutation.error}</p>}
    {resource.data && <div className="management-panel table-scroll"><table><caption className="sr-only">All roles</caption><thead><tr><th>Code</th><th>Name</th><th>Actions</th></tr></thead><tbody>
      {roles.map((r) => <tr key={r.id}><td>{r.code}</td><td>{r.name}</td><td><div className="table-actions">
        <Button variant="outline" size="sm" disabled={mutation.busy} onClick={() => begin(r)} aria-label={`Edit ${r.code}`}>Edit</Button>
        <Button variant="outline" size="sm" disabled={!menuResource.data || mutation.busy} onClick={() => setSelected(r.id)} aria-label={`Assign menus to ${r.code}`}>Assign menus</Button>
        <Button variant="outline" size="sm" disabled={mutation.busy} aria-label={`Delete ${r.code}`} onClick={() => { mutation.clearError(); setDeleting(r) }}>Delete</Button>
      </div></td></tr>)}{!roles.length && <tr><td colSpan={3}>No roles found.</td></tr>}
    </tbody></table></div>}
    {role && menuResource.data && <AssignedMenus key={role.id} role={role} menus={menuResource.data.menus} onClose={() => setSelected(null)} />}
    <ConfirmDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }} title="Delete role?" description={`Delete “${deleting?.name || ''}”? Roles with assigned users cannot be deleted.`} action="Delete role" destructive busy={mutation.busy} error={mutation.error}
      onConfirm={() => void mutation.run(() => api.delete(`/roles/${deleting.id}`), async () => { setDeleting(null); setSelected(null); await resource.reload() }, 'Role deleted.')} />
  </ManagementLayout>
}
