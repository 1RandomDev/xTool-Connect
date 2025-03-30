#### TCP Ports
| Port | Function  |
| ---- | --------- |
| 8080 | HTTP API  |
| 8081 | WebSocket |

#### HTTP API
##### GET `/progress`
Returns info about the current working state of the machine.
###### Response:
```js
{
	"progress": 100.00, // Progress of the current job
	"working": 56197,   // Time since the current job was started in milliseconds
	"line": 0           // Current line of GCODE file
}
```

##### GET `/ping`
Always returns okay if the device is reachable.
###### Response:
```js
{
	"result": "ok"
}
```

##### GET `/getmachinetype`
Returns type of the current machine.
###### Response:
```js
{
	"result": "ok",
	"type": "xTool D1Pro"
}
```

##### GET `/getlaserpowertype`
Returns the maximum power of the installed laser module.
###### Response:
```js
{
	"result": "ok",
	"power": 10      // 10W
}
```

##### GET `/getlaserpowerinfo`
Returns information about the installed laser module, similar to `/getlaserpowertype`.
###### Response:
```js
{
	"result": "ok",
	"type": 0,       // Maybe 0 for regular laser and 1 for infrared?
	"power": 10      // 10W
}
```

##### GET `/peripherystatus`
Returns current status of the machine and current configuration.
###### Response:
```js
{
	"result": "ok",
	"status": "normal",
	"sdCard": 1,                // 1 = card inserted, 0 = no card
	"limitStopFlag": 1,         // 1 = on, 0 = off
	"tiltStopFlag": 1,          // 1 = on, 0 = off, set by XCS together with movingStopFlag
	"movingStopFlag": 1,        // 1 = on, 0 = off, set by XCS together with tiltStopFlag
	"tiltThreshold": 15,        // Threshold for the tilt sensor, not accessible via XCS
	"movingThreshold": 40,      // Threshold for the movement sensor, not accessible via XCS
	"flameAlarmMode": 3,        // Don't know what it does, maybe different detection algorithms? Not accessible via XCS.
	"flameAlarmSensitivity": 1  // 1 = high, 2 = low, 3 = off
}
```

##### GET `/system`
Used for querying and changing settings of the machine.
###### Parameters:
| Name                  | Description |
| --------------------- | ----------- |
| action                | Action the user wants to perform.<br>Supported actions: mac, version, get_working_sta, offset, dotMode, set_dev_name, get_dev_name, setLimitStopSwitch, setTiltStopSwitch, setMovingStopSwitch, setTiltCheckThreshold, setMovingCheckThreshold, setFlameAlarmMode, setFlameAlarmSensitivity |
| name                  | Must be used together with `action=set_dev_name` and should contain the new name of the device. |
| limitStopSwitch       | Must be used together with `action=setLimitStopSwitch`.<br>Supported values: 1 = on, 0 = off |
| tiltStopSwitch        | Must be used together with `action=setTiltStopSwitch`.<br>Supported values: 1 = on, 0 = off |
| movingStopSwitch      | Must be used together with `action=setMovingStopSwitch`.<br>Supported values: 1 = on, 0 = off |
| tiltCheckThreshold    | Must be used together with `action=setTiltCheckThreshold`.<br>Supported values: 0 - 255; Default: 15 |
| movingCheckThreshold  | Must be used together with `action=setMovingCheckThreshold`.<br>Supported values: 0 - 255; Default: 40 |
| tiltStopSwitch        | Must be used together with `action=setTiltStopSwitch`.<br>Supported values: 1 = on, 0 = off |
| flameAlarmMode        | Must be used together with `action=setFlameAlarmMode`.<br>Supported values: unknown |
| flameAlarmSensitivity | Must be used together with `action=setFlameAlarmSensitivity`.<br>Supported values: 1 = high, 2 = low, 3 = off |
###### Response:
```json5
// action=mac
{
	"result": "ok",
	"mac": "XX:XX:XX:XX:XX:XX"
}
// action=version
{
	"result": "ok",
	"sn": "XXXXXXXXXXXXXXX",
	"version": "V40.31.006.01 B2"
}
// action=get_working_sta
{
	"result": "ok",
	"working": "0"   // 0 = idle, 1 = running (when started via /read API), 2 = running (started via button on device)
}
// action=offset
{
	"result": "ok",
	"x": 0.0,
	"y": 0.0
}
// action=dotMode
{
	"result": "ok",
	"dotMode": 0
}
// action=get_dev_name
{
	"result": "ok",
	"name": "My xTool D1 Pro"
}
```

##### GET `/cmd`
Execute a single GCODE command.
###### Parameters:
| Name | Required | Description                    |
| ---- | -------- | ------------------------------ |
| cmd  | Yes      | GCODE that should be executed. |
###### Response:
```js
{
	"result": "ok"
}
```

##### POST `/cmd`
Execute multiple GCODE commands.
###### Body (plain text):
```
G1
G2
M1
...
```

##### GET `/read`
Read and immediately execute GCODE file from SD card.
###### Parameters:
| Name | Required | Description                      |
| ---- | -------- | -------------------------------- |
| file | Yes      | Path of the file on the SD card. |
###### Response:
```js
{
	"result": "ok" // or "fail" if the file cannot be found, if the file exists but cannot be executed machine will return ok while doing nothing
}
```

##### GET `/list`
Returns list of files on the SD card.
###### Parameters:
| Name | Required | Description |
| ---- | -------- | ----------- |
| dir  | No       | Path to directory that should be listed, defaults to root of the SD card. |
###### Response:
```js
{
	"type": "dir",
	"name": [
		"/frame.gcode",
		"/tmp.gcode",
		//...
	]
}
```

##### GET `/delete`
Delete a file from the SD card.
###### Parameters:
| Name | Required | Description |
| ---- | -------- | ----------- |
| file | Yes | Path of file or directory that should be deleted. Directories can only be deleted once they are empty. |
###### Response:
```js
{
	"result": "ok" // or "fail" if the file cannot be found
}
```

##### POST `/upload` or POST `/cnc/data`
Upload a file to the SD card.
###### Parameters:
| Name     | Required | Description |
| -------- | -------- | ----------- |
| filetype | No       | Type of the GCODE file (frame or program) used for naming the files.<br>Type 0 = /frame.gcode, Type 1 = /tmp.gcode |
| filename | No       | Full path where the uploaded file should be placed. Directories need to exist prior to upload.<br>Default: /tmp.gcode |
###### Body (multipart form):
| Name | Required | Description |
| ---- | -------- | ----------- |
| file | Yes      | File that should be uploaded. |
###### Response:
```js
{
	"result": "ok" // even if something went wrong
}
```

##### GET `/cnc/data`
Pause, resume, stop current job.
###### Parameters:
| Name   | Required | Description |
| ------ | -------- | ----------- |
| action | Yes      | Action the user wants to perform.<br>Supported actions: pause, resume, stop |
###### Response:
```js
{
	"result": "ok" // or "fail" is action is not possible in the current state
}
```

##### GET `/updater`
Simple web interface that lets the user upload a custom firmware update.

##### POST `/upgrade`
Endpoint for uploading firmware update. Used by the web based updater and XCS.
###### Body (multipart form):
| Name | Required | Description           |
| ---- | -------- | --------------------- |
| file | Yes      | Firmware binary file. |
**Response:**
`OK` or `FAIL` in plain Text

##### GET `/framing`
Usage unknown since framing is usually done via the `/cnc/data` endpoint.

#### WiFi Setup
When holding down the power button for 5 seconds in idle, the machine will enter WiFi setup mode. To access the following API endpoints the user must be connected to the AP starting with `xTool_D1P_`. The xTool will be accessible via the ip `192.168.40.1`.
##### POST `http://192.168.40.1:8080/net?action=connsta`
Set WiFi configuration.
###### Body (plain text):
```
<SSID> <PASSWORD>
```
###### Response:
```js
{
	"result": "ok"
}
```

#### WebSocket API
##### Messages from the machine
| Name                 | Description |
| -------------------- | ----------- |
| ok:IDLE              | Machine finished a job or job was aborted and is now in idle again. |
| ok:WORKING_\<state\> | Machine entered working state, available states are WORKING_ONLINE, WORKING_ONLINE_READY, WORKING_OFFLINE, WORKING_FRAMING, WORKING_FRAME_READY. |
| ok:PAUSING           | Current job paused either via the button or via the API. |
| WORK_STOPPED          | Current job has been canceled by holding the power button for 3s or API. |
| ok:ERROR             | An error occurred. |
| err:tiltCheck        | Tilt sensor exceeded threshold. |
| err:movingCheck      | Movement sensor exceeded threshold. |
| err:limitCheck       | Limit switch was activated. |
| err:flameCheck       | Flame was detected. |

#### Discovery
##### UDP Broadcast
Broadcast message:
```js
{
  "ip": "192.168.178.211",  // Address of the current computer
  "port": 20000,
  "requestId": 123456       // Request ID (will be included in the response for identification)
}
```

Example:
```bash
$ echo '{"requestId":123456}' | socat - UDP-DATAGRAM:255.255.255.255:20000,broadcast

{
	"requestId":	123456,
	"ip":	"192.168.178.229",
	"name":	"xTool D1 Pro",
	"version":	"40.31.006.01"
}
```

After receiving the UDP request on port 20000, the device will first try to reply on TCP port 20001 and only then send the same response on UDP port 20000. If TCP port 20001 is blocked by a firewall the device will wait until the connections timed out before using UDP, creating a 20 second delay.


#### GCODE
Incomplete right now.
| Code           | Description                   |
| -------------- | ----------------------------- |
| M28            | Move to home position         |
| M106 S0/1      | Enable/Disable laser cross    |
| M17            | Enable steppers               |
| M18            | Disable steppers/laser module |
| M205 X... Y... | Set working area              |
| M101           | Flat surface mode             |
| M102           | Rotary mode                   |
| G92 X... Y...  | Set origin                    |
