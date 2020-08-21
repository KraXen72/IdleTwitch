require('dotenv').config();
const puppeteer = require('puppeteer-core');
const dayjs = require('dayjs');
const cheerio = require('cheerio');
var fs = require('fs');
const inquirer = require('./input');
const treekill = require('tree-kill');
var Spinner = require('cli-spinner').Spinner;
let colors = require('colors');
var readline = require('readline');

var run = true;
var firstRun = true;
var cookie = null;
var streamers = null;
// ========================================== CONFIG SECTION =================================================================
const configPath = './config.json'
const screenshotFolder = './screenshots/';
const baseUrl = 'https://www.twitch.tv/';
const userAgent = (process.env.userAgent || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36');
let streamersUrl = (process.env.streamersUrl || `https://www.twitch.tv/directory/game/`);

const scrollDelay = (Number(process.env.scrollDelay) || 2000);
const scrollTimes = (Number(process.env.scrollTimes) || 5);

const minWatching = (Number(process.env.minWatching) || 15); // Minutes
const maxWatching = (Number(process.env.maxWatching) || 30); //Minutes

const streamerListRefresh = (Number(process.env.streamerListRefresh) || 1);
const streamerListRefreshUnit = (process.env.streamerListRefreshUnit || 'hour');

const hideBrowser = true;
const proxy = (process.env.proxy || "");
const proxyAuth = (process.env.proxyAuth || "");

const browserScreenshot = (process.env.browserScreenshot || false);

const browserClean = 1;
const browserCleanUnit = 'hour';

let configFile = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : null;


var browserConfig = {
  headless: hideBrowser,
  defaultViewport: null,
  args: [
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    `--window-size=1320,1080`,
    '--no-zygote',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-setuid-sandbox'
  ]
};

const cookiePolicyQuery = 'button[data-a-target="consent-banner-accept"]';
const matureContentQuery = 'button[data-a-target="player-overlay-mature-accept"]';
const sidebarQuery = '*[data-test-selector="user-menu__toggle"]';
const userStatusQuery = 'span[data-a-target="presence-text"]';
const channelsQuery = 'a[data-test-selector*="ChannelLink"]';
const streamPauseQuery = 'button[data-a-target="player-play-pause-button"]';
const streamSettingsQuery = '[data-a-target="player-settings-button"]';
const streamQualitySettingQuery = '[data-a-target="player-settings-menu-item-quality"]';
const streamQualityQuery = 'input[data-a-target="tw-radio"]';
const CHANNEL_STATUS = ".tw-channel-status-text-indicator";
const DROP_STATUS = '[data-a-target="Drops Enabled"]';
const DROP_STATUS2 = '.drops-campaign-details__drops-success';
const DROP_INVENTORY_NAME = '[data-test-selector="drops-list__game-name"]';
const DROP_INVENTORY_LIST = 'div.tw-flex-wrap.tw-tower.tw-tower--180.tw-tower--gutter-sm';
const NO_INVENTORY_DROPS = '[data-test-selector="drops-list__no-drops-default"]';
const DROP_PLACEHOLDER = '.tw-tower__placeholder';
const DROP_ITEM = '.tw-flex';
const CATEGORY_NOT_FOUND = '[data-a-target="core-error-message"]';


const DEBUG_FLAG = false;

// ========================================== CONFIG SECTION =================================================================


// ========================================== UTILS SECTION =================================================================
function idle(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function query(page, query) {
  let bodyHTML = await page.evaluate(() => document.body.innerHTML);
  //use cheerio server based jquery
  //load the whole body for cheerio to operate with
  let $ = cheerio.load(bodyHTML);
  //defining a var for the selection
  const jquery = $(query);
  //returning it with some checks
  if (DEBUG_FLAG && !jquery)
    throw new Error("Invalid query result");
  return jquery;
}

function capitalize(word) {
  return (word[0].toUpperCase() + word.substring(1));
}

// ========================================== UTILS SECTION =================================================================

async function getUserProperty(page, name) {

  if (!name || !(/^[A-Za-z1-9]+$/.test(name))) throw new Error("Invalid cookie name: ", name);

  const data = await page.cookies();
  let cookieValue = undefined;

  for (let i = 0; i < data.length; i++) {
    if (data[i].name == 'twilight-user') {
      cookieValue = JSON.parse(decodeURIComponent(data[i].value));
      if (!cookieValue[name]) throw new Error("Invalid cookie value returned");
    }
  }
  return cookieValue[name];
}

async function getDropStatus(page) {

  /**
   * Other solution:
   * POST request to https://gql.twitch.tv/gql
   * application/JSON
   * Request payload: search for operationName: "inventory" or "Inventory_DropsList_CurrentUser"
   */

  let spinner = new Spinner(`%s Checking for drops`);
  spinner.setSpinnerString(0);
  spinner.start();
  await page.goto(`${baseUrl}inventory`, { waitUntil: "networkidle2" });
  let noDrops = await query(page, NO_INVENTORY_DROPS);

  if (noDrops.length) {
    spinner.stop(true);
    console.log("[" + '-'.brightRed + "] Haven't received a drop yet");
  }
  else {
    await idle(1000);

    let count = 0;
    let drop = await query(page, DROP_INVENTORY_LIST);
    count = (await query(page, DROP_INVENTORY_LIST + ">" + DROP_ITEM)).length;
    let dropCount = 0;

    if (count) {
      //console.log(`ℹ Got ${count} notifications`)
      for (let i = 0; i < count; i++) {
        let game = (await query(page, `${DROP_INVENTORY_LIST + ">" + DROP_ITEM}:nth-child(${i + 1}) ${DROP_INVENTORY_NAME}`))
          .text().toUpperCase();
        if (game == configFile.game.toUpperCase()) {
          dropCount++;
        }
      }
      await idle(1500);
      spinner.stop(1);
      if (dropCount > 0) {
        console.log(`[+] You got ${dropCount} ${(capitalize(configFile.game)).bold} drop(s) !`);
      }
      else {
        console.log("[" + '-'.brightRed + "] Haven't received a drop yet");
      }
    }
  }

  return spinner.stop(true);
}

async function viewRandomPage(browser, page) {
  var streamer_last_refresh = dayjs().add(streamerListRefresh, streamerListRefreshUnit);
  var browser_last_refresh = dayjs().add(browserClean, browserCleanUnit);
  let spinner0 = new Spinner('%s Checking for drops enabled streamers...');
  spinner0.setSpinnerString(0);
  let retries = 0;

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
        streamer_last_refresh = dayjs().add(streamerListRefresh, streamerListRefreshUnit);
      }

      let watch = streamers[getRandomInt(0, streamers.length - 1)];
      var sleep = getRandomInt(minWatching, maxWatching) * 60000; //Set watuching timer

      spinner0.start();
      await page.goto(baseUrl + watch, {
        "waitUntil": "networkidle2"
      });

      let channelStatus = (await query(page, CHANNEL_STATUS)).text().trim().toUpperCase(); //to avoid getting any unwanted additional lowercase text 

      const dropsEnabled = (await query(page, DROP_STATUS)).length || (await query(page, DROP_STATUS2)).length;

      if (!channelStatus.includes("LIVE") || !dropsEnabled) {
        spinner0.stop(1);
        if (retries >= 2)
          exit();
        console.log(`\n[${'-'.red}] Are you sure the game has drops enabled? Retrying ${2 - retries} more times... `);
        retries++;
        continue;
      }
      spinner0.stop(1);

      await getDropStatus(page);
      await page.goto(baseUrl + watch, {
        "waitUntil": "networkidle2"
      });


      console.log(`\n[${'√'.brightYellow}] Now watching: `, baseUrl + watch);

      await idle(1000);

      await clickWhenExist(page, cookiePolicyQuery);
      await clickWhenExist(page, matureContentQuery); //Click on accept button

      if (firstRun) {
        await clickWhenExist(page, streamPauseQuery);

        await clickWhenExist(page, streamSettingsQuery);
        await page.waitFor(streamQualitySettingQuery);

        await clickWhenExist(page, streamQualitySettingQuery);
        await page.waitFor(streamQualityQuery);

        var resolution = await query(page, streamQualityQuery);
        resolution = resolution[resolution.length - 1].attribs.id;
        await page.evaluate((resolution) => {
          document.getElementById(resolution).click();
        }, resolution);
        console.log(`[${'x'.brightYellow}] Lowest resolution set!`);

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
        console.log('[+] Screenshot created: ' + `${watch}.png`);
      }

      await clickWhenExist(page, sidebarQuery); //Open sidebar
      await page.waitFor(userStatusQuery); //Waiting for sidebar
      let status = await query(page, userStatusQuery); //status jQuery
      await clickWhenExist(page, sidebarQuery); //Close sidebar
      let currentDate = dayjs().format('HH:mm:ss');

      console.log('[' + '?'.brightCyan + '] Account status:', status[0] ? status[0].children[0].data : "Unknown");
      console.log('[' + '?'.brightCyan + '] Time: ' + dayjs().format('HH:mm:ss'));
      console.log('[' + '?'.brightCyan + '] Watching stream for ' + sleep / 60000 + ' minutes => ' + dayjs().add((sleep / 60000), 'minutes').format('HH:mm:ss') + '\n');

      await page.waitFor(sleep);

    } catch (e) {
      exit("trying to watch a stream.", e);
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
  let spinner1 = new Spinner('%s Looking for config files');

  try {
    spinner1.setSpinnerString(0);
    spinner1.start();

    if (fs.existsSync(configPath)) {
      await idle(1000);
      spinner1.stop(1);
      console.log(`[${'+'.brightGreen}] Found cfg file.`);

      configFile = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      if (proxy) browserConfig.args.push('--proxy-server=' + proxy);
      browserConfig.executablePath = configFile.exec;
      cookie[0].value = configFile.auth_token;
      streamersUrl = (streamersUrl + configFile.game.toUpperCase());

      return cookie;
    } else if (process.env.token) {
      console.log(`[${'+'.brightGreen}] Env config found`);

      if (proxy) browserConfig.args.push('--proxy-server=' + proxy);
      cookie[0].value = process.env.token; //Set cookie from env
      browserConfig.executablePath = '/usr/bin/chromium-browser'; //For docker container

      return cookie;
    } else {
      spinner1.stop(1);
      console.log(`[${'-'.brightRed}] No config file found!`);

      let input = await inquirer.askLogin();

      fs.writeFile(configPath, JSON.stringify(input), function (err) {
        if (err) {
          console.log(err);
        }
      });

      if (proxy) browserConfig.args[6] = '--proxy-server=' + proxy;
      browserConfig.executablePath = input.exec;
      cookie[0].value = input.auth_token;

      return cookie;
    }
  } catch (e) {
    exit("check for config file.", e);
  }
}



async function spawnBrowser() {
  console.log(`\n=============[ ${'NET'.brightRed} ]=============`);

  let spinner2 = new Spinner('%s getting browser ready');
  spinner2.setSpinnerString(0);
  spinner2.start();

  try {
    //Initialize puppeteer
    var browser = await puppeteer.launch(browserConfig);
    var page = await browser.newPage();

    await page.setUserAgent(userAgent); //Set userAgent

    await page.setCookie(...cookie); //Set cookie

    //set navigation timeout
    await page.setDefaultNavigationTimeout(process.env.timeout || 0);
    await page.setDefaultTimeout(process.env.timeout || 0);

    if (proxyAuth) {
      await page.setExtraHTTPHeaders({
        'Proxy-Authorization': 'Basic ' + Buffer.from(proxyAuth).toString('base64')
      })
    }
    spinner2.stop(1);
    console.log(`[${'+'.brightGreen}] Successfully set up the browser.`);
  } catch (e) {
    spinner2.stop(1);
    exit("set up the browser", e);
  }

  return {
    browser,
    page
  };
}

async function getAllStreamer(page) {
  console.log(`\n=============[ ${'MISC'.brightRed} ]=============`);

  let spinner3 = new Spinner("%s Logging in...");
  spinner3.setSpinnerString(0);
  let spinner4 = new Spinner("%s Fetching streamers (This may take some time)...");
  spinner4.setSpinnerString(0);

  try {
    spinner3.start();
    await page.goto(streamersUrl, {
      "waitUntil": "networkidle0"
    });

    //was the category found?
    const notFound = await query(page, CATEGORY_NOT_FOUND);

    if (notFound.length || notFound.text() == "Category does not exist") {
      spinner3.stop(1);
      console.log(`[${'-'.brightRed}] Game category not found, did you enter the game as displayed on twitch?`);
      exit();
    }

    spinner3.stop(1);
    await checkLogin(page);

    spinner4.start();

    await scroll(page, scrollTimes);
    const jquery = await query(page, channelsQuery);
    streamers = null;
    streamers = new Array();

    for (var i = 0; i < jquery.length; i++) {
      streamers[i] = jquery[i].attribs.href.split("/")[1];
    }

    spinner4.stop(1);
    console.log(`[${'+'.brightGreen}] Got streamers and filtered them!`);
    return;
  } catch (e) {
    spinner3.stop(1);
    spinner4.stop(1);
    exit("get streamers/ filter streamer.", e);
  }
}

async function checkLogin(page) {
  let cookieSetByServer = await page.cookies();
  for (var i = 0; i < cookieSetByServer.length; i++) {
    if (cookieSetByServer[i].name == 'twilight-user') {
      let name = await getUserProperty(page, 'displayName');
      console.log(`[${'+'.brightGreen}] Successfully logged in as ${name.bold.green}!`);
      return true;
    }
  }
  if (!process.env.token) {
    fs.unlinkSync(configPath);
  }
  console.log(`[${'-'.brightRed}] Login failed, is your token valid?`);
  exit();
}



async function scroll(page, times) {

  for (var i = 0; i < times; i++) {
    try {
      await page.evaluate(async () => {
        var x = document.getElementsByClassName("scrollable-trigger__wrapper");
        x[0].scrollIntoView();
      });
    } catch (e) {
      clearLine();
      exit("emulate scroll.", e);
    }
    await page.waitFor(scrollDelay);
  }
  return;
}


function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function clickWhenExist(page, selector) {
  let result = await query(page, selector);

  try {
    if (result[0].type == 'tag' && result[0].name == 'button') {
      await page.click(selector);
      await page.waitFor(500);
      return;
    }
  } catch (e) { }
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
  console.log("\nExiting...");
  run = false;
  process.exit();
}

async function exit(msg = "", e = null) {
  run = false;
  if (e && msg.length > 0) {
    console.log(`[${'-'.brightRed}] An error occured while trying to ${msg}(${e.name}: ${e.message.brightRed})`);
  }
  //process.exit();
  main();
}

async function main() {
  console.clear();
  console.log("IdleTwitch" + " v" + '1.02'.italic.brightGreen);
  console.log(`\n=============[ ${'CFG'.brightRed} ]=============`);

  try {
    cookie = await readLoginData();
    var {
      browser,
      page
    } = await spawnBrowser();
    await getAllStreamer(page);
    console.log(`\n=============[ ${'MAIN'.brightRed} ]=============`);
    await viewRandomPage(browser, page);

  } catch (e) {
    exit("initialize main.", e);
  }
};

main();

process.on("SIGINT", shutDown);
process.on("SIGTERM", shutDown);
