# DonutShop
is an Arduino Nano ESP32 + OTG adapter that changes profiles for the RT4K based on gameID. <br />

<img src="./images/dsdemo.JPG"><br />

<p align="center"><img width="500" src="./images/1ds.JPG"></p><br />


See it in action: https://youtu.be/ldbfFbKzjh8
<br /><br />
## Updates
  - ALL settings are now configured in the Web UI, including Wifi.
  - New Captive Portal for joining to your home network. Initial setup requires connecting to "DonutShop_Setup" Wifi.
  - New Settings page allows you to Update Firmware and Load S0 profile if all Consoles are off. 
  - OTA updates now available. "donutshop" shows up as a Network port in Arduino IDE 2.x
  - New Web UI!
    - [Follow steps below to setup.](https://github.com/svirant/DonutShop/#additional-steps-for-latest-version-of-donutshopino)
  - Detection rates have been sped up!
    - Unpowered consoles that are DNS address based, timeout after 7 seconds. This is reduced to 2 seconds after a console's first power up.
      - console DNS addresses will be automatically replaced by IP in order for the 2 second timeout to work.
    - Quickest if IP address is used versus Domain address.
      - Ex: http://10.0.1.10/gameid vs http://ps1digital.local/gameid 

## Parts used
  - **OTG Adapter:** https://www.amazon.com/dp/B0CQKXWRNF
     - 18w version, not 60w
     - not all OTG adapters work, this one works the best
  - **Arduino Nano ESP32:** https://www.amazon.com/dp/B0CXHZXJXP
 <br /><br />

## gameID devices currently supported
| **Device**    | Supported | Notes |
| ------------- | ------------- |------------- |
|PS1Digital | yes, confirmed first hand | |
|N64Digital | yes, confirmed first hand | |
|RetroGEM N64 | yes | |
|RetroGEM PS1 | yes | |
| MemCardPro 2 | yes, for GameCube, PS1, & PS2 | MemCardPro 2.0+ firmware requires https instead of http |
| Fenrir ?| | |
| more on the way... |  

### LED activity
| **Color**    | Blinking | On | Notes |
| ------------- | ------------- |------------- |------------- |
| 🟠| | Wifi not connected | After 2 minutes of unsuccessfully connecting, "DonutShop_Setup" Wifi AP will reappear to help with reconnection. |
| 🔵| WiFi active, querying gameID addresses| Longer blinks represent an unsuccessful query of gameID address. Usually a powered off console in the list.| After initial power, no blue light means WiFi not found. |
| 🟢| 1 second blink is gameID match found and SVS profile being sent to RT4K | |  | 
| 🔴| | Power| No way to control as it's hardwired in. May just need to cover with tape. |

You can disable the <code style="color : blue">BLUE</code> / <code style="color : green">GREEN</code> LEDs by commenting out the following lines in the .ino:
```
 //pinMode(LED_GREEN, OUTPUT);
 //pinMode(LED_BLUE, OUTPUT);
```

## Flashing 
1. Download the latest ```.bin``` files listed above
2. Open [ESP Tool](https://espressif.github.io/esptool-js/) in Chrome, Brave, or Edge
3. Connect your Arduino Nano ESP32 via USB and double click the RST button immediately following to enter **recovery mode** (a GREEN led will strobe when successful)
4. Click **Connect** and select your device (typically starts with USB JTAG)
5. Click **Erase Flash** to format your device (required for LittleFS)
6. Set Flash Address to **0x0** and Choose the downloaded file ```Donut_Shop.bin```
7. Click **Add File**, set the next Flash Address to **0xF70000**, Choose ```nora_recovery.bin```
8. Click **Program**
9. Once complete, reconnect the USB cable of the device and continue **Setup** below...

## Setup
1. Upon reconnecting the USB cable, your board should **Successfully boot DonutShop** and leave you with an ORANGE led.
2. With your computer or smartphone, join the broadcasted ```DonutShop_Setup``` WiFi to connect it to your home network.
3. Follow the instructions listed and once complete, you should see a BLUE led indicating it's connected to WiFi and looking for addresses to connect to. If the blue led does not show, press the RST button one time.
4. You should now be able to visit http://donutshop.local to finish setup.
5. For all future changes/uploads you can use the "Firmware Update" section in Settings to apply the latest listed .bin file.
   
## General Setup

For Consoles, quickest if IP address is used versus Domain address:
  - Ex: http://10.0.1.10/gameid vs http://ps1digital.local/gameid 

<br />
If you have multiple consoles on when DonutShop is booting, the console furthest down the list wins. If more than 2 consoles are active when one is powered off, the console that was on prior takes over. (Order is remembered.)<br><br>

There are a multiple moving parts with this setup, and if you have issues, please use the "DonutShop_usb-only-test.ino". More info in the troublehshooting section at the end.

## Adding gameIDs, Consoles, and other Options

The Web UI allows you to live update the Consoles and gameID table. You no longer have to reflash for changes. You can also now import and export your config if anything were to happen and you need to rebuild.

## WiFi setup
**ONLY** compatible with **2.4GHz** WiFi APs. Configured during initial setup process. If you need to change SSID or password, the "DonutShop_Setup" AP will reappear after 2 minutes of not being able to connect.

## [Advanced] Programming the Arduino Nano ESP32 with custom .ino changes
I recommend the [Official Arduino IDE and guide](https://docs.arduino.cc/software/ide-v2/tutorials/getting-started-ide-v2/) if you're unfamiliar with Arduinos. All .ino files used for programming are listed above. The following Libraries will also need to be added in order to Compile successfully.<br />
- **Libraries:**
  - If a Library is missing, it should be available through the built-in Library Manager under "Tools" -> "Manage Libraries..."
  - <EspUsbHostSerial_FTDI.h>  Follow these steps to add EspUsbHostSerial_FTDI.h
    - Goto https://github.com/wakwak-koba/EspUsbHost
    - Click the <code style="color : green">GREEN</code> "<> Code" box and "Download ZIP"
    - In Arudino IDE; goto "Sketch" -> "Include Library" -> "Add .ZIP Library"

<br />

## Thank you!
 - Thanks to https://github.com/wakwak-koba for his fork of the EspUsbHost library. Without it, it would have taken much longer to figure out the usb communication bits.
  - Huge thanks to @CielFricker249 / "Aru" on the RetroTink discord for the idea and testing of the Donut Dongle project as well!

## TroubleShooting ##

If only the red status and power led are red, and you can ping the device but not access the web ui, the SPIFFS partition has not been configured. Make sure to follow the steps above to ensure the bootloader has been burned and device flashed properly the first time.

The 🔵 and 🟢 leds indicate WiFi and usb serial/gameID lookup. This should help diagnose as a first step.

After that, confirm the following:
 - Configured Wifi settings in .ino.
    - Make sure it's to a **2.4GHz** Wifi AP. **5GHz is NOT supported** by the Arduino Nano ESP32.
 - Have at least 1 gameID to profile in the gameDB
 - Have at least 1 address in the consoles db that you can access with a web browser

 If you are sure of these settings, and it still does not work, try the following to test the usb serial connection:
  - Configure your Arduino Nano ESP32 with the provided "DonutShop_usb-only-test.ino". This is configured to only load "remote profile 8".
    - You can change the 8 to 1 - 9 if needed.
  - Verify that everything is connected with your OTG adapter and has power.
  - Press the reset button on top of the Arduino and within a couple of seconds it should load the remote profile.

    If this works, then there must be a wifi connectivity issue somewhere. 

    Here is a video of the "usb only test" being performed: https://www.youtube.com/watch?v=XP7OSW7X0DQ

