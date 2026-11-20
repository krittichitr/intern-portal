import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertCircle, Camera, LoaderCircle, Upload } from 'lucide-react'
import FormDialog from '@/components/FormDialog'
import { useAuth } from '@/context/useAuth'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
const maxBytes = 2 * 1024 * 1024

export default function AvatarUpload({ disabled = false, onUploadingChange }) {
  const { uploadAvatar, isLoggingOut } = useAuth()
  const input = useRef(null)
  const pending = useRef(false)
  const [selection, setSelection] = useState(null)
  const [open, setOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [error, setError] = useState('')
  const locked = disabled || isUploading || isLoggingOut

  useEffect(() => {
    return () => {
      if (selection) URL.revokeObjectURL(selection.url)
    }
  }, [selection])

  function selectPhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = '' // Allow selecting the same file again after a failure.
    if (!file || pending.current) return
    setOpen(true)
    setPreviewFailed(false)
    setError('')
    if (!allowedTypes.includes(file.type) || !file.size || file.size > maxBytes) {
      setSelection(null)
      setError(file.size > maxBytes ? 'Choose an image no larger than 2 MiB.' : 'Choose a JPG, PNG or WebP image.')
      return
    }
    setSelection({ file, url: URL.createObjectURL(file) })
  }

  function cancelPhoto() {
    if (pending.current) return
    setOpen(false)
    setSelection(null)
    setPreviewFailed(false)
    setError('')
  }

  async function uploadPhoto() {
    if (!selection || pending.current || locked || previewFailed) return
    pending.current = true
    setIsUploading(true)
    onUploadingChange?.(true)
    setError('')
    try {
      await uploadAvatar(selection.file)
      setSelection(null)
      setOpen(false)
      toast.success('Profile photo updated successfully.', { id: 'avatar-upload' })
    } catch (failure) {
      const status = failure.response?.status
      toast.error(status === 400 ? 'This image could not be accepted. Choose a valid JPG, PNG or WebP image.'
        : status === 401 ? 'Your session could not be verified. Sign in again before uploading.'
          : status === 413 ? 'The image is too large. Choose one no larger than 2 MiB.'
            : !failure.response && failure.isAxiosError ? 'Couldn’t connect to the server. Your photo is ready to retry.'
              : 'Couldn’t upload your photo. Please try again.', { id: 'avatar-upload' })
    } finally {
      pending.current = false
      setIsUploading(false)
      onUploadingChange?.(false)
    }
  }

  return (
    <section aria-label="Profile photo" aria-busy={isUploading} className="mb-6 space-y-3">
      <input ref={input} type="file" accept={allowedTypes.join(',')} aria-label="Choose profile photo" className="sr-only" disabled={locked} onChange={selectPhoto} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={locked} onClick={() => { setOpen(true); input.current?.click() }}><Camera /> Change Photo</Button>
        <p className="text-xs text-muted-foreground">JPG, PNG or WebP · Up to 2 MiB</p>
      </div>
      <FormDialog open={open} onOpenChange={(value) => { if (!value) cancelPhoto() }} title="Change Photo" description="Choose a JPG, PNG or WebP image up to 2 MiB." busy={isUploading || isLoggingOut}>
        <Button type="button" variant="outline" disabled={locked} onClick={() => input.current?.click()}>Choose image</Button>
      {selection && (
        <div className="space-y-3">
          {!previewFailed && <img src={selection.url} alt="Selected photo preview" className="size-24 rounded-xl border object-cover" onError={() => {
            setPreviewFailed(true)
            setError('This file could not be previewed. Choose a valid image.')
          }} />}
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={uploadPhoto} disabled={locked || previewFailed}>{isUploading ? <LoaderCircle className="animate-spin" /> : <Upload />}{isUploading ? 'Uploading…' : 'Upload Photo'}</Button>
            <Button type="button" variant="outline" aria-label="Cancel photo selection" onClick={cancelPhoto} disabled={locked}>Cancel</Button>
          </div>
        </div>
      )}
      {!selection && <Button type="button" variant="outline" disabled={locked} onClick={cancelPhoto}>Cancel</Button>}
      {error && <Alert variant="destructive"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert>}
      </FormDialog>
    </section>
  )
}
