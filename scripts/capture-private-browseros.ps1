param(
  [ValidateSet("All", "Window", "Pages")]
  [string]$Mode = "All",
  [int]$CdpPort = 9005,
  [string]$OutputDir = (Join-Path $env:TEMP "codex-pannamos-screenshots"),
  [string]$TargetUrlPattern = ""
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runtimeRoot = Join-Path $env:LOCALAPPDATA "PannamOS-Private"
$profileDir = Join-Path $runtimeRoot "profile"

function Sanitize-FileName {
  param([string]$Value)

  $invalid = [System.IO.Path]::GetInvalidFileNameChars()
  $clean = $Value
  foreach ($char in $invalid) {
    $clean = $clean.Replace($char, "-")
  }

  $clean = $clean -replace "\s+", "-"
  $clean = $clean.Trim("-")
  if ($clean.Length -gt 80) {
    $clean = $clean.Substring(0, 80)
  }
  if ([string]::IsNullOrWhiteSpace($clean)) {
    return "page"
  }
  return $clean
}

function Get-PrivateBrowserProcessIds {
  $processes = Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq "chrome.exe" -and
        $_.CommandLine -and
      (
        $_.CommandLine -like "*--user-data-dir=$profileDir*" -or
        $_.CommandLine -like "*PannamOS-Private*profile*"
      )
    }

  return @($processes | Select-Object -ExpandProperty ProcessId)
}

function Capture-PrivateBrowserWindow {
  $processIds = Get-PrivateBrowserProcessIds
  if ($processIds.Count -eq 0) {
    Write-Warning "No private PannamOS chrome.exe process was found for profile $profileDir"
    return $null
  }

  Add-Type -AssemblyName System.Drawing
  Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;

public static class PannamOSWindowCapture
{
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public sealed class WindowInfo
    {
        public IntPtr Hwnd;
        public int ProcessId;
        public string Title;
        public int Left;
        public int Top;
        public int Width;
        public int Height;
        public int Area { get { return Width * Height; } }
    }

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);

    public static WindowInfo[] GetVisibleWindowsForProcessIds(int[] processIds)
    {
        var wanted = new HashSet<int>(processIds);
        var windows = new List<WindowInfo>();

        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam)
        {
            if (!IsWindowVisible(hWnd))
            {
                return true;
            }

            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            if (!wanted.Contains((int)pid))
            {
                return true;
            }

            RECT rect;
            int dwmResult = DwmGetWindowAttribute(hWnd, 9, out rect, Marshal.SizeOf(typeof(RECT)));
            if (dwmResult != 0)
            {
                GetWindowRect(hWnd, out rect);
            }

            int width = rect.Right - rect.Left;
            int height = rect.Bottom - rect.Top;
            if (width < 100 || height < 100)
            {
                return true;
            }

            var titleBuilder = new StringBuilder(512);
            GetWindowText(hWnd, titleBuilder, titleBuilder.Capacity);

            windows.Add(new WindowInfo {
                Hwnd = hWnd,
                ProcessId = (int)pid,
                Title = titleBuilder.ToString(),
                Left = rect.Left,
                Top = rect.Top,
                Width = width,
                Height = height
            });

            return true;
        }, IntPtr.Zero);

        return windows.ToArray();
    }

    public static void CaptureWindow(WindowInfo window, string outputPath)
    {
        using (var bitmap = new Bitmap(window.Width, window.Height, PixelFormat.Format32bppArgb))
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.CopyFromScreen(window.Left, window.Top, 0, 0, new Size(window.Width, window.Height), CopyPixelOperation.SourceCopy);
            bitmap.Save(outputPath, ImageFormat.Png);
        }
    }
}
"@ -ReferencedAssemblies @("System.Drawing.dll", "System.dll")

  $windows = [PannamOSWindowCapture]::GetVisibleWindowsForProcessIds([int[]]$processIds) |
    Sort-Object Area -Descending

  if (!$windows -or $windows.Count -eq 0) {
    Write-Warning "Private PannamOS is running, but no visible top-level window was found."
    return $null
  }

  $window = $windows[0]
  $path = Join-Path $OutputDir "pannamos-window-$timestamp.png"
  [PannamOSWindowCapture]::CaptureWindow($window, $path)

  [pscustomobject]@{
    Type = "Window"
    Path = $path
    Title = $window.Title
    ProcessId = $window.ProcessId
    Left = $window.Left
    Top = $window.Top
    Width = $window.Width
    Height = $window.Height
  }
}

function Receive-CdpMessage {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Client,
    [int]$TimeoutMs = 10000
  )

  $buffer = New-Object byte[] 65536
  $stream = [System.IO.MemoryStream]::new()
  $cts = [System.Threading.CancellationTokenSource]::new($TimeoutMs)

  try {
    do {
      $segment = [ArraySegment[byte]]::new($buffer)
      $result = $Client.ReceiveAsync($segment, $cts.Token).GetAwaiter().GetResult()
      if ($result.Count -gt 0) {
        $stream.Write($buffer, 0, $result.Count)
      }
    } while (!$result.EndOfMessage)

    $text = [System.Text.Encoding]::UTF8.GetString($stream.ToArray())
    return $text | ConvertFrom-Json
  }
  finally {
    $stream.Dispose()
    $cts.Dispose()
  }
}

function Invoke-CdpMethod {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Client,
    [ref]$NextId,
    [string]$Method,
    [hashtable]$Params = @{}
  )

  $id = $NextId.Value
  $NextId.Value = $NextId.Value + 1

  $payload = @{
    id = $id
    method = $Method
    params = $Params
  } | ConvertTo-Json -Depth 20 -Compress

  $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
  $segment = [ArraySegment[byte]]::new($bytes)
  $null = $Client.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None).GetAwaiter().GetResult()

  do {
    $message = Receive-CdpMessage -Client $Client
  } while ($message.id -ne $id)

  if ($message.error) {
    throw "$Method failed: $($message.error.message)"
  }

  return $message.result
}

function Capture-CdpPages {
  $targets = Invoke-RestMethod "http://127.0.0.1:$CdpPort/json/list"
  $pages = @($targets | Where-Object {
      $_.type -eq "page" -and
      $_.webSocketDebuggerUrl -and
      ($TargetUrlPattern -eq "" -or $_.url -like "*$TargetUrlPattern*")
    })

  if ($pages.Count -eq 0) {
    Write-Warning "No CDP page targets found on port $CdpPort."
    return @()
  }

  $results = @()

  foreach ($page in $pages) {
    $client = [System.Net.WebSockets.ClientWebSocket]::new()
    try {
      $client.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [System.Threading.CancellationToken]::None).GetAwaiter().GetResult()
      $nextId = 1

      Invoke-CdpMethod -Client $client -NextId ([ref]$nextId) -Method "Page.enable" | Out-Null
      $screenshot = Invoke-CdpMethod -Client $client -NextId ([ref]$nextId) -Method "Page.captureScreenshot" -Params @{
        format = "png"
        fromSurface = $true
        captureBeyondViewport = $true
      }

      $label = Sanitize-FileName -Value "$($page.title)-$($page.url)"
      $path = Join-Path $OutputDir "pannamos-page-$timestamp-$label.png"
      [System.IO.File]::WriteAllBytes($path, [Convert]::FromBase64String($screenshot.data))

      $results += [pscustomobject]@{
        Type = "Page"
        Path = $path
        Title = $page.title
        Url = $page.url
      }
    }
    catch {
      $results += [pscustomobject]@{
        Type = "Page"
        Path = $null
        Title = $page.title
        Url = $page.url
        Error = $_.Exception.Message
      }
    }
    finally {
      if ($client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $null = $client.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [System.Threading.CancellationToken]::None).GetAwaiter().GetResult()
      }
      $client.Dispose()
    }
  }

  return $results
}

$captures = @()

if ($Mode -eq "All" -or $Mode -eq "Window") {
  $windowCapture = Capture-PrivateBrowserWindow
  if ($windowCapture) {
    $captures += $windowCapture
  }
}

if ($Mode -eq "All" -or $Mode -eq "Pages") {
  $captures += Capture-CdpPages
}

$captures | Format-Table -AutoSize
