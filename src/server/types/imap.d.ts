// Ambient types for node-imap (the `imap` package). Minimal surface — only
// what imap-service.ts uses. node-imap no publica @types propios.
declare module 'imap' {
  import { EventEmitter } from 'events';

  interface ImapConfig {
    user: string;
    password: string;
    host: string;
    port: number;
    tls?: boolean;
    tlsOptions?: import('node:tls').ConnectionOptions;
    authTimeout?: number;
    connTimeout?: number;
    keepalive?: boolean | Record<string, unknown>;
  }

  interface ImapBox {
    attribs: string[];
    delimiter: string;
    children: Record<string, ImapBox> | null;
    parent: unknown;
  }

  type ImapBoxList = Record<string, ImapBox>;

  type SearchCriteria = Array<string | (string | number)[]>;

  interface FetchOptions {
    bodies?: string | string[];
    struct?: boolean;
    markSeen?: boolean;
  }

  class Connection extends EventEmitter {
    constructor(config: ImapConfig);
    connect(): void;
    end(): void;
    openBox(name: string, readOnly: boolean, cb: (err: Error | null, box: unknown) => void): void;
    getBoxes(cb: (err: Error | null, boxes: ImapBoxList) => void): void;
    search(criteria: SearchCriteria, cb: (err: Error | null, uids: number[]) => void): void;
    fetch(source: number | number[] | string, options: FetchOptions): EventEmitter;
    addFlags(source: number | number[], flags: string | string[], cb: (err: Error | null) => void): void;
    delFlags(source: number | number[], flags: string | string[], cb: (err: Error | null) => void): void;
    move(source: number | number[], box: string, cb: (err: Error | null) => void): void;
    copy(source: number | number[], box: string, cb: (err: Error | null) => void): void;
    expunge(uids: number | number[], cb: (err: Error | null) => void): void;

    static parseHeader(rawHeader: string): Record<string, string[]>;
  }

  export = Connection;
}
