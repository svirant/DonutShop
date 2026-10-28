import { ESPLoader, Transport } from "https://unpkg.com/esptool-js@0.6.1/bundle.js";

const cfg = window.DONUTSHOP_INSTALLER_CONFIG;

const $ = (id) => document.getElementById(id);
const ui = {
  browserWarning: $("browserWarning"),
  boardPicker: $("boardPicker"),
  instructionsWrap: $("instructionsWrap"),
  installSteps: $("installSteps"),
  releaseBadge: $("releaseBadge"),
  releaseVersion: $("releaseVersion"),
  releaseDate: $("releaseDate"),
  releaseNotesWrap: $("releaseNotesWrap"),
  releaseLink: $("releaseLink"),
  releaseNotesTooltip: $("releaseNotesTooltip"),
  fullName: $("fullName"),
  recoveryName: $("recoveryName"),
  helperName: $("helperName"),
  startButton: $("startButton"),
  jtagButton: $("jtagButton"),
  jtagInstructions: $("jtagInstructions"),
  statusDot: $("statusDot"),
  fullProgress: $("fullProgress"),
  recoveryProgress: $("recoveryProgress"),
  fullPercent: $("fullPercent"),
  recoveryPercent: $("recoveryPercent"),
  successBox: $("successBox"),
  errorBox: $("errorBox"),
  consoleOutput: $("consoleOutput"),
  boardButtons: [...document.querySelectorAll("[data-board]")]
};

const DFU_CLASS = 0xFE;
const DFU_SUBCLASS = 0x01;

const DFU_DNLOAD = 1;
const DFU_GETSTATUS = 3;
const DFU_CLRSTATUS = 4;
const DFU_ABORT = 6;

const STATE_DFU_IDLE = 2;
const STATE_DFU_DNLOAD_SYNC = 3;
const STATE_DFU_DNBUSY = 4;
const STATE_DFU_DNLOAD_IDLE = 5;
const STATE_DFU_MANIFEST_SYNC = 6;
const STATE_DFU_MANIFEST = 7;
const STATE_DFU_MANIFEST_WAIT_RESET = 8;
const STATE_DFU_ERROR = 10;

let images = null;
let releaseManifest = null;
let selectedBoard = null;
let firmwareLoadGeneration = 0;
let busy = false;
let stage = "connect";
let watchTimer = null;
let showJtagFallback = false;
let watchDeadline = 0;
let lastProgressLog = [-10, -10];

const platform = String(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || "").toLowerCase();
const isWindows = platform.includes("win");
const XIAO_FLASH_SIZE_BYTES = cfg?.firmware?.xiaoFlashSizeBytes || (8 * 1024 * 1024);

function log(message){
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  console.log(line);
  ui.consoleOutput.textContent += `${line}\n`;
  ui.consoleOutput.scrollTop = ui.consoleOutput.scrollHeight;
}

function sleep(ms){
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DFU_STEP_TIMEOUT_MS = 10000;

function withTimeout(promise, ms, message){
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);

    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
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

function setBoardButtonsDisabled(disabled){
  for(const button of ui.boardButtons){
    button.disabled = !!disabled;
  }
}

function renderInstructions(board){
  const xiaoBoot = 'Hold down the <strong>Boot</strong> button while connecting your XIAO ESP32 via USB directly to your PC or Mac (not through a USB hub). The Boot button is on the right side of the USB-C port when it\'s facing up.';
  const xiaoSetup = 'After installation, disconnect the USB cable, verify the WiFi antenna is connected, and continue with the <strong>“Setup”</strong> steps listed on GitHub.';
  const nanoSetup = 'After installation, continue with the <strong>“Setup”</strong> steps listed on GitHub.';
  let steps = [];

  if(board === "xiao"){
    if(isWindows){
      steps.push('<strong>Windows 10/11 first-time setup:</strong> Install Seeed Studio\'s official XIAO ESP32 USB driver before continuing. <a href="./XIAO-ESP32_drivers.zip">XIAO ESP32 USB driver package</a>. Extract the ZIP, right-click on <code>seeed_usb_serial.inf</code> and select <strong>“Install”</strong>. This is only required once.');
    }
    steps.push(xiaoBoot);
    steps.push('Click <strong>“Connect and Flash”</strong> and select <strong>“USB JTAG”</strong>.');
    steps.push(xiaoSetup);
  }
  else{
    if(isWindows){
      steps.push('<strong>Windows 10/11 first-time setup:</strong> Install Arduino’s official Nano ESP32 USB driver before continuing. <a href="./Arduino-Nano-ESP32_drivers.zip">Arduino ESP32 drivers-only package (6MB)</a>. Extract the ZIP, open the <code>drivers</code> folder, then run <code>dpinst-amd64.exe</code> on 64-bit Windows 10 or any Windows 11 PC. Use <code>dpinst-x86.exe</code> only for 32-bit Windows 10. This is only required once.');
    }
    steps.push('Connect your Nano ESP32 via USB directly to your PC or Mac (not through a USB hub) and double click the Nano\'s RST button to enter <strong>recovery mode</strong> (a <strong>GREEN</strong> LED will strobe when successful).');
    steps.push('Click <strong>“Connect and Flash”</strong> and select <strong>“ARDUINO_NANO_NORA”</strong> (or <strong>“Nano ESP32 (bootloader)”</strong>). When <strong>“Authorize USB JTAG”</strong> appears, follow the instruction shown below the button.');
    steps.push(nanoSetup);
  }

  ui.installSteps.innerHTML = steps.map((step) => `<li>${step}</li>`).join("");
  ui.instructionsWrap.classList.remove("hidden");
}

function updateBoardSelection(){
  for(const button of ui.boardButtons){
    const selected = button.dataset.board === selectedBoard;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  }
}

function setBusy(value){
  busy = value;
  setBoardButtonsDisabled(value || !releaseManifest);
  if(value){
    ui.startButton.disabled = true;
    ui.jtagButton.disabled = true;
    setStatus("busy");
  }
  else{
    updateButtonForStage();
  }
}

function updateButtonForStage(){
  ui.startButton.classList.remove("reset-cue", "reset-done");

  const showJtag = stage === "wait-reset" && showJtagFallback;
  ui.jtagButton.classList.toggle("hidden", !showJtag);
  ui.jtagButton.disabled = busy || !showJtag;
  ui.jtagInstructions.classList.toggle("hidden", !showJtag);

  const showStart = !!selectedBoard && (stage === "connect" || stage === "done");
  ui.startButton.classList.toggle("hidden", !showStart);

  if(!selectedBoard || !images){
    ui.startButton.disabled = true;
    ui.startButton.textContent = "Connect and Flash";
    return;
  }

  if(stage === "connect"){
    ui.startButton.disabled = false;
    ui.startButton.textContent = "Connect and Flash";
  }
  else if(stage === "done"){
    ui.startButton.disabled = true;
    ui.startButton.textContent = "Installed";
  }
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

function validateNanoLayout(fullAsset, recoveryAsset, helperAsset){
  const fullEnd = cfg.firmware.fullAddress + fullAsset.size;
  const recoveryEnd = cfg.firmware.recoveryAddress + recoveryAsset.size;

  if(fullEnd > cfg.firmware.recoveryAddress){
    throw new Error(`Main image would overlap the recovery region.`);
  }
  if(recoveryEnd > cfg.firmware.flashSizeBytes){
    throw new Error(`Recovery image would extend beyond 16 MB flash.`);
  }
  if(helperAsset.size < 1024 || helperAsset.size > (3 * 1024 * 1024)){
    throw new Error(`DFU helper size is not plausible.`);
  }
}

function validateXiaoLayout(fullAsset){
  if(!fullAsset?.size || fullAsset.size > XIAO_FLASH_SIZE_BYTES){
    throw new Error(`XIAO full image is not plausible for 8 MB flash.`);
  }
}

function formatReleaseNotes(body){
  const text = String(body || "").trim();

  if(!text){
    return "No release notes were provided for this release.";
  }

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
    setBoardButtonsDisabled(true);
    log("Loading firmware manifest…");

    const url = new URL("firmware/manifest.json", window.location.href);
    url.searchParams.set("_", Date.now().toString());
    const response = await fetch(url, { cache: "no-store" });

    if(response.status === 404){
      throw new Error("Firmware mirror is not initialized. Run the Sync Installer Firmware workflow once.");
    }
    if(!response.ok){
      throw new Error(`Firmware manifest lookup failed: HTTP ${response.status}`);
    }

    const manifest = await response.json();
    if(!manifest.tag || !manifest.full || !manifest.xiao_full || !manifest.recovery || !manifest.helper){
      throw new Error("firmware/manifest.json is missing Nano, XIAO, recovery, or helper data. Run the updated Sync Installer Firmware workflow.");
    }

    validateNanoLayout(manifest.full, manifest.recovery, manifest.helper);
    validateXiaoLayout(manifest.xiao_full);
    releaseManifest = manifest;

    ui.releaseVersion.textContent = manifest.tag || manifest.name || "—";
    ui.releaseDate.textContent = formatDate(manifest.published_at);
    ui.releaseBadge.textContent = manifest.prerelease ? "Pre-release" : "Latest stable";
    ui.releaseNotesTooltip.textContent = formatReleaseNotes(manifest.body);

    if(manifest.html_url){
      ui.releaseLink.href = manifest.html_url;
      ui.releaseNotesWrap.classList.remove("hidden");
    }

    setBoardButtonsDisabled(false);
    setStatus("");
    log("Firmware manifest is ready. Select a board.");

    if(selectedBoard){
      await loadFirmwareForBoard(selectedBoard);
    }
  }
  catch(error){
    setBoardButtonsDisabled(true);
    showError(error?.message || String(error));
  }
}

async function loadFirmwareForBoard(board){
  if(!releaseManifest) return;

  const generation = ++firmwareLoadGeneration;
  images = null;
  stage = "connect";
  showJtagFallback = false;
  stopBootloaderWatcher();
  updateButtonForStage();
  clearError();
  ui.successBox.classList.add("hidden");
  setStatus("busy");
  setBoardButtonsDisabled(true);

  try{
    if(board === "xiao"){
      validateXiaoLayout(releaseManifest.xiao_full);
      ui.fullName.textContent = releaseManifest.xiao_full.name;
      ui.recoveryName.textContent = "—";
      ui.helperName.textContent = "—";
      const xiaoFullData = await fetchAsset(releaseManifest.xiao_full);
      if(generation !== firmwareLoadGeneration || selectedBoard !== board) return;
      images = { xiaoFullData };
      log("XIAO firmware is ready.");
    }
    else{
      validateNanoLayout(releaseManifest.full, releaseManifest.recovery, releaseManifest.helper);
      ui.fullName.textContent = releaseManifest.full.name;
      ui.recoveryName.textContent = releaseManifest.recovery.name;
      ui.helperName.textContent = releaseManifest.helper.name;
      const [fullData, recoveryData, helperData] = await Promise.all([
        fetchAsset(releaseManifest.full),
        fetchAsset(releaseManifest.recovery),
        fetchAsset(releaseManifest.helper)
      ]);
      if(generation !== firmwareLoadGeneration || selectedBoard !== board) return;
      images = { fullData, recoveryData, helperData };
      log(`${board === "waveshare" ? "Waveshare" : "Arduino"} Nano firmware is ready.`);
    }

    stage = "connect";
    setStatus("good");
    setBoardButtonsDisabled(false);
    updateButtonForStage();
  }
  catch(error){
    if(generation !== firmwareLoadGeneration) return;
    images = null;
    setBoardButtonsDisabled(false);
    updateButtonForStage();
    showError(error?.message || String(error));
  }
}

async function selectBoard(board){
  if(busy || !["xiao", "waveshare", "arduino"].includes(board)) return;

  selectedBoard = board;
  ++firmwareLoadGeneration;
  stopBootloaderWatcher();
  showJtagFallback = false;
  stage = "connect";
  images = null;
  clearError();
  ui.successBox.classList.add("hidden");
  updateBoardSelection();
  renderInstructions(board);
  updateButtonForStage();

  if(board !== "xiao" && !("usb" in navigator)){
    showError("WebUSB is required for Arduino/Waveshare installation. Use Chrome or Edge on desktop.");
    return;
  }

  await loadFirmwareForBoard(board);
}

function findDfuInterface(device){
  for(const configuration of device.configurations || []){
    for(const iface of configuration.interfaces || []){
      for(const alt of iface.alternates || []){
        if(alt.interfaceClass === DFU_CLASS && alt.interfaceSubclass === DFU_SUBCLASS){
          return {
            configurationValue: configuration.configurationValue,
            interfaceNumber: iface.interfaceNumber
          };
        }
      }
    }
  }

  return null;
}

async function readConfigDescriptor(device){
  const head = await device.controlTransferIn({
    requestType: "standard",
    recipient: "device",
    request: 6,
    value: (2 << 8),
    index: 0
  }, 9);

  if(head.status !== "ok" || !head.data || head.data.byteLength < 9){
    throw new Error("Could not read USB configuration descriptor.");
  }

  const hv = new DataView(head.data.buffer, head.data.byteOffset, head.data.byteLength);
  const total = hv.getUint16(2, true);

  const full = await device.controlTransferIn({
    requestType: "standard",
    recipient: "device",
    request: 6,
    value: (2 << 8),
    index: 0
  }, total);

  if(full.status !== "ok" || !full.data){
    throw new Error("Could not read full USB configuration descriptor.");
  }

  return new Uint8Array(full.data.buffer, full.data.byteOffset, full.data.byteLength);
}

function parseDfuFunctionalDescriptor(bytes){
  for(let i = 0; i + 1 < bytes.length; ){
    const len = bytes[i];
    const type = bytes[i + 1];

    if(!len) break;

    if(type === 0x21 && len >= 9){
      return {
        attributes: bytes[i + 2],
        detachTimeout: bytes[i + 3] | (bytes[i + 4] << 8),
        transferSize: bytes[i + 5] | (bytes[i + 6] << 8),
        version: bytes[i + 7] | (bytes[i + 8] << 8)
      };
    }

    i += len;
  }

  return null;
}

async function dfuStatus(device, iface){
  const response = await device.controlTransferIn({
    requestType: "class",
    recipient: "interface",
    request: DFU_GETSTATUS,
    value: 0,
    index: iface
  }, 6);

  if(response.status !== "ok" || !response.data || response.data.byteLength < 6){
    throw new Error(`DFU GETSTATUS failed (${response.status}).`);
  }

  const b = new Uint8Array(response.data.buffer, response.data.byteOffset, 6);
  return {
    status: b[0],
    pollTimeout: b[1] | (b[2] << 8) | (b[3] << 16),
    state: b[4]
  };
}

async function makeDfuReady(device, iface){
  let status = await dfuStatus(device, iface);

  if(status.state === STATE_DFU_ERROR){
    const clear = await device.controlTransferOut({
      requestType: "class",
      recipient: "interface",
      request: DFU_CLRSTATUS,
      value: 0,
      index: iface
    });

    if(clear.status !== "ok"){
      throw new Error(`DFU CLRSTATUS failed (${clear.status}).`);
    }

    status = await dfuStatus(device, iface);
  }

  if(status.state !== STATE_DFU_IDLE && status.state !== STATE_DFU_DNLOAD_IDLE){
    try{
      await device.controlTransferOut({
        requestType: "class",
        recipient: "interface",
        request: DFU_ABORT,
        value: 0,
        index: iface
      });
      status = await dfuStatus(device, iface);
    }
    catch(_error){}
  }

  return status;
}

async function waitForDownloadIdle(device, iface){
  for(let n = 0; n < 100; n++){
    const status = await dfuStatus(device, iface);

    if(status.status !== 0){
      throw new Error(`DFU status error ${status.status}, state ${status.state}.`);
    }

    if(status.state === STATE_DFU_DNLOAD_IDLE || status.state === STATE_DFU_IDLE){
      return;
    }

    if(status.state === STATE_DFU_ERROR){
      throw new Error("DFU entered error state.");
    }

    if(status.state !== STATE_DFU_DNLOAD_SYNC && status.state !== STATE_DFU_DNBUSY){
      throw new Error(`Unexpected DFU state ${status.state} while downloading.`);
    }

    await sleep(Math.max(1, status.pollTimeout));
  }

  throw new Error("Timed out waiting for DFU download block.");
}

async function manifestDfu(device, iface, blockNumber){
  log("Finishing helper upload…");

  const result = await device.controlTransferOut({
    requestType: "class",
    recipient: "interface",
    request: DFU_DNLOAD,
    value: blockNumber,
    index: iface
  });

  if(result.status !== "ok"){
    throw new Error(`Final DFU DNLOAD failed (${result.status}).`);
  }

  for(let n = 0; n < 80; n++){
    const status = await dfuStatus(device, iface);

    if(status.status !== 0){
      throw new Error(`DFU manifestation error ${status.status}.`);
    }

    if(status.state === STATE_DFU_MANIFEST_WAIT_RESET ||
       status.state === STATE_DFU_IDLE ||
       status.state === STATE_DFU_DNLOAD_IDLE){
      return;
    }

    if(status.state !== STATE_DFU_MANIFEST_SYNC &&
       status.state !== STATE_DFU_MANIFEST){
      return;
    }

    await sleep(Math.max(10, status.pollTimeout));
  }
}

async function uploadHelperDfu(){
  let device = null;
  let iface = null;
  let claimed = false;

  try{
    log("Select “Nano ESP32 (bootloader)” in the USB chooser.");

    device = await navigator.usb.requestDevice({
      filters: [{
        vendorId: cfg.device.recoveryVendorId,
        productId: cfg.device.recoveryProductId
      }]
    });

    log(`Selected ${device.productName || "Nano ESP32 (bootloader)"} ${hex4(device.vendorId)}:${hex4(device.productId)}.`);

    iface = findDfuInterface(device);
    if(!iface){
      throw new Error("The selected device does not expose the Nano ESP32 DFU recovery interface.");
    }

    log("Opening DFU device…");
    await withTimeout(
      device.open(),
      DFU_STEP_TIMEOUT_MS,
      "Timed out while opening the Nano DFU device. Close Arduino IDE and other browser tabs using the Nano, unplug/replug it, enter recovery mode again, and retry."
    );
    log("DFU device opened.");

    if(!device.configuration){
      log(`Selecting DFU configuration ${iface.configurationValue}…`);
      await withTimeout(
        device.selectConfiguration(iface.configurationValue),
        DFU_STEP_TIMEOUT_MS,
        `Timed out while selecting DFU configuration ${iface.configurationValue}. Close Arduino IDE and other browser tabs using the Nano, unplug/replug it, enter recovery mode again, and retry.`
      );
      log(`DFU configuration ${iface.configurationValue} selected.`);
    }
    else{
      log(`DFU configuration ${device.configuration.configurationValue} already selected.`);
    }

    log(`Claiming DFU interface ${iface.interfaceNumber}…`);
    await withTimeout(
      device.claimInterface(iface.interfaceNumber),
      DFU_STEP_TIMEOUT_MS,
      `Timed out while claiming DFU interface ${iface.interfaceNumber}. Close Arduino IDE and other browser tabs using the Nano, unplug/replug it, enter recovery mode again, and retry.`
    );
    claimed = true;

    log(`DFU interface ${iface.interfaceNumber} claimed.`);

    let transferSize = 4096;

    try{
      const descriptor = parseDfuFunctionalDescriptor(await readConfigDescriptor(device));
      if(descriptor?.transferSize > 0){
        transferSize = Math.min(descriptor.transferSize, 4096);
      }
      if(descriptor){
        log(`DFU ready: ${transferSize}-byte blocks.`);
      }
    }
    catch(_error){
      log("Using 4096-byte DFU blocks.");
    }

    if(transferSize < 64) transferSize = 64;

    const initial = await makeDfuReady(device, iface.interfaceNumber);
    if(initial.status !== 0){
      throw new Error(`DFU is not ready (status ${initial.status}).`);
    }

    let block = 0;
    let lastPercent = -1;

    for(let offset = 0; offset < images.helperData.length; offset += transferSize, block++){
      const chunk = images.helperData.subarray(
        offset,
        Math.min(offset + transferSize, images.helperData.length)
      );

      const out = await device.controlTransferOut({
        requestType: "class",
        recipient: "interface",
        request: DFU_DNLOAD,
        value: block,
        index: iface.interfaceNumber
      }, chunk);

      if(out.status !== "ok"){
        throw new Error(`DFU helper block ${block} failed (${out.status}).`);
      }

      await waitForDownloadIdle(device, iface.interfaceNumber);

      const percent = Math.min(
        100,
        Math.floor(((offset + chunk.length) * 100) / images.helperData.length)
      );

      if(percent >= lastPercent + 10 || percent === 100){
        lastPercent = percent;
        log(`Preparing USB JTAG helper: ${percent}%`);
      }
    }

    await manifestDfu(device, iface.interfaceNumber, block);
    log("USB JTAG helper installed successfully.");
  }
  finally{
    try{
      if(device?.opened && claimed && iface){
        await device.releaseInterface(iface.interfaceNumber);
      }
    }
    catch(_error){}

    try{
      if(device?.opened){
        await device.close();
      }
    }
    catch(_error){}
  }
}

function isBootloaderPort(port){
  try{
    const info = port.getInfo();
    return info.usbVendorId === cfg.device.bootVendorId &&
           info.usbProductId === cfg.device.bootProductId;
  }
  catch(_error){
    return false;
  }
}

async function getAuthorizedBootloaderPorts(){
  const ports = await navigator.serial.getPorts();
  return ports.filter(isBootloaderPort);
}

function stopBootloaderWatcher(){
  if(watchTimer){
    clearInterval(watchTimer);
    watchTimer = null;
  }

}

function startBootloaderWatcher(){
  stopBootloaderWatcher();

  showJtagFallback = true;
  updateButtonForStage();
  log("Click “Authorize USB JTAG”, leave the chooser open, press RST on the Nano once, then select the USB JTAG device when it appears.");

  watchTimer = setInterval(async () => {
    if(busy || stage !== "wait-reset"){
      return;
    }

    try{
      const ports = await getAuthorizedBootloaderPorts();

      if(ports.length === 1){
        stopBootloaderWatcher();
        showJtagFallback = false;
        log("RST detected. USB JTAG is ready; continuing automatically.");
        stage = "flashing";
        updateButtonForStage();
        await flashBootloaderDevice(ports[0], true);
      }
    }
    catch(_error){}
  }, 500);
}

async function beginFactoryFlow(){
  if(busy || !images) return;

  clearError();
  ui.successBox.classList.add("hidden");

  // If this board is already in ROM USB JTAG mode and Chrome already has
  // permission, skip the recovery helper entirely.
  try{
    const authorized = await getAuthorizedBootloaderPorts();

    if(authorized.length === 1){
      log("Authorized USB JTAG device already present. Skipping recovery helper.");
      await flashBootloaderDevice(authorized[0], true);
      return;
    }
  }
  catch(_error){}

  setBusy(true);

  try{
    log("Connecting to Nano ESP32 recovery mode…");
    await uploadHelperDfu();

    // Give the Nano recovery/DFU stack a full three seconds to settle before
    // telling the user to press RST. Pressing RST earlier can interrupt the
    // transition immediately after the helper upload.
    log("Preparing reset step…");
    await sleep(3000);

    showJtagFallback = false;
    stage = "wait-reset";
    setBusy(false);
    updateButtonForStage();

    log("");
    log("========================================");
    log("PRESS THE NANO RST BUTTON ONCE TO CONTINUE");
    log("========================================");
    log("Waiting for USB JTAG…");

    // Keep the same button in the Press RST Once state. The page watches for
    // the already-authorized 303A:1001 device and continues automatically.
    startBootloaderWatcher();
  }
  catch(error){
    setBusy(false);

    if(error?.name === "NotFoundError"){
      stage = "connect";
      updateButtonForStage();
      showError("Nano recovery mode was not selected. Double-click RST until the GREEN LED strobes, then click “Connect and Flash” again.");
    }
    else{
      stage = "connect";
      updateButtonForStage();
      showError(error?.message || String(error));
    }
  }
}

function resetProgress(){
  ui.fullProgress.value = 0;
  ui.recoveryProgress.value = 0;
  ui.fullPercent.textContent = "0%";
  ui.recoveryPercent.textContent = "0%";
  lastProgressLog = [-10, -10];
}

async function flashBootloaderDevice(portOverride = null, automatic = false){
  if(busy || !images) return;

  stopBootloaderWatcher();
  clearError();
  ui.successBox.classList.add("hidden");
  resetProgress();
  setBusy(true);

  let transport = null;
  let loaderConnected = false;
  let manualPermissionGranted = false;

  try{
    let port = portOverride;

    if(!port){
      log("Select “Espressif USB JTAG/serial debug unit” to authorize it for this browser profile.");
      port = await navigator.serial.requestPort({
        filters: [{
          usbVendorId: cfg.device.bootVendorId,
          usbProductId: cfg.device.bootProductId
        }]
      });
      manualPermissionGranted = true;

      // The user successfully selected/authorized the device. The
      // authorization instructions are no longer needed.
      showJtagFallback = false;
      updateButtonForStage();
    }
    else{
      log("Using previously authorized USB JTAG device.");
    }

    const info = port.getInfo();
    log(`Selected USB ${hex4(info.usbVendorId)}:${hex4(info.usbProductId)}.`);

    transport = new Transport(port, false);

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

    log("Connecting to ESP32-S3 ROM downloader…");
    const chipName = await loader.main();
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
        const percent = total
          ? Math.min(100, Math.round((written / total) * 100))
          : 0;

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

    log("Flash complete. Resetting Nano…");
    await loader.after("hard_reset");

    stage = "done";
    setStatus("good");
    setBusy(false);
    updateButtonForStage();
    ui.successBox.classList.remove("hidden");
    log("Installation complete.");
  }
  catch(error){
    if(transport){
      try{
        await transport.disconnect();
      }
      catch(_error){}
    }

    setBusy(false);

    if(automatic && !loaderConnected){
      showJtagFallback = false;
      stage = "wait-reset";
      updateButtonForStage();
      setStatus("good");
      log(`Automatic USB JTAG connection was not ready yet: ${error?.message || error}`);
      log("Waiting for USB JTAG to become available…");
      startBootloaderWatcher();
      return;
    }

    if(!automatic && !loaderConnected && error?.name === "NotFoundError"){
      showJtagFallback = true;
      stage = "wait-reset";
      updateButtonForStage();
      setStatus("good");
      log("Click “Authorize USB JTAG”, leave the chooser open, press RST on the Nano once, then select the USB JTAG device when it appears.");
      startBootloaderWatcher();
      showJtagFallback = true;
      updateButtonForStage();
      return;
    }

    if(!automatic && !loaderConnected && manualPermissionGranted){
      showJtagFallback = false;
      stage = "wait-reset";
      updateButtonForStage();
      setStatus("good");
      log(`USB JTAG permission was granted, but the connection was not ready yet: ${error?.message || error}`);
      log("Waiting for USB JTAG to become available…");
      startBootloaderWatcher();
      return;
    }

    showJtagFallback = true;
    stage = "wait-reset";
    updateButtonForStage();
    showError(`Installation failed: ${error?.message || error}`);
  }
}

async function flashXiaoDevice(){
  if(busy || !images?.xiaoFullData || selectedBoard !== "xiao") return;

  clearError();
  ui.successBox.classList.add("hidden");
  resetProgress();
  setBusy(true);

  let transport = null;
  try{
    log("Select “USB JTAG” in Chrome's serial chooser.");
    const port = await navigator.serial.requestPort({
      filters: [{
        usbVendorId: cfg.device.bootVendorId,
        usbProductId: cfg.device.bootProductId
      }]
    });

    const info = port.getInfo();
    log(`Selected USB ${hex4(info.usbVendorId)}:${hex4(info.usbProductId)}.`);
    transport = new Transport(port, false);

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

    log("Connecting to XIAO ESP32-S3 USB JTAG downloader…");
    const chipName = await loader.main();
    log(`Detected chip: ${chipName}`);
    if(!String(chipName).toUpperCase().includes(cfg.device.expectedChip.toUpperCase())){
      throw new Error(`Wrong chip detected (${chipName}). This installer requires ${cfg.device.expectedChip}.`);
    }

    // XIAO intentionally does not erase the entire flash first and does not
    // receive the Nano Nora recovery image. Its merged full image starts at 0x0.
    log("Writing XIAO DonutShop full image at 0x0…");
    await loader.writeFlash({
      fileArray: [
        { data: images.xiaoFullData, address: cfg.firmware.fullAddress }
      ],
      flashMode: "keep",
      flashFreq: "keep",
      flashSize: "keep",
      eraseAll: false,
      compress: true,
      reportProgress(_fileIndex, written, total){
        const percent = total ? Math.min(100, Math.round((written / total) * 100)) : 0;
        ui.fullProgress.value = percent;
        ui.fullPercent.textContent = `${percent}%`;
        const bucket = percent === 100 ? 100 : Math.floor(percent / 10) * 10;
        if(bucket >= lastProgressLog[0] + 10 || percent === 100){
          lastProgressLog[0] = bucket;
          log(`XIAO firmware: ${percent}%`);
        }
      }
    });

    log("Flash complete. Resetting XIAO…");
    await loader.after("hard_reset");
    stage = "done";
    setStatus("good");
    setBusy(false);
    updateButtonForStage();
    ui.successBox.classList.remove("hidden");
    log("XIAO installation complete.");

    try{ await transport.disconnect(); }catch(_error){}
  }
  catch(error){
    if(transport){
      try{ await transport.disconnect(); }catch(_error){}
    }
    setBusy(false);
    stage = "connect";
    updateButtonForStage();
    const message = error?.name === "NotFoundError"
      ? "USB JTAG was not selected. Hold the XIAO Boot button while connecting USB, then click “Connect and Flash” again."
      : `Installation failed: ${error?.message || error}`;
    showError(message);
  }
}

async function handlePrimaryAction(){
  if(stage !== "connect") return;
  if(selectedBoard === "xiao"){
    await flashXiaoDevice();
  }
  else{
    await beginFactoryFlow();
  }
}

async function handleJtagAction(){
  if(busy || stage !== "wait-reset"){
    return;
  }

  // Keep the authorization instructions visible while the native chooser
  // is open so the user can still reference them.
  showJtagFallback = true;
  updateButtonForStage();
  await flashBootloaderDevice(null, false);
}

function init(){
  ui.startButton.addEventListener("click", handlePrimaryAction);
  ui.jtagButton.addEventListener("click", handleJtagAction);
  for(const button of ui.boardButtons){
    button.addEventListener("click", () => selectBoard(button.dataset.board));
  }

  ui.instructionsWrap.classList.add("hidden");
  setBoardButtonsDisabled(true);
  updateBoardSelection();
  updateButtonForStage();

  if(!("serial" in navigator)){
    ui.browserWarning.classList.remove("hidden");
    setStatus("bad");
    return;
  }

  prepareRelease();
}

init();