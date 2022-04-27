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

import * as path from 'path';
import { Connection } from 'jsforce';
import { StubFS } from './stubfs';
import { wrapError } from './error';
import { Logger, LoggerStage } from './logger';

export class FlowReader {
  private logger: Logger;
  private connection: Connection;
  private namespaces: string[];
  private stubFS: StubFS;

  public constructor(
    logger: Logger,
    connection: Connection,
    orgNamespace: string | null,
    namespaces: string[],
    stubFS: StubFS
  ) {
    this.logger = logger;
    this.connection = connection;
    this.namespaces = namespaces;
    this.stubFS = stubFS;
  }

  public async run(): Promise<Error | void> {
    try {
      const pages = await this.connection.tooling
        .sobject('FlowDefinition')
        .find<FlowInfo>(this.query(), 'DeveloperName, NamespacePrefix')
        .execute({ autoFetch: true, maxFetch: 100000 });
      this.write(pages);
    } catch (err) {
      return wrapError(err);
    } finally {
      this.logger.complete(LoggerStage.FLOWS);
    }
  }

  private query(): string {
    const conditions = this.namespaces.map(namespace => {
      if (namespace == 'unmanaged') {
        return 'NamespacePrefix = null';
      } else {
        return `NamespacePrefix = '${namespace}'`;
      }
    });
    return conditions.join(' OR ');
  }

  private write(flows: FlowInfo[]): void {
    const byNamespace: Map<string, FlowInfo[]> = new Map();

    for (const flow of flows) {
      let namespacePages = byNamespace.get(flow.NamespacePrefix);
      if (namespacePages == undefined) {
        namespacePages = [];
        byNamespace.set(flow.NamespacePrefix, namespacePages);
      }
      namespacePages.push(flow);
    }

    byNamespace.forEach((namespaceFlows, namespace) => {
      const targetDirectory = namespace == null ? 'unmanaged' : namespace;
      for (const flow of namespaceFlows) {
        this.stubFS.newFile(
          path.join(targetDirectory, 'flows', `${flow.DeveloperName}.flow`),
          ''
        );
      }
    });
  }
}

interface FlowInfo {
  DeveloperName: string;
  NamespacePrefix: string;
}
