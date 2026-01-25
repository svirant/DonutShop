/*
* RT4K ClownCar v0.4
* Copyright(C) 2026 @Donutswdad
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation,either version 3 of the License,or
*(at your option) any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program.  If not,see <http://www.gnu.org/licenses/>.
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <SPIFFS.h>
#include <ArduinoJson.h>
#include <Arduino_JSON.h>
#include <ESPmDNS.h>
#include <EspUsbHostSerial_FTDI.h> // https://github.com/wakwak-koba/EspUsbHost in order to have FTDI support for the RT4K usb serial port, this is the easist method.
                                   // Step 1 - Goto the github link above. Click the GREEN "<> Code" box and "Download ZIP"
                                   // Step 2 - In Arudino IDE; goto "Sketch" -> "Include Library" -> "Add .ZIP Library"
                                  

/*
////////////////////
//    OPTIONS    //
//////////////////
*/

bool const VGASerial = false;    // Use onboard TX1 pin to send Serial Commands to RT4K.

bool S0_pwr = false;        // Load "S0_pwr_profile" when all consoles defined below are off. Defined below.

int S0_pwr_profile = -12;    // When all consoles definied below are off, load this profile. set to 0 means that S0_<whatever>.rt4 profile will load.
                                 // "S0_pwr" must be set true
                                 //
                                 // If using a "remote button profile" which are valued 1 - 12, place a "-" before the profile number. 
                                 // Example: -1 means "remote button profile 1"
                                 //          -12 means "remote button profile 12"

bool S0_gameID = true;     // When a gameID match is not found for a powered on console, DefaultProf for that console will load


//////////////////

int currentProf = 32222;  // current SVS profile number, set high initially
unsigned long currentGameTime = 0;
unsigned long prevGameTime = 0;
String payload = ""; 


class SerialFTDI : public EspUsbHostSerial_FTDI {
  public:
  String cprof = "null";
  String tcprof = "null";
  virtual void task(void) override {
    EspUsbHost::task();
    if(this->isReady()){
      usb_host_transfer_submit(this->usbTransfer_recv);
      if(cprof != "null" && currentProf != cprof.toInt()){
        currentProf = cprof.toInt();
        analogWrite(LED_GREEN,222);
        if(currentProf >= 0){
          tcprof = "\rSVS NEW INPUT=" + cprof + "\r";
          submit((uint8_t *)reinterpret_cast<const uint8_t*>(&tcprof[0]), tcprof.length());
          delay(1000);
          tcprof = "\rSVS CURRENT INPUT=" + cprof + "\r";
        }
        if(currentProf < 0){
          tcprof = "\rremote prof" + String((-1)*currentProf) + "\r";
          delay(1000); // only added so the green led stays lit for 1 second. not needed for "remote prof" command.
        }
        submit((uint8_t *)reinterpret_cast<const uint8_t*>(&tcprof[0]), tcprof.length());
        analogWrite(LED_GREEN,255);

      }
    }
  }
};

SerialFTDI usbHost;

struct Console {
  String Desc;
  String Address;
  int DefaultProf;
  int Prof;
  int On;
  int King;
  bool Enabled;
};

/*
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//    CONFIG     //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
*/
                   // format as so: {console address, Default Profile for console, current profile state (leave 0), power state (leave 0), active state (leave 0)}
                   //
                   // If using a "remote button profile" for the "Default Profile" which are valued 1 - 12, place a "-" before the profile number. 
                   // Example: -1 means "remote button profile 1"
                   //          -12 means "remote button profile 12"
                   //            0 means SVS profile 0
                   //            1 means SVS profile 1
                   //           12 means SVS profile 12
                   //           etc...
Console consoles[] = {{"PS1","http://ps1digital.local/gameid",-9,0,0,0,1}, // you can add more, but stay in this format
                      {"MemCardPro","http://10.0.1.53/api/currentState",-10,0,0,0,1},
                   // {"PS2","http://ps2digital.local/gameid",102,0,0,0,1}, // remove leading "//" to uncomment and enable ps2digital
                   // {"MCP","http://10.0.0.14/api/currentState",104,0,0,0,1}, // address format for MemCardPro. replace IP address with your MCP address
                      {"N64","http://n64digital.local/gameid",-7,0,0,0,1} // the last one in the list has no "," at the end
                      };

int consolesSize = sizeof(consoles) / sizeof(consoles[0]); // length of consoles DB. can grow dynamically

                   // If using a "remote button profile" for the "PROFILE" which are valued 1 - 12, place a "-" before the profile number. 
                   // Example: -1 means "remote button profile 1"
                   //          -12 means "remote button profile 12"
                   //            0 means SVS profile 0
                   //            1 means SVS profile 1
                   //           12 means SVS profile 12
                   //           etc...
                   //                      
                                 // {"Description","<GAMEID>","PROFILE #"},
String gameDB[1000][3] = {{"N64 EverDrive","00000000-00000000---00","7"}, // 7 is the "SVS PROFILE", would translate to a S7_<USER_DEFINED>.rt4 named profile under RT4K-SDcard/profile/SVS/
                      {"xstation","XSTATION","8"},               // XSTATION is the <GAMEID>
                      {"GameCube","GM4E0100","505"},             // GameCube is the Description
                      {"N64 MarioKart 64","3E5055B6-2E92DA52-N-45","501"},
                      {"N64 Mario 64","635A2BFF-8B022326-N-45","502"},
                      {"N64 GoldenEye 007","DCBC50D1-09FD1AA3-N-45","503"},
                      {"N64 Wave Race 64","492F4B61-04E5146A-N-45","504"},
                      {"PS1 Ridge Racer Revolution","SLUS-00214","10"},
                      {"PS1 Ridge Racer","SCUS-94300","9"},
                      {"MegaDrive","MegaDrive","506"},
                      {"SoR2","Streets of Rage 2 (USA)","507"}};

int gameDBSize = 11; // array can hold 1000 entries, but only set to current size so the UI doesnt show 989 blank entries :)

// WiFi config is just below

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

WebServer server(80);
uint16_t gTime = 2000;

void setup(){

  WiFi.begin("SSID","password"); // WiFi creds go here. MUST be a 2.4GHz WiFi AP. 5GHz is NOT supported by the Nano ESP32.
  usbHost.begin(115200); // leave at 115200 for RT4K connection
  if(VGASerial){
    Serial0.begin(9600);
    while(!Serial0){;}   // allow connection to establish before continuing
    Serial0.print(F("\r")); // clear RT4K Serial buffer
  }
  pinMode(LED_GREEN, OUTPUT); // GREEN led lights up for 1 second when a SVS profile is sent
  pinMode(LED_BLUE, OUTPUT); // BLUE led is a WiFi activity. Long periods of blue means one of the gameID servers is not connecting.
  analogWrite(LED_GREEN,255);
  analogWrite(LED_BLUE,255);
  MDNS.begin("clowncar");
  if(!SPIFFS.begin(true)){
    Serial0.println(F("SPIFFS mount failed!"));
    return;
  }

  loadGameDB();
  loadConsoles();
  loadS0Vars();

  server.on("/",HTTP_GET,handleRoot);
  server.on("/getConsoles",HTTP_GET,handleGetConsoles);
  server.on("/updateConsoles",HTTP_POST,handleUpdateConsoles);
  server.on("/getGameDB",HTTP_GET,handleGetGameDB);
  server.on("/updateGameDB",HTTP_POST,handleUpdateGameDB);
  server.on("/getS0Vars", HTTP_GET, handleGetS0Vars);
  server.on("/updateS0Vars", HTTP_POST, handleUpdateS0Vars);
  server.on("/getPayload", HTTP_GET, handleGetPayload);

  server.begin();  
}  // end of setup

void loop(){

  readGameID();
  server.handleClient();
  usbHost.task();  // used for RT4K usb serial communications

}  // end of loop()


int fetchGameIDProf(String gameID,int dp){ // looks at gameDB for a gameID -> profile match
  for(int i = 0; i < gameDBSize; i++){      // returns "DefaultProf" for console if nothing found and S0_gameID = true
    if(gameDB[i][1] == gameID){            // returns "-1" (meaning dont change anything) if nothing found and S0_gameID = false
      return gameDB[i][2].toInt();
      break;
   }
  }

  if(S0_gameID) return dp;
  else return -1;
}  // end of fetchGameIDProf()

void readGameID(){ // queries addresses in "consoles" array for gameIDs
  currentGameTime = millis();  // Init timer
  if(prevGameTime == 0)       // If previous timer not initialized, do so now.
    prevGameTime = millis();
  if((currentGameTime - prevGameTime) >= gTime){ // make sure at least gTime has passed before continuing

    int result = 0;
    for(int i = 0; i < consolesSize; i++){
      if(WiFi.status() == WL_CONNECTED && consoles[i].Enabled){ // wait for WiFi connection
        HTTPClient http;
        http.setConnectTimeout(2000); // give only 2 seconds per console to check gameID, is only honored for IP-based addresses
        http.begin(consoles[i].Address);
        analogWrite(LED_BLUE,222);
        int httpCode = http.GET();             // start connection and send HTTP header
        if(httpCode > 0 || httpCode == -11){   // httpCode will be negative on error, let the read error slide...
          if(httpCode == HTTP_CODE_OK){        // console is healthy // HTTP header has been sent and Server response header has been handled
            consoles[i].Address = replaceDomainWithIP(consoles[i].Address); // replace Domain with IP in consoles array. this allows setConnectTimeout to be honored
            payload = http.getString();        
            JSONVar MCPjson = JSON.parse(payload); // 
            if(JSON.typeof(MCPjson) != "undefined"){ // If the response is JSON, continue
              if(MCPjson.hasOwnProperty("gameID")){  // If JSON contains gameID, reset payload to it's value
                payload = (const char*) MCPjson["gameID"];
              }
            }
            result = fetchGameIDProf(payload,consoles[i].DefaultProf);
            consoles[i].On = 1;
            if(consoles[i].Prof != result && result != -1){ // gameID found for console, set as King, unset previous King, send profile change 
              consoles[i].Prof = result;
              consoles[i].King = 1;
              for(int j=0;j < consolesSize;j++){ // set previous King to 0
                if(i != j && consoles[j].King == 1)
                  consoles[j].King = 0;
              }
              usbHost.cprof = String((consoles[i].Prof));
              if(VGASerial)sendProfile(consoles[i].Prof);
            }
        } 
        } // end of if(httpCode > 0 || httpCode == -11)
        else{ // console is off, set attributes to 0, find a console that is On starting at the top of the gameID list, set as King, send profile
          consoles[i].On = 0;
          consoles[i].Prof = 33333;
          if(consoles[i].King == 1){
            currentProf = 33333;
            usbHost.cprof = String(33333);
            for(int k=0;k < consolesSize;k++){
              if(i == k){
                consoles[k].King = 0;
                for(int l=0;l < consolesSize;l++){ // find next Console that is on
                  if(consoles[l].On == 1){
                    consoles[l].King = 1;
                    usbHost.cprof = String((consoles[l].Prof));
                    if(VGASerial)sendProfile(consoles[l].Prof);
                    break;
                  }
                }
              }
    
            } // end of for()
          } // end of if()
          int count = 0;
          for(int m=0;m < consolesSize;m++){
            if(consoles[m].On == 0) count++;
          }
          if(count == consolesSize && S0_pwr){
            usbHost.cprof = String(S0_pwr_profile);
            if(VGASerial)sendProfile(S0_pwr_profile);
          }   
        } // end of else()
      http.end();
      analogWrite(LED_BLUE, 255);
      }  // end of WiFi connection
      else if(!consoles[i].Enabled){ // console is disabled in web ui, set attributes to 0, find a console that is On starting at the top of the gameID list, set as King, send profile
          consoles[i].On = 0;
          consoles[i].Prof = 33333;
          if(consoles[i].King == 1){
            currentProf = 33333;
            usbHost.cprof = String(33333);
            for(int k=0;k < consolesSize;k++){
              if(i == k){
                consoles[k].King = 0;
                for(int l=0;l < consolesSize;l++){ // find next Console that is on
                  if(consoles[l].On == 1){
                    consoles[l].King = 1;
                    usbHost.cprof = String((consoles[l].Prof));
                    if(VGASerial)sendProfile(consoles[l].Prof);
                    break;
                  }
                }
              }
    
            } // end of for()
          } // end of if()
      } // end of if else()      
    }
    currentGameTime = 0;
    prevGameTime = 0;
  }
}  // end of readGameID()

String replaceDomainWithIP(String input){
  String result = input;
  int startIndex = 0;
  while(startIndex < result.length()){
    int httpPos = result.indexOf("http://",startIndex); // Look for "http://"
    if(httpPos == -1) break;  // No "http://" found
    int domainStart = httpPos + 7; // Set the position right after "http://"
    int domainEnd = result.indexOf('/',domainStart);  // Find the end of the domain (start of the path)
    if(domainEnd == -1) domainEnd = result.length();  // If no path, consider till the end of the string
    String domain = result.substring(domainStart,domainEnd);
    if(!isIPAddress(domain)){ // If the domain is not an IP address, replace it
      IPAddress ipAddress;
      if(WiFi.hostByName(domain.c_str(),ipAddress)){  // Perform DNS lookup
        result.replace(domain,ipAddress.toString()); // Replace the Domain with the IP address
      }
    }
    startIndex = domainEnd;  // Continue searching after the domain
  } // end of while()
  return result;
} // end of replaceDomainWithIP()

bool isIPAddress(String str){
  IPAddress ip;
  return ip.fromString(str);  // Returns true if the string is a valid IP address
}

void sendProfile(int num){
  analogWrite(LED_GREEN,222);
  if(num >= 0){
    Serial0.print(F("\rSVS NEW INPUT="));
    Serial0.print(num);;
    Serial0.println(F("\r"));
    delay(1000);
    Serial0.print(F("\rSVS CURRENT INPUT="));
    Serial0.print(num);
    Serial0.println(F("\r"));
  }
  else if(num < 0){
    Serial0.print(F("\rremote prof"));
    Serial0.print((-1) * num);
    Serial0.println(F("\r"));
  }
  analogWrite(LED_GREEN,255);
}

void handleGetConsoles(){
    JsonDocument doc;
    JsonArray arr = doc.to<JsonArray>();
    for(int i=0;i<consolesSize;i++){
        JsonObject obj = arr.add<JsonObject>();
        obj["Desc"] = consoles[i].Desc;
        obj["Address"] = consoles[i].Address;
        obj["DefaultProf"] = consoles[i].DefaultProf;
        obj["Enabled"] = consoles[i].Enabled;
    }

    String out; serializeJson(doc,out);
    server.send(200,"application/json",out);
}

void handleGetGameDB(){
    JsonDocument doc;
    JsonArray arr = doc.to<JsonArray>();
    for(int i=0;i<gameDBSize;i++){
        JsonArray item = arr.add<JsonArray>();
        item.add(gameDB[i][0]);
        item.add(gameDB[i][1]);
        item.add(gameDB[i][2]);
    }
    String out; serializeJson(doc,out);
    server.send(200,"application/json",out);
}

void saveGameDB(){
  File f = SPIFFS.open("/gameDB.json", FILE_WRITE);
  if(!f){
    Serial0.println(F("saveGameDB(): failed to open file"));
    return;
  }

  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();

  for(int i = 0; i < gameDBSize; i++){
    JsonArray item = arr.add<JsonArray>();
    item.add(gameDB[i][0]);
    item.add(gameDB[i][1]);
    item.add(gameDB[i][2]);
  }

  serializeJson(doc, f);
  f.close();
}

void handleUpdateGameDB(){
  if(!server.hasArg("plain")){
    server.send(400, "application/json", "{\"error\":\"No data\"}");
    return;
  }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, server.arg("plain"));
  if(err){
    server.send(400, "application/json", "{\"error\":\"Bad JSON\"}");
    return;
  }

  JsonArray arr = doc.as<JsonArray>();

  gameDBSize = 0;
  for(JsonArray item : arr){
    gameDB[gameDBSize][0] = item[0].as<String>();
    gameDB[gameDBSize][1] = item[1].as<String>();
    gameDB[gameDBSize][2] = item[2].as<String>();
    gameDBSize++;
  }

  saveGameDB();

  server.send(200, "application/json", "{\"status\":\"ok\"}");
}

void loadGameDB(){
  if(!SPIFFS.exists("/gameDB.json")){
    Serial0.println(F("gameDB.json not found, using default"));
    return; // keep your default array
  }

  File f = SPIFFS.open("/gameDB.json", FILE_READ);
  if(!f){
    Serial0.println(F("Failed to open gameDB.json"));
    return;
  }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, f);
  f.close();

  if(err){
    Serial0.println(F("Failed to parse gameDB.json"));
    return;
  }

  JsonArray arr = doc.as<JsonArray>();
  gameDBSize = 0;
  for(JsonArray item : arr){
    gameDB[gameDBSize][0] = item[0].as<String>();
    gameDB[gameDBSize][1] = item[1].as<String>();
    gameDB[gameDBSize][2] = item[2].as<String>();
    gameDBSize++;
  }

  Serial0.println(F("gameDB loaded from SPIFFS"));
}

void saveConsoles(){
  File f = SPIFFS.open("/consoles.json", FILE_WRITE);
  if(!f) return;

  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();

  for(int i = 0; i < consolesSize; i++){
    JsonObject obj = arr.add<JsonObject>();
    obj["Desc"]        = consoles[i].Desc;
    obj["Address"]     = consoles[i].Address;
    obj["DefaultProf"] = consoles[i].DefaultProf;
    obj["Enabled"]      = consoles[i].Enabled;
  }

  serializeJson(doc, f);
  f.close();
}

void handleUpdateConsoles(){
  if(!server.hasArg("plain")){
    server.send(400, "application/json", "{\"error\":\"No data\"}");
    return;
  }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, server.arg("plain"));
  if(err){
    server.send(400, "application/json", "{\"error\":\"Bad JSON\"}");
    return;
  }

  JsonArray arr = doc.as<JsonArray>();

  // Update consoles array in RAM
  int newSize = 0;
  for(JsonObject obj : arr){
    consoles[newSize].Desc        = obj["Desc"].as<String>();
    consoles[newSize].Address     = obj["Address"].as<String>();
    consoles[newSize].DefaultProf = obj["DefaultProf"].as<int>();
    consoles[newSize].Enabled      = obj["Enabled"].as<bool>();
    newSize++;
  }
  consolesSize = newSize;

  // Persist to SPIFFS
  saveConsoles();

  server.send(200, "application/json", "{\"status\":\"ok\"}");
}

String embedS0Vars(){
  JsonDocument doc;
  doc["S0_gameID"] = S0_gameID;
  doc["S0_pwr"] = S0_pwr;
  doc["S0_pwr_profile"] = S0_pwr_profile;

  String json;
  serializeJson(doc, json);

  return "let S0Vars = " + json + ";";
}

void handleUpdateS0Vars(){
  if(!server.hasArg("plain")){
    server.send(400, "text/plain", "No body");
    return;
  }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, server.arg("plain"));

  if(err){
    server.send(400, "text/plain", "Bad JSON");
    return;
  }

  if(doc["S0_gameID"].is<bool>()){
    S0_gameID = doc["S0_gameID"].as<bool>();
  }
  if(doc["S0_pwr"].is<bool>()){
    S0_pwr = doc["S0_pwr"].as<bool>();
  }
  if(doc["S0_pwr_profile"].is<int>()){
    S0_pwr_profile = doc["S0_pwr_profile"].as<int>();
  }

  saveS0Vars();
  server.send(200, "text/plain", "OK");
}

void saveS0Vars(){
  JsonDocument doc;

  doc["S0_gameID"] = S0_gameID;
  doc["S0_pwr"] = S0_pwr;
  doc["S0_pwr_profile"] = S0_pwr_profile;

  File f = SPIFFS.open("/s0vars.json", FILE_WRITE);
  if(!f) return;

  serializeJson(doc, f);
  f.close();
}

void loadS0Vars(){
  if(!SPIFFS.exists("/s0vars.json")){
    Serial0.println(F("S0 vars not found, using defaults"));
    return;
  }

  File f = SPIFFS.open("/s0vars.json", FILE_READ);
  if(!f) return;

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, f);
  f.close();

  if(err){
    Serial0.println(F("Failed to parse S0 JSON"));
    return;
  }

  if(doc["S0_gameID"].is<bool>())
    S0_gameID = doc["S0_gameID"].as<bool>();
  if(doc["S0_pwr"].is<bool>())
    S0_pwr = doc["S0_pwr"].as<bool>();
  if(doc["S0_pwr_profile"].is<int>())
    S0_pwr_profile = doc["S0_pwr_profile"].as<int>();

}

void handleGetS0Vars(){
  JsonDocument doc;

  doc["S0_gameID"] = S0_gameID;
  doc["S0_pwr"] = S0_pwr;
  doc["S0_pwr_profile"] = S0_pwr_profile;

  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

void loadConsoles(){
    if(!SPIFFS.exists("/consoles.json")) return;
    File f = SPIFFS.open("/consoles.json", FILE_READ);
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc,f);
    if(err){ f.close(); return; }
    JsonArray arr = doc.as<JsonArray>();
    consolesSize = 0;
    for(JsonObject obj: arr){
        consoles[consolesSize].Desc = obj["Desc"].as<String>();
        consoles[consolesSize].Address = obj["Address"].as<String>();
        consoles[consolesSize].DefaultProf = obj["DefaultProf"].as<int>();
        consoles[consolesSize].Enabled = obj["Enabled"].as<bool>();
        consolesSize++;
    }
    f.close();
}

void handleGetPayload(){
  server.send(200, "text/plain", payload);
}

void handleRoot() {
  String page = R"rawliteral(
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Clown Car</title>
    <style>
      body { font-family: sans-serif; }
      table { border-collapse: collapse; width: 80%; margin: 20px auto; }
      th, td { border: 1px solid #999; padding: 6px 10px; }
      th { background: #eee; cursor: pointer; user-select: none; }
      input { width: 100%; }
      button { margin: 2px; }
      h2, h3 { text-align: center; }
      .controls { text-align: center; }
      .arrow { font-size: 0.8em; margin-left: 4px; color: #555; }
      .s0-row { background-color: #f0f0f0; font-weight: bold; }
    </style>
  </head>
  <body>

  <center><h1>Clown Car</h1></center>

  <div class="controls">
    <button onclick="addConsole()">Add Console</button>
    <button onclick="addProfile()">Add Profile</button>
  </div>

  <h2>Consoles</h2>
  <table id="consoleTable">
    <thead>
      <tr>
        <th>Enabled</th>
        <th>Description</th>
        <th>Address</th>
        <th>
          No Match Profile
          <input type="checkbox" id="S0_gameID" style="margin-left:5px;"
                 onchange="updateS0GameID(this)">
        </th>
        <th>Action</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>

  <h2>gameDB</h2>
  <table id="profileTable">
    <thead>
      <tr>
        <th onclick="sortProfiles(0)">Name <span class="arrow" id="arrow0">▲▼</span></th>
        <th onclick="sortProfiles(1)">gameID <span class="arrow" id="arrow1">▲▼</span></th>
        <th onclick="sortProfiles(2)">Profile # <span class="arrow" id="arrow2">▲▼</span></th>
        <th>Action</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>

  <script>
  let consoles = [];
  let gameProfiles = [];
  let currentSortCol = null;
  let currentSortDir = 'asc';

  )rawliteral";

  page += embedS0Vars();

  page += R"rawliteral(

  // ---------------- LOAD DATA ----------------
  async function loadData(){
    const c = await fetch('/getConsoles');
    consoles = await c.json();

    const g = await fetch('/getGameDB');
    gameProfiles = await g.json();

    renderConsoles();
    renderProfiles();
    updateArrows();

    // set initial state of S0_gameID checkbox
    const s0cb = document.getElementById('S0_gameID');
    if (s0cb && S0Vars['S0_gameID'] !== undefined) {
      s0cb.checked = S0Vars['S0_gameID'];
    }
  }

  // ---------------- CONSOLES ----------------
  function renderConsoles(){
    const tbody = document.querySelector('#consoleTable tbody');
    tbody.innerHTML = '';

    consoles.forEach((c, idx) => {
      const tr = document.createElement('tr');

      const tdEnable = document.createElement('td');
      const enableCheckbox = document.createElement('input');
      enableCheckbox.type = 'checkbox';
      enableCheckbox.checked = !!c.Enabled;
      enableCheckbox.onchange = async () => {
        consoles[idx].Enabled = enableCheckbox.checked;
        await saveConsoles(); 
        };
      tdEnable.appendChild(enableCheckbox);
      tr.appendChild(tdEnable);

      const tdDesc = document.createElement('td');
      const descInput = document.createElement('input');
      descInput.type = 'text'; descInput.value = c.Desc;
      descInput.onchange = async () => { 
        consoles[idx].Desc = descInput.value;
        await saveConsoles();
        };
      tdDesc.appendChild(descInput);
      tr.appendChild(tdDesc);

      const tdAddr = document.createElement('td');
      const addrInput = document.createElement('input');
      addrInput.type='text'; addrInput.value=c.Address;
      addrInput.onchange = async()=>{ 
        consoles[idx].Address = addrInput.value; 
        await saveConsoles(); 
        };
      tdAddr.appendChild(addrInput); 
      tr.appendChild(tdAddr);

      const tdProf = document.createElement('td');
      const profInput = document.createElement('input');
      profInput.type='number'; profInput.value=c.DefaultProf;
      profInput.onchange = async()=>{ 
        consoles[idx].DefaultProf = parseInt(profInput.value)||0; 
        await saveConsoles(); 
        };
      tdProf.appendChild(profInput); 
      tr.appendChild(tdProf);

      const tdDel = document.createElement('td');
      const delBtn = document.createElement('button'); 
      delBtn.textContent='Delete';
      delBtn.onclick=()=>deleteConsole(idx); 
      tdDel.appendChild(delBtn); 
      tr.appendChild(tdDel);

      tbody.appendChild(tr);
    });

    // --------- S0 row ----------
    const trS0 = document.createElement('tr'); trS0.className='s0-row';

    const tdEnableS0 = document.createElement('td');
    const s0cb = document.createElement('input'); s0cb.type='checkbox';
    s0cb.checked = !!S0Vars['S0_pwr'];
    s0cb.onchange = ()=>{ 
      S0Vars['S0_pwr']=s0cb.checked; 
      s0profile.disabled = !s0cb.checked; 
      saveS0Vars(); 
      };
    tdEnableS0.appendChild(s0cb); trS0.appendChild(tdEnableS0);

    const tdDescS0 = document.createElement('td');
    const labelSpan = document.createElement('span');
    labelSpan.textContent = "All Powered Off Profile: ";
    labelSpan.style.fontWeight = '500';
    tdDescS0.appendChild(labelSpan);

    const s0profile = document.createElement('input'); 
    s0profile.type='number'; 
    s0profile.id='S0_pwr_profile';
    s0profile.value = S0Vars['S0_pwr_profile'] || 0;
    s0profile.disabled = !s0cb.checked;
    s0profile.style.width = '10%';
    s0profile.onchange = ()=>{ 
      S0Vars['S0_pwr_profile']=parseInt(s0profile.value)||0; 
      saveS0Vars(); 
      };
    tdDescS0.appendChild(s0profile); 
    trS0.appendChild(tdDescS0);

    ['', '', ''].forEach(() => {
      const td = document.createElement('td');
      td.style.backgroundColor = 'white';
      td.style.border = 'none';
      trS0.appendChild(td);
    });

    tbody.appendChild(trS0);
  }

  async function saveConsoles(){
    await fetch('/updateConsoles', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(consoles)
    });
  }

  async function addConsole(){ 
    consoles.push({
      Desc:"Console Name",
      Address:"http://",
      DefaultProf:0,
      Enabled:true
      }); 
      await saveConsoles(); 
      loadData(); 
  }

  async function deleteConsole(idx){ 
    if(!confirm('Delete this console?')) return; 
    consoles.splice(idx,1); 
    await saveConsoles(); 
    renderConsoles(); 
  }

  // ---------------- PROFILES ----------------
  function renderProfiles(){ 
    const tbody=document.querySelector('#profileTable tbody'); 
    tbody.innerHTML='';
    gameProfiles.forEach((p,idx)=>{
      const tr=document.createElement('tr');
      const tdName=document.createElement('td'); 
      const nameInput=document.createElement('input'); 
      nameInput.value=p[0]; 
      nameInput.onchange=saveProfiles; 
      tdName.appendChild(nameInput); 
      tr.appendChild(tdName);
      const tdGameID=document.createElement('td'); 
      const gidInput=document.createElement('input'); 
      gidInput.value=p[1]; 
      gidInput.onchange=saveProfiles; 
      tdGameID.appendChild(gidInput); 
      tr.appendChild(tdGameID);
      const tdVal=document.createElement('td'); 
      const valInput=document.createElement('input'); 
      valInput.type='number'; valInput.value=p[2]; 
      valInput.onchange=saveProfiles; 
      tdVal.appendChild(valInput); 
      tr.appendChild(tdVal);
      const tdAction=document.createElement('td'); 
      const delBtn=document.createElement('button'); 
      delBtn.textContent='Delete'; 
      delBtn.onclick=()=>deleteProfile(idx); 
      tdAction.appendChild(delBtn); 
      tr.appendChild(tdAction);
      tr._name=nameInput; 
      tr._gameid=gidInput; 
      tr._val=valInput;
      tbody.appendChild(tr);
    });
  }

  async function saveProfiles(){ 
    document.querySelectorAll('#profileTable tbody tr').forEach((row,i)=>{ gameProfiles[i][0]=row._name.value; 
    gameProfiles[i][1]=row._gameid.value; 
    gameProfiles[i][2]=row._val.value; });
    await fetch('/updateGameDB',{
      method:'POST',
      body:JSON.stringify(gameProfiles)
      });
  }

  async function addProfile(){ 
    const response=await fetch("/getPayload"); 
    const payload=await response.text(); 
    gameProfiles.unshift(["CurrentGame",payload,"999"]); 
    await fetch('/updateGameDB',{
      method:'POST',
      body:JSON.stringify(gameProfiles)
      }
    ); 
    renderProfiles(); 
    updateArrows(); 
  }

  async function deleteProfile(idx){ 
    if(!confirm('Delete this profile?')) 
    return; gameProfiles.splice(idx,1); 
    await fetch('/updateGameDB',{
      method:'POST',
      body:JSON.stringify(gameProfiles)
      }
    );
    renderProfiles(); 
  }

  // ---------------- SORTING ----------------
  function sortProfiles(col){ if(currentSortCol===col)
  { currentSortDir=currentSortDir==='asc'?'desc':'asc'; } 
  else { currentSortCol=col; currentSortDir='asc'; }
    gameProfiles.sort((a,b)=>{ let va=a[col], vb=b[col]; 
    if(!isNaN(va)&&!isNaN(vb)){ va=Number(va); vb=Number(vb); } 
    else { va=va.toString().toLowerCase(); vb=vb.toString().toLowerCase(); } 
    if(va<vb)return currentSortDir==='asc'?-1:1; 
    if(va>vb)return currentSortDir==='asc'?1:-1; return 0; });
    renderProfiles(); 
    updateArrows();
  }
  function updateArrows(){ for(let i=0;i<3;i++){ 
    const arrow=document.getElementById('arrow'+i); 
    arrow.textContent=(i===currentSortCol)?(currentSortDir==='asc'?'▲':'▼'):'▲▼'; } }

  // ---------------- S0 HANDLERS ----------------
  function updateS0GameID(cb){ 
    S0Vars['S0_gameID']=cb.checked; 
    saveS0Vars(); 
  }

  function saveS0Vars(){ 
    fetch('/updateS0Vars',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(S0Vars)
    }); 
  }

  // ---------------- INITIALIZE ----------------
  loadData();
  </script>

  </body>
  </html>
  )rawliteral";

  server.send(200, "text/html", page);
}
