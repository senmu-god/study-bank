' Study Bank launcher -- ASCII only (Windows Script Host reads .vbs as ANSI)
Option Explicit
Dim fso, shell, root, ps1, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = root & "\start-bank.ps1"
If Not fso.FileExists(ps1) Then
    MsgBox "start-bank.ps1 not found:" & vbCrLf & ps1, 16, "Study Bank"
    WScript.Quit 1
End If
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
shell.Run cmd, 0, False