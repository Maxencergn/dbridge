$ErrorActionPreference = "Stop"

$url = "https://github.com/Maxencergn/dbridge/releases/latest/download/dbridge-windows-x64.exe"
$dir = Join-Path $env:LOCALAPPDATA "dbridge"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$dest = Join-Path $dir "dbridge.exe"
Invoke-WebRequest -Uri $url -OutFile $dest

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not $userPath) { $userPath = "" }
$parts = $userPath.Split(";") | Where-Object { $_ -and ($_ -ne $dir) }
$updated = (@($parts) + $dir) -join ";"
if ($updated -ne $userPath) {
  [Environment]::SetEnvironmentVariable("Path", $updated, "User")
  Write-Host "Added $dir to your user PATH. Open a new terminal."
}

Write-Host "Installed $dest"
if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq "Arm64") {
  Write-Host "Windows on ARM runs the x64 build."
}
