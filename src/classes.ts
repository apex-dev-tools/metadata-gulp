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
import { Connection, ExecuteAnonymousResult } from 'jsforce';
import { StubFS } from './stubfs';
import { wrapError } from './error';
import { chunk, foldLeft } from './arrays';
import { Logger, LoggerStage } from './logger';

export class ClassReader {
  private logger: Logger;
  private connection: Connection;
  private orgNamespace: string | null;
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
    this.orgNamespace = orgNamespace;
    this.namespaces = namespaces;
    this.stubFS = stubFS;
  }

  public async run(): Promise<Error | null> {
    const allNamespaces = new Set<string>(this.namespaces);
    // TODO: Re-enable?
    // if (this.orgNamespace != null) allNamespaces.add(this.orgNamespace);

    const result = foldLeft<string, Promise<Error | null>>(
      [...allNamespaces],
      Promise.resolve(null)
    )((accum, ns) => {
      return accum.then(
        async err => {
          if (err != null) return err;
          return await this.queryByNamespace(ns);
        },
        err => {
          return wrapError(err);
        }
      );
    });

    result.finally(() => this.logger.complete(LoggerStage.CLASSES));

    return result;
  }

  private async queryByNamespace(namespace: string): Promise<Error | null> {
    const classNames = await this.getValidClassNames(namespace);
    const chunks = chunk(classNames, 200);

    return foldLeft<string[], Promise<Error | null>>(
      chunks,
      Promise.resolve(null)
    )((accum, chunk) => {
      return accum.then(
        async err => {
          if (err != null) return err;
          return await this.queryByChunk(namespace, chunk);
        },
        err => {
          return wrapError(err);
        }
      );
    });
  }

  private async queryByChunk(
    namespace: string,
    chunk: string[]
  ): Promise<Error | null> {
    const names = chunk.map(name => `Name='${name}'`).join(' OR ');
    return this.connection.tooling
      .sobject('ApexClass')
      .find<ClassInfo>(
        `Status = 'Active' AND NamespacePrefix = '${namespace}' AND (${names})`,
        'Name, NamespacePrefix, IsValid, Body'
      )
      .execute({ autoFetch: true, maxFetch: 100000 })
      .then(
        records => {
          const invalid = records
            .filter(cls => cls.IsValid == false)
            .map(cls => cls.Name);
          if (invalid.length > 0) {
            this.logger.error(
              `Invalid classes, these will be ignored: ${invalid.join(', ')}`
            );
          }
          this.write(records);
          return null;
        },
        err => {
          return wrapError(err);
        }
      );
  }

  private async getValidClassNames(namespace: string): Promise<string[]> {
    const records = await this.connection.tooling
      .sobject('ApexClass')
      .find<ClassInfo>(
        `Status = 'Active' AND NamespacePrefix = '${namespace}'`,
        'Name, IsValid'
      )
      .execute({ autoFetch: true, maxFetch: 100000 });

    const invalid = records
      .filter(cls => cls.IsValid == false)
      .map(cls => cls.Name);
    const status = await this.refreshInvalid(namespace, invalid);
    if (!status.success) {
      const exceptionMessage = status.exceptionMessage || 'Unknown Exception';
      const exceptionStackTrace =
        status.exceptionStackTrace || 'No stack trace';
      this.logger.error(
        `Class validation failed: ${exceptionMessage}\n${exceptionStackTrace}`
      );
    }

    return records.map(record => record.Name);
  }

  private async refreshInvalid(
    namespace: string,
    classes: string[]
  ): Promise<AnonymousResult> {
    const chunks = chunk(classes, 50);

    return foldLeft<string[], Promise<AnonymousResult>>(
      chunks,
      Promise.resolve({ success: true })
    )(async (accum, chunk) => {
      const result = await accum;
      if (!result.success) return result;
      const anon = chunk
        .map(cls => `Type.forName('${namespace}.${cls}');`)
        .join('\n');
      return this.connection.tooling.executeAnonymous(anon);
    });
  }

  private write(classes: ClassInfo[]): void {
    const byNamespace: Map<string, ClassInfo[]> = new Map();

    console.log(`Class count: ${classes.length}`);
    console.log(
      `Has it: ${
        classes.find(value => value.Name == 'ffasync_ProcessService') !==
        undefined
          ? 'true'
          : 'false'
      }`
    );

    for (const cls of classes) {
      console.log(`${cls.NamespacePrefix} ${cls.Name} ${cls.Body.length}`);
      if (cls.Body !== '(hidden)') {
        let namespaceClasses = byNamespace.get(cls.NamespacePrefix);
        if (namespaceClasses === undefined) {
          namespaceClasses = [];
          byNamespace.set(cls.NamespacePrefix, namespaceClasses);
        }
        namespaceClasses.push(cls);
      }
    }

    byNamespace.forEach((namespaceClasses, namespace) => {
      const targetDirectory = namespace === null ? 'unmanaged' : namespace;
      for (const cls of namespaceClasses) {
        console.log(`Stub ${cls.Name} ${cls.Body.length}`);
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
