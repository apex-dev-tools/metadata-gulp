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
import { XMLParser } from 'fast-xml-parser';

interface QueryReply<T> {
  'soapenv:Envelope': QueryEnvelope<T>;
}

interface QueryEnvelope<T> {
  'soapenv:Body': QueryBody<T>;
}

interface QueryBody<T> {
  queryResponse: QueryResponse<T>;
}

interface QueryResponse<T> {
  result?: Result<T>;
}

interface Result<T> {
  /** xsd:boolean */
  done?: string;
  /** QueryLocator|xsd:string */
  queryLocator?: string;
  /** records[] */
  records?: Array<T>;
  /** xsd:int */
  size?: string;
}

export async function query<T>(
  query: string,
  url: string,
  sessionId: string
): Promise<QueryResponse<T>> {
  const msg = `
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com">
      <soapenv:Header>
        <urn:SessionHeader>
            <urn:sessionId>${sessionId}</urn:sessionId>
        </urn:SessionHeader>
      </soapenv:Header>
      <soapenv:Body>
        <urn:query>
            <urn:queryString>${query}</urn:queryString>
        </urn:query>
      </soapenv:Body>
    </soapenv:Envelope>`;

  // This throws on bad status
  const { response } = await soapRequest({
    url: url,
    headers: { SOAPAction: 'foobar', 'content-type': 'text/xml' },
    xml: msg,
    timeout: 180000,
  });

  const parser = new XMLParser();
  const jsonObj = parser.parse(response.body) as QueryReply<T>;
  return jsonObj['soapenv:Envelope']['soapenv:Body'].queryResponse;
}
