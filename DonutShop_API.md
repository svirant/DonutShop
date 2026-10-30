# DonutShop REST API Guide

**Firmware:** DonutShop v0.7.25 or higher
**Base URL:** `http://donutshop.local`
**Transport:** HTTP, port 80

The DonutShop REST API provides access to RetroTink status, device information, serial commands, SD card directory listings, file downloads and uploads, file and folder deletion, folder creation, and file or folder move/rename operations.

All public API access uses **port 80**.
## Endpoint Summary
| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/info` | Device and firmware information |
| `GET` | `/api/status` | Current RetroTink and DonutShop status |
| `POST` | `/api/command` | Send a RetroTink serial command |
| `GET` | `/api/files/` | List the SD card root |
| `GET` | `/api/files/<path>` | List a directory or download a file |
| `PUT` | `/api/files/<path>` | Create or overwrite a file |
| `DELETE` | `/api/files/<path>` | Delete a file or empty folder |
| `POST` | `/api/files/mkdir` | Create a folder |
| `POST` | `/api/files/move` | Move or rename a file or folder |
---
# Device Information

## `GET /api/info`

Returns stable information about the connected RetroTink and DonutShop.

Example response:

```json
{
  "ok": true,
  "retrotink": {
    "model": "RT4K Pro",
    "model_id": 1,
    "fw": "1.80.1"
  },
  "donutshop": {
    "version": "0.7.25",
    "firmware_type": "D",
    "hostname": "donutshop",
    "ssid": "MyNetwork",
    "preferred_hd15_baud": 2000000
  }
}
```
### RetroTink fields

| Field | Description |
|---|---|
| `model` | Detected RetroTink model |
| `model_id` | Internal model identifier |
| `fw` | RetroTink firmware version |

### DonutShop fields

| Field | Description |
|---|---|
| `version` | DonutShop firmware version |
| `firmware_type` | DonutShop firmware type |
| `hostname` | Configured DonutShop hostname |
| `ssid` | Connected Wi-Fi network |
| `preferred_hd15_baud` | Preferred HD-15 serial baud rate |

---

# Current Status
## `GET /api/status`

Returns the current RetroTink state and DonutShop connection information.

Example response:
```json
{
  "ok": true,
  "retrotink": {
    "profile": "S1_SNES",
    "profile_path": "profile/SVS/S1_SNES.rt4",
    "uptime_s": 54592,
    "baud": 2000000,
    "power_state": "awake",
    "active_video_input": "HDMI",
    "active_video_input_id": 0,
    "active_video_output": "2160p60",
    "active_video_output_id": 0,
    "source": "cache",
    "age_ms": 862
  },
  "donutshop": {
    "uptime_s": 61460,
    "serial_type": "usb",
    "baud": 2000000,
    "retrotink_connected": true,
    "wifi_connected": true,
    "ip": "10.0.1.100",
    "rssi": -63,
    "channel": 2
  }
}
```
DonutShop maintains a shared RetroTink status cache. A status snapshot up to approximately **4 seconds old** may be reused rather than sending another serial `status` command.

The `source` field indicates whether the response came from the existing cache or from a newly requested status update.

`retrotink_connected` becomes false when the most recent valid RetroTink status information is more than approximately 10 seconds old.

---
# Sending Commands

## `POST /api/command`

Sends one serial command to the connected RetroTink.

### Request body

Content type:

```text
application/json
```

Body:

```json
{
  "command": "status"
}
```

An optional `console` field can mirror the command and response into an open WebCtl Console:

```json
{
  "command": "status",
  "console": true
}
```

`console` defaults to `false`.

### Load a profile

Profiles can be loaded through the same command endpoint:

```json
{
  "command": "prof load SVS/S1_SNES.rt4"
}
```

Profile paths are relative to the RetroTink `/profile/` directory. Do not include the `0:/profile/` prefix.

For example:

`0:/profile/SVS/S1_SNES.rt4`

becomes:

`prof load SVS/S1_SNES.rt4`

A successful profile load returns:

```json
{
  "ok": true,
  "command": "prof load SVS/S1_SNES.rt4",
  "responded": true,
  "response": "[COM] prof load ok\n",
  "truncated": false,
  "console": false
}
```

An unsuccessful profile load returns:

```json
{
  "ok": true,
  "command": "prof load SVS/S1_SNES.rt4",
  "responded": true,
  "response": "[COM] prof load fail\n",
  "truncated": false,
  "console": false
}
```

The API accepts a single serial command per request. Commands are limited to 255 characters.

Binary-session commands such as file transfer commands are intentionally not accepted through `/api/command`. File transfers should use `/api/files/...`.
The captured command response is limited to approximately 4 KB. If the response exceeds the available capture buffer, `truncated` is set to `true`.

---
# Files API

The Files API is rooted directly at the RetroTink SD card.

Do **not** include the RetroTink `0:/` prefix.

For example:

```text
RetroTink path:
0:/profile/SVS/S1_SNES.rt4

API path:
/api/files/profile/SVS/S1_SNES.rt4
```

Paths containing spaces or other reserved URL characters should be URL encoded by the API client.

For example:

```text
File path:
folder/SNES Profile #1.rt4

API path:
/api/files/folder/SNES%20Profile%20%231.rt4
```
In this example, spaces become `%20` and `#` becomes `%23`.

---
# Directory Listing

## `GET /api/files/`

Lists the root of the RetroTink SD card.
## `GET /api/files/<directory>`

Lists the specified directory.

Example:

```text
GET /api/files/profile/SVS
```

Example response:

```json
{
  "ok": true,
  "path": "profile/SVS",
  "truncated": false,
  "entries": [
    {
      "type": "dir",
      "size": 0,
      "mtime": 1750000000,
      "name": "Subfolder"
    },
    {
      "type": "file",
      "size": 18432,
      "mtime": 1750000100,
      "name": "S1_SNES.rt4"
    }
  ]
}
```
### Entry fields

| Field | Description |
|---|---|
| `type` | `file` or `dir` |
| `size` | File size in bytes |
| `mtime` | Modification timestamp reported by the RetroTink |
| `name` | File or directory name |

`truncated:true` indicates that the complete directory contents could not fit within DonutShop's directory capture limit.

---

# File Download
## `GET /api/files/<file>`

Returns the raw file contents.

Example request:

```text
GET /api/files/profile/SVS/S1_SNES.rt4
```

Successful file responses use:

```text
Content-Type: application/octet-stream
Content-Length: <file size>
X-DonutShop-Verification: crc16
X-DonutShop-Transport: <transport>
```
### Download transport defaults

| Connection | Baud | Default |
|---|---:|---|
| USB Serial | 2,000,000 | no-ACK |
| HD-15 | 9,600 | ACK |
| HD-15 | 38,400 | ACK |
| HD-15 | 2,000,000 | no-ACK |

The HD-15 2,000,000 no-ACK mode can only be used when the [baud mod](https://github.com/svirant/DonutDongle#2m-baud-mod) has been performed on your DonutDongle.
### ACK override

HD-15 file downloads can override the default on an individual request.

Force ACK:

```text
GET /api/files/profile/SVS/S1_SNES.rt4?ack=1
```

Force no-ACK:

```text
GET /api/files/profile/SVS/S1_SNES.rt4?ack=0
```

The option does not change USB behavior; USB downloads remain no-ACK.

The actual mode selected is returned in:

```text
X-DonutShop-Transport
```

Possible values include:

```text
usb-noack
hd15-ack
hd15-noack
```

---

# File Upload
## `PUT /api/files/<file>`

Creates or overwrites a file on the RetroTink SD card.

The request body is the raw file data.

Example request:

```text
PUT /api/files/profile/SVS/S1_SNES.rt4
Content-Type: application/octet-stream
Content-Length: 5242880

<raw file data>
```

A valid, non-zero `Content-Length` is required.

### Successful response

```json
{
  "ok": true,
  "path": "profile/SVS/S1_SNES.rt4",
  "bytes": 5242880,
  "frames": 2560,
  "transport": "hd15-ack",
  "ms": 57854
}
```
### Response fields

| Field | Description |
|---|---|
| `ok` | Whether the upload completed successfully |
| `path` | Destination path |
| `bytes` | Number of file bytes successfully transferred |
| `frames` | Number of data frames transferred |
| `transport` | Transfer mode used |
| `ms` | Upload transfer time in milliseconds |
### Upload transport defaults

| Connection | Upload mode |
|---|---|
| USB Serial | no-ACK |
| HD-15 | ACK |

HD-15 uploads use ACK mode, including at **2,000,000 baud**.

This is intentionally different from HD-15 2,000,000 baud downloads, which default to no-ACK.

---

# File Delete

## `DELETE /api/files/<path>`

Deletes a file or an empty folder from the RetroTink SD card.

Example:

```text
DELETE /api/files/profile/SVS/S1_SNES.rt4
```

---

# Create Folder
## `POST /api/files/mkdir`

Creates a folder on the RetroTink SD card.

### Request body

```json
{
  "path": "profile/SVS/New Folder"
}
```

---

# Move or Rename

## `POST /api/files/move`

Moves or renames a file or folder on the RetroTink SD card.

### Request body

```json
{
  "source": "profile/SVS/Old.rt4",
  "destination": "profile/SVS/New.rt4"
}
```

---
# Transfer Progress

The public REST API does not require a separate progress/status endpoint.

For a download, the client can calculate progress using the number of response bytes received and the `Content-Length` header.

For an upload, the client already knows the request `Content-Length` and how many body bytes it has transmitted. This allows the client to calculate percentage, transfer rate, elapsed time, and estimated time remaining locally.
Reaching 100% of the request body means the entire file has been sent to DonutShop, but the client should still wait for the final HTTP response before considering the upload complete.

A successful final response with:

```json
{
  "ok": true
}
```

is the authoritative indication that the RetroTink file transfer completed successfully.

---
# File Path Rules

API file paths are relative to the SD card root.

Valid:

```text
profile/SVS/S1_SNES.rt4
rt4k_1800.rbf
rt4kup.bin
folder/subfolder/file.txt
```

The API rejects paths that attempt to escape or ambiguously traverse the SD root, including `.` and `..` path segments.

Paths beginning with `/` or `-`, paths containing backslashes or `:`, and paths longer than 255 characters are also rejected.

---
# Common HTTP Responses
| Status | Meaning |
|---:|---|
| `200` | Request completed successfully |
| `400` | Invalid request, command, path, or upload size |
| `404` | File or directory not found |
| `409` | RetroTink serial connection or file-transfer session is busy |
| `411` | PUT request is missing a valid non-zero `Content-Length` |
| `500` | Transfer or internal processing failure |
| `502` | RetroTink returned an unexpected transfer error |
| `503` | RetroTink communication or serial write unavailable |
| `504` | RetroTink response timed out |
| `507` | DonutShop could not allocate the required transfer/listing memory |
Error responses generally use:

```json
{
  "ok": false,
  "error": "description of the error"
}
```

A failed PUT may also report how many bytes had been committed before the failure:

```json
{
  "ok": false,
  "bytes": 1048576,
  "error": "description of the error"
}
```

---

---
# No Experimental Firmware Update API

A one-shot API endpoint for updating the connected RetroTink to the latest experimental firmware was considered, but is not currently implemented.
The existing Experimental Firmware update flow in WebCtl is intentionally browser-assisted. The browser performs the heavier package work, including downloading the firmware ZIP, parsing it, extracting the required files, and orchestrating the staging process. DonutShop then handles the RetroTink file transfer and firmware-update commands.
This split keeps the update process fast and avoids moving ZIP extraction and other heavier processing back onto the Nano, where the same work was previously slower and more resource-intensive.

For that reason, firmware updating remains a WebCtl feature rather than a standalone REST API operation.
