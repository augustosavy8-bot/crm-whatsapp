' Arranca start-foko.cmd sin mostrar ventana de consola.
Set sh = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run """" & scriptDir & "\start-foko.cmd""", 0, False
