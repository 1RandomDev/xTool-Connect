const dgram = require('dgram');
const net = require('net');

const DISCOVERY_PORT = 20000;
const DISCOVERY_TCP_PORT = 20001;

module.exports.scanDevices = () => {
    return new Promise(resolve => {
        const requestId = Date.now();
        const devices = [];
        const handleResponse = message => {
            try {
                message = JSON.parse(message);
                if(message.requestId == requestId && !!message.ip && !!message.name) {
                    if(devices.find(dev => dev.ip == message.ip)) return;
                    delete message.requestId;
                    devices.push(message);
                    console.log('Discovered device: '+JSON.stringify(message));
                }
            } catch(e) {}
        };
        const socket = dgram.createSocket('udp4');

        // Request
        socket.on('listening', () => {
            socket.setBroadcast(true);
            socket.send(JSON.stringify({requestId}), DISCOVERY_PORT, '255.255.255.255');
            console.log('Starting device scan.');
        });

        // UDP Response
        socket.on('message', handleResponse);

        // TCP Response
        const tcpServer = net.createServer(socket => {
            socket.on('data', handleResponse);
        });
        tcpServer.listen(DISCOVERY_TCP_PORT);

        setTimeout(() => {
            tcpServer.close();
            socket.close();
            resolve(devices);
        }, 2000);

        socket.bind();
    });
};
