const ssidField = document.getElementById('ssidField');
const passwordField = document.getElementById('passwordField');
const connectBtn = document.getElementById('connectBtn');

function inputValidator() {
    connectBtn.disabled = ssidField.value == '' || passwordField.value == '';
}
ssidField.addEventListener('keyup', inputValidator);
passwordField.addEventListener('keyup', inputValidator);

connectBtn.addEventListener('click', () => {
    connectBtn.classList.add('running');
    setTimeout(async () => {
        const response = await window.electronAPI.setupWifi({
            ssid: ssidField.value,
            password: passwordField.value
        });
        connectBtn.classList.remove('running');
        switch(response.result) {
            case 'ok':
                toastr.success('WiFi has been sucessfully set up for your device. You can now go back and connect to the device.', 'Setup complete');
                ssidField.value = '';
                passwordField.value = '';
                inputValidator();
                setTimeout(() => {
                    location.href = 'index.html';
                }, 4000);
                break;
            case 'fail_network':
                toastr.error('You are not connected to the xTool hotspot, please go to your WiFi settings and make sure you\'re connected to the hotspot starting with <b>xTool_D1P_</b>.', 'Setup failed');
                break;
            case 'fail':
                toastr.error('Device could not be connected to the specified WiFI. Please verify that your device is turned on and in setup mode.', 'Setup failed');
                break;
        }
    }, 1000);
});
