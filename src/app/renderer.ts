declare global {
  interface Window {
    versions: {
      node: () => string;
      chrome: () => string;
      electron: () => string;
    };
  }
}

const information = document.getElementById('info');
if (information) {
  const chromeVersion = window.versions.chrome();
  const nodeVersion = window.versions.node();
  const electronVersion = window.versions.electron();

  if (chromeVersion === undefined || nodeVersion === undefined || electronVersion === undefined) {
    throw new Error("Unable to retrieve version information");
  }
  const versionsString = [
    [ 'Chrome', chromeVersion ],
    [ 'Node.js', nodeVersion ],
    [ 'Electron', electronVersion ],
  ].map(([name, version], index) => {
    let str: string = index == versionsString.length ? 'and ' : '';
    str += `${name} (v${version})`;
    return str;
  }).join(', ');
  information.innerText = `This app is using ${versionsString}.`;
} else {
  throw new Error("Element with id 'info' not found");
}
