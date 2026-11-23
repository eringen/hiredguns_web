// Boot the original SystemTakeover configuration from the archived CD32 installation.
const form = document.querySelector('#boot');
const status = document.querySelector('#status');
const button = form.querySelector('button');
const machine = document.querySelector('#machine');

async function mountFile(target, blob, name) {
  const data = new Uint8Array(await blob.arrayBuffer());
  Object.assign(target, {name, data, size: data.length, crc32: false});
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  button.disabled = true;
  try {
    const kick = document.querySelector('#kick').files[0];
    if (kick.size !== 524288) throw new Error('Select the 512 KiB CD32 Kickstart ROM.');
    const emulator = new ScriptedAmigaEmulator();
    emulator.setModel(SAEC_Model_A1200, 0);
    const config = emulator.getConfig();
    config.video.id = 'game';
    config.video.api = SAEC_Config_Video_API_Canvas;
    config.memory.z2FastSize = 4 << 20;
    await mountFile(config.memory.rom, kick, kick.name);
    status.textContent = 'Loading game disk…';
    const response = await fetch('HiredGuns.hdf');
    if (!response.ok) throw new Error('Game disk unavailable. Run make preview-build.');
    emulator.setMountInfoDefaults(0);
    const drive = config.mount.config[0].ci;
    drive.controller_type = SAEC_Config_Mount_Controller_Type_MB_IDE;
    drive.controller_unit = 0;
    drive.devname = 'DH0';
    drive.bootpri = 0;
    await mountFile(drive.file, await response.blob(), 'HiredGuns.hdf');
    drive.highcyl = Math.floor(drive.file.size / (drive.blocksize * drive.surfaces * drive.sectors));
    machine.hidden = false;
    const result = await emulator.start();
    if (result) throw new Error('The emulator could not start (code ' + result + ').');
    form.hidden = true;
    status.textContent = 'Click for mouse input. Arrow keys move the joystick. Right Shift fires.';
  } catch (error) {
    status.textContent = error.message;
    machine.hidden = true;
    button.disabled = false;
  }
});
