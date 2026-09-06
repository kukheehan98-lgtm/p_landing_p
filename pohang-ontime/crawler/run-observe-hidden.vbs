' 위 run-local-hidden.vbs 와 같은 이유로 씁니다 — 창을 아예 만들지 않습니다.
Set shell = CreateObject("WScript.Shell")
path = Replace(WScript.ScriptFullName, "run-observe-hidden.vbs", "run-observe.ps1")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & path & """", 0, True
