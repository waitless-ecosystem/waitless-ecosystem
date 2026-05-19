$Port = 8000
$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add("http://localhost:$Port/")
$Listener.Start()
Write-Host "HTTP Server started on http://localhost:$Port"

try {
    while ($Listener.IsListening) {
        try {
            $Context = $Listener.GetContext()
            $Request = $Context.Request
            $Response = $Context.Response

            # Get the requested file path
            $FilePath = "$PSScriptRoot$($Request.Url.LocalPath)"

            # Default to index.html if directory requested
            if ([System.IO.Path]::GetExtension($FilePath) -eq "" -and (Test-Path $FilePath -PathType Container)) {
                $FilePath = [System.IO.Path]::Combine($FilePath, "index.html")
            }

            # Set response content type based on file extension
            $Extension = [System.IO.Path]::GetExtension($FilePath).ToLower()
            $ContentType = switch ($Extension) {
                ".html" { "text/html; charset=utf-8" }
                ".js" { "application/javascript; charset=utf-8" }
                ".css" { "text/css; charset=utf-8" }
                ".json" { "application/json; charset=utf-8" }
                ".png" { "image/png" }
                ".jpg" { "image/jpeg" }
                ".gif" { "image/gif" }
                ".svg" { "image/svg+xml" }
                default { "text/plain; charset=utf-8" }
            }

            if (Test-Path $FilePath) {
                $FileContent = [System.IO.File]::ReadAllBytes($FilePath)
                $Response.ContentType = $ContentType
                $Response.ContentLength64 = $FileContent.Length
                try {
                    $Response.OutputStream.Write($FileContent, 0, $FileContent.Length)
                } catch {
                    # Client disconnected mid-response; ignore.
                }
            } else {
                $Body = [System.Text.Encoding]::UTF8.GetBytes("404 - File not found")
                $Response.StatusCode = 404
                $Response.StatusDescription = "Not Found"
                $Response.ContentType = "text/plain; charset=utf-8"
                $Response.ContentLength64 = $Body.Length
                try {
                    $Response.OutputStream.Write($Body, 0, $Body.Length)
                } catch {
                    # Ignore write errors.
                }
            }
        } catch {
            # Keep the server alive on transient listener/network issues.
        } finally {
            try { $Response.OutputStream.Close() } catch {}
        }
    }
} finally {
    $Listener.Stop()
    $Listener.Close()
}
