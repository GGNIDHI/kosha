const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
const os = require('os');

const PORT = 7673;
const PROJECT_SRC = __dirname;

let progress = {
  percent: 0,
  statusText: 'Initializing...',
  logs: []
};

function log(msg) {
  console.log(msg);
  progress.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/setup') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(path.join(PROJECT_SRC, 'setup.html')).pipe(res);
  } 
  else if (req.url === '/api/default-path') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const defaultParent = os.homedir();
    res.end(JSON.stringify({ path: defaultParent }));
  } 
  else if (req.url === '/api/browse') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (process.platform === 'darwin') {
      exec('osascript -e "POSIX path of (choose folder with prompt \\"Select installation directory:\\")"', (err, stdout) => {
        if (err) {
          res.end(JSON.stringify({ path: '' }));
        } else {
          res.end(JSON.stringify({ path: stdout.trim() }));
        }
      });
    } else {
      // Windows PowerShell Folder Browser
      const psCommand = `
        Add-Type -AssemblyName System.Windows.Forms;
        $f = New-Object System.Windows.Forms.FolderBrowserDialog;
        $f.Description = 'Select installation directory:';
        if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
          $f.SelectedPath
        }
      `;
      exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand.replace(/\n/g, '')}"`, (err, stdout) => {
        if (err) {
          res.end(JSON.stringify({ path: '' }));
        } else {
          res.end(JSON.stringify({ path: stdout.trim() }));
        }
      });
    }
  } 
  else if (req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(progress));
  } 
  else if (req.url === '/api/install' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const data = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ started: true }));
      
      // Trigger async installation
      runInstallation(data);
    });
  } 
  else {
    res.writeHead(404);
    res.end('Not found');
  }
});

function launchStandalone(port) {
  if (process.platform === 'darwin') {
    let hasChrome = false;
    try {
      // 1. Direct path check (fastest, no process spawned)
      const chromePaths = [
        '/Applications/Google Chrome.app',
        path.join(os.homedir(), 'Applications/Google Chrome.app')
      ];
      hasChrome = chromePaths.some(p => fs.existsSync(p));
      
      // 2. Spotlight check (fallback, doesn't trigger AppleScript locate prompts)
      if (!hasChrome) {
        const stdout = execSync('mdfind "kMDItemCFBundleIdentifier == \'com.google.Chrome\'"', { stdio: ['ignore', 'pipe', 'ignore'] });
        hasChrome = stdout.toString().trim().length > 0;
      }
    } catch (e) {
      hasChrome = false;
    }

    if (hasChrome) {
      exec(`open -a "Google Chrome" --args --app=http://localhost:${port}`);
    } else {
      exec(`open http://localhost:${port}`);
    }
  } else {
    exec('where chrome', (err) => {
      if (!err) {
        exec(`start chrome --app=http://localhost:${port}`);
      } else {
        exec(`start http://localhost:${port}`);
      }
    });
  }
}

server.listen(PORT, () => {
  console.log(`Setup server active at http://localhost:${PORT}`);
  launchStandalone(PORT);
});

async function runInstallation(data) {
  try {
    const TARGET_DIR = path.join(data.targetPath, 'Kosha');
    log(`Starting installation inside: ${TARGET_DIR}`);
    progress.percent = 10;
    progress.statusText = 'Creating directories...';
    
    fs.mkdirSync(TARGET_DIR, { recursive: true });
    
    progress.percent = 20;
    progress.statusText = 'Copying application files...';
    
    // Copy files recursively excluding node_modules, setup utilities, and launcher app
    fs.cpSync(PROJECT_SRC, TARGET_DIR, {
      recursive: true,
      filter: (src) => {
        const relative = path.relative(PROJECT_SRC, src);
        return !relative.includes('node_modules') &&
               !relative.includes('Kosha Launcher.app') &&
               !relative.includes('setup-server.cjs') &&
               !relative.includes('setup.html') &&
               !relative.includes('bootstrap.sh') &&
               !relative.includes('.git');
      }
    });
    log('Files copied successfully.');
    
    progress.percent = 40;
    progress.statusText = 'Resolving Node.js runtime...';
    
    let nodePath = '';
    let npmPath = '';
    let globalNode = false;
    
    try {
      // Check if global node exists
      execSync('node -v');
      execSync('npm -v');
      nodePath = execSync('which node').toString().trim();
      npmPath = execSync('which npm').toString().trim();
      globalNode = true;
      log(`Found global Node.js at ${nodePath}`);
    } catch (e) {
      log('Global Node.js not found. Setting up standalone local Node...');
    }
    
    if (!globalNode) {
      progress.statusText = 'Downloading standalone Node.js runtime...';
      const nodeVersion = 'v22.11.0';
      let nodeUrl = '';
      let zipName = '';
      
      if (process.platform === 'darwin') {
        const arch = os.arch() === 'arm64' ? 'arm64' : 'x64';
        zipName = `node-${nodeVersion}-darwin-${arch}.tar.gz`;
        nodeUrl = `https://nodejs.org/dist/${nodeVersion}/${zipName}`;
      } else {
        zipName = `node-${nodeVersion}-win-x64.zip`;
        nodeUrl = `https://nodejs.org/dist/${nodeVersion}/${zipName}`;
      }
      
      const zipPath = path.join(TARGET_DIR, zipName);
      log(`Downloading Node.js from ${nodeUrl}...`);
      
      // Download via shell utility
      if (process.platform === 'darwin') {
        execSync(`curl -sSL "${nodeUrl}" -o "${zipPath}"`);
        execSync(`tar -xzf "${zipPath}" -C "${TARGET_DIR}" --strip-components=1`);
        nodePath = path.join(TARGET_DIR, 'bin', 'node');
        npmPath = path.join(TARGET_DIR, 'bin', 'npm');
      } else {
        // Windows
        execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "(New-Object System.Net.WebClient).DownloadFile('${nodeUrl}', '${zipPath}')"`);
        execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${TARGET_DIR}'"`);
        const extractedDir = path.join(TARGET_DIR, `node-${nodeVersion}-win-x64`);
        fs.renameSync(extractedDir, path.join(TARGET_DIR, 'node-portable'));
        nodePath = path.join(TARGET_DIR, 'node-portable', 'node.exe');
        npmPath = path.join(TARGET_DIR, 'node-portable', 'npm.cmd');
      }
      
      fs.unlinkSync(zipPath);
      log('Standalone Node.js downloaded and unpacked successfully.');
    }
    
    const nodeDir = path.dirname(nodePath);
    
    progress.percent = 60;
    progress.statusText = 'Configuring local environment...';
    
    // Write env file
    const envContent = `VITE_PORT=${data.port}\nVITE_INIT_NAME=${data.userName}\nVITE_INIT_CURRENCY=${data.currency}\nVITE_INIT_GEMINI_KEY=${data.geminiKey}\n`;
    fs.writeFileSync(path.join(TARGET_DIR, '.env'), envContent);
    log('Configuration .env file created.');
    
    progress.percent = 70;
    progress.statusText = 'Installing project packages... (This may take a few seconds)';
    
    // Run npm install
    const npmCmd = process.platform === 'win32' ? `"${npmPath}"` : npmPath;
    execSync(`export PATH="${nodeDir}:$PATH" && cd "${TARGET_DIR}" && ${npmCmd} install`, { shell: true });
    log('Dependencies installed.');
    
    progress.percent = 90;
    progress.statusText = 'Creating one-click desktop launchers...';
    
    if (process.platform === 'darwin') {
      const startupAppleScript = `
        tell application "Finder" to set projectFolder to container of (path to me) as alias
        set projectPath to POSIX path of projectFolder
        set userPort to "${data.port}"
        do shell script "export PATH=\"${nodeDir}:\\$PATH\" && cd \\"" & projectPath & "\\" && (lsof -i :" & userPort & " >/dev/null || nohup \\"${nodePath}\\" node_modules/vite/bin/vite.js --port " & userPort & " >/dev/null 2>&1 </dev/null &)"
        
        set chromeInstalled to false
        try
          do shell script "[ -d '/Applications/Google Chrome.app' ] || [ -d \\"\\$HOME/Applications/Google Chrome.app\\" ] || [ -n \\"\\$(mdfind kMDItemCFBundleIdentifier == 'com.google.Chrome')\\" ]"
          set chromeInstalled to true
        end try
        
        if chromeInstalled then
          try
            do shell script "open -a 'Google Chrome' --args --app=http://localhost:" & userPort
          on error
            do shell script "open http://localhost:" & userPort
          end try
        else
          do shell script "open http://localhost:" & userPort
        end if
      `;
      const tempScript = '/tmp/KoshaStartup.applescript';
      fs.writeFileSync(tempScript, startupAppleScript);
      
      const appPath = path.join(TARGET_DIR, 'Kosha.app');
      execSync(`osacompile -o "${appPath}" ${tempScript}`);
      fs.unlinkSync(tempScript);
      
      // Apply beautiful app icon on Mac
      const iconSrc = path.join(TARGET_DIR, 'public', 'logo.png');
      if (fs.existsSync(iconSrc)) {
        const iconsetDir = '/tmp/KoshaStartup.iconset';
        execSync(`rm -rf ${iconsetDir} && mkdir -p ${iconsetDir}`);
        
        execSync(`sips -s format png -z 16 16     "${iconSrc}" --out "${iconsetDir}/icon_16x16.png" >/dev/null 2>&1`);
        execSync(`sips -s format png -z 32 32     "${iconSrc}" --out "${iconsetDir}/icon_16x16@2x.png" >/dev/null 2>&1`);
        execSync(`sips -s format png -z 32 32     "${iconSrc}" --out "${iconsetDir}/icon_32x32.png" >/dev/null 2>&1`);
        execSync(`sips -s format png -z 64 64     "${iconSrc}" --out "${iconsetDir}/icon_32x32@2x.png" >/dev/null 2>&1`);
        execSync(`sips -s format png -z 128 128   "${iconSrc}" --out "${iconsetDir}/icon_128x128.png" >/dev/null 2>&1`);
        execSync(`sips -s format png -z 256 256   "${iconSrc}" --out "${iconsetDir}/icon_128x128@2x.png" >/dev/null 2>&1`);
        execSync(`sips -s format png -z 256 256   "${iconSrc}" --out "${iconsetDir}/icon_256x256.png" >/dev/null 2>&1`);
        execSync(`sips -s format png -z 512 512   "${iconSrc}" --out "${iconsetDir}/icon_256x256@2x.png" >/dev/null 2>&1`);
        execSync(`sips -s format png -z 512 512   "${iconSrc}" --out "${iconsetDir}/icon_512x512.png" >/dev/null 2>&1`);
        execSync(`sips -s format png -z 1024 1024 "${iconSrc}" --out "${iconsetDir}/icon_512x512@2x.png" >/dev/null 2>&1`);
        
        execSync(`iconutil -c icns ${iconsetDir} -o "/tmp/KoshaStartup.icns"`);
        execSync(`cp "/tmp/KoshaStartup.icns" "${appPath}/Contents/Resources/applet.icns"`);
        execSync(`rm -rf ${iconsetDir} && rm -f "/tmp/KoshaStartup.icns"`);
        execSync(`touch "${appPath}"`);
      }
    } else {
      // Windows bat launcher
      const batContent = `@echo off\ntitle Kosha Launcher\ncd /d "%~dp0"\nset PORT=${data.port}\nset PATH=${nodeDir};%PATH%\nnetstat -o -an | findstr :%PORT% >nul\nif %errorlevel% neq 0 (\n    start /b cmd /c "npm run dev -- --port %PORT%"\n    timeout /t 2 >nul\n)\nstart chrome --app=http://localhost:%PORT%\nif %errorlevel% neq 0 (\n    start http://localhost:%PORT%\n)\nexit`;
      fs.writeFileSync(path.join(TARGET_DIR, 'Kosha Launcher.bat'), batContent);
    }
    
    log('Launchers configured successfully.');
    
    // Start Vite server inside the target directory asynchronously
    log('Launching Kosha development server...');
    exec(`export PATH="${nodeDir}:$PATH" && cd "${TARGET_DIR}" && nohup "${nodePath}" node_modules/vite/bin/vite.js --port ${data.port} >/dev/null 2>&1 &`, { shell: true });
    
    // Auto-launch the dashboard in standalone window after Vite starts
    setTimeout(() => {
      launchStandalone(data.port);
    }, 2000);

    progress.percent = 100;
    progress.statusText = 'Setup completed!';
    log('Kosha has been successfully configured and launched!');
    
    // Self-destruct setup server after 5 seconds to free up the port
    setTimeout(() => {
      console.log('Terminating setup server...');
      process.exit(0);
    }, 5000);
    
  } catch (err) {
    log(`[ERROR] Setup failed: ${err.message}`);
    progress.statusText = 'Installation failed!';
  }
}
