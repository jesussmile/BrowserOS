import { ChevronDown, User } from 'lucide-react'
import type { FC } from 'react'
import { useNavigate } from 'react-router'
import ProductLogo from '@/assets/product_logo.svg'
import { ThemeToggle } from '@/components/elements/theme-toggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/lib/workspace/use-workspace'

interface SidebarBrandingProps {
  expanded?: boolean
}

export const SidebarBranding: FC<SidebarBrandingProps> = ({
  expanded = true,
}) => {
  const { selectedFolder } = useWorkspace()
  const navigate = useNavigate()

  const displayName = selectedFolder?.name || 'PannamOS'

  return (
    <div className="flex h-14 items-center justify-between border-b px-2">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none',
              expanded ? 'pr-3' : '',
            )}
          >
            <img src={ProductLogo} alt="PannamOS" className="size-8" />
            <div
              className={cn(
                'flex min-w-0 flex-col gap-0.5 leading-none transition-opacity duration-200',
                expanded ? 'opacity-100' : 'hidden',
              )}
            >
              <div className="flex items-center gap-1">
                <span className="truncate font-semibold">{displayName}</span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              </div>
              <span className="truncate font-medium text-primary text-xs">
                Local
              </span>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={expanded ? 'bottom' : 'right'}
          align="start"
          className="w-56"
        >
          <DropdownMenuItem onClick={() => navigate('/profile')}>
            <User className="mr-2 size-4" />
            Local profile
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div
        className={cn(
          'shrink-0 transition-opacity duration-200',
          expanded ? 'opacity-100' : 'hidden',
        )}
      >
        <ThemeToggle className="h-8 w-8" iconClassName="h-4 w-4" />
      </div>
    </div>
  )
}
