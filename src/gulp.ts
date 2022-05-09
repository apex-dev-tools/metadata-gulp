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

import * as fs from 'fs';
import * as path from 'path';
import { ComponentReader } from './components';
import { FlowReader } from './flows';
import { PageReader } from './pages';
import { ClassReader } from './classes';
import { LabelReader } from './labels';
import { CustomSObjectReader } from './customSObjects';
import { StubFS } from './stubfs';
import { Logger } from './logger';
import { Aliases, AuthInfo, Connection } from '@salesforce/core';
import { ConfigUtil } from './configUtils';
import { StandardSObjectReader } from './standardSObjects';
import { Connection as JSConnection } from 'jsforce';
import { ctxError } from './error';

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
  private POLL_TIMEOUT = 10 * 60 * 1000;

  public async getDefaultUsername(
    workspacePath: string
  ): Promise<string | undefined> {
    const usernameOrAlias = await ConfigUtil.getConfigValue(
      workspacePath,
      'defaultusername'
    );
    if (typeof usernameOrAlias == 'string') {
      return (await Aliases.fetch(usernameOrAlias)) || usernameOrAlias;
    }
    return undefined;
  }

  public async getOrgNamespace(
    workspacePath: string,
    connection: JSConnection | null
  ): Promise<string | null | undefined> {
    this.checkWorkspaceOrThrow(workspacePath);
    const localConnection =
      connection || ((await this.getConnection(workspacePath)) as JSConnection);

    try {
      const organisations = await localConnection
        .sobject('Organization')
        .find<Organization>('', 'NamespacePrefix')
        .execute();
      if (organisations.length == 1) return organisations[0].NamespacePrefix;
      else return undefined;
    } catch (err) {
      throw ctxError(err, 'Organization query');
    }
  }

  public async getOrgPackageNamespaces(
    workspacePath: string,
    connection: JSConnection | null
  ): Promise<NamespaceInfo[]> {
    this.checkWorkspaceOrThrow(workspacePath);
    const localConnection =
      connection || ((await this.getConnection(workspacePath)) as JSConnection);
    if (localConnection == null)
      throw new Error('There is no default org available to query');

    const orgNamespace = await this.getOrgNamespace(
      workspacePath,
      localConnection
    );
    if (orgNamespace === undefined)
      throw new Error('Unable to query org default namespace');

    const results = await localConnection.tooling
      .sobject('InstalledSubscriberPackage')
      .find<InstalledSubscriberPackage>('', installedPackageFields.join(','))
      .execute({ autoFetch: true, maxFetch: 100000 });

    const infos = results
      .filter(info => info.SubscriberPackage.NamespacePrefix != null)
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
    if (orgNamespace != null) {
      infos.unshift(
        new NamespaceInfo(orgNamespace, 'The org default namespace')
      );
    } else {
      infos.unshift(
        new NamespaceInfo(
          'unmanaged',
          'Metadata that does belong to a managed package, may be part of an unlocked/unmanaged package'
        )
      );
    }
    return infos;
  }

  public async update(
    workspacePath: string,
    logger: Logger,
    connection: JSConnection | null,
    namespaces: string[] = []
  ): Promise<void> {
    this.checkWorkspaceOrThrow(workspacePath);
    const localConnection =
      connection || ((await this.getConnection(workspacePath)) as JSConnection);
    if (localConnection == null) {
      throw new Error(
        'There is no default org available to load metadata from'
      );
    }

    if (
      !localConnection.metadata.pollTimeout ||
      localConnection.metadata.pollTimeout < this.POLL_TIMEOUT
    ) {
      localConnection.metadata.pollTimeout = this.POLL_TIMEOUT;
    }

    const orgNamespace = await this.getOrgNamespace(
      workspacePath,
      localConnection
    );
    if (orgNamespace === undefined)
      throw new Error('Could not obtain the org default namespace');

    const uniqueNamespaces = new Set(namespaces);
    if (orgNamespace != null && uniqueNamespaces.has('unmanaged')) {
      throw new Error(
        "The 'unmanaged' namespace should only be used on orgs without a default namespace"
      );
    }

    const otherNamespaces = Array.from(uniqueNamespaces.keys());
    const stubFS = new StubFS(workspacePath);

    const labelsReader = new LabelReader(
      logger,
      localConnection,
      otherNamespaces,
      stubFS
    ).run();
    const classesReader = new ClassReader(
      logger,
      localConnection,
      otherNamespaces,
      stubFS
    ).run();
    const standardSObjectReader = new StandardSObjectReader(
      logger,
      localConnection,
      orgNamespace,
      otherNamespaces,
      stubFS
    ).run();
    const customSObjectReader = new CustomSObjectReader(
      logger,
      localConnection,
      orgNamespace,
      otherNamespaces,
      stubFS
    ).run();
    const pageReader = new PageReader(
      logger,
      localConnection,
      otherNamespaces,
      stubFS
    ).run();
    const componentReader = new ComponentReader(
      logger,
      localConnection,
      otherNamespaces,
      stubFS
    ).run();
    const flowReader = new FlowReader(
      logger,
      localConnection,
      orgNamespace,
      otherNamespaces,
      stubFS
    ).run();

    const loaded = Promise.all([
      labelsReader,
      classesReader,
      standardSObjectReader,
      customSObjectReader,
      pageReader,
      componentReader,
      flowReader,
    ]);

    return loaded.then(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _result => {
        return stubFS.sync();
      },
      err => {
        throw err;
      }
    );
  }

  private async getConnection(
    workspacePath: string
  ): Promise<JSConnection | null> {
    const username = await this.getDefaultUsername(workspacePath);
    if (username !== undefined) {
      const connection = await Connection.create({
        authInfo: await AuthInfo.create({ username: username }),
      });
      return connection;
    } else {
      return null;
    }
  }

  private checkWorkspaceOrThrow(workspacePath: string): void {
    const projectPath = path.join(workspacePath, 'sfdx-project.json');
    if (!fs.statSync(projectPath).isFile())
      throw new Error(`No sfdx-project.json file found at ${projectPath}`);
  }

  private packageVersion(pkg: SubscriberPackageVersion): string {
    return `${pkg.Name} (${pkg.MajorVersion}.${pkg.MinorVersion}.${pkg.PatchVersion}.${pkg.BuildNumber})`;
  }
}

interface Organization {
  NamespacePrefix: string;
}
