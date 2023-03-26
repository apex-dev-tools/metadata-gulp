/*
 Copyright (c) 2022 Kevin Jones, All rights reserved.
 Redistribution and use in source and binary forms, with or without
 modification, are permitted provided that the following conditions
 are met:
 1. Redistributions of source code must retain the above copyright
    notice, this list of conditions and the following disclaimer.
 2. Redistributions in binary form must reproduce the above copyright
    notice, this list of conditions and the following disclaimer in the
    documentation and/or other materials provided with the distribution.
 3. The name of the author may not be used to endorse or promote products
    derived from this software without specific prior written permission.
 */

import soapRequest from 'easy-soap-request';

// Basic wrapper around easy-soap-service to mocking for testing

export interface SOAPOptions {
  /**
   * endpoint URL
   */
  url: string;

  /**
   * HTTP headers, key-value dictionary
   */
  headers: Record<string, unknown>;

  /**
   *  SOAP envelope, can be read from file or passed as string
   */
  xml: string;

  /**
   * Milliseconds before timing out request
   * @default 10000
   */
  timeout?: number | undefined;
}

export interface SOAPResponse {
  response: {
    headers: any;
    body: any;
    statusCode: number;
  };
}

export interface SOAPService {
  soapRequest(options: SOAPOptions): Promise<SOAPResponse>;
}

class EasySoapService implements SOAPService {
  async soapRequest(options: SOAPOptions): Promise<SOAPResponse> {
    return soapRequest(options);
  }
}

export function createSOAPService(): SOAPService {
  return new EasySoapService();
}
