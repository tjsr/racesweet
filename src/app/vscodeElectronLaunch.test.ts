import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

type VscodeTask = {
  command?: string;
  detail?: string;
  isBackground?: boolean;
  label?: string;
  problemMatcher?: {
    background?: {
      endsPattern?: string;
    };
  };
};

type VscodeLaunchConfiguration = {
  args?: string[];
  name?: string;
  preLaunchTask?: string;
  runtimeArgs?: string[];
  runtimeExecutable?: string;
};

type VscodeLaunch = {
  compounds?: Array<{
    configurations?: string[];
    name?: string;
    stopAll?: boolean;
  }>;
  configurations?: VscodeLaunchConfiguration[];
};

const parseJsonc = <Data>(contents: string): Data =>
  JSON.parse(contents.replaceAll(/^\s*\/\/.*$/gm, '')) as Data;

const readVscodeTasks = async (): Promise<{ tasks?: VscodeTask[] }> =>
  parseJsonc(await readFile(join(process.cwd(), '.vscode', 'tasks.json'), 'utf-8'));

const readVscodeLaunch = async (): Promise<VscodeLaunch> =>
  parseJsonc(await readFile(join(process.cwd(), '.vscode', 'launch.json'), 'utf-8'));

describe('VS Code Electron debug tasks', () => {
  it('has a background Electron Forge serve task for webpack assets and the dev asset server', async () => {
    const tasks = await readVscodeTasks();
    const serveTask = tasks.tasks?.find((task) => task.label === 'electron: serve');

    expect(serveTask?.command).toBe('npm run serve');
    expect(serveTask?.isBackground).toBe(true);
    expect(serveTask?.detail).toContain('main, preload, renderer assets');
    expect(serveTask?.problemMatcher?.background?.endsPattern).toContain('Webpack Output Available');
  });

  it('has a task that waits for an already-starting Electron asset server', async () => {
    const tasks = await readVscodeTasks();
    const waitTask = tasks.tasks?.find((task) => task.label === 'electron: wait for assets');

    expect(waitTask?.command).toBe('npm run wait:electron-assets');
    expect(waitTask?.detail).toContain('webpack dev asset server');
  });

  it('launches Electron Main through the shared serve script', async () => {
    const launch = await readVscodeLaunch();
    const mainConfig = launch.configurations?.find((configuration) => configuration.name === 'Electron Main');

    expect(mainConfig?.runtimeExecutable).toBe('npm');
    expect(mainConfig?.runtimeArgs).toEqual(['run', 'serve']);
    expect(mainConfig?.args).toBeUndefined();
  });

  it('starts the serve task before launching the renderer debugger', async () => {
    const launch = await readVscodeLaunch();
    const rendererConfig = launch.configurations?.find((configuration) => configuration.name === 'Electron Renderer');

    expect(rendererConfig?.preLaunchTask).toBe('electron: serve');
  });

  it('uses a compound for Electron All instead of bypassing Forge with electron directly', async () => {
    const launch = await readVscodeLaunch();
    const electronAllConfiguration = launch.configurations?.find((configuration) => configuration.name === 'Electron All');
    const electronAllCompound = launch.compounds?.find((compound) => compound.name === 'Electron All');
    const rendererAttachConfig = launch.configurations?.find((configuration) => configuration.name === 'Electron Renderer Attach');

    expect(electronAllConfiguration).toBeUndefined();
    expect(rendererAttachConfig?.preLaunchTask).toBe('electron: wait for assets');
    expect(electronAllCompound?.configurations).toEqual(['Electron Main', 'Electron Renderer Attach']);
    expect(electronAllCompound?.stopAll).toBe(true);
  });
});
