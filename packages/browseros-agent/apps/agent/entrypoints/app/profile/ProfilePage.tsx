import { ArrowLeft, Database, KeyRound } from 'lucide-react'
import type { FC } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const ProfilePage: FC = () => {
  const navigate = useNavigate()

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="shrink-0"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex-1 pr-9 text-center">
            <CardTitle className="text-2xl">Local-only profile</CardTitle>
            <CardDescription>
              Cloud account profiles are disabled in this private PannamOS
              build.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <div className="mb-2 flex items-center gap-2 font-medium">
            <Database className="size-4" />
            Local browser state
          </div>
          <p className="text-muted-foreground">
            Chats, schedules, app catalog entries, and provider settings stay on
            this PC. Configure model providers separately; no cloud account
            login is required.
          </p>
        </div>

        <Button className="w-full" onClick={() => navigate('/settings/ai')}>
          <KeyRound className="size-4" />
          Configure model providers
        </Button>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => navigate('/home')}
        >
          Back to PannamOS
        </Button>
      </CardContent>
    </Card>
  )
}
