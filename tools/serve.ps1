# ローカル確認用の簡易サーバー（Windows PowerShell）
# 使い方：stage-planner フォルダで
#   powershell -ExecutionPolicy Bypass -File tools\serve.ps1
# を実行し、ブラウザで http://localhost:8765/ を開く。Ctrl+C で終了。
param([int]$Port = 8765, [string]$Root = (Split-Path -Parent $PSScriptRoot))
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $Root on http://localhost:$Port/"
$mime = @{ '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8';
  '.json' = 'application/json'; '.webmanifest' = 'application/manifest+json'; '.png' = 'image/png'; '.jpg' = 'image/jpeg';
  '.svg' = 'image/svg+xml'; '.pdf' = 'application/pdf'; '.md' = 'text/plain; charset=utf-8' }
$rootFull = [IO.Path]::GetFullPath($Root)
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path.EndsWith('/')) { $path += 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $Root ($path.TrimStart('/') -replace '/', '\')))
    if ($file.StartsWith($rootFull) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ct = $mime[[IO.Path]::GetExtension($file).ToLower()]; if (-not $ct) { $ct = 'application/octet-stream' }
      $ctx.Response.ContentType = $ct
      $ctx.Response.Headers.Add('Cache-Control', 'no-cache')
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $ctx.Response.StatusCode = 404 }
  } catch { Write-Host $_ }
  $ctx.Response.Close()
}
