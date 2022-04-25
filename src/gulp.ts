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

import { ComponentReader } from './components';
import { FlowReader } from './flows';
import { PageReader } from './pages';
import { ClassReader } from './classes';
import { LabelReader } from './labels';
import { CustomSObjectReader } from './customSObjects';
import { StubFS } from './stubfs';
import { Logger } from './logger';
import { AuthInfo, Connection } from '@salesforce/core';
import { ConfigUtil } from './configUtils';
import { StandardSObjectReader } from './standardSObjects';

export { Logger, LoggerStage } from './logger';

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

interface SubscriberPackage {
  NamespacePrefix: string;
  Name: string;
  Description: string;
}

interface SubscriberPackageVersion {
  Name: string;
  MajorVersion: number;
  MinorVersion: number;
  PatchVersion: number;
  BuildNumber: number;
}

interface InstalledSubscriberPackage {
  SubscriberPackage: SubscriberPackage;
  SubscriberPackageVersion: SubscriberPackageVersion;
}

export class NamespaceInfo {
  namespace: string;
  description: string;

  constructor(namespace: string, description: string) {
    this.namespace = namespace;
    this.description = description;
  }
}

export class Gulp {
  public async getDefaultUsername(
    workspacePath: string
  ): Promise<string | undefined> {
    const username = await ConfigUtil.getConfigValue(
      workspacePath,
      'defaultusername'
    );
    if (typeof username == 'string') {
      return username;
    }
    return undefined;
  }

  private async getOrgNamespace(
    connection: Connection
  ): Promise<string | null | undefined> {
    const organisations = await connection
      .sobject('Organization')
      .find<Organization>('', 'NamespacePrefix')
      .execute();

    if (organisations.length === 1) return organisations[0].NamespacePrefix;
    else return null;
  }

  public async getOrgPackageNamespaces(
    workspacePath: string,
    connection: Connection | null
  ): Promise<NamespaceInfo[]> {
    const localConnection =
      connection || (await this.getConnection(workspacePath));
    if (localConnection == null)
      throw new Error('There is no default org available to query');

    const orgNamespace = await this.getOrgNamespace(localConnection);
    if (orgNamespace === undefined)
      throw new Error('Unable to query org default namespace');

    const results = await localConnection.tooling
      .sobject('InstalledSubscriberPackage')
      .find<InstalledSubscriberPackage>('', installedPackageFields.join(','))
      .execute({ autoFetch: true, maxFetch: 100000 });

    const infos = results
      .sort((a, b) =>
        a.SubscriberPackage.NamespacePrefix.localeCompare(
          b.SubscriberPackage.NamespacePrefix
        )
      )
      .map(pkg => {
        return new NamespaceInfo(
          pkg.SubscriberPackage.NamespacePrefix,
          `${this.packageVersion(pkg.SubscriberPackageVersion)} - ${
            pkg.SubscriberPackage.Name
          }${
            pkg.SubscriberPackage.Description
              ? ' - ' + pkg.SubscriberPackage.Description
              : ''
          }`
        );
      });
    if (orgNamespace !== null) {
      infos.unshift(
        new NamespaceInfo(orgNamespace, 'The org default namespace')
      );
    } else {
      infos.unshift(
        new NamespaceInfo(
          'unmanaged',
          'The Unmanaged metadata that does belong to a package'
        )
      );
    }
    return infos;
  }

  private packageVersion(pkg: SubscriberPackageVersion): string {
    return `${pkg.Name} (${pkg.MajorVersion}.${pkg.MinorVersion}.${pkg.PatchVersion}.${pkg.BuildNumber})`;
  }

  public async update(
    workspacePath: string,
    logger: Logger,
    connection: Connection | null,
    namespaces: string[] = []
  ): Promise<boolean> {
    const localConnection =
      connection || (await this.getConnection(workspacePath));
    if (localConnection == null)
      throw new Error('There is no default org available to query');

    const orgNamespace = await this.getOrgNamespace(localConnection);
    if (orgNamespace === undefined) return false;
    const uniqueNamespaces = new Set(namespaces);
    if (orgNamespace != null) uniqueNamespaces.delete(orgNamespace);
    const otherNamespaces = Array.from(uniqueNamespaces.keys());

    const stubFS = new StubFS(workspacePath);

    const labelsReader = new LabelReader(
      localConnection,
      orgNamespace,
      otherNamespaces,
      stubFS
    ).run();
    const classesReader = new ClassReader(
      logger,
      localConnection,
      orgNamespace,
      otherNamespaces,
      stubFS
    ).run();
    const standardSObjectReader = new StandardSObjectReader(
      localConnection,
      orgNamespace,
      otherNamespaces,
      stubFS
    ).run();
    const customSOobjectReader = new CustomSObjectReader(
      localConnection,
      orgNamespace,
      otherNamespaces,
      stubFS
    ).run();
    const pageReader = new PageReader(
      localConnection,
      orgNamespace,
      otherNamespaces,
      stubFS
    ).run();
    const componentReader = new ComponentReader(
      localConnection,
      orgNamespace,
      otherNamespaces,
      stubFS
    ).run();
    const flowReader = new FlowReader(
      localConnection,
      orgNamespace,
      otherNamespaces,
      stubFS
    ).run();

    const results = {
      labels: await labelsReader,
      classes: await classesReader,
      standardSObjects: await standardSObjectReader,
      customSObjects: await customSOobjectReader,
      pages: await pageReader,
      componentReader: await componentReader,
      flowReader: await flowReader,
    };
    let err: keyof typeof results;
    for (err in results) {
      if (results[err]) throw results[err];
    }

    await stubFS.sync();
    return true;
  }

  private async getConnection(
    workspacePath: string
  ): Promise<Connection | null> {
    const username = await ConfigUtil.getConfigValue(
      workspacePath,
      'defaultusername'
    );
    if (typeof username == 'string') {
      return await Connection.create({
        authInfo: await AuthInfo.create({ username: username }),
      });
    } else {
      return null;
    }
  }
}

interface Organization {
  NamespacePrefix: string;
}
