import './window';

const information = document.getElementById('info');
const LEGACY_CODE = true; // Don't use this code, legacy for reference only

if (information && !LEGACY_CODE) {
  if (window.versions) {
    console.debug(window.versions, window.versions.chrome);
    const chromeVersion = typeof window.versions.chrome === 'function' ? window.versions.chrome() : undefined;
    const nodeVersion = typeof window.versions.node === 'function' ? window.versions.node() : undefined;
    const electronVersion = typeof window.versions.electron === 'function' ? window.versions.electron() : undefined;
  
    if (chromeVersion === undefined || nodeVersion === undefined || electronVersion === undefined) {
      throw new Error("Unable to retrieve version information");
    }
    const versionsString = [
      [ 'Chrome', chromeVersion ],
      [ 'Node.js', nodeVersion ],
      [ 'Electron', electronVersion ],
    ];
    versionsString.map(([name, version], index) => {
      let str: string = index == versionsString.length ? 'and ' : '';
      str += `${name} (v${version})`;
      return str;
    }).join(', ');
    information.innerText = `This app is using ${versionsString}.`;
  }
} else if (!LEGACY_CODE) {
  throw new Error("Element with id 'info' not found");
}

