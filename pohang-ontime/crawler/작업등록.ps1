# ══════════════════════════════════════════════════════════════════
#  한 번만 실행하면 됩니다.
#  이 PC에 「매일 오전 9시 10분에 강좌를 수집한다」는 예약을 걸어둡니다.
#
#      pwsh -File pohang-ontime\crawler\작업등록.ps1
#
#  왜 9시 10분인가: 도서관 접수가 오전 10시에 열리는 경우가 많아
#  그 전에 최신 상태를 만들어 둡니다.
#
#  PC가 꺼져 있어 그 시각을 놓치면, 켜진 뒤 곧바로 한 번 돕니다.
#  없애려면:  Unregister-ScheduledTask -TaskName '컬처픽 강좌 수집'
# ══════════════════════════════════════════════════════════════════

$ErrorActionPreference = 'Stop'

$script = Join-Path $PSScriptRoot 'run-local.ps1'
if (-not (Test-Path $script)) { throw "run-local.ps1 을 찾을 수 없습니다: $script" }

$name = '컬처픽 강좌 수집'

$action = New-ScheduledTaskAction `
  -Execute 'pwsh.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""

$trigger = New-ScheduledTaskTrigger -Daily -At '09:10'

# StartWhenAvailable: 껐다 켠 뒤에도 놓친 실행을 따라잡습니다
# DontStopIfGoingOnBatteries: 노트북이 배터리로 가도 멈추지 않습니다
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false
}

Register-ScheduledTask `
  -TaskName $name `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description '포항 무료 강좌 정보를 기관 홈페이지에서 받아 사이트에 반영합니다.' | Out-Null

Write-Output "등록했습니다 — 매일 09:10"
Write-Output "지금 한 번 돌려보려면:  Start-ScheduledTask -TaskName '$name'"
