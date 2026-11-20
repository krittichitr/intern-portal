import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { resolveAvatarUrl } from '@/lib/api'

export default function UserAvatar({ username, avatarUrl, className }) {
  const initials = username.trim().split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  const src = resolveAvatarUrl(avatarUrl)
  return (
    <Avatar className={cn('size-10 shrink-0 rounded-xl', className)}>
      {src && <AvatarImage src={src} alt={`${username} profile picture`} />}
      <AvatarFallback className="rounded-[inherit] bg-blue-50 font-semibold text-blue-700">
        {initials || 'U'}
      </AvatarFallback>
    </Avatar>
  )
}
