$first = Import-Clixml ./misc/cfg.xml
$success = "Successfully setup, automatically launching..."

if(!$first) {
        cmd.exe /c "npm install"
        $first = 1
        $first | Export-Clixml ./misc/cfg.xml
        Write-host $success
        cmd.exe /c "node app"
        
} 
Write-Host $success
cmd.exe /c "node app"
