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

export class ClassReader {
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

  public async run(): Promise<void[]> {
    try {
      const allNamespaces = new Set<string>(this.namespaces);
      return Promise.all(
        [...allNamespaces].map(namespace => this.queryByNamespace(namespace))
      ).finally(() => this.logger.complete(LoggerStage.CLASSES));
    } catch (err) {
      throw ctxError(err, 'Classes');
    }
  }

  private async queryByNamespace(namespace: string): Promise<void> {
    let unprocessed = await this.getAllClassNames(namespace);

    while (unprocessed.length > 0) {
      this.logger.debug(
        `Downloading ${unprocessed.length} classes for namespace ${namespace}`
      );

      const rejected = await Promise.all(
        chunk(unprocessed, 200).map(chunk =>
          this.bulkLoadClasses(namespace, chunk)
        )
      );

      const invalid: string[] = rejected.reduce(
        (acc, val) => acc.concat(val),
        []
      );
      this.logger.debug(
        `Downloading chunk return ${invalid.length} as invalid`
      );

      unprocessed = invalid;
      await this.refreshClasses(namespace, unprocessed.slice(0, 100));
    }
  }

  private async bulkLoadClasses(
    namespace: string,
    chunk: string[]
  ): Promise<string[]> {
    try {
      const isUnmanged = namespace == 'unmanaged';
      const namespaceClause = isUnmanged
        ? 'NamespacePrefix = null'
        : `NamespacePrefix = '${namespace}'`;
      const names = chunk.map(name => `Name='${name}'`).join(' OR ');
      const records = await this.connection.tooling
        .sobject('ApexClass')
        .find<ClassInfo>(
          `Status = 'Active' AND ${namespaceClause} AND (${names})`,
          'Name, NamespacePrefix, IsValid, Body'
        )
        .execute({ autoFetch: true, maxFetch: 100000 });

      return this.writeValid(records);
    } catch (err) {
      throw ctxError(err, 'query chunk');
    }
  }

  private async getAllClassNames(namespace: string): Promise<string[]> {
    try {
      const isUnmanged = namespace == 'unmanaged';
      const namespaceClause = isUnmanged
        ? 'NamespacePrefix = null'
        : `NamespacePrefix = '${namespace}'`;
      const records = await this.connection.tooling
        .sobject('ApexClass')
        .find<ClassInfo>(`Status = 'Active' AND ${namespaceClause}`, 'Name')
        .execute({ autoFetch: true, maxFetch: 100000 });

      return records.map(record => record.Name);
    } catch (err) {
      throw ctxError(err, 'query valid');
    }
  }

  private async refreshClasses(
    namespace: string,
    classes: string[]
  ): Promise<AnonymousResult[]> {
    try {
      const isUnmanged = namespace == 'unmanaged';
      const chunks = chunk(classes, 50);

      return Promise.all(
        chunks.map(chunk => {
          const anon = chunk
            .map(cls => {
              const fullName = isUnmanged ? cls : `${namespace}.${cls}`;
              return `Type.forName('${fullName}');`;
            })
            .join('\n');
          return this.connection.tooling.executeAnonymous(anon);
        })
      );
    } catch (err) {
      throw ctxError(err, 'excute anonymous');
    }
  }

  private writeValid(classes: ClassInfo[]): string[] {
    const invalid: string[] = [];
    const byNamespace: Map<string, ClassInfo[]> = new Map();

    for (const cls of classes) {
      if (!cls.IsValid) {
        invalid.push(cls.Name);
      } else if (cls.Body != '(hidden)') {
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

    return invalid;
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
