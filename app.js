require('dotenv').config();
const puppeteer = require('puppeteer-core');
const dayjs = require('dayjs');
const cheerio = require('cheerio');
var fs = require('fs');
const inquirer = require('./input');
const treekill = require('tree-kill');
var Spinner = require('cli-spinner').Spinner;
let colors = require('colors');

var run = true;
var firstRun = true;
var cookie = null;
var streamers = null;
// ========================================== CONFIG SECTION =================================================================
const configPath = './config.json'
const screenshotFolder = './screenshots/';
const baseUrl = 'https://www.twitch.tv/';
const userAgent = (process.env.userAgent || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36');
const streamersUrl = (process.env.streamersUrl || 'https://www.twitch.tv/directory/game/VALORANT?tl=c2542d6d-cd10-4532-919b-3d19f30a768b');

const scrollDelay = (Number(process.env.scrollDelay) || 2000);
const scrollTimes = (Number(process.env.scrollTimes) || 5);

const minWatching = (Number(process.env.minWatching) || 15); // Minutes
const maxWatching = (Number(process.env.maxWatching) || 30); //Minutes

const streamerListRefresh = (Number(process.env.streamerListRefresh) || 1);
const streamerListRefreshUnit = (process.env.streamerListRefreshUnit || 'hour'); //https://day.js.org/docs/en/manipulate/add

const showBrowser = false; // false state equ headless mode;
const proxy = (process.env.proxy || ""); // "ip:port" By https://github.com/Jan710
const proxyAuth = (process.env.proxyAuth || "");

const browserScreenshot = (process.env.browserScreenshot || false);

const browserClean = 1;
const browserCleanUnit = 'hour';

var browserConfig = {
  headless: !showBrowser,
  args: [
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-setuid-sandbox'
  ]
}; //https://github.com/D3vl0per/Valorant-watcher/issues/24

const cookiePolicyQuery = 'button[data-a-target="consent-banner-accept"]';
const matureContentQuery = 'button[data-a-target="player-overlay-mature-accept"]';
const sidebarQuery = '*[data-test-selector="user-menu__toggle"]';
const userStatusQuery = 'span[data-a-target="presence-text"]';
const channelsQuery = 'a[data-test-selector*="ChannelLink"]';
const streamPauseQuery = 'button[data-a-target="player-play-pause-button"]';
const streamSettingsQuery = '[data-a-target="player-settings-button"]';
const streamQualitySettingQuery = '[data-a-target="player-settings-menu-item-quality"]';
const streamQualityQuery = 'input[data-a-target="tw-radio"]';
// ========================================== CONFIG SECTION =================================================================


// ========================================== UTILS SECTION =================================================================
function idle(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
// ========================================== UTILS SECTION =================================================================

async function getUserProperty(page, name) {

  if (!name || !(/^[A-Za-z1-9]+$/.test(name))) throw new Error("Invalid cookie name: ", name);

  const data = await page.cookies();
  let cookieValue = undefined;

  for (let i = 0; i < data.length; i++) {
    if (data[i].name == 'twilight-user') {
      cookieValue = JSON.stringify((data[i].value).replace(/\%+[1-9]+/gm, ' ').replace(/\ \C\ /gm, ""));
      cookieValue = cookieValue.replace(/"+/gm, "");
      let reg = new RegExp(`(?<=${name}\\s\\:\\s)[a-zA-Z0-9]+`, 'gm');
      cookieValue = cookieValue.match(reg);
    }
  }
  return cookieValue ? cookieValue[0] : new Error("Invalid cookie returned");
}

async function getValorantStatus(page) {

  let spinner = new Spinner("%s Checking for a valorant drop");
  spinner.setSpinnerString(18);
  spinner.start();
  await page.click('[aria-label="Open Notifications"]');
  await idle(2000);
  let notif = await page.evaluate(() => {
    document.querySelector('[data-test-selector="center-window__empty"]') ?
      document.querySelector('[data-test-selector="center-window__empty"]').toString() :
      false;
  });
  if (notif) {
    spinner.stop(true);
    console.log("⛔ Haven't received valorant yet");
  }
  else {
    let count = 0;
    await page.waitForSelector('div[data-test-selector="center-window__content"]', {
      timeout: 2500
    });

    await idle(1000);
    count = await page.evaluate(() => {
      return document.querySelector('[data-test-selector="center-window__content"]').children.length;
    })
    let success = false;
    if (count) {
      //console.log(`ℹ Got ${count} notifications`);
      for (let i = 0; i < count; i++)//check if really works
      {
        let drop = await page.evaluate(() => Array.from(document.querySelectorAll('div[data-test-selector="center-window__content"] .tw-c-text-alt strong:first-of-type'), e => e.innerText));
        if (drop.some((element) => element == "VALORANT")) {
          success = true;
          break;
        }

      }
      await idle(1500);
      spinner.stop(true);
      if (success) {
        console.log("✅ Successfully received VALORANT");
        exit("⚙ exiting...");
      }
      else {
        console.log("⛔ Haven't received valorant yet...");
      }
    }
  }
  spinner.stop(true);
}

async function viewRandomPage(browser, page) {
  var streamer_last_refresh = dayjs().add(streamerListRefresh, streamerListRefreshUnit);
  var browser_last_refresh = dayjs().add(browserClean, browserCleanUnit);
  while (run) {
    try {
      if (dayjs(browser_last_refresh).isBefore(dayjs())) {
        var newSpawn = await cleanup(browser, page);
        browser = newSpawn.browser;
        page = newSpawn.page;
        firstRun = true;
        browser_last_refresh = dayjs().add(browserClean, browserCleanUnit);
      }

      if (dayjs(streamer_last_refresh).isBefore(dayjs())) {
        await getAllStreamer(page); //Call getAllStreamer function and refresh the list
        streamer_last_refresh = dayjs().add(streamerListRefresh, streamerListRefreshUnit); //https://github.com/D3vl0per/Valorant-watcher/issues/25
      }

      let watch = streamers[getRandomInt(0, streamers.length - 1)]; //https://github.com/D3vl0per/Valorant-watcher/issues/27
      var sleep = getRandomInt(minWatching, maxWatching) * 60000; //Set watuching timer

      console.log('\n🔗 Now watching streamer: ', baseUrl + watch);
      await page.goto(baseUrl + watch, {
        "waitUntil": "networkidle0"
      }); //https://github.com/puppeteer/puppeteer/blob/master/docs/api.md#pagegobackoptions

      await clickWhenExist(page, cookiePolicyQuery);
      await clickWhenExist(page, matureContentQuery); //Click on accept button

      if (firstRun) {
        console.log('🔧 Setting lowest possible resolution..');
        await clickWhenExist(page, streamPauseQuery);

        await clickWhenExist(page, streamSettingsQuery);
        await page.waitFor(streamQualitySettingQuery);

        await clickWhenExist(page, streamQualitySettingQuery);
        await page.waitFor(streamQualityQuery);

        var resolution = await queryOnWebsite(page, streamQualityQuery);
        resolution = resolution[resolution.length - 1].attribs.id;
        await page.evaluate((resolution) => {
          document.getElementById(resolution).click();
        }, resolution);

        await clickWhenExist(page, streamPauseQuery);

        await page.keyboard.press('m'); //For unmute
        firstRun = false;
      }


      if (browserScreenshot) {
        await page.waitFor(1000);
        fs.access(screenshotFolder, error => {
          if (error) {
            fs.promises.mkdir(screenshotFolder);
          }
        });
        await page.screenshot({
          path: `${screenshotFolder}${watch}.png`
        });
        console.log('📸 Screenshot created: ' + `${watch}.png`);
      }

      await clickWhenExist(page, sidebarQuery); //Open sidebar
      await page.waitFor(userStatusQuery); //Waiting for sidebar
      let status = await queryOnWebsite(page, userStatusQuery); //status jQuery
      await clickWhenExist(page, sidebarQuery); //Close sidebar

      let currentDate = dayjs().format('HH:mm:ss');

      console.log('💡 Account status:', status[0] ? status[0].children[0].data : "Unknown");
      console.log('🕒 Time: ' + dayjs().format('HH:mm:ss'));
      console.log('💤 Watching stream for ' + sleep / 60000 + ' minutes => ' + dayjs().add((sleep / 60000), 'minutes').format('HH:mm:ss') + '\n');

      await page.waitFor(sleep);

    } catch (e) {
      console.log('🤬 Error: ', e);
    }
  }
}

async function readLoginData() {
  const cookie = [{
    "domain": ".twitch.tv",
    "hostOnly": false,
    "httpOnly": false,
    "name": "auth-token",
    "path": "/",
    "sameSite": "no_restriction",
    "secure": true,
    "session": false,
    "storeId": "0",
    "id": 1
  }];
  try {
    console.log('🔎 Checking config file...');

    if (fs.existsSync(configPath)) {
      console.log('✅ Json config found!');

      let configFile = JSON.parse(fs.readFileSync(configPath, 'utf8'))

      if (proxy) browserConfig.args.push('--proxy-server=' + proxy);
      browserConfig.executablePath = configFile.exec;
      cookie[0].value = configFile.token;

      return cookie;
    } else if (process.env.token) {
      console.log('✅ Env config found');

      if (proxy) browserConfig.args.push('--proxy-server=' + proxy);
      cookie[0].value = process.env.token; //Set cookie from env
      browserConfig.executablePath = '/usr/bin/chromium-browser'; //For docker container

      return cookie;
    } else {
      console.log('❌ No config file found!');

      let input = await inquirer.askLogin();

      fs.writeFile(configPath, JSON.stringify(input), function (err) {
        if (err) {
          console.log(err);
        }
      });

      if (proxy) browserConfig.args[6] = '--proxy-server=' + proxy;
      browserConfig.executablePath = input.exec;
      cookie[0].value = input.token;

      return cookie;
    }
  } catch (err) {
    console.log('🤬 Error: ', e);
  }
}



async function spawnBrowser() {
  console.log(`\n=============[ ${'NET'.red} ]=============`);
  console.log('📱 Launching browser...');
  var browser = await puppeteer.launch(browserConfig);
  var page = await browser.newPage();

  console.log('🔧 Setting User-Agent...');
  await page.setUserAgent(userAgent); //Set userAgent

  console.log('🔧 Setting auth token...');
  await page.setCookie(...cookie); //Set cookie

  console.log('⏰ Setting timeouts...');
  await page.setDefaultNavigationTimeout(process.env.timeout || 0);
  await page.setDefaultTimeout(process.env.timeout || 0);

  if (proxyAuth) {
    await page.setExtraHTTPHeaders({
      'Proxy-Authorization': 'Basic ' + Buffer.from(proxyAuth).toString('base64')
    })
  }

  return {
    browser,
    page
  };
}



async function getAllStreamer(page) {
  console.log(`\n=============[ ${'MISC'.red} ]=============`);
  await page.goto(streamersUrl, {
    "waitUntil": "networkidle0"
  });
  console.log('🔐 Checking login...');
  await checkLogin(page);
  console.log('📡 Checking active streamers...');
  await scroll(page, scrollTimes);
  const jquery = await queryOnWebsite(page, channelsQuery);
  streamers = null;
  streamers = new Array();

  console.log('🧹 Filtering out html codes...');
  for (var i = 0; i < jquery.length; i++) {
    streamers[i] = jquery[i].attribs.href.split("/")[1];
  }
  return;
}



async function checkLogin(page) {
  let cookieSetByServer = await page.cookies();
  for (var i = 0; i < cookieSetByServer.length; i++) {
    if (cookieSetByServer[i].name == 'twilight-user') {
      let name = await getUserProperty(page, 'displayName');
      console.log(`✅ Successfully logged in as ${name.bold.green}!`);
      return true;
    }
  }
  console.log('🛑 Login failed!');
  console.log('🔑 Invalid token!');
  console.log('\nPlease ensure that you have a valid twitch auth-token.\nhttps://github.com/D3vl0per/Valorant-watcher#how-token-does-it-look-like');
  if (!process.env.token) {
    fs.unlinkSync(configPath);
  }
  process.exit();
}



async function scroll(page, times) {
  console.log('🔨 Emulating scroll...');

  for (var i = 0; i < times; i++) {
    await page.evaluate(async (page) => {
      var x = document.getElementsByClassName("scrollable-trigger__wrapper");
      x[0].scrollIntoView();
    });
    await page.waitFor(scrollDelay);
  }
  return;
}



function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}



async function clickWhenExist(page, query) {
  let result = await queryOnWebsite(page, query);

  try {
    if (result[0].type == 'tag' && result[0].name == 'button') {
      await page.click(query);
      await page.waitFor(500);
      return;
    }
  } catch (e) { }
}



async function queryOnWebsite(page, query) {
  let bodyHTML = await page.evaluate(() => document.body.innerHTML);
  let $ = cheerio.load(bodyHTML);
  const jquery = $(query);
  return jquery;
}



async function cleanup(browser, page) {
  const pages = await browser.pages();
  await pages.map((page) => page.close());
  await treekill(browser.process().pid, 'SIGKILL');
  //await browser.close();
  return await spawnBrowser();
}



async function killBrowser(browser, page) {
  const pages = await browser.pages();
  await pages.map((page) => page.close());
  treekill(browser.process().pid, 'SIGKILL');
  return;
}



async function shutDown() {
  console.log("\n👋Bye Bye👋");
  run = false;
  process.exit();
}

async function exit(msg) {
  console.log(msg);
  await idle(500);
  run = false;
  process.exit();
}

async function main() {
  console.clear();
  console.log("xxxxxxxxxxxxxxxxxxxxxx " + 'Idle Twitch'.rainbow + " xxxxxxxxxxxxxxxxxxxxx");
  console.log('Forked by Flickery'.bold + " v" + '1.02'.italic.green);
  console.log(`\n=============[ ${'CFG'.red} ]=============`);
  cookie = await readLoginData();
  var {
    browser,
    page
  } = await spawnBrowser();
  await getAllStreamer(page);
  console.log(`\n=============[ ${'MAIN'.red} ]=============`);
  console.log('⚙ Running watcher...');
  await getValorantStatus(page); //check if we received a valorant drop

  await viewRandomPage(browser, page);
};

main();

process.on("SIGINT", shutDown);
process.on("SIGTERM", shutDown);
