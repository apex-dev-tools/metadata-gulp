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

import { Connection } from 'jsforce';
import { ComponentReader } from './components';
import { FlowReader } from './flows';
import { PageReader } from './pages';
import { ClassReader } from './classes';
import { LabelReader } from './labels';
import { SObjectReader } from './sobjects';
import { StubFS } from './stubfs';

export default class Gulp {
  public async update(
    connection: Connection,
    workspace: string,
    namespaces: string[] = []
  ): Promise<void> {
    //connection.metadata.pollTimeout = 10 * 60 * 1000;
    //connection.metadata.pollInterval = 15 * 1000;

    const orgNamespace = await this.queryOrgNamespace(connection);
    if (orgNamespace == null) return;
    const uniqueNamespaces = new Set(namespaces);
    if (orgNamespace != null) uniqueNamespaces.delete(orgNamespace);
    const otherNamespaces = Array.from(uniqueNamespaces.keys());

    const stubFS = new StubFS(workspace);

    const labelsReader = new LabelReader(
      connection,
      orgNamespace,
      otherNamespaces,
      stubFS
    ).run();
    const classesReader = new ClassReader(
      connection,
      orgNamespace,
      otherNamespaces,
      stubFS
    ).run();
    const sobjectReader = new SObjectReader(
      connection,
      orgNamespace,
      otherNamespaces,
      stubFS
    ).run();
    const pageReader = new PageReader(
      connection,
      orgNamespace,
      otherNamespaces,
      stubFS
    ).run();
    const componentReader = new ComponentReader(
      connection,
      orgNamespace,
      otherNamespaces,
      stubFS
    ).run();
    const flowReader = new FlowReader(
      connection,
      orgNamespace,
      otherNamespaces,
      stubFS
    ).run();

    const results = {
      labels: await labelsReader,
      classes: await classesReader,
      sobjects: await sobjectReader,
      pages: await pageReader,
      componentReader: await componentReader,
      flowReader: await flowReader,
    };
    let err: keyof typeof results;
    for (err in results) {
      if (results[err] !== undefined) throw results[err];
    }

    return stubFS.sync();
  }

  private async queryOrgNamespace(
    connection: Connection
  ): Promise<string | null> {
    const organisations = await connection
      .sobject('Organization')
      .find<Organization>('', 'NamespacePrefix')
      .execute();

    if (organisations.length === 1) return organisations[0].NamespacePrefix;
    else return null;
  }
}

interface Organization {
  NamespacePrefix: string;
}
