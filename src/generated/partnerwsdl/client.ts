import {
  Client as SoapClient,
  createClientAsync as soapCreateClientAsync,
  IOptions,
} from 'soap';
import { Query } from './definitions/Query';
import { QueryResponse } from './definitions/QueryResponse';

export interface PartnerWsdlClient extends SoapClient {
  queryAsync(query: Query): Promise<[result: QueryResponse]>;
}

/** Create PartnerWsdlClient */
export function createClientAsync(
  url: string,
  options?: IOptions,
  endpoint?: string
): Promise<PartnerWsdlClient> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  return soapCreateClientAsync(
    url,
    options,
    endpoint
  ) as Promise<PartnerWsdlClient>;
}
