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

import { Connection as JSConnection } from 'jsforce';

export interface SubscriberPackage {
  NamespacePrefix: string;
  Name: string;
  Description: string;
}

export interface SubscriberPackageVersion {
  Name: string;
  MajorVersion: number;
  MinorVersion: number;
  PatchVersion: number;
  BuildNumber: number;
}

export interface InstalledSubscriberPackage {
  SubscriberPackage: SubscriberPackage;
  SubscriberPackageVersion: SubscriberPackageVersion;
}

const installedPackageFields = [
  'SubscriberPackage.NamespacePrefix',
  'SubscriberPackage.Name',
  'SubscriberPackage.Description',
  'SubscriberPackageVersion.Name',
  'SubscriberPackageVersion.MajorVersion',
  'SubscriberPackageVersion.MinorVersion',
  'SubscriberPackageVersion.PatchVersion',
  'SubscriberPackageVersion.BuildNumber',
];

export class InstalledPackages {
  private static instance: InstalledPackages;
  private packages: Map<JSConnection, InstalledSubscriberPackage[]> = new Map();

  public static getInstance(): InstalledPackages {
    if (!InstalledPackages.instance) {
      InstalledPackages.instance = new InstalledPackages();
    }

    return InstalledPackages.instance;
  }

  public async get(
    connection: JSConnection
  ): Promise<InstalledSubscriberPackage[]> {
    let result = this.packages.get(connection);
    if (result == undefined) {
      result = await connection.tooling
        .sobject('InstalledSubscriberPackage')
        .find<InstalledSubscriberPackage>('', installedPackageFields.join(','))
        .execute({ autoFetch: true, maxFetch: 100000 });
      this.packages.set(connection, result);
    }
    return result;
  }

  public async namespaces(connection: JSConnection): Promise<string[]> {
    return (await this.get(connection)).map(
      pkg => pkg.SubscriberPackage.NamespacePrefix
    );
  }

  public async packageName(
    conection: JSConnection,
    namespace: string
  ): Promise<string | undefined> {
    const packages = await this.get(conection);
    const pkg = packages.find(
      pkg => pkg.SubscriberPackage.NamespacePrefix == namespace
    );
    return pkg == undefined ? undefined : pkg.SubscriberPackage.Name;
  }
}
