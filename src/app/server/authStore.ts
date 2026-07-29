import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  AuthenticatedUser,
  LoginRequest,
  SetupRequest,
  UserRole,
} from '../../model/serverApi.js';

const scrypt = promisify(scryptCallback);
const SESSION_DURATION_MS: number = 12 * 60 * 60 * 1_000;
const MINIMUM_PASSWORD_LENGTH: number = 12;

interface PersistedUser extends AuthenticatedUser {
  passwordHash: string;
  passwordSalt: string;
}

interface PersistedUserStore {
  schemaVersion: 1;
  users: PersistedUser[];
}

interface AuthSession {
  expiresAt: number;
  token: string;
  userId: string;
}

const createEmptyUserStore = (): PersistedUserStore => ({
  schemaVersion: 1,
  users: [],
});

const publicUser = (user: PersistedUser): AuthenticatedUser => ({
  id: user.id,
  role: user.role,
  username: user.username,
});

const normalizeUsername = (username: string): string => username.trim().toLowerCase();

const hashPassword = async (password: string, salt: string): Promise<string> => {
  const value: Buffer = await scrypt(password, salt, 64) as Buffer;
  return value.toString('base64');
};

const assertPassword = (password: string): void => {
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    throw new Error(`Password must contain at least ${MINIMUM_PASSWORD_LENGTH} characters.`);
  }
};

export const isLoopbackAddress = (address: string | undefined): boolean => {
  if (!address) {
    return false;
  }
  return address === '::1' ||
    address === '127.0.0.1' ||
    address.startsWith('127.') ||
    address.startsWith('::ffff:127.');
};

export class AuthStore {
  private readonly filePath: string;
  private readonly sessions = new Map<string, AuthSession>();
  private store: PersistedUserStore = createEmptyUserStore();

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public initialize = async (): Promise<void> => {
    try {
      const parsed: PersistedUserStore = JSON.parse(await readFile(this.filePath, 'utf8')) as PersistedUserStore;
      this.store = parsed.schemaVersion === 1 && Array.isArray(parsed.users)
        ? parsed
        : createEmptyUserStore();
    } catch (error: unknown) {
      const nodeError: NodeJS.ErrnoException = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') {
        throw error;
      }
      this.store = createEmptyUserStore();
    }
  };

  public get setupRequired(): boolean {
    return this.store.users.length === 0;
  }

  public authenticate = async (request: LoginRequest): Promise<{ token: string; user: AuthenticatedUser }> => {
    const username: string = normalizeUsername(request.username);
    const user: PersistedUser | undefined = this.store.users.find(
      (candidate: PersistedUser): boolean => candidate.username === username,
    );
    if (!user) {
      await hashPassword(request.password, randomBytes(16).toString('base64'));
      throw new Error('Invalid username or password.');
    }

    const candidateHash: Buffer = Buffer.from(
      await hashPassword(request.password, user.passwordSalt),
      'base64',
    );
    const expectedHash: Buffer = Buffer.from(user.passwordHash, 'base64');
    if (candidateHash.length !== expectedHash.length || !timingSafeEqual(candidateHash, expectedHash)) {
      throw new Error('Invalid username or password.');
    }

    return this.createSession(user);
  };

  public createInitialAdmin = async (
    request: SetupRequest,
    remoteAddress: string | undefined,
  ): Promise<{ token: string; user: AuthenticatedUser }> => {
    if (!this.setupRequired) {
      throw new Error('RaceSweet setup has already been completed.');
    }
    if (!isLoopbackAddress(remoteAddress)) {
      throw new Error('The first RaceSweet administrator can only be created from localhost.');
    }
    assertPassword(request.password);
    const username: string = normalizeUsername(request.username);
    if (!username) {
      throw new Error('Username is required.');
    }

    const passwordSalt: string = randomBytes(24).toString('base64');
    const user: PersistedUser = {
      id: randomUUID(),
      passwordHash: await hashPassword(request.password, passwordSalt),
      passwordSalt,
      role: 'admin',
      username,
    };
    this.store = {
      ...this.store,
      users: [user],
    };
    await this.persist();
    return this.createSession(user);
  };

  public createUser = async (
    request: LoginRequest & { role: UserRole },
  ): Promise<AuthenticatedUser> => {
    assertPassword(request.password);
    const username: string = normalizeUsername(request.username);
    if (!username) {
      throw new Error('Username is required.');
    }
    if (this.store.users.some((candidate: PersistedUser): boolean => candidate.username === username)) {
      throw new Error(`A user named ${username} already exists.`);
    }
    const passwordSalt: string = randomBytes(24).toString('base64');
    const user: PersistedUser = {
      id: randomUUID(),
      passwordHash: await hashPassword(request.password, passwordSalt),
      passwordSalt,
      role: request.role,
      username,
    };
    this.store = {
      ...this.store,
      users: [...this.store.users, user],
    };
    await this.persist();
    return publicUser(user);
  };

  public getUserForSession = (token: string | undefined): AuthenticatedUser | undefined => {
    if (!token) {
      return undefined;
    }
    const session: AuthSession | undefined = this.sessions.get(token);
    if (!session) {
      return undefined;
    }
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      return undefined;
    }
    const user: PersistedUser | undefined = this.store.users.find(
      (candidate: PersistedUser): boolean => candidate.id === session.userId,
    );
    return user ? publicUser(user) : undefined;
  };

  public listUsers = (): AuthenticatedUser[] => this.store.users.map(publicUser);

  public logout = (token: string | undefined): void => {
    if (token) {
      this.sessions.delete(token);
    }
  };

  private createSession = (user: PersistedUser): { token: string; user: AuthenticatedUser } => {
    const token: string = randomBytes(32).toString('base64url');
    this.sessions.set(token, {
      expiresAt: Date.now() + SESSION_DURATION_MS,
      token,
      userId: user.id,
    });
    return {
      token,
      user: publicUser(user),
    };
  };

  private persist = async (): Promise<void> => {
    const directoryPath: string = path.dirname(this.filePath);
    const temporaryPath: string = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await mkdir(directoryPath, { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(this.store, null, 2), 'utf8');
    await rename(temporaryPath, this.filePath);
  };
}
