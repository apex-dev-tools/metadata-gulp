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
import { StubFS } from '../util/stubfs';
import { chunk } from '../util/arrays';
import { Logger, LoggerStage } from '../util/logger';
import { ctxError } from '../util/error';
import { default as PQueue } from 'p-queue';

export class ClassReader {
  private static readonly MAX_INVALID = 50000;
  private logger: Logger;
  private connection: Connection;
  private namespaces: string[];
  private stubFS: StubFS;
  private queue = new PQueue({ concurrency: 15 });

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

  public async run(): Promise<void[][]> {
    try {
      const allNamespaces = new Set<string>(this.namespaces);
      return this.queue
        .addAll(
          [...allNamespaces].map(
            namespace => () => this.queryByNamespace(namespace)
          )
        )
        .finally(() => this.logger.complete(LoggerStage.CLASSES));
    } catch (err) {
      throw ctxError(err, 'Classes');
    }
  }

  private async queryByNamespace(namespace: string): Promise<void[]> {
    // Try short cut via loading from ApexClass
    const validClasses = await this.getClassIds(namespace);
    const chunks = chunk(validClasses, 200);
    return this.queue.addAll(
      chunks.map(c => () => this.bulkLoadClasses(namespace, c))
    );
  }

  private async getClassIds(namespace: string): Promise<string[]> {
    try {
      const isUnmanged = namespace == 'unmanaged';
      const namespaceClause = isUnmanged
        ? 'NamespacePrefix = null'
        : `NamespacePrefix = '${namespace}'`;
      const records = await this.connection.tooling
        .sobject('ApexClass')
        .find<ClassInfoId>(`Status = 'Active' AND ${namespaceClause}`, 'Id')
        .execute({ autoFetch: true, maxFetch: 100000 });

      return records.map(record => record.Id);
    } catch (err) {
      throw ctxError(err, 'query invalid');
    }
  }

  private async bulkLoadClasses(
    namespace: string,
    ids: string[]
  ): Promise<void> {
    try {
      const idClause = ids.map(id => `'${id}'`).join(', ');
      const records = await this.connection.tooling
        .sobject('ApexClass')
        .find<ClassInfoBody>(`Id IN (${idClause})`, 'Name, Body')
        .execute();
      return this.writeValid(namespace, records);
    } catch (err) {
      throw ctxError(err, 'query chunk');
    }
  }

  private writeValid(namespace: string, classes: ClassInfoBody[]): void {
    const targetDirectory = namespace == null ? 'unmanaged' : namespace;
    classes.forEach(cls => {
      this.stubFS.newFile(
        path.join(targetDirectory, 'classes', `${cls.Name}.cls`),
        cls.Body
      );
    });
  }
}

interface ClassInfoBody {
  Name: string;
  Body: string;
}

interface ClassInfoId {
  Id: string;
}

export interface AnonymousResult {
  success: boolean;
  exceptionMessage?: string;
  exceptionStackTrace?: string;
}
