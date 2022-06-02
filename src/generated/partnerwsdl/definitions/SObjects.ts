/**
 * sObjects
 * @targetNSAlias `ens`
 * @targetNamespace `urn:sobject.partner.soap.sforce.com`
 */
export interface SObjects {
  /** xsd:string */
  type?: string;
  /** xsd:string */
  fieldsToNull?: Array<string>;
  /** ID|xsd:string|length,pattern */
  Id?: string;
}
