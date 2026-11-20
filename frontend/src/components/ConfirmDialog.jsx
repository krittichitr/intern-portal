import { useRef } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

export default function ConfirmDialog({ open, onOpenChange, title, description, onConfirm, busy = false, error, action = 'Confirm', destructive = false }) {
  const previousFocus = useRef(null)
  return <AlertDialog open={open} onOpenChange={(value) => { if (!busy) onOpenChange(value) }}>
    <AlertDialogContent onOpenAutoFocus={() => { previousFocus.current = document.activeElement }}
      onCloseAutoFocus={(event) => {
        event.preventDefault()
        if (previousFocus.current?.isConnected) previousFocus.current.focus()
        else document.getElementById('main-content')?.focus()
      }} onEscapeKeyDown={(event) => { if (busy) event.preventDefault() }}>
      <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader>
      {error && <p role="alert" className="field-error">{error}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
        <AlertDialogAction variant={destructive ? 'destructive' : 'default'} disabled={busy} onClick={(event) => { event.preventDefault(); onConfirm() }}>{busy ? 'Saving…' : action}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
