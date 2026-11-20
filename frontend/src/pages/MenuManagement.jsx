import { useState } from 'react'
import api from '@/lib/api'
import ManagementLayout from '@/components/layout/ManagementLayout'
import FormDialog from '@/components/FormDialog'
import ConfirmDialog from '@/components/ConfirmDialog'
import ResourceStatus from '@/components/ResourceStatus'
import { useAdminResource, useAdminMutation } from '@/hooks/useAdminApi'
import { useMenus } from '@/context/useMenus'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const blank = { menuName: '', menuPath: '', menuIcon: '', parentId: '', sortOrder: 0, isActive: true }
export default function MenuManagement() {
  const resource = useAdminResource('/menus'), mutation = useAdminMutation()
  const { refreshMenus } = useMenus()
  const [editing, setEditing] = useState(null), [form, setForm] = useState(blank), [validation, setValidation] = useState('')
  const [deleting, setDeleting] = useState(null)
  const menus = resource.data?.menus || []
  const begin = (menu) => { mutation.clearError(); setEditing(menu?.id || 'new'); setValidation(''); setForm(menu ? { ...blank, ...menu, menuPath: menu.menuPath ?? '', menuIcon: menu.menuIcon ?? '', parentId: menu.parentId ?? '' } : { ...blank }) }
  const change = (key, value) => setForm((old) => ({ ...old, [key]: value }))
  const descendants = new Set(editing && editing !== 'new' ? [editing] : [])
  let grew = true
  while (grew) { grew = false; menus.forEach((m) => { if (descendants.has(m.parentId) && !descendants.has(m.id)) { descendants.add(m.id); grew = true } }) }
  async function saved() { setEditing(null); await resource.reload(); await refreshMenus() }
  function submit(event) {
    event.preventDefault(); setValidation('')
    const order = Number(form.sortOrder)
    if (!form.menuName.trim() || !Number.isInteger(order) || order < 0 || order > 2147483647) { setValidation('Enter a menu name and a valid non-negative sort order.'); return }
    if (form.menuPath && !/^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(form.menuPath)) { setValidation('Use an internal path such as /reports without spaces, query or trailing slash.'); return }
    const body = { menuName: form.menuName.trim(), menuPath: form.menuPath || null, menuIcon: form.menuIcon || null, parentId: form.parentId || null, sortOrder: order, isActive: form.isActive }
    void mutation.run(() => editing === 'new' ? api.post('/menus', body) : api.put(`/menus/${editing}`, body), saved, 'Menu saved.')
  }
  return <ManagementLayout title="Menu Management" description="Manage menu details, hierarchy and availability.">
    <div className="management-actions"><Button onClick={() => begin(null)} disabled={mutation.busy}>Add menu</Button></div>
    <ResourceStatus resource={resource} />
    <FormDialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null) }} title={editing === 'new' ? 'Add menu' : 'Edit menu'} description="Set menu details and availability." busy={mutation.busy}>
      <form onSubmit={submit} className="dialog-form" aria-label={editing === 'new' ? 'Add menu' : 'Edit menu'}>
      <fieldset disabled={mutation.busy}>
        <div className="management-fields">
          <div><Label htmlFor="menu-name">Menu name</Label><Input id="menu-name" required maxLength={100} value={form.menuName} onChange={(e) => change('menuName', e.target.value)} /></div>
          <div><Label htmlFor="menu-path">Menu path (blank for group)</Label><Input id="menu-path" maxLength={255} placeholder="/reports" value={form.menuPath} onChange={(e) => change('menuPath', e.target.value)} /></div>
          <div><Label htmlFor="menu-icon">Icon name</Label><Input id="menu-icon" maxLength={64} placeholder="FileText" value={form.menuIcon} onChange={(e) => change('menuIcon', e.target.value)} /></div>
          <div><Label htmlFor="menu-parent">Parent menu</Label><select id="menu-parent" value={form.parentId} onChange={(e) => change('parentId', e.target.value)}><option value="">None (root menu)</option>{menus.filter((m) => !descendants.has(m.id)).map((m) => <option value={m.id} key={m.id}>{m.menuName}{!m.isActive ? ' (inactive)' : ''}</option>)}</select></div>
          <div><Label htmlFor="menu-order">Sort order</Label><Input id="menu-order" type="number" required min="0" max="2147483647" step="1" value={form.sortOrder} onChange={(e) => change('sortOrder', e.target.value)} /></div>
          <label className="management-check"><input type="checkbox" checked={form.isActive} onChange={(e) => change('isActive', e.target.checked)} /> Active</label>
        </div>
        {(validation || mutation.error) && <p role="alert" className="field-error">{validation || mutation.error}</p>}
        <div className="management-actions"><Button type="submit">{mutation.busy ? 'Saving…' : 'Save menu'}</Button><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button></div>
      </fieldset>
    </form></FormDialog>
    {!editing && !deleting && mutation.error && <p role="alert" className="field-error">{mutation.error}</p>}
    {resource.data && <div className="management-panel table-scroll"><table><caption className="sr-only">All menus</caption><thead><tr>{['Name', 'Path', 'Parent', 'Icon', 'Order', 'Status', 'Actions'].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>
      {menus.map((m) => <tr key={m.id}><td>{m.menuName}</td><td>{m.menuPath || 'Group'}</td><td>{menus.find((p) => p.id === m.parentId)?.menuName || '—'}</td><td>{m.menuIcon || '—'}</td><td>{m.sortOrder}</td><td>{m.isActive ? 'Active' : 'Inactive'}</td><td><div className="table-actions"><Button variant="outline" size="sm" disabled={mutation.busy} onClick={() => begin(m)} aria-label={`Edit ${m.menuName}`}>Edit</Button><Button variant="outline" size="sm" disabled={mutation.busy} onClick={() => { mutation.clearError(); setDeleting(m) }} aria-label={`Delete ${m.menuName}`}>Delete</Button></div></td></tr>)}
      {!menus.length && <tr><td colSpan={7}>No menus found.</td></tr>}
    </tbody></table></div>}
    <ConfirmDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }} title="Delete menu?" description={`Delete “${deleting?.menuName || ''}”? Child menus and role assignments must be removed first.`} action="Delete menu" destructive busy={mutation.busy} error={mutation.error}
      onConfirm={() => void mutation.run(() => api.delete(`/menus/${deleting.id}`), async () => { setDeleting(null); await saved() }, 'Menu deleted.')} />
  </ManagementLayout>
}
