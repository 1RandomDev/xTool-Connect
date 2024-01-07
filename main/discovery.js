const dgram = require('dgram');

const DISCOVERY_PORT = 20000;

module.exports.scanDevices = () => {
    return new Promise(resolve => {
        const requestId = Date.now();
        const devices = [];
        const socket = dgram.createSocket('udp4');

        socket.on('listening', () => {
            socket.setBroadcast(true);
            socket.send(JSON.stringify({requestId}), DISCOVERY_PORT, '255.255.255.255');
            console.log('Starting device scan.');
        });

        socket.on('message', (message, remote) => {
            try {
                message = JSON.parse(message);
                if(message.requestId == requestId && !!message.ip && !!message.name) {
                    delete message.requestId;
                    devices.push(message);
                    console.log('Discovered device: '+JSON.stringify(message));
                }
            } catch(e) {}
        });

        setTimeout(() => {
            socket.close();
            resolve(devices);
        }, 2000);

        socket.bind();
    });
};
