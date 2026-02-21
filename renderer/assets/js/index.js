const ipAddressField = document.getElementById('ipAddressField');
const connectBtn = document.getElementById('connectBtn');
const autoConnectOpt = document.getElementById('autoConnectOpt');
const deviceDiscovery = document.getElementById('deviceDiscovery');

ipAddressField.addEventListener('keyup', () => {
    connectBtn.disabled = ipAddressField.value == '';
});
ipAddressField.addEventListener('keypress', event => {
    if(event.key == 'Enter') {
        connectBtn.click();
    }
});
connectBtn.addEventListener('click', () => {
    if(connectBtn.classList.contains('running')) return;
    connectBtn.classList.add('running');
    window.electronAPI.saveSettings({deviceAddress: ipAddressField.value});

    setTimeout(async () => {
        const response = await window.electronAPI.connectDevice();
        connectBtn.classList.remove('running');
        if(response.result == 'ok') {
            location.href = 'control.html';
        } else {
            toastr.error('Unable to connect to your device. Please check if the IP address is correct and if the device is turned on and connected to the network.', 'Connection failed')
        }
    }, 500);
});
autoConnectOpt.addEventListener('change', () => {
    window.electronAPI.saveSettings({autoConnect: autoConnectOpt.checked});
});
deviceDiscovery.querySelector('.rescanBtn').addEventListener('click', event => {
    event.preventDefault();
    scanDevices();
});

(async () => {
    const settings = await window.electronAPI.getSettings();
    ipAddressField.value = settings.deviceAddress || '';
    connectBtn.disabled = ipAddressField.value == '';
    autoConnectOpt.checked = settings.autoConnect;
    
    if(settings.autoConnect && await window.electronAPI.firstConnect()) {
        connectBtn.click();
    }

    const params = new URLSearchParams(window.location.search);
    if(params.get('message') == 'timeout') {
        toastr.error('Connection to device lost. Please check your internet connection and reconnect.', 'Connection lost');
        if(settings.autoConnect) {
            setTimeout(() => {
                connectBtn.click();
            }, 5000);
        }
    }

    scanDevices();
})();

async function scanDevices() {
    const rescan = deviceDiscovery.querySelector('.rescan');
    const scanning = deviceDiscovery.querySelector('.scanning');
    rescan.style.display = 'none';
    scanning.style.display = 'block';

    const devices = await window.electronAPI.scanDevices();
    for(let dev of deviceDiscovery.querySelectorAll('.device')) dev.remove();
    devices.forEach(dev => {
        const element = document.createElement('div');
        element.classList.add('device');
        element.innerHTML = `<span class="name">${dev.name}</span><span class="ip">${dev.ip}</span>`;
        element.onclick = () => {
            ipAddressField.value = dev.ip;
            connectBtn.disabled = false;
            connectBtn.click();
        };
        deviceDiscovery.appendChild(element);
    });

    rescan.style.display = null;
    scanning.style.display = null;
}
