import { execFile } from 'node:child_process';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { cp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const packageDirectory = path.resolve('release', `iracing-agent-${Date.now()}`);
const zipPath = path.resolve('release', 'racesweet-iracing-agent.zip');
const linkedPackageDirectory = path.resolve('release', 'iracing-agent');
const localSystemConfiguration = await readFile(path.resolve('src', 'generated', 'system-config.json'), 'utf8')
  .then((contents) => JSON.parse(contents))
  .catch(() => ({}));
const defaultConfiguration = JSON.parse(await readFile(path.resolve('src', 'defaults.json'), 'utf8'));
const configuredListenerPort = localSystemConfiguration.listenerServer?.httpsPort || localSystemConfiguration.listenerServer?.httpPort;
const localListenerUrl = configuredListenerPort
  ? `${localSystemConfiguration.listenerServer.httpsPort ? 'https' : 'http'}://127.0.0.1:${configuredListenerPort}`
  : '';
const configuredValue = (environmentName, fallback = '') => process.env[environmentName] || fallback;

await rm(packageDirectory, { force: true, recursive: true });
await rm(zipPath, { force: true });
await mkdir(path.join(packageDirectory, 'src', 'agent'), { recursive: true });
await mkdir(path.join(packageDirectory, 'src', 'utils'), { recursive: true });
await mkdir(path.join(packageDirectory, 'runtime'), { recursive: true });
await cp(path.resolve('dist-iracing-agent', 'src', 'agent'), path.join(packageDirectory, 'src', 'agent'), { recursive: true });
await cp(path.resolve('dist-iracing-agent', 'src', 'utils', 'iracingRelay.js'), path.join(packageDirectory, 'src', 'utils', 'iracingRelay.js'));
const runtimePackages = [
  '@irsdk-node',
  'argparse',
  'bindings',
  'file-uri-to-path',
  'irsdk-node',
  'js-yaml',
  'module-alias',
  'node-addon-api',
  'node-gyp-build',
];
for (const packageName of runtimePackages) {
  await cp(
    path.resolve('node_modules', packageName),
    path.join(packageDirectory, 'node_modules', packageName),
    { recursive: true },
  );
}
await cp(process.execPath, path.join(packageDirectory, 'runtime', 'node.exe'));
await writeFile(path.join(packageDirectory, 'package.json'), `${JSON.stringify({ dependencies: { 'irsdk-node': '^5.4.0' }, private: true, type: 'commonjs' }, null, 2)}\n`, 'utf8');
const defaultUrl = configuredValue('RACESWEET_URL', localSystemConfiguration.remoteServer?.baseUrl || localListenerUrl || `http://127.0.0.1:${defaultConfiguration.listenerHttpPort}`);
const defaultSourceId = configuredValue('RACESWEET_SOURCE_ID', 'iracing-agent');
const defaultSessionId = configuredValue('RACESWEET_SESSION_ID', 'active');
const defaultUsername = configuredValue('RACESWEET_USERNAME', 'admin');
const defaultPassword = configuredValue('RACESWEET_PASSWORD', 'adminadminadmin');
const missingDefaults = [['url', defaultUrl], ['source-id', defaultSourceId], ['session-id', defaultSessionId], ['username', defaultUsername], ['password', defaultPassword]]
  .filter(([, value]) => !value).map(([name]) => name);
if (missingDefaults.length > 0) {
  throw new Error(`Cannot create a usable racesweet.properties file. Provide ${missingDefaults.join(', ')} using RACESWEET_* environment variables.`);
}
const passwordKey = createHash('sha256').update(`${defaultUrl}\0${defaultSourceId}\0${defaultSessionId}\0${defaultUsername}`).digest();
const passwordIv = randomBytes(12);
const passwordCipher = createCipheriv('aes-256-gcm', passwordKey, passwordIv);
const passwordText = Buffer.concat([passwordCipher.update(defaultPassword, 'utf8'), passwordCipher.final()]);
const encryptedPassword = defaultPassword
  ? `v1:${passwordIv.toString('base64url')}:${passwordCipher.getAuthTag().toString('base64url')}:${passwordText.toString('base64url')}`
  : '';
await writeFile(path.join(packageDirectory, 'racesweet.properties'), [
  '# RaceSweet iRacing agent defaults. Environment variables override these values.',
  `url=${defaultUrl}`,
  `sessionId=${defaultSessionId}`,
  `sourceId=${defaultSourceId}`,
  `username=${defaultUsername}`,
  `passwordEncrypted=${encryptedPassword}`,
  'pollIntervalMs=16',
  'timingLines=[{"id":"finish","kind":"finish","lapDistancePercent":0}]',
].join('\r\n') + '\r\n', 'utf8');
await writeFile(path.join(packageDirectory, 'launch-iracing-agent.cmd'), [
  '@echo off',
  'setlocal',
  'set "AGENT_ROOT=%~dp0"',
  '"%AGENT_ROOT%runtime\\node.exe" "%AGENT_ROOT%src\\agent\\iracingAgentMain.js"',
  'if errorlevel 1 pause',
].join('\r\n'), 'utf8');
await writeFile(path.join(packageDirectory, 'README.txt'), 'Run launch-iracing-agent.cmd. It includes a private Node.js runtime and the native iRacing SDK dependency.\r\n', 'utf8');

const escapedPackageDirectory = packageDirectory.replace(/'/gu, "''");
const escapedZipPath = zipPath.replace(/'/gu, "''");
await execFileAsync('powershell.exe', [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  `Compress-Archive -Path (Get-ChildItem -LiteralPath '${escapedPackageDirectory}' -Force | Select-Object -ExpandProperty FullName) -DestinationPath '${escapedZipPath}' -CompressionLevel Optimal`,
]);

await rm(linkedPackageDirectory, { force: true, recursive: true });
await symlink(packageDirectory, linkedPackageDirectory, "junction");

console.log(`iRacing agent package prepared at ${packageDirectory}`);
console.log(`iRacing agent zip prepared at ${zipPath}`);
