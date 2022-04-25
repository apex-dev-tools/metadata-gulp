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

export interface CustomObjectDetail {
  QualifiedApiName: string;
}
export class EntityName {
  public namespace: string | null;
  public name: string;
  public extension: string;

  public constructor(
    namespace: string | null,
    name: string,
    extension: string
  ) {
    this.namespace = namespace;
    this.name = name;
    this.extension = extension;
  }

  public static applySObject(name: string): EntityName | null {
    const parts = name.split('__');
    if (parts.length >= 2 && parts.length <= 3) {
      const last = parts[parts.length - 1];
      if (last === 'c' || last === 'mdt' || last === 'e' || last === 'b') {
        if (parts.length === 2) {
          return new EntityName(null, parts[0], parts[1]);
        } else {
          return new EntityName(parts[0], parts[1], parts[2]);
        }
      }
    }
    return null;
  }

  public static applyField(name: string): EntityName | null {
    const parts = name.split('__');
    if (parts.length >= 2 && parts.length <= 3) {
      const last = parts[parts.length - 1];
      if (last === 'c') {
        if (parts.length === 2) {
          return new EntityName(null, parts[0], parts[1]);
        } else {
          return new EntityName(parts[0], parts[1], parts[2]);
        }
      }
    }
    return null;
  }

  public fullName(): string {
    if (this.namespace === null) {
      return `${this.name}__${this.extension}`;
    } else {
      return `${this.namespace}__${this.name}__${this.extension}`;
    }
  }

  public developerName(): string {
    if (this.namespace === null) {
      return `${this.name}`;
    } else {
      return `${this.namespace}__${this.name}`;
    }
  }

  public defaultNamespace(namespace: string | null): EntityName {
    if (namespace != null && this.namespace == null) {
      this.namespace = namespace;
    }
    return this;
  }
}

export interface Field {
  fullName: string;
}

export interface CustomObject {
  fields?: Field | Field[];
}

export interface SObjectJSON {
  CustomObject?: CustomObject;
}
