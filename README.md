<h1 align="center"><img src="https://i.imgur.com/ie0oZQP.png"/></h1>

<h3 align="center">A simple idle bot for twitch drops.</h3>

- [How to get my auth token?](#How-do-I-get-my-auth-token)
- [How to Use?](#How-to-use)
- [Features](#Features)
- [Changelogs](#Changelogs)
- [Gallery](#Gallery)
- [Credits](#Credits)
- [Donations](#Donations)

## How do I get my auth token?
GO to `twitch.tv` then click on F12 and go inside the developer console (on the upper tabs) and paste this inside and press enter:
```js
console.log((decodeURIComponent(document.cookie)).match('(?<="authToken":")[a-zA-z0-9]+')[0]);
```

## How to use?
Just double click on `start.bat`.

## Features:
- Multiple game support
- Drop annoucement
- Flexible, fast and colorful interface
- Multiple platforms supported
- Token login (no complicated username/password)
- Clean error handling
- Headless browser - no interface
- Streamer filtering with drops-enabled streamers
- Random watch time for each streamer
- No popup interruptions on Twitch while idling
- Actively Maintained

## Changelogs:<br>
- Added the `getUserProperty` which parses the content of the `twilight-user` cookie to get any property<br>
- Added the name at the login to know if the auth_token is the correct one<br>
- Changed the interface for windows cmd's<br>
- Added animated cli spinners for the esthetic<br>
- Added some colors and removed some output for more readability<br>
- Added a check for the drop, by going to the inventory page (switched from directly accessing the notifications tab to make it simpler)<br>
- Added the choice to specifically choose a game to watch drops for<br>
- Added some error handling with custom error messages<br>
- Added an idling function

## Gallery:
![](https://i.imgur.com/qh5JXMz.png)
===================================
![](https://i.imgur.com/hfBxXMR.png)

## Credits:
Forked from [valorant-watcher](https://github.com/D3vl0per/Valorant-watcher) originally created by d3v. 
Updated by AlexSimpler in 2020.

## Donations
You can also donate to the precursor of this project and idea:

<a href="https://www.buymeacoffee.com/D3v" target="_blank"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Me A Coffee" style="height: 41px !important;width: 174px !important;box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;-webkit-box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;" ></a>
