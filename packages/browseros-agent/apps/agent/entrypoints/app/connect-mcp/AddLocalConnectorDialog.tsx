import {
  isLoopbackHttpUrl,
  LOCAL_MCP_URL_ERROR,
} from '@browseros/shared/utils/local-url'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod/v3'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const formSchema = z.object({
  url: z
    .string()
    .url('Please enter a valid local MCP URL')
    .refine(isLoopbackHttpUrl, LOCAL_MCP_URL_ERROR),
  description: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

export interface LocalConnectorCheckResult {
  ok: boolean
  url: string
  toolCount: number
  tools: Array<{
    name: string
    description?: string
  }>
  error?: string
}

interface AddLocalConnectorDialogProps {
  open: boolean
  serverName: string
  initialUrl?: string
  initialDescription?: string
  onOpenChange: (open: boolean) => void
  onCheck?: (config: { url: string }) => Promise<LocalConnectorCheckResult>
  onSave: (config: {
    url: string
    description: string
    checkResult?: LocalConnectorCheckResult
  }) => void
}

export const AddLocalConnectorDialog: FC<AddLocalConnectorDialogProps> = ({
  open,
  serverName,
  initialUrl,
  initialDescription,
  onOpenChange,
  onCheck,
  onSave,
}) => {
  const [checkResult, setCheckResult] =
    useState<LocalConnectorCheckResult | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      url: initialUrl ?? '',
      description: initialDescription ?? '',
    },
  })

  useEffect(() => {
    if (!open) return
    setCheckResult(null)
    form.reset({
      url: initialUrl ?? '',
      description: initialDescription ?? '',
    })
  }, [form, initialDescription, initialUrl, open])

  const onSubmit = (values: FormValues) => {
    const url = values.url.trim()
    onSave({
      url,
      description: values.description ?? '',
      checkResult: checkResult?.url === url ? checkResult : undefined,
    })
    onOpenChange(false)
  }

  const handleCheck = async () => {
    if (!onCheck) return
    const valid = await form.trigger('url')
    if (!valid) return

    const url = form.getValues('url').trim()
    setIsChecking(true)
    setCheckResult(null)
    try {
      setCheckResult(await onCheck({ url }))
    } catch (error) {
      setCheckResult({
        ok: false,
        url,
        toolCount: 0,
        tools: [],
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect local MCP</DialogTitle>
          <DialogDescription>
            Attach a local MCP server URL for {serverName}. Authentication and
            secrets stay with that local server, not any upstream cloud service.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>MCP Server URL</FormLabel>
                  <FormDescription>
                    Use a local endpoint such as http://localhost:8000/sse.
                  </FormDescription>
                  <FormControl>
                    <Input
                      type="url"
                      placeholder="http://localhost:8000/sse"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What this local connector can do..."
                      rows={3}
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {checkResult && (
              <div
                className={`rounded-md border p-3 text-sm ${
                  checkResult.ok
                    ? 'border-green-500/30 bg-green-500/5 text-green-700'
                    : 'border-destructive/30 bg-destructive/5 text-destructive'
                }`}
              >
                <div className="mb-2 flex items-center gap-2 font-medium">
                  {checkResult.ok ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  {checkResult.ok
                    ? `${checkResult.toolCount} local tools found`
                    : 'Connector check failed'}
                </div>
                {checkResult.ok ? (
                  <div className="flex flex-wrap gap-1">
                    {checkResult.tools.slice(0, 8).map((tool) => (
                      <span
                        key={tool.name}
                        className="rounded bg-background px-2 py-0.5 text-xs"
                        title={tool.description}
                      >
                        {tool.name}
                      </span>
                    ))}
                    {checkResult.toolCount > 8 && (
                      <span className="rounded bg-background px-2 py-0.5 text-xs">
                        +{checkResult.toolCount - 8} more
                      </span>
                    )}
                  </div>
                ) : (
                  <p>{checkResult.error}</p>
                )}
              </div>
            )}

            <DialogFooter>
              {onCheck && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isChecking}
                  onClick={() => {
                    void handleCheck()
                  }}
                >
                  {isChecking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Check
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange-bright)]"
              >
                Save connector
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
