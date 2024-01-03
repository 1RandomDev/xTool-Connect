const axios = require('axios');
const { WebSocket } = require('ws');

let connected;
let websocket;
let heartbeatTimer, lastHeartbeat;

module.exports.setupWifi = async (credentials) => {
    try {
        const response = await axios.post('http://192.168.40.1:8080/net?action=connsta', credentials.ssid+' '+credentials.password);
        if(response.data.result == 'ok') return {result: 'ok'};
    } catch(err) {
        console.error("WiFi setup failed:", err.message);
        if(err.code == 'ENETUNREACH') return {result: 'fail_network'};
    }
    
    return {result: 'fail'};
};

module.exports.connect = async (deviceAddress, wsCallback) => {
    if(connected) this.disconnect();

    try {
        let res = await axios.get(`http://${deviceAddress}:8080/ping`);
        if(res.data.result != 'ok') {
            console.error('Device connect failed: Ping response invalid:', res.data);
            return {result: 'fail'}
        }
    } catch(err) {
        console.error('Device connect failed:', err.message);
        return {result: 'fail'}
    }

    return new Promise(resolve => {
        websocket = new WebSocket(`ws://${deviceAddress}:8081`);
        websocket.on('error', err => {
            console.error('WebSocket connection faild:', err);
            resolve({result: 'fail'});
        });
        websocket.on('open', () => {
            heartbeatTimer = setInterval(() => {
                websocket.ping();
                if(lastHeartbeat + 6000 < Date.now()) {
                    wsCallback('err:TIMEOUT');
                    clearInterval(heartbeatTimer);
                    websocket.terminate();
                    connected = false;
                }
            }, 2000);
            resolve({result: 'ok'});
        });
        websocket.on('pong', () => {
            lastHeartbeat = Date.now();
        });
        websocket.on('message', wsCallback)
    });
};

module.exports.disconnect = () => {
    if(!connected) return;

    clearInterval(heartbeatTimer);
    websocket.close();
    connected = false;
};

module.exports.getInfo = async (deviceAddress) => {
    const settings = {};

    try {
        let res = await axios.get(`http://${deviceAddress}:8080/getmachinetype`);
        settings.deviceModel = res.data.type;
    
        res = await axios.get(`http://${deviceAddress}:8080/getlaserpowertype`);
        settings.laserPower = res.data.power+'W';
    
        res = await axios.get(`http://${deviceAddress}:8080/peripherystatus`);
        settings.flameAlarmMode = res.data.flameAlarmSensitivity;
        settings.tiltSwitchMode = res.data.tiltStopFlag;
        settings.limitSwitchesMode = res.data.limitStopFlag;
    
        res = await axios.get(`http://${deviceAddress}:8080/system?action=get_dev_name`);
        settings.deviceName = res.data.name;
    
        res = await axios.get(`http://${deviceAddress}:8080/system?action=mac`);
        settings.macAddress = res.data.mac;
    
        res = await axios.get(`http://${deviceAddress}:8080/system?action=version`);
        settings.firmwareVersion = res.data.version;
        settings.serialNumber = res.data.sn;
    
        res = await axios.get(`http://${deviceAddress}:8080/system?action=offset`);
        settings.crossOffsetX = res.data.x;
        settings.crossOffsetY = res.data.y;
    
        res = await axios.get(`http://${deviceAddress}:8080/system?action=dotMode`);
        settings.positioningMode = res.data.dotMode;
    } catch(err) {
        console.error('Getting device info failed:', err);
    }

    return settings;
};

module.exports.saveSettings = async (deviceAddress, settings) => {
    try {
        for([name, value] of Object.entries(settings)) {
            switch(name) {
                case 'flameAlarmMode':
                    await axios.get(`http://${deviceAddress}:8080/system?action=setFlameAlarmSensitivity&flameAlarmSensitivity=${value}`);
                    break;
    
                case 'tiltSwitchMode':
                    await axios.get(`http://${deviceAddress}:8080/system?action=setTiltStopSwitch&tiltStopSwitch=${value}`);
                    await axios.get(`http://${deviceAddress}:8080/system?action=setMovingStopSwitch&movingStopSwitch=${value}`);
                    break;
    
                case 'limitSwitchesMode':
                    await axios.get(`http://${deviceAddress}:8080/system?action=setLimitStopSwitch&limitStopSwitch=${value}`);
                    break;
    
                case 'deviceName':
                    await axios.get(`http://${deviceAddress}:8080/system?action=set_dev_name&name=${value}`);
                    break;
    
                case 'crossOffsetX':
                    await axios.get(`http://${deviceAddress}:8080/cmd?cmd=M98 X${value}`);
                    break;
    
                case 'crossOffsetY':
                    await axios.get(`http://${deviceAddress}:8080/cmd?cmd=M98 Y${value}`);
                    break;
                
                case 'positioningMode':
                    await axios.get(`http://${deviceAddress}:8080/cmd?cmd=M97 S${value}`);
                    break;
            }
        }
    } catch(err) {
        console.error('Saving device settings failed:', err);
    }
};
