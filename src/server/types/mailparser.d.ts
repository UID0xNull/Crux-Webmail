declare module 'mailparser' {
  export function simpleParser(data: Buffer | string, callback: (err: Error | null, obj: ParsedMail) => void): void;
  export function simpleParser(data: Buffer | string): Promise<ParsedMail>;

  export interface ParsedMail {
    from: ParsedMailAddress;
    to: ParsedMailAddress;
    cc?: ParsedMailAddress;
    bcc?: ParsedMailAddress;
    subject?: string;
    date?: Date;
    text?: string;
    html?: string;
    textPlain?: string;
    textHtml?: string;
    attachments: ParsedMailAttachment[];
    headers: Record<string, string>;
    messageId?: string;
  }

  export interface ParsedMailAddress {
    value: ParsedMailAddressValue[];
  }

  export interface ParsedMailAddressValue {
    name: string;
    address: string;
  }

  export interface ParsedMailAttachment {
    contentType: string;
    contentDisposition: string;
    contentTransferEncoding: string;
    contentLength: number;
    contentId: string;
    content: Buffer;
    filename: string;
    relatedHeaders: Record<string, string>;
  }
}