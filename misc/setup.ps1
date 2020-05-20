$first = Import-Clixml ./cfg.xml

if(!$first) {
        cmd.exe /c "npm install"
        $first = 1
        $first | Export-Clixml ./cfg.xml
        
} 
Write-Host "Successfully setup, you can now open start.bat"
