$first = Import-Clixml ./misc/cfg.xml

if(!$first) {
        cmd.exe /c "npm install"
        $first = 1
        $first | Export-Clixml ./misc/cfg.xml
        cmd.exe /c "node app"
        
} 
Write-Host "Successfully setup, automatically launching..."
cmd.exe /c "node app"
