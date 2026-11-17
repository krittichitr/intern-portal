import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export default function UserAvatar({ username, className }) {
  const initials = username.trim().split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  return (
    <Avatar className={cn('size-10 shrink-0 rounded-xl', className)}>
      <AvatarFallback className="rounded-[inherit] bg-blue-50 font-semibold text-blue-700">
        {initials || 'U'}
      </AvatarFallback>
    </Avatar>
  )
}
