# ══════════════════════════════════════════════════════════════════
#  작업 스케줄러가 5분마다 부르는 실행기.
#  오늘 접수가 열리는 강좌가 없으면 아무 일도 하지 않고 끝납니다.
# ══════════════════════════════════════════════════════════════════

$ErrorActionPreference = 'Stop'

# Node 는 UTF-8 로 출력하는데 구형 PowerShell 은 콘솔 코드페이지로 읽어 깨집니다
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$crawler = $PSScriptRoot
$site    = Split-Path -Parent $crawler
$repo    = Split-Path -Parent $site
$log     = Join-Path $crawler 'last-observe.log'

function Say([string]$m) {
  $line = "$(Get-Date -Format 'HH:mm:ss')  $m"
  Write-Output $line
  Add-Content -Path $log -Value $line -Encoding utf8
}

Set-Location $repo

try {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) {
    foreach ($p in @(
      (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
      (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
    )) { if ($p -and (Test-Path $p)) { $node = $p; break } }
  }
  if (-not $node) { throw 'Node.js 를 찾을 수 없습니다' }

  Push-Location $site
  $out = & $node 'crawler/observe.js' 2>&1
  Pop-Location

  # 관측할 게 없으면 기록조차 남기지 않습니다 — 하루 60번 도는 작업이라
  # 매번 적으면 기록이 잡음으로 가득 찹니다.
  if ($out -match '관측 시작') {
    Set-Content -Path $log -Value "실행 $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -Encoding utf8
    $out | ForEach-Object { Say "  $_" }
  }
}
catch {
  Say "실패: $_"
  exit 1
}
