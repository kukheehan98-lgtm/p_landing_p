# ══════════════════════════════════════════════════════════════════
#  접수 마감 속도 관측 — 한 번만 실행하면 됩니다.
#
#      pwsh -File pohang-ontime\crawler\관측등록.ps1
#
#  오전 8시부터 오후 1시까지 5분마다 깨어나, 그 사이에 접수가 열리는
#  강좌가 있으면 그 시각에 맞춰 정원 변화를 연속으로 찍습니다.
#  열리는 강좌가 없으면 아무것도 하지 않고 바로 끝납니다.
#
#  왜 필요한가: 「선착순이라 알림이 없으면 못 잡는다」가 이 서비스의 전제인데,
#  실제로 몇 분 만에 차는지 우리는 모릅니다. 30초면 알림을 접수 5분 전에
#  보내야 하고, 사흘 걸리면 메시지를 다시 짜야 합니다.
#
#  없애려면:  Unregister-ScheduledTask -TaskName '컬처픽 접수 관측'
# ══════════════════════════════════════════════════════════════════

$ErrorActionPreference = 'Stop'

$script = Join-Path $PSScriptRoot 'run-observe.ps1'
if (-not (Test-Path $script)) { throw "run-observe.ps1 을 찾을 수 없습니다: $script" }

$name = '컬처픽 접수 관측'

# PowerShell 7 은 스토어 앱이라 작업 스케줄러가 경로를 못 찾습니다 (0x80070002)
$shell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

$action = New-ScheduledTaskAction `
  -Execute $shell `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""

# 08:00 부터 5분 간격으로 5시간 (13:00 까지)
$trigger = New-ScheduledTaskTrigger -Daily -At '08:00'
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At '08:00' `
  -RepetitionInterval (New-TimeSpan -Minutes 5) `
  -RepetitionDuration (New-TimeSpan -Hours 5)).Repetition

# 관측은 최대 두 시간 남짓 이어집니다
$settings = New-ScheduledTaskSettingsSet `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 3)

if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false
}

Register-ScheduledTask `
  -TaskName $name `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description '접수가 열리는 순간 정원이 차는 속도를 기록합니다.' | Out-Null

Write-Output "등록했습니다 — 08:00~13:00, 5분마다 확인"
Write-Output "기록은 pohang-ontime\data\fill-log.csv 에 쌓입니다"
