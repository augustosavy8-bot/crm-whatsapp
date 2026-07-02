' Abre el panel FOKO. Si el server no esta corriendo, lo levanta y luego abre el navegador.
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)

' Ver si ya hay algo escuchando en el puerto 5173
Set exec = sh.Exec("cmd /c netstat -ano -p tcp")
salida = exec.StdOut.ReadAll()

If InStr(salida, ":5173") = 0 Then
  ' No esta corriendo: lo arranca oculto y espera a que levante
  sh.Run """" & dir & "\start-foko-hidden.vbs""", 0, False
  WScript.Sleep 4500
End If

' Abre el panel en el navegador por defecto
sh.Run "http://localhost:5173"
