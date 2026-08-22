# iRacing agent

The iRacing agent runs on the Windows machine that is running iRacing. It reads the iRacing SDK shared memory through `irsdk-node`, converts finish, sector, and pit transitions into RaceSweet records, and uploads them to the RaceSweet HTTP API.

Create a RaceSweet data source with type `timing-iracing-agent`, assign it to the target session, and ensure the entrant identifiers use the iRacing `UserID` as `txNo`.

Build the compiled agent with:

```powershell
npm run build:iracing-agent
```

Create the portable Windows zip bundle instead:

```powershell
npm.cmd run package:iracing-agent:zip
```

The package command refuses to create a bundle with blank connection defaults. Values must be supplied as `RACESWEET_URL`, `RACESWEET_SOURCE_ID`, `RACESWEET_SESSION_ID`, `RACESWEET_USERNAME`, and `RACESWEET_PASSWORD`. The URL can also be derived from the local generated listener configuration when a listener port is configured.

If username or password environment variables are omitted, the package defaults to username `admin` and password `adminadminadmin`.

If URL, source ID, or session ID environment variables are omitted, defaults are the shared RaceSweet listener default (`http://127.0.0.11`), `iracing-agent`, and `active`. The `active` session value is resolved by the RaceSweet server when the upload arrives.

The zip is written to `release\\racesweet-iracing-agent.zip`. It includes the compiled agent, production dependencies, the native iRacing binding, a private Node.js runtime, `launch-iracing-agent.cmd`, and `racesweet.properties`.

When `RACESWEET_URL`, `RACESWEET_SESSION_ID`, `RACESWEET_SOURCE_ID`, `RACESWEET_USERNAME`, and `RACESWEET_PASSWORD` are set while building the package, their defaults are written into `racesweet.properties`. The password is AES-GCM encrypted using a key derived from the other packaged values. This protects it from casual plaintext inspection, but anyone with the complete bundle can technically recover it.

Run it on the iRacing host with Node.js 22 or newer:

```powershell
$env:RACESWEET_URL = 'https://racesweet.example.com'
$env:RACESWEET_SOURCE_ID = 'iracing-agent'
$env:RACESWEET_SESSION_ID = 'the-racesweet-session-id'
$env:RACESWEET_USERNAME = 'agent-user'
$env:RACESWEET_PASSWORD = 'agent-password'
$env:RACESWEET_TIMING_LINES = '[{"id":"finish","kind":"finish","lapDistancePercent":0}]'
node .\dist-iracing-agent\src\agent\iracingAgentMain.js
```

The native `irsdk-node` dependency must be installed for the Windows architecture of the host. iRacing must have memory telemetry enabled (`irsdkEnableMem=1` in `app.ini`).
