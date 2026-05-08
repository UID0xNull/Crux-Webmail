declare module 'simple-imap' {
  import { EventEmitter } from 'events';

  export interface ImapConnectionConfig {
    host?: string;
    port?: number;
    tls?: boolean;
    cert?: string;
    key?: string;
    ca?: Buffer | string;
    authTimeout?: number;
    connTimeout?: number;
    keepalive?: boolean;
    keepaliveInterval?: number;
    username?: string;
    password?: string;
    xoauth2?: string;
    disconnectOnErrors?: boolean | string[];
  }

  export interface OpenBoxOptions {
    readOnly?: boolean;
  }

  export interface SearchCondition {
    answer?: boolean;
    seen?: boolean;
    flag?: string;
    unseen?: boolean;
    answered?: boolean;
    deleted?: boolean;
    draft?: boolean;
    bcc?: string;
    from?: string;
    to?: string;
    cc?: string;
    subject?: string;
    body?: string;
    larger?: number;
    smaller?: number;
    before?: string;
    on?: string;
    after?: string;
    uid?: boolean;
  }

  export interface MailboxData {
    attributes: {
      uid: number;
      date: Date;
      size: number;
      flags: string[];
      from: string;
      to: string;
      cc: string;
      attachments?: any[];
    };
    headers: Record<string, string | string[]>;
    _rawBody?: Buffer[];
  }

  export class Imap extends EventEmitter {
    constructor(config?: ImapConnectionConfig);
    connect(config: ImapConnectionConfig): void;
    openBox(name: string, options: OpenBoxOptions | boolean, callback: (err: Error | null) => void): void;
    search(cond: SearchCondition | SearchCondition[], callback: (err: Error | null, results: number[]) => void): void;
    fetch(cond: any, options: any): EventEmitter;
    idle(callback: (err: Error | null) => void): void;
    done(callback: (err: Error | null, info: any) => void): void;
    deleteEmail(opts: { box: string; uid: number }, callback: (err: Error | null) => void): void;
    move(opts: { box: string; uid: number; to: string }, callback: (err: Error | null) => void): void;
    copy(opts: { box: string; uid: number; to: string }, callback: (err: Error | null) => void): void;
    updateFlags(opts: { box: string; uid: number }, flags: Record<string, string[]>, callback: (err: Error | null) => void): void;
    list(callback: (err: Error | null, data: any[]) => void): void;
    status(boxName: string, items: string[], callback: (err: Error | null, data: any) => void): void;
    end(): void;
    logout(callback?: (err: Error | null) => void): void;
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    removeAllListeners(): this;
  }
}