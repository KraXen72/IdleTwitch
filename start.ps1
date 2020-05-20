$firsttime = 0

if(!$firsttime) {
        cmd.exe /c "npm install"
        cmd.exe /c "node app.js"
        $firsttime = 1
} else {
        cmd.exe /c "node app.js"
}

