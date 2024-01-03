const ipAddressField = document.getElementById('ipAddressField');
const connectBtn = document.getElementById('connectBtn');
const autoConnectOpt = document.getElementById('autoConnectOpt');

ipAddressField.addEventListener('keyup', () => {
    connectBtn.disabled = ipAddressField.value == '';
});
ipAddressField.addEventListener('keypress', event => {
    if(event.key == 'Enter') {
        connectBtn.click();
    }
});
connectBtn.addEventListener('click', () => {
    connectBtn.classList.add('running');
    window.electronAPI.saveSettings({deviceAddress: ipAddressField.value});

    setTimeout(async () => {
        const response = await window.electronAPI.connectDevice();
        connectBtn.classList.remove('running');
        if(response.result == 'ok') {
            location.href = 'settings.html';
        } else {
            toastr.error('Unable to connect to your device. Please check if the IP address is correct and if the device is turned on and connected to the network.', 'Connection failed')
        }
    }, 500);
});
autoConnectOpt.addEventListener('change', () => {
    window.electronAPI.saveSettings({autoConnect: autoConnectOpt.checked});
});

(async () => {
    const settings = await window.electronAPI.getSettings();
    ipAddressField.value = settings.deviceAddress || '';
    connectBtn.disabled = ipAddressField.value == '';
    autoConnectOpt.checked = settings.autoConnect;
    
    if(settings.autoConnect && await window.electronAPI.firstConnect()) {
        connectBtn.click();
    }
})();
