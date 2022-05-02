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
import { chunk } from './arrays';
import { Logger, LoggerStage } from './logger';
import { ctxError } from './error';

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

  public async run(): Promise<void[][]> {
    try {
      const allNamespaces = new Set<string>(this.namespaces);
      return Promise.all(
        [...allNamespaces].map(namespace => this.queryByNamespace(namespace))
      ).finally(() => this.logger.complete(LoggerStage.CLASSES));
    } catch (err) {
      throw ctxError(err, 'Classes');
    }
  }

  private async queryByNamespace(namespace: string): Promise<void[]> {
    const classNames = await this.getValidClassNames(namespace);

    const chunks = chunk(classNames, 200);

    return Promise.all(
      chunks.map(chunk => this.queryByChunk(namespace, chunk))
    );
  }

  private async queryByChunk(
    namespace: string,
    chunk: string[]
  ): Promise<void> {
    try {
      const isUnmanged = namespace == 'unmanaged';
      const namespaceClause = isUnmanged
        ? 'NamespacePrefix = null'
        : `NamespacePrefix = '${namespace}`;
      const names = chunk.map(name => `Name='${name}'`).join(' OR ');
      const records = await this.connection.tooling
        .sobject('ApexClass')
        .find<ClassInfo>(
          `Status = 'Active' AND ${namespaceClause} AND (${names})`,
          'Name, NamespacePrefix, IsValid, Body'
        )
        .execute({ autoFetch: true, maxFetch: 100000 });

      const invalid = records
        .filter(cls => cls.IsValid == false)
        .map(cls => cls.Name);
      if (invalid.length > 0) {
        this.logger.debug(
          `Invalid classes, these will be ignored: ${invalid.join(', ')}`
        );
      }
      this.write(records);
    } catch (err) {
      throw ctxError(err, 'query chunk');
    }
  }

  private async getValidClassNames(namespace: string): Promise<string[]> {
    try {
      const isUnmanged = namespace == 'unmanaged';
      const namespaceClause = isUnmanged
        ? 'NamespacePrefix = null'
        : `NamespacePrefix = '${namespace}`;
      const records = await this.connection.tooling
        .sobject('ApexClass')
        .find<ClassInfo>(`Status = 'Active' AND ${namespaceClause}`, 'Name')
        .execute({ autoFetch: true, maxFetch: 100000 });

      const statuses = await this.refreshClasses(
        namespace,
        records.map(cls => cls.Name)
      );

      statuses.map(status => {
        if (!status.success) {
          const exceptionMessage =
            status.exceptionMessage || 'Unknown Exception';
          const exceptionStackTrace =
            status.exceptionStackTrace || 'No stack trace';
          this.logger.debug(
            `Class validation failed: ${exceptionMessage}\n${exceptionStackTrace}`
          );
        }
      });

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

  private write(classes: ClassInfo[]): void {
    const byNamespace: Map<string, ClassInfo[]> = new Map();

    for (const cls of classes) {
      if (cls.Body != '(hidden)') {
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
