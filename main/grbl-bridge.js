const net = require('node:net');

const GRBL_PORT = 2354;
const GRBL_HOST = '127.0.0.1';
let server, clients, callback, config, deviceController;

module.exports.start = (cb, config_, deviceController_) => {
    config = config_;
    deviceController = deviceController_;
    callback = cb;
    if(server != null) return;

    let timeoutInterval, lastMessage, startMessageReceived = false, programMessageReceived = false, receivedGcode = '';
    const checkTimeout = () => {
        if(lastMessage + 400 < Date.now()) {
            clearInterval(timeoutInterval);
            if(programMessageReceived) {
                console.log('[GRBL] Transmission timed out');
                fireCallback({event: 'timeout'});
            } else {
                console.log('[GRBL] Transmission complete');
                fireCallback({event: 'complete', gcode: receivedGcode, isProgram: programMessageReceived});
            }
            startMessageReceived = false;
            programMessageReceived = false;
            receivedGcode = '';
        }
    };
    clients = [];
    server = net.createServer(socket => {
        clients.push(socket);
        socket.on('data', data => {
            let messages = data.toString();
            messages = messages.split('\n');
            messages.pop();
            for(let message of messages) {
                //console.log('Recv: '+message);
                
                if(startMessageReceived && message != '[program start]' && message != 'M2' && !message.startsWith('G00')) {
                    receivedGcode += message+'\n';
                }
                lastMessage = Date.now();
                switch(message) {
                    case '?':
                        startMessageReceived = true;
                        timeoutInterval = setInterval(checkTimeout, 600);
                        fireCallback({event: 'started'});
                        console.log('[GRBL] Transmission started');
    
                        socket.write('<Idle|MPos:0.000,0.000,0.000|FS:0,0|Pn:PXYZ|Ov:100,100,100>\n');
                        socket.write('ok\n');
                        break;
                    case '[program start]':
                        programMessageReceived = true;
                        if(!startMessageReceived) {
                            startMessageReceived = true;
                            timeoutInterval = setInterval(checkTimeout, 600);
                            fireCallback({event: 'started'});
                            console.log('[GRBL] Transmission started');
                        }
    
                        socket.write('ok\n');
                        break;
                    case 'M2':
                        clearImmediate(timeoutInterval);
                        console.log('[GRBL] Transmission complete');
                        fireCallback({event: 'complete', gcode: receivedGcode, isProgram: programMessageReceived});
                        startMessageReceived = false;
                        programMessageReceived = false;
                        receivedGcode = '';
    
                        socket.write('[MSG:Pgm End]\n');
                        socket.write('ok\n');
                        break;
                    case '$H':
                        fireCallback({event: 'complete', gcode: ''});
                        // Home

                        socket.write('ok\n');
                        break;
                    case '$J':
                        fireCallback({event: 'complete', gcode: ''});
                        // Jog

                        socket.write('ok\n');
                        break;
                    case '$I':
                        socket.write('[VER:0.0.0:]\n');
                        socket.write('ok\n');
                        break;
                    default:
                        socket.write('ok\n');
                }
            }
        });
        socket.on('close', () => {
            clients.splice(clients.indexOf(socket), 1);
        });
    });
    server.listen(GRBL_PORT, GRBL_HOST);
    console.log(`[GRBL] Listening on ${GRBL_HOST}:${GRBL_PORT}`);
};

module.exports.stop = () => {
    if(server ==  null) return;
    console.log('[GRBL] Shutting down server');
    for(let client of clients) {
        client.destroy();
    }
    server.close();
    server = null;
};

async function fireCallback(data) {
    if(data.event == 'complete') {
        if(data.gcode.length == 0) return;

        const dotMode = await deviceController.dotModeActive();
        let dotModePower = config.laserSpotIntensity;
        if(dotModePower > 10) dotModePower = 10;

        if(!data.isProgram) {
            if(dotMode) {
                data.gcode = data.gcode.replace(/S0/g, '');
            }

            data.gcode =
`M17 S1
M207 S${data.isProgram ? 1 : 0}
M106 S${(data.isProgram || dotMode) ? 0 : 1}
M205 X430 Y400
M101
G92 X0 Y0
G0 F9600
G1 F1000${dotMode ? 'S'+(dotModePower*10) : ''}
${data.gcode}M18
`;
        }

        if(dotMode && deviceController.isLaserDotActive()) {
            data.gcode += `M9 S${dotModePower*10} N1000000000000\n`;
        }
    }
    callback(data);
}
