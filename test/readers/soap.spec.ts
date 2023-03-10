/*
 Copyright (c) 2023 Kevin Jones, All rights reserved.
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

import { query } from '../../src/readers/soap';
import {
  createSOAPService,
  SOAPOptions,
  SOAPResponse,
  SOAPService,
} from '../../src/readers/soapService';

class MockSoapService implements SOAPService {
  response: SOAPResponse;
  public calls: SOAPOptions[] = [];

  constructor(response: SOAPResponse) {
    this.response = response;
  }

  soapRequest(options: SOAPOptions): Promise<SOAPResponse> {
    this.calls.push(options);
    return Promise.resolve(this.response);
  }
}

let soapService: MockSoapService;

const exampleResponse = `
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
	xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
	xmlns="urn:partner.soap.sforce.com"
	xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
	xmlns:sf="urn:sobject.partner.soap.sforce.com">
	<soapenv:Body>
		<queryResponse>
            <result xsi:type="QueryResult">
                <done>true</done>
                <queryLocator xsi:nil="true"/>
                <records xsi:type="sf:sObject">
                    <sf:type>ApexClass</sf:type>
                    <sf:Id xsi:nil="true"/>
                    <sf:Name>ComponentLogger</sf:Name>
                    <sf:Body>(hidden)</sf:Body>
                </records>
				<records xsi:type="sf:sObject">
					<sf:type>ApexClass</sf:type>
					<sf:Id xsi:nil="true"/>
					<sf:Name>ComponentLogger_Tests</sf:Name>
					<sf:Body>Escaped char: &lt;</sf:Body>
				</records>
            </result>
		</queryResponse>
	</soapenv:Body>
</soapenv:Envelope>`;

interface ClassInfoBody {
  'sf:Name': string;
  'sf:Body': string;
}

function createServerRequest(sessionId: string, query: string): string {
  return `
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
}

describe('soap', () => {
  beforeEach(() => {
    soapService = new MockSoapService({
      response: { headers: {}, body: exampleResponse, statusCode: 200 },
    });
  });

  it('should pass args to soap service', async () => {
    await query(soapService, 'SELECT Id FROM Account', 'url', 'sessionId');

    expect(soapService.calls.length).toBe(1);
    expect(soapService.calls[0].url).toBe('url');
    expect(soapService.calls[0].xml).toBe(
      createServerRequest('sessionId', 'SELECT Id FROM Account')
    );
    expect(soapService.calls[0].headers).toStrictEqual({
      SOAPAction: 'foobar',
      'content-type': 'text/xml',
    });
  });

  it('should parse server resonse', async () => {
    const result = await query<ClassInfoBody>(
      soapService,
      'SELECT Id FROM Account',
      'url',
      'sessionId'
    );

    console.log(JSON.stringify(result));
    expect(result.result).not.toBeUndefined();
    expect(result.result?.records?.length).toBe(2);
    expect(result.result?.records?.[0]['sf:Name']).toBe('ComponentLogger');
    expect(result.result?.records?.[0]['sf:Body']).toBe('(hidden)');
    expect(result.result?.records?.[1]['sf:Name']).toBe(
      'ComponentLogger_Tests'
    );
    expect(result.result?.records?.[1]['sf:Body']).toBe('Escaped char: <');
  });
});
