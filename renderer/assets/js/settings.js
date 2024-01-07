const settingsContainer = document.getElementById('settingsContainer');

settingsContainer.addEventListener('change', event => {
    let value;
    if(event.target.type == 'radio') {
        value = settingsContainer.querySelector(`input[name="${event.target.name}"]:checked`).value;
    } else {
        value = event.target.value;
    }
    window.electronAPI.saveDeviceSettings({ [event.target.name]: value });

    if(event.target.name == 'positioningMode') {
        settingsContainer.querySelector('[name="crossOffsetX"]').disabled = value == '1';
        settingsContainer.querySelector('[name="crossOffsetY"]').disabled = value == '1';
    }
});

(async () => {
    const deviceInfo = await window.electronAPI.getDeviceInfo();
    Object.entries(deviceInfo).forEach(([name, value]) => {
        const elements = settingsContainer.querySelectorAll(`[name="${name}"]`);
        if(elements.length == 0) return;
        if(elements[0].nodeName == 'INPUT') {
            if(elements[0].type == 'radio') {
                elements.forEach(element => {
                    element.checked = element.value == value;
                });
            } else {
                elements[0].value = value;
            }

            if(name == 'positioningMode') {
                settingsContainer.querySelector('[name="crossOffsetX"]').disabled = value == '1';
                settingsContainer.querySelector('[name="crossOffsetY"]').disabled = value == '1';
            }
        } else {
            elements[0].innerText = value;
        }
    });
})();
