# SRT Inspector

Local VS Code extension for browsing CTC/Data-1 `.SRT` and `.ERF` timing data as decoded fields.

## Use

1. Open this `vscode-srt-inspector` folder in VS Code.
2. Run `npm install` and then press `F5` to launch an Extension Development Host.
3. In that window, right-click an `.SRT` or `.ERF` file and choose **Open SRT Inspector**, or use the editor-title button.

The inspector keeps the raw record beside decoded DRT, time, transponder, line, loop, confidence, status, and hit fields. It also labels `40`, `4D`, `4E`, and `E1` control records and derives their time-of-day when a visible-time SRT row provides an anchor.

## Verify

Run `npm test` from this extension folder.
