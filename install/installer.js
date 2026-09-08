import { ESPLoader, Transport } from "https://unpkg.com/esptool-js@0.6.1/bundle.js";

const cfg = window.DONUTSHOP_INSTALLER_CONFIG;
const $ = (id) => document.getElementById(id);
const ui = {
  browserWarning: $("browserWarning"),
  releaseBadge: $("releaseBadge"),
  releaseVersion: $("releaseVersion"),
  releaseDate: $("releaseDate"),
  releaseNotesWrap: $("releaseNotesWrap"),
  releaseLink: $("releaseLink"),
  releaseNotesTooltip: $("releaseNotesTooltip"),
  fullName: $("fullName"),
  recoveryName: $("recoveryName"),
  startButton: $("startButton"),
  statusDot: $("statusDot"),
  fullProgress: $("fullProgress"),
  recoveryProgress: $("recoveryProgress"),
  fullPercent: $("fullPercent"),
  recoveryPercent: $("recoveryPercent"),
  successBox: $("successBox"),
  errorBox: $("errorBox"),
  consoleOutput: $("consoleOutput")
};

let images = null;
let busy = false;
let done = false;
let lastProgressLog = [-10, -10];

function log(message){
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  console.log(line);
  ui.consoleOutput.textContent += `${line}\n`;
  ui.consoleOutput.scrollTop = ui.consoleOutput.scrollHeight;
}

function hex4(value){
  if(value === undefined) return "????";
  return Number(value).toString(16).toUpperCase().padStart(4, "0");
}

function bytesText(bytes){
  if(!Number.isFinite(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while(value >= 1024 && unit < units.length - 1){
    value /= 1024;
    unit++;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function formatDate(iso){
  if(!iso) return "—";
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function setStatus(kind){
  ui.statusDot.className = "status-dot" + (kind ? ` ${kind}` : "");
}

function clearError(){
  ui.errorBox.textContent = "";
  ui.errorBox.classList.add("hidden");
}

function showError(message){
  ui.errorBox.textContent = message;
  ui.errorBox.classList.remove("hidden");
  ui.successBox.classList.add("hidden");
  setStatus("bad");
  log(`ERROR: ${message}`);
}

function updateButton(){
  ui.startButton.disabled = busy || !images || done;
  ui.startButton.textContent = done ? "Installed" : "Connect and Flash";
}

function setBusy(value){
  busy = value;
  if(value) setStatus("busy");
  updateButton();
}

async function sha256Hex(bytes){
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function firmwareUrl(name){
  return new URL(`firmware/${encodeURIComponent(name)}`, window.location.href).href;
}

async function fetchAsset(asset){
  log(`Downloading ${asset.name} (${bytesText(asset.size)})…`);
  const response = await fetch(firmwareUrl(asset.name), { cache: "no-store" });
  if(!response.ok){
    throw new Error(`Download failed for ${asset.name}: HTTP ${response.status}`);
  }

  const data = new Uint8Array(await response.arrayBuffer());
  if(data.byteLength !== asset.size){
    throw new Error(`${asset.name} size mismatch.`);
  }
  if(!asset.sha256){
    throw new Error(`${asset.name} has no SHA-256 value in firmware/manifest.json.`);
  }

  const actual = await sha256Hex(data);
  if(actual !== String(asset.sha256).toLowerCase()){
    throw new Error(`SHA-256 verification failed for ${asset.name}.`);
  }

  log(`${asset.name}: SHA-256 verified.`);
  return data;
}

function validateLayout(fullAsset, recoveryAsset){
  const fullEnd = cfg.firmware.fullAddress + fullAsset.size;
  const recoveryEnd = cfg.firmware.recoveryAddress + recoveryAsset.size;
  if(fullEnd > cfg.firmware.recoveryAddress){
    throw new Error("Main image would overlap the recovery region.");
  }
  if(recoveryEnd > cfg.firmware.flashSizeBytes){
    throw new Error("Recovery image would extend beyond 16 MB flash.");
  }
}

function formatReleaseNotes(body){
  const text = String(body || "").trim();
  if(!text) return "No release notes were provided for this release.";
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .trim();
}

async function prepareRelease(){
  try{
    setStatus("busy");
    log("DIRECT WEBSERIAL TEST: DFU/WebUSB helper path is disabled.");
    log("Loading firmware manifest…");

    const url = new URL("firmware/manifest.json", window.location.href);
    url.searchParams.set("_", Date.now().toString());
    const response = await fetch(url, { cache: "no-store" });
    if(!response.ok){
      throw new Error(`Firmware manifest lookup failed: HTTP ${response.status}`);
    }

    const manifest = await response.json();
    if(!manifest.tag || !manifest.full || !manifest.recovery){
      throw new Error("firmware/manifest.json is missing full or recovery data.");
    }

    validateLayout(manifest.full, manifest.recovery);
    ui.releaseVersion.textContent = manifest.tag || manifest.name || "—";
    ui.releaseDate.textContent = formatDate(manifest.published_at);
    ui.releaseBadge.textContent = manifest.prerelease ? "Pre-release" : "Latest stable";
    ui.releaseNotesTooltip.textContent = formatReleaseNotes(manifest.body);

    if(manifest.html_url){
      ui.releaseLink.href = manifest.html_url;
      ui.releaseNotesWrap.classList.remove("hidden");
    }

    ui.fullName.textContent = manifest.full.name;
    ui.recoveryName.textContent = manifest.recovery.name;

    const [fullData, recoveryData] = await Promise.all([
      fetchAsset(manifest.full),
      fetchAsset(manifest.recovery)
    ]);

    images = { fullData, recoveryData };
    setStatus("good");
    updateButton();
    log("Firmware is ready.");
    log("Click Connect and Flash, then choose the same Nano serial device that works on Espressif's esptool-js site.");
  }
  catch(error){
    showError(error?.message || String(error));
  }
}

function resetProgress(){
  ui.fullProgress.value = 0;
  ui.recoveryProgress.value = 0;
  ui.fullPercent.textContent = "0%";
  ui.recoveryPercent.textContent = "0%";
  lastProgressLog = [-10, -10];
}

async function directSerialFlash(){
  if(busy || !images || done) return;

  clearError();
  ui.successBox.classList.add("hidden");
  resetProgress();
  setBusy(true);

  let transport = null;
  let loaderConnected = false;

  try{
    log("Opening Web Serial chooser for Arduino Nano ESP32 recovery CDC 2341:0070…");

    // This diagnostic revision targets the Arduino Nano ESP32 recovery composite device.
    // The board is already in recovery/bootloader mode, so we will not toggle DTR/RTS.
    const port = await navigator.serial.requestPort({
      filters: [{ usbVendorId: 0x2341, usbProductId: 0x0070 }]
    });
    const info = port.getInfo();
    log(`Selected serial device USB ${hex4(info.usbVendorId)}:${hex4(info.usbProductId)}.`);

    // Keep this test close to Espressif's documented example: direct Web Serial
    // -> Transport -> ESPLoader.main(). No WebUSB, DFU interface, or helper.
    transport = new Transport(port, true);
    const terminal = {
      clean(){},
      writeLine(data){
        const text = String(data || "").trimEnd();
        if(text) log(text);
      },
      write(data){
        const text = String(data || "").trimEnd();
        if(text) log(text);
      }
    };

    const loader = new ESPLoader({
      transport,
      baudrate: cfg.device.flashBaud,
      terminal,
      debugLogging: false
    });

    log("Connecting with ESPLoader.main(\"no_reset\") — no DTR/RTS control signals…");
    const chipName = await loader.main("no_reset");
    loaderConnected = true;
    log(`Detected chip: ${chipName}`);

    if(!String(chipName).toUpperCase().includes(cfg.device.expectedChip.toUpperCase())){
      throw new Error(`Wrong chip detected (${chipName}). This installer requires ${cfg.device.expectedChip}.`);
    }

    log("Erasing entire flash…");
    await loader.eraseFlash();
    log("Flash erase complete.");

    log("Writing DonutShop firmware…");
    await loader.writeFlash({
      fileArray: [
        { data: images.fullData, address: cfg.firmware.fullAddress },
        { data: images.recoveryData, address: cfg.firmware.recoveryAddress }
      ],
      flashMode: "keep",
      flashFreq: "keep",
      flashSize: "keep",
      eraseAll: false,
      compress: true,
      reportProgress(fileIndex, written, total){
        const percent = total ? Math.min(100, Math.round((written / total) * 100)) : 0;
        if(fileIndex === 0){
          ui.fullProgress.value = percent;
          ui.fullPercent.textContent = `${percent}%`;
        }
        else{
          ui.recoveryProgress.value = percent;
          ui.recoveryPercent.textContent = `${percent}%`;
        }

        const bucket = percent === 100 ? 100 : Math.floor(percent / 10) * 10;
        if(bucket >= lastProgressLog[fileIndex] + 10 || percent === 100){
          lastProgressLog[fileIndex] = bucket;
          log(`${fileIndex === 0 ? "Main firmware" : "Recovery image"}: ${percent}%`);
        }
      }
    });

    log("Flash complete. Skipping automatic reset to avoid DTR/RTS setSignals().");
    try{ await transport.disconnect(); } catch(_error){}
    transport = null;
    log("Press RST once on the Nano to boot the newly flashed firmware.");

    done = true;
    setBusy(false);
    setStatus("good");
    updateButton();
    ui.successBox.classList.remove("hidden");
    log("Installation complete.");
  }
  catch(error){
    if(transport){
      try{ await transport.disconnect(); } catch(_error){}
    }

    setBusy(false);
    if(error?.name === "NotFoundError"){
      setStatus("good");
      log("Serial chooser canceled. No changes were made.");
      return;
    }

    const phase = loaderConnected ? "during flashing" : "while connecting to the ESP32-S3";
    showError(`Direct Web Serial test failed ${phase}: ${error?.message || error}`);
  }
}

function init(){
  ui.startButton.addEventListener("click", directSerialFlash);
  if(!("serial" in navigator)){
    ui.browserWarning.classList.remove("hidden");
    setStatus("bad");
    return;
  }
  prepareRelease();
}

init();
