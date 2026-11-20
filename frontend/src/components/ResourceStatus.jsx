import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export default function ResourceStatus({ resource }) {
  return <>{resource.loading && <p role="status" className="my-4">Loading…</p>}
    {resource.error && <Alert variant="destructive" className="my-4"><AlertDescription>{resource.error}<Button variant="outline" className="ml-3" onClick={() => void resource.reload()}>Retry</Button></AlertDescription></Alert>}</>
}
