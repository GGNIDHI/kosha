@echo off
title Kosha Setup Wizard
cd /d "%~dp0"

:: Check if node_modules exists. If not, trigger the installer wizard.
if not exist node_modules (
    echo Launching First-Time Onboarding Installer...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "Add-Type -AssemblyName PresentationFramework; ^
         Add-Type -AssemblyName System.Windows.Forms; ^
         Add-Type -AssemblyName Microsoft.VisualBasic; ^
         $confirm = [System.Windows.MessageBox]::Show('Welcome to the Kosha Setup Wizard!`n`nThis installer will copy Kosha and automatically configure all necessary dependencies (including downloading a standalone Node.js environment if not found globally). Proceed?', 'Kosha Setup Wizard', 'YesNo', 'Question'); ^
         if ($confirm -eq 'No') { exit 1 }; ^
         $folderBrowser = New-Object System.Windows.Forms.FolderBrowserDialog; ^
         $folderBrowser.Description = 'Select the parent directory where you want to install the Kosha folder:'; ^
         if ($folderBrowser.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 1 }; ^
         $targetParent = $folderBrowser.SelectedPath; ^
         $targetDir = Join-Path $targetParent 'Kosha'; ^
         echo 'Creating installation directory at ' $targetDir '...'; ^
         New-Item -ItemType Directory -Force -Path $targetDir | Out-Null; ^
         echo 'Copying files...'; ^
         Copy-Item -Path '.\*' -Destination $targetDir -Recurse -Exclude 'node_modules', 'Kosha Launcher.app', 'install.sh', 'Kosha' -Force; ^
         cd $targetDir; ^
         $nodePath = ''; ^
         $npmPath = ''; ^
         $hasGlobalNode = $false; ^
         try { ^
             $nodeCheck = Get-Command node -ErrorAction SilentlyContinue; ^
             $npmCheck = Get-Command npm -ErrorAction SilentlyContinue; ^
             if ($nodeCheck -and $npmCheck) { ^
                 $nodePath = $nodeCheck.Source; ^
                 $npmPath = $nodeCheck.Source; ^
                 $hasGlobalNode = $true; ^
             } ^
         } catch {}; ^
         if (-not $hasGlobalNode) { ^
             echo 'Node.js not found. Downloading portable standalone Node.js for Windows...'; ^
             [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12; ^
             $nodeUrl = 'https://nodejs.org/dist/v22.11.0/node-v22.11.0-win-x64.zip'; ^
             $zipPath = Join-Path $targetDir 'node-portable.zip'; ^
             (New-Object System.Net.WebClient).DownloadFile($nodeUrl, $zipPath); ^
             echo 'Extracting Node.js...'; ^
             Expand-Archive -Path $zipPath -DestinationPath $targetDir; ^
             Remove-Item -Path $zipPath -Force; ^
             $extractedFolder = Get-ChildItem -Directory -Filter 'node-v22.11.0-win-x64' | Select-Object -First 1; ^
             Rename-Item -Path $extractedFolder.FullName -NewName 'node-portable'; ^
             $nodePath = Join-Path $targetDir 'node-portable\node.exe'; ^
             $npmPath = Join-Path $targetDir 'node-portable\npm.cmd'; ^
         }; ^
         $nodeDir = Split-Path $nodePath; ^
         $env:Path = $nodeDir + ';' + $env:Path; ^
         $name = [Microsoft.VisualBasic.Interaction]::InputBox('Please enter your Profile Name:', 'Kosha Onboarding', 'User'); ^
         $currency = [Microsoft.VisualBasic.Interaction]::InputBox('Please enter your Base Currency (e.g., INR, USD):', 'Kosha Onboarding', 'INR'); ^
         $gemini = [Microsoft.VisualBasic.Interaction]::InputBox('Enter your Google Gemini API Key (Optional, click OK to skip):', 'Kosha Onboarding', ''); ^
         $port = [Microsoft.VisualBasic.Interaction]::InputBox('Choose a local port number (Default: 7673):', 'Kosha Onboarding', '7673'); ^
         if (!$port) { $port = '7673' }; ^
         $envContent = 'VITE_PORT=' + $port + [Environment]::NewLine + 'VITE_INIT_NAME=' + $name + [Environment]::NewLine + 'VITE_INIT_CURRENCY=' + $currency + [Environment]::NewLine + 'VITE_INIT_GEMINI_KEY=' + $gemini; ^
         Set-Content -Path '.env' -Value $envContent; ^
         echo 'Installing dependencies...'; ^
         Start-Process -FilePath $npmPath -ArgumentList 'install' -WorkingDirectory $targetDir -NoNewWindow -Wait; ^
         $batContent = '@echo off' + [Environment]::NewLine + 'title Kosha Launcher' + [Environment]::NewLine + 'cd /d \"%~dp0\"' + [Environment]::NewLine + 'set PORT=' + $port + [Environment]::NewLine + 'set PATH=' + $nodeDir + ';%PATH%' + [Environment]::NewLine + 'netstat -o -an | findstr :%PORT% >nul' + [Environment]::NewLine + 'if %errorlevel% neq 0 (' + [Environment]::NewLine + '    start /b cmd /c \"npm run dev -- --port %PORT%\"' + [Environment]::NewLine + '    timeout /t 2 >nul' + [Environment]::NewLine + ')' + [Environment]::NewLine + 'start http://localhost:%PORT%' + [Environment]::NewLine + 'exit'; ^
         Set-Content -Path 'Kosha Launcher.bat' -Value $batContent; ^
         [System.Windows.MessageBox]::Show('Setup complete! Kosha is installed at ' + $targetDir + '.`n`nDouble-click the new \"Kosha Launcher.bat\" inside that folder to run it anytime.', 'Kosha Onboarding', 'OK', 'Information'); ^
         Start-Process 'http://localhost:'$port"
         
    if %errorlevel% neq 0 (
        echo Setup cancelled or failed.
        pause
        exit
    )
    exit
)

:: Subsequent Runs: Read Port from .env
set PORT=7673
if exist .env (
    for /f "tokens=2 delims==" %%i in ('findstr VITE_PORT .env') do set PORT=%%i
)

:: Start Vite
echo Starting server on port %PORT%...
netstat -o -an | findstr :%PORT% >nul
if %errorlevel% neq 0 (
    start /b cmd /c "npm run dev -- --port %PORT%"
    timeout /t 2 >nul
)

echo Opening Kosha Dashboard...
start http://localhost:%PORT%
exit
