' PowerShell 의 -WindowStyle Hidden 은 창을 만들었다가 숨기는 방식이라
' 아주 짧게 깜빡일 수 있습니다. 이 launcher 는 창을 아예 만들지 않고
' 실행하므로 완전히 안 보입니다. 작업 스케줄러가 이 파일을 부릅니다.
Set shell = CreateObject("WScript.Shell")
path = Replace(WScript.ScriptFullName, "run-local-hidden.vbs", "run-local.ps1")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & path & """", 0, True
