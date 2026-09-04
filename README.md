# DonutShop
is an Arduino Nano ESP32 + OTG adapter that changes profiles for the RetroTink 4K based on gameID. <br />

<p align="center"><img src="./images/1.JPG"><br />
<p align="center"><img src="./images/2.JPG"><br />

<p align="center"><img width="500" src="./images/3.JPG"></p><br />

See it in action: https://youtu.be/ldbfFbKzjh8 <br>

  - Note: In version v0.7.x you can still access this gameID only version at http://donutshop.local/gameid
    
<br /><br />
## DonutShop ft. RT4K WebCtl (work in progress v0.7.x)
 - Requires RT4K v1.75+ fw
 - This version integrates the gameID functionality into the RT4K WebCtl internal test app. It's still very much a work in progress, but I wanted to share the experience thus far.
 - In a nutshell, with WebCtl on DonutShop, you gain:
    - Dashboard of RT4K status, ability to change Input/Output
    - Remote + OSD
    - Load profiles by double-clicking on the filename, allowing you to quickly try out new profiles.
    - File Manager with bulk file operations including, copy/move/delete/download,drag & drop uploads.
      - Load profiles by double-clicking on the filename, allowing you to quickly try out new profiles.
      - Save live profile to current directory with the option to change name
      - View .txt & .html files immediately in-browser. Great for reading various guides found on the SD Card image.
      - Edit & Save .txt files in-browser for immediate changes to various features that use .txt files.
    - SVS Simulator (for example - load SVS profiles by #)
    - Stage & Flash latest experimental firmware over Wi-Fi directly from Github

<br>
<p align="center"><img src="./images/5.JPG"><br />
<p align="center"><img src="./images/6.JPG"><br />
<p align="center"><img src="./images/7.JPG"><br />
<p align="center"><img src="./images/8.JPG"><br />
<p align="center"><img src="./images/9.JPG"><br />
<p align="center"><img src="./images/10.JPG"><br />
<p align="center"><img src="./images/11.JPG"><br />
<p align="center"><img src="./images/12.JPG"><br /></p><br>

## Updates
  - New Installer only takes a few clicks.
  - WiP DonutShop ft. RT4K WebCtl now available to experience the new features of the RT4K v1.75+ firmware
  - .3mf added for printing a case.
  - NEW Terminal to relay [Remote Control Commands](https://consolemods.org/wiki/AV:RetroTINK-4K#Remote_Control_Commands). Toggle **Keyboard Nav Mode** to navigate the RT4K interface with keyboard keys.
  - New flash / setup method can now all be done via web browser.
  - ALL settings are now configured in the Web UI.
  - New Captive Portal for joining to your home network.
  - New Settings page allows you to Update Firmware and Load S0 profile if all Consoles are off. 
  - OTA updates now available. "donutshop" shows up as a Network port in Arduino IDE 2.x
  - New Web UI!
  - Detection rates have been sped up!
    - Unpowered consoles that are DNS address based, timeout after 7 seconds. This is reduced to 2 seconds after a console's first power up.
      - console DNS addresses will be automatically replaced by IP in order for the 2 second timeout to work.
    - Quickest if IP address is used versus Domain address.
      - Ex: http://10.0.1.10/gameid vs http://ps1digital.local/gameid 

## Parts used
(links help support [RetroRGB!](https://retrorgb.com/))
  - **OTG Adapter:** The following were tested on 4/27/2026. Not all OTG adapters work.
     - [Jadebones USB C to USB OTG](https://amzn.to/4cRdskT)
     - [USB C OTG Adapter, 2 in 1 USB-C to USB](https://a.co/d/07DvAKlc)
     - IT: [IVIVTOR USB-C OTG Cable Adapter](https://www.amazon.it/dp/B0F8N12YQD) (tested on 8/24/26)
  - **Nano ESP32:** pick one based on availability
     - [WaveShare Nano ESP32](https://amzn.to/45FE30D) or from [Aliexpress](https://s.click.aliexpress.com/e/_c3cHQg5V)
     - [Arduino Nano ESP32](https://amzn.to/4xXGsQm)
  - **USB-A to C cable**
     - [Short USB A to USB C Cable](https://amzn.to/4qvE7cV)

 <br /><br />

## gameID devices currently supported
| **Device**    | Supported | Notes |
| ------------- | ------------- |------------- |
|PS1Digital | yes, confirmed first hand | |
|N64Digital | yes, confirmed first hand | |
|RetroGEM N64 | yes | |
|RetroGEM PS1 | yes | |
| MemCardPro 2 | yes, for GameCube, PS1, & PS2 | MCP 2.0 firmware requires https instead of http. <br> MCP 3.0 firmware requires disabling "WebUI v2 (Beta)" access and then you can use the http method. Ex: http://10.0.1.52/api/currentState |
| Fenrir ?| | |
| more on the way... |  

### LED activity
| **Color**    | Blinking | On | Notes |
| ------------- | ------------- |------------- |------------- |
| 🟠| | Wifi not connected | After 2 minutes of unsuccessfully connecting, "DonutShop_Setup" Wifi AP will reappear to help with reconnection. |
| 🔵| WiFi active, querying gameID addresses| Longer blinks represent an unsuccessful query of gameID address. Usually a powered off console in the list.| After initial power, no BLUE light means WiFi not found. |
| 🟢| 1 second blink is gameID match found and SVS profile being sent to RT4K | |  | 
| 🔴| | Power| No way to control as it's hardwired in. May just need to cover with tape. |

## Flashing 
1. Open the [DonutShop Firmware Installer](https://svirant.github.io/DonutShop/install/) in Brave/Chrome/Edge.
2. Once complete, reconnect the USB cable of the device and continue **Setup** below...
3. If you get an error pertaining to "Timed out while claiming DFU interface 0", try the Alternative Flashing steps at the bottom of the page.
   - So far this has only been the case for Windows 11 and support is not currently implemented.

## Setup
1. Upon reconnecting the USB cable, your board should **Successfully boot DonutShop** and leave you with an ORANGE led.
2. With your computer or smartphone, join the broadcasted ```DonutShop_Setup``` WiFi to connect it to your home network.
    - You can now also change the default "donutshop" Hostname. Must follow the rules listed and will have .local appended automatically.
    - ONLY "a-z", "0-9", and "-" (hyphen) characters are allowed. (edge hyphens not allowed)
3. Follow the instructions listed and once complete, you should see a BLUE led indicating it's connected to WiFi and looking for addresses to connect to. If the BLUE led does not show, press the RST button one time.
4. You should now be able to visit http://donutshop.local to confirm WiFi connectivity.
5. Disconnect the Arduino Nano ESP32 and connect it to the OTG adapter. Connect the OTG assembly to the RT4K and everything should power on.
6. Reconfirm connectivity to http://donutshop.local and refresh the page after the RT4K has fully booted.
7. For all updates you can visit the "Firmware Update" section in Settings to "Check for Updates" and auto update to the latest.
8. There is also a manual update section where you can apply any version's _update .bin file. Updating manually with the _full version will not work.
   
## General Setup

For Consoles, quickest if IP address is used versus Domain address:
  - Ex: http://10.0.1.10/gameid vs http://ps1digital.local/gameid 

If you have multiple consoles on when DonutShop is booting, the console furthest down the list wins. If more than 2 consoles are active when one is powered off, the console that was on prior takes over. (Order is remembered.)<br>

There are a multiple moving parts with this setup, and if you have issues, please use the "DonutShop_usb-only-test.ino". More info in the troublehshooting section at the end.

## Adding gameIDs, Consoles, and other Options

The Web UI allows you to live update the Consoles and gameID table. You no longer have to reflash for changes. You can also now import and export your config if anything were to happen and you need to rebuild.

## WiFi setup
**ONLY** compatible with **2.4GHz** WiFi APs. Configured during initial setup process. If you need to change SSID or password, the "DonutShop_Setup" AP will reappear after 2 minutes of not being able to connect.

## [Advanced] Programming the Arduino Nano ESP32 with custom .ino changes
I recommend the [Official Arduino IDE and guide](https://docs.arduino.cc/software/ide-v2/tutorials/getting-started-ide-v2/) if you're unfamiliar with Arduinos. All .ino files used for programming are listed above. The following Libraries will also need to be added in order to Compile successfully.<br />
- **Add Additional Boards**
  - In the Arduino IDE open up "Settings", find the section "Additional boards manager URLs:"
  - Add in: https://espressif.github.io/arduino-esp32/package_esp32_index.json and select "OK"
1. First, you must have completed the steps shown in the "Flashing" section above at least once before continuing.
2. "Double click" the RST button right after connecting to your PC/Mac to put into "recovery mode". You'll see a GREEN led strobe if successful.
3. Open up Donut_Dongle_gameID.ino in the Arduino IDE to make your custom changes.
4. Under the "Tools" menu, make sure...
- Board - "esp32" -> "Arduino Nano ESP32" is selected. DO NOT select "Arduino ESP32 Boards" -> "Arduino Nano ESP32"
- Port - The listed "Serial" port is chosen, not dfu one.
    - If Donut_Shop is currently running, you should also see a "DonutShop" Network Port that connects via WiFi.
- Core Debug Level - "None"
- Partition Scheme - "With SPIFFS partition (advanced)" is chosen
- Pin Numbering - "By Arduino pin (default)"
- USB Mode - "Debug mode (Hardware CDC)" / **Important that this is selected!**
5. To flash the changes, select "Sketch" -> "Upload"

<br />

## Thank you!
  - BIG Thanks goes to Mike Chi of RetroTink for early access to the documentation and most importantly the WebCtl test app that made this possible.
  - The RetroTink Discord for beta testing feedback.
  - Bob @ RetroRGB for always supporting and being an invaluable resource to the community.
  - Huge thanks to @CielFricker249 / "Aru" on the RetroTink Discord for the gameID idea and testing of the Donut Dongle project as well!

## TroubleShooting ##

The 🔵 and 🟢 leds indicate WiFi and usb serial/gameID lookup. This should help diagnose as a first step.

If you are sure of these settings, and it still does not work, try the following to test the usb serial connection:
  - Configure your Arduino Nano ESP32 with the provided "DonutShop_usb-only-test.ino". This is configured to only load "remote profile 8".
    - You can change the 8 to 1 - 9 if needed.
  - Verify that everything is connected with your OTG adapter and has power.
  - Press the reset button on top of the device and within a couple of seconds it should load the remote profile.

    If this works, then there must be a wifi connectivity issue somewhere. 

    Here is a video of the "usb only test" being performed: https://www.youtube.com/watch?v=XP7OSW7X0DQ

## Alternative Flashing Steps
1. Open [ESP Tool](https://espressif.github.io/esptool-js/) in Chrome, Brave, or Edge
2. Connect your Arduino Nano ESP32 via USB directly to your PC or Mac (not through a usb-hub) and double click the Nano's RST button immediately following to enter **recovery mode** (a GREEN led will strobe when successful)
3. Clicking **Connect** opens up a selection menu and you should see something like (depending on OS and Nano brand) Nano ESP32 or TinyUSB
4. With the **Connect menu** still open, single click the Nano button once more and quickly select the new device named USB JTAG; click **Connect**
    - If it disappears, click the Nano button again for it to return. Be faster this time! ;)
4b. If Step 4 is not working, Refresh the page and click **Connect** once more. You should now see USB JTAG available for **Connect**
5. Click **Erase Flash** to format your device (required for LittleFS)
6. Download the latest files from the Github Releases section.
7. Set Flash Address to **0x0** and Choose the file ```DonutShop_vX.X.X_full.bin```
8. Click **Add File**, set the next Flash Address to **0xF70000**, Choose ```nora_recovery.bin```
9. Click **Program**
10. Once complete, reconnect the USB cable of the device and continue **Setup** below...
