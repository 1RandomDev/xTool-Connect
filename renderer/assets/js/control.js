const disconnectBtn = document.getElementById('disconnectBtn');
const gcodeDropzone = document.getElementById('gcodeDropzone');
const moveDistance = document.getElementById('moveDistance');
const moveSpeed = document.getElementById('moveSpeed');
const positioningButtons = document.getElementById('positioningButtons');
const laserSpotBtn = document.getElementById('laserSpotBtn');
const laserSpotIntensity = document.getElementById('laserSpotIntensity');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const currentStatus = document.getElementById('currentStatus');
const currentProgress = document.getElementById('currentProgress');
const currentProgressNum = document.getElementById('currentProgressNum');

let progressUpdateTimer, laserSpotActive, uploadNotification;

disconnectBtn.addEventListener('click', () => {
    window.electronAPI.disconnectDevice();
    location.href = 'index.html';
});

gcodeDropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.target.classList.remove('drag');

    handleUpload(event.dataTransfer.files[0]);
});
gcodeDropzone.addEventListener('click', (event) => {
    let input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gcode';
    input.onchange = () => {
        handleUpload(input.files[0])
    };
    input.click();
});

gcodeDropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.stopPropagation();
});
gcodeDropzone.addEventListener('dragenter', (event) => {
    gcodeDropzone.classList.add('drag');
});
gcodeDropzone.addEventListener('dragleave', (event) => {
    gcodeDropzone.classList.remove('drag');
});

laserSpotBtn.addEventListener('click', async () => {
    laserSpotActive = !laserSpotActive;
    window.electronAPI.setLaserDot(laserSpotActive);
    updateLaserSpotBtn();
});
laserSpotIntensity.addEventListener('change', () => {
    window.electronAPI.saveSettings({laserSpotIntensity: getValueInBounds(laserSpotIntensity)});
    window.electronAPI.setLaserDot(true);
});

moveDistance.addEventListener('change', () => {
    window.electronAPI.saveSettings({moveDistance: getValueInBounds(moveDistance)});
});
moveSpeed.addEventListener('change', () => {
    window.electronAPI.saveSettings({moveSpeed: getValueInBounds(moveSpeed)});
});
positioningButtons.addEventListener('click', event => {
    if(event.target.nodeName != 'BUTTON') return;
    window.electronAPI.moveLaser(event.target.value);
});

pauseBtn.addEventListener('click', () => {
    window.electronAPI.control(pauseBtn.value);
});
stopBtn.addEventListener('click', () => {
    window.electronAPI.control(stopBtn.value);
});

(async () => {
    const settings = await window.electronAPI.getSettings();
    moveDistance.value = settings.moveDistance;
    moveSpeed.value = settings.moveSpeed;
    laserSpotIntensity.value = settings.laserSpotIntensity;

    window.electronAPI.onWebsocketMessage(data => {
        switch(data) {
            case 'ok:WORKING_OFFLINE':
            case 'ok:WORKING_FRAMING':
                gcodeDropzone.classList.add('disabled');
                disableMoveButtons(true);
                pauseBtn.disabled = false;
                stopBtn.disabled = false;
                currentStatus.innerText = 'Working';
                pauseBtn.innerText = 'Pause';
                pauseBtn.value = 'pause';
                if(!progressUpdateTimer) {
                    updateProgress();
                    progressUpdateTimer = setInterval(updateProgress, 5000);
                }
                break;
            case 'ok:IDLE':
                gcodeDropzone.classList.remove('disabled');
                disableMoveButtons(false);
                pauseBtn.disabled = true;
                stopBtn.disabled = true;
                pauseBtn.innerText = 'Pause';
                pauseBtn.value = 'pause';
                currentStatus.innerText = 'Ready';
                currentProgressNum.innerText = '0%';
                clearInterval(progressUpdateTimer);
                progressUpdateTimer = null;
                currentProgress.style.width = null;
                break;
            case 'ok:PAUSING':
                currentStatus.innerText = 'Paused';
                pauseBtn.innerText = 'Resume';
                pauseBtn.value = 'resume';
                clearInterval(progressUpdateTimer);
                progressUpdateTimer = null;
                break;
            case 'ok:WORKING_FRAMING':
                currentStatus.innerText = 'Framing';
                break;
            case 'WORK_STOPED':
                toastr.error('The current job was canceled either by the user or due to an error.', 'Job canceled');
                break;
            case 'err:tiltCheck':
            case 'err:movingCheck':
                toastr.error('The current job was aborted because the device was moved during operation.', 'Movement detected!', {timeOut: 8000});
                break;
            case 'err:flameCheck':
                toastr.error('The current job was aborted because a flame was detected. Please check the state of the device immediately.', 'Flame detected!', {timeOut: 8000});
                break;
            case 'err:limitCheck':
                toastr.error('The current job was aborted because a limit switch was activated.', 'Limit reached!', {timeOut: 8000});
                break;
            case 'grbl:started':
                uploadNotification = toastr.success('Please wait until the file is received and the upload is complete.', 'Receiving data from LightBurn...', {timeOut: 0});
                break;
            case 'grbl:complete':
                uploadNotification.remove();
                toastr.success('You can now start the job by pressing the start button on the device.', 'LightBurn upload complete');
                break;
            case 'grbl:timeout':
                uploadNotification.remove();
                toastr.success('File could not be sent to the device.', 'LightBurn upload failed');
                break;
        }
    });

    const currentState = await window.electronAPI.getCurrentState();
    document.getElementById('deviceName').innerText = currentState.deviceName;
    laserSpotBtn.disabled = !currentState.dotMode;
    laserSpotIntensity.disabled = !currentState.dotMode;
    laserSpotActive = currentState.laserDotActive;
    updateLaserSpotBtn();

    if(!currentState.working) {
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
        currentStatus.innerText = 'Ready';
        currentProgressNum.innerText = '0%';
    } else {
        gcodeDropzone.classList.add('disabled');
        disableMoveButtons(true);
        updateProgress();
        progressUpdateTimer = setInterval(updateProgress, 5000);
        if(currentState.paused) {
            pauseBtn.innerText = 'Resume';
            pauseBtn.value = 'resume';
            currentStatus.innerText = 'Paused';
        } else if(currentState.framing) {
            currentStatus.innerText = 'Framing';
        } else {
            currentStatus.innerText = 'Working';
        }
    }
})();

async function handleUpload(file) {
    if(!file.name.endsWith('.gcode') && !file.name.endsWith('.gc') && !file.name.endsWith('.g')) {
        toastr.error('Only <b>.gcode</b> files are supported for upload. Please export your project as GCODE.', 'Unsupported filetype')
        return;
    }

    toastr.success('Please wait until the upload is complete.', 'Uploading file...');
    if(await window.electronAPI.uploadGcode(file.path, 1)) {
        toastr.success('You can now start the job by pressing the start button on the device.', 'Upload complete');
    } else {
        toastr.error('File could not be sent to the device.', 'Upload failed');
    }
}

function disableMoveButtons(disabled) {
    for(const btn of positioningButtons.querySelectorAll('button')) {
        btn.disabled = disabled;
    }
}
async function updateProgress() {
    const progress = await window.electronAPI.getProgress();
    currentProgressNum.innerText = progress+'%';
    currentProgress.style.width = progress+'%';
}
function updateLaserSpotBtn() {
    if(laserSpotActive) {
        laserSpotBtn.innerText = 'Turn off';
        laserSpotBtn.classList.add('buttonRed');
        laserSpotIntensity.disabled = false;
    } else {
        laserSpotBtn.innerText = 'Turn on';
        laserSpotBtn.classList.remove('buttonRed');
        laserSpotIntensity.disabled = true;
    }
}
function getValueInBounds(element) {
    const value = parseInt(element.value);
    const min = parseInt(element.min);
    const max = parseInt(element.max);

    if(value > max) {
        element.value = max;
        return max;
    } else if(value < min) {
        element.value = min;
        return min;
    } else {
        return value
    }
}
