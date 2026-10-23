@echo off
REM Relance l'application de développement sur le téléphone branché en USB.
REM Prérequis : le serveur de développement tourne (cd app, puis npx expo start --dev-client).
REM Le téléphone passe par le câble (adb reverse) : ça marche même si le PC change de réseau.
echo Telephone detecte :
adb devices
adb reverse tcp:8081 tcp:8081
adb shell am force-stop fun.grandpaname.app.dev
adb shell am start -a android.intent.action.VIEW -d "exp+grand-paname://expo-development-client/?url=http%%3A%%2F%%2Flocalhost%%3A8081" fun.grandpaname.app.dev
echo.
echo Si la liste ci-dessus est vide : debloque le telephone, mode "Transfert de fichiers", Debogage USB active.
pause
