import { Layers3 } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Brand({ className, light = false }) {
  return (
    <div className={cn('brand', light && 'brand-light', className)} aria-label="Intern Portal">
      <Layers3 size={24} aria-hidden="true" />
      <span>Intern Portal</span>
    </div>
  )
}
