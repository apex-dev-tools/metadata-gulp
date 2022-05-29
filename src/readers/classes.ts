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
    await this.refreshInvalid(namespace);

    // Try short cut via loading from ApexClass
    const validClasses = await this.getClassNames(namespace, true);
    const chunks = chunk(validClasses, 100);
    return this.queue.addAll(
      chunks.map(c => () => this.bulkLoadClasses(namespace, c))
    );
  }

  private async refreshInvalid(namespace: string): Promise<boolean> {
    const refreshed: Set<string> = new Set();
    let invalid = await this.getClassNames(namespace, false);
    if (invalid.length > ClassReader.MAX_INVALID) return false;

    while (invalid.length > 0) {
      const refresh = invalid.slice(0, 100);
      refresh.forEach(cls => refreshed.add(cls));
      await this.refreshClasses(namespace, refresh);

      invalid = await this.getClassNames(namespace, false);
      invalid = invalid.filter(cls => !refreshed.has(cls));
    }

    return true;
  }

  private async bulkLoadClasses(
    namespace: string,
    chunk: string[]
  ): Promise<void> {
    try {
      const isUnmanged = namespace == 'unmanaged';
      const namespaceClause = isUnmanged
        ? 'NamespacePrefix = null'
        : `NamespacePrefix = '${namespace}'`;
      const names = chunk.map(name => `Name='${name}'`).join(' OR ');
      const records = await this.connection.tooling
        .sobject('ApexClass')
        .find<ClassInfo>(
          `Status = 'Active' AND IsValid = true AND ${namespaceClause} AND (${names})`,
          'Name, NamespacePrefix, IsValid, Body'
        )
        .execute({ autoFetch: true, maxFetch: 100000 });

      return this.writeValid(records);
    } catch (err) {
      throw ctxError(err, 'query chunk');
    }
  }

  private async getClassNames(
    namespace: string,
    isValid: boolean
  ): Promise<string[]> {
    try {
      const isUnmanged = namespace == 'unmanaged';
      const namespaceClause = isUnmanged
        ? 'NamespacePrefix = null'
        : `NamespacePrefix = '${namespace}'`;
      const valid = isValid ? 'true' : 'false';
      const records = await this.connection.tooling
        .sobject('ApexClass')
        .find<ClassInfo>(
          `IsValid = ${valid} AND Status = 'Active' AND ${namespaceClause}`,
          'Name'
        )
        .execute({ autoFetch: true, maxFetch: 100000 });

      return records.map(record => record.Name);
    } catch (err) {
      throw ctxError(err, 'query invalid');
    }
  }

  private async refreshClasses(
    namespace: string,
    classes: string[]
  ): Promise<AnonymousResult> {
    try {
      const isUnmanged = namespace == 'unmanaged';
      const anon = classes
        .map(cls => {
          const fullName = isUnmanged ? cls : `${namespace}.${cls}`;
          return `Type.forName('${fullName}');`;
        })
        .join('\n');
      return this.connection.tooling.executeAnonymous(anon);
    } catch (err) {
      throw ctxError(err, 'excute anonymous');
    }
  }

  private writeValid(classes: ClassInfo[]): void {
    const byNamespace: Map<string, ClassInfo[]> = new Map();

    for (const cls of classes) {
      if (cls.IsValid && cls.Body != '(hidden)') {
        let namespaceClasses = byNamespace.get(cls.NamespacePrefix);
        if (namespaceClasses == undefined) {
          namespaceClasses = [];
          byNamespace.set(cls.NamespacePrefix, namespaceClasses);
        }
        namespaceClasses.push(cls);
      }
    }

    byNamespace.forEach((namespaceClasses, namespace) => {
      const targetDirectory = namespace == null ? 'unmanaged' : namespace;
      for (const cls of namespaceClasses) {
        this.stubFS.newFile(
          path.join(targetDirectory, 'classes', `${cls.Name}.cls`),
          cls.Body
        );
      }
    });
  }
}

interface ClassInfo {
  Name: string;
  NamespacePrefix: string;
  IsValid: boolean;
  Body: string;
}

export interface AnonymousResult {
  success: boolean;
  exceptionMessage?: string;
  exceptionStackTrace?: string;
}
