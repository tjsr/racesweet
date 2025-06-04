import type { ErrorType } from "./racestate.ts";

export class Barrier<T> extends Promise<T> {
  // private _resolver: (resolve: (value: T) => void, reject: (reason?: any) => void) => void;
  private _resolve: (value: T) => void;
  // private _reject: (reason?: any) => void;
  public release = (_value: T) => this;
  // public externalReject: (reason?: any) => void;
  public constructor(executor?: (resolve: (value: T) => void, reject: (reason?: ErrorType) => void) => void) {
    let resolve: (value: T) => void;
    let reject: (reason?: ErrorType) => void;

    super((res, rej) => {
      resolve = res;
      reject = rej;
      executor?.(resolve, reject);
    });

    this._resolve = resolve!;
    // this._reject = reject!;
    this.release = (value: T): this => {
      this._resolve(value);
      return this;
    };

    // this.externalReject = (reason?: any): void => {
    //   this._reject(reason);
    // };
  }

  public resolve<T>(value: T): Barrier<T> {
    return new Barrier<T>((resolve) => {
      resolve(value);
    });
  }

}
