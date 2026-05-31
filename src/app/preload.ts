window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector: string, text: string) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const dep of ['chrome', 'node', 'electron']) {
    const version = process.versions[dep];
    if (version) {
      replaceText(`${dep}-version`, version);
    }
  }
});
