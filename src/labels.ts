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
import * as path from 'path';
import { ctxError } from './error';
import { Logger, LoggerStage } from './logger';
import { StubFS } from './stubfs';

export class LabelReader {
  private logger: Logger;
  private connection: Connection;
  private namespaces: string[];
  private stubFS: StubFS;

  public constructor(
    logger: Logger,
    connection: Connection,
    namespaces: string[],
    stubFS: StubFS
  ) {
    this.logger = logger;
    this.connection = connection;
    this.namespaces = namespaces;
    this.stubFS = stubFS;
  }

  public async run(): Promise<void> {
    try {
      const conditions = this.query();
      if (conditions.length > 0) {
        const labels = await this.connection.tooling
          .sobject('ExternalString')
          .find<LabelInfo>(conditions, 'Name, NamespacePrefix')
          .execute({ autoFetch: true, maxFetch: 100000 });

        this.writeLabels(labels);
      }
      this.logger.complete(LoggerStage.LABELS);
    } catch (err) {
      throw ctxError(err, 'Labels query');
    }
  }

  private query(): string {
    const conditions = this.namespaces.map(namespace => {
      if (namespace == 'unmanaged') {
        return 'NamespacePrefix = null';
      } else {
        return `(NamespacePrefix = '${namespace}' AND IsProtected = false)`;
      }
    });
    return conditions.join(' OR ');
  }

  private writeLabels(labels: LabelInfo[]): void {
    const byNamespace: Map<string, string[]> = new Map();

    for (const label of labels) {
      let namespaceLabels = byNamespace.get(label.NamespacePrefix);
      if (namespaceLabels == undefined) {
        namespaceLabels = [];
        byNamespace.set(label.NamespacePrefix, namespaceLabels);
      }
      namespaceLabels.push(label.Name);
    }

    byNamespace.forEach((namespaceLabels, namespace) => {
      const targetDirectory = namespace == null ? 'unmanaged' : namespace;
      this.stubFS.newFile(
        path.join(targetDirectory, 'CustomLabels.labels-meta.xml'),
        this.createLabels(namespaceLabels)
      );
    });
  }

  private createLabels(labelNames: string[]): string {
    const labelDefinitions = labelNames
      .map(name => {
        return `   <labels>
        <fullName>${name}</fullName>
        <language>en_US</language>
        <protected>false</protected>
        <shortDescription></shortDescription>
        <value></value>
    </labels>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<CustomLabels xmlns="http://soap.sforce.com/2006/04/metadata">
${labelDefinitions}
</CustomLabels>
`;
  }
}

interface LabelInfo {
  Name: string;
  NamespacePrefix: string;
}
