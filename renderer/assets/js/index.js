const ipAddressField = document.getElementById('ipAddressField');
const connectBtn = document.getElementById('connectBtn');

ipAddressField.addEventListener('keyup', () => {
    connectBtn.disabled = ipAddressField.value == '';
});
connectBtn.addEventListener('click', () => {
    connectBtn.classList.add('running');
});
