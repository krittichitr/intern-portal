import { useRef } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export default function FormDialog({ open, onOpenChange, title, description, busy = false, children }) {
  const previousFocus = useRef(null)
  return <Dialog open={open} onOpenChange={(value) => { if (!busy) onOpenChange(value) }}>
    <DialogContent className="app-form-dialog max-h-[85svh] overflow-y-auto sm:max-w-2xl" showCloseButton={!busy}
      onOpenAutoFocus={() => { previousFocus.current = document.activeElement }}
      onCloseAutoFocus={(event) => {
        event.preventDefault()
        if (previousFocus.current?.isConnected) previousFocus.current.focus()
        else document.getElementById('main-content')?.focus()
      }}
      onEscapeKeyDown={(event) => { if (busy) event.preventDefault() }}
      onInteractOutside={(event) => { if (busy) event.preventDefault() }}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      {children}
    </DialogContent>
  </Dialog>
}
