# ══════════════════════════════════════════════════════════════════
#  우리동네 컬처픽_포항 — 이 PC에서 도는 강좌 수집
# ------------------------------------------------------------------
#  포항시립도서관은 웹 방화벽이 해외 IP를 막아서 깃허브 서버에서는
#  긁을 수 없습니다. 한국에 있는 이 PC가 대신 긁어 저장소에 올립니다.
#
#  하루 한 번 윈도우 작업 스케줄러가 이 파일을 실행합니다.
#  손으로 확인하려면 그냥 실행해도 됩니다:
#      pwsh -File pohang-ontime\crawler\run-local.ps1
#
#  결과는 같은 폴더의 last-local-run.log 에 남습니다.
# ══════════════════════════════════════════════════════════════════

$ErrorActionPreference = 'Stop'

# Node 는 UTF-8 로 출력하는데 구형 PowerShell 은 콘솔 코드페이지(CP949)로 읽어
# 한글이 깨집니다. 기록을 읽을 수 있게 UTF-8 로 맞춰 둡니다.
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$crawler = $PSScriptRoot
$site    = Split-Path -Parent $crawler                    # ...\pohang-ontime
$repo    = Split-Path -Parent $site                       # ...\p_landing_p
$log     = Join-Path $crawler 'last-local-run.log'

function Say([string]$m) {
  $line = "$(Get-Date -Format 'HH:mm:ss')  $m"
  Write-Output $line
  Add-Content -Path $log -Value $line -Encoding utf8
}

Set-Content -Path $log -Value "실행 $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -Encoding utf8
Set-Location $repo

try {
  # 설치 직후에는 실행 중인 프로세스의 PATH 가 아직 낡아 있어 node 를 못 찾습니다.
  # 그래서 표준 설치 위치까지 직접 살펴봅니다.
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) {
    foreach ($p in @(
      (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
      (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
      (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
    )) {
      if ($p -and (Test-Path $p)) { $node = $p; break }
    }
  }
  if (-not $node) { throw 'Node.js 를 찾을 수 없습니다. winget install OpenJS.NodeJS.LTS 로 설치하세요.' }
  Say "node: $node"

  # 깃허브 액션도 같은 파일을 고치므로, 먼저 받아와 어긋남을 없앱니다
  Say '저장소 갱신'
  # --autostash: 직전 실행이 중간에 끊겨 남은 변경이 있어도 멈추지 않습니다
  git pull --rebase --autostash --quiet origin main 2>&1 | ForEach-Object { Say "  $_" }

  Say '수집 시작'
  Push-Location $site
  & $node 'crawler/crawl.js' 2>&1 | ForEach-Object { Say "  $_" }
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { throw "수집이 실패했습니다 (종료 코드 $code)" }

  $changed = git status --porcelain -- 'pohang-ontime/data' 'pohang-ontime/index.html'
  if (-not $changed) { Say '바뀐 내용 없음 — 올리지 않습니다'; exit 0 }

  git add 'pohang-ontime/data' 'pohang-ontime/index.html'
  git commit -q -m "Refresh program data from Pohang ($(Get-Date -Format 'yyyy-MM-dd HH:mm') KST)"
  git push --quiet origin main
  Say '올렸습니다 — 잠시 뒤 사이트에 반영됩니다'
}
catch {
  Say "실패: $_"
  exit 1
}
