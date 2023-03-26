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
import { query } from './soap';
import { createSOAPService } from './soapService';

export class ClassReader {
  private logger: Logger;
  private connection: Connection;
  private namespaces: string[];
  private stubFS: StubFS;
  private queue = new PQueue({ concurrency: 5 });

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
          [...allNamespaces].map(namespace => () =>
            this.queryByNamespace(namespace)
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
    this.logger.debug(
      `Found ${validClasses.length} classes in namespaces ${namespace}`
    );
    const chunks = chunk(validClasses, 200);
    return this.queue.addAll(
      chunks.map(c => () => this.bulkLoadClassesSOAP(namespace, c))
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

  private async bulkLoadClassesSOAP(
    namespace: string,
    ids: string[]
  ): Promise<void> {
    try {
      const url = [
        this.connection.instanceUrl,
        'services/Soap/u',
        this.connection.version,
      ].join('/');
      const idClause = ids.map(id => `'${id}'`).join(', ');
      const queryString = `Select Name, ApiVersion, Body from ApexClass Where Id in (${idClause})`;

      const response = await query<ClassInfoBody>(
        createSOAPService(),
        queryString,
        url,
        this.connection.accessToken
      );
      const classes = response.result?.records || [];
      this.writeValid(namespace, classes);
    } catch (err) {
      throw ctxError(err, 'query chunk');
    }
  }

  private writeValid(namespace: string, classes: ClassInfoBody[]): void {
    const targetDirectory = namespace == null ? 'unmanaged' : namespace;
    let count = 0;
    classes.forEach(cls => {
      const hasBody =
        cls['sf:Body'] &&
        cls['sf:Body'].length > 0 &&
        cls['sf:Body'] != '(hidden)';
      if (hasBody) {
        this.stubFS.newFile(
          path.join(targetDirectory, 'classes', `${cls['sf:Name']}.cls`),
          this.correctBodyIssues(cls['sf:Body'])
        );
        this.stubFS.newFile(
          path.join(
            targetDirectory,
            'classes',
            `${cls['sf:Name']}.cls-meta.xml`
          ),
          this.correctBodyIssues(`<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
  <apiVersion>${cls['sf:ApiVersion']}.0</apiVersion>
  <status>Active</status>
</ApexClass>`)
        );
        count += 1;
      }
    });
    this.logger.debug(`Loaded ${count} classes for namespace ${namespace}`);
  }

  private static webServiceRegex = /@WebService\s*webService/g;
  private static invocableRegEx = /^\s*@Invocable.*\(.*\)$/gm;

  private correctBodyIssues(content: string): string {
    return content
      .replace(ClassReader.webServiceRegex, '')
      .replace(ClassReader.invocableRegEx, '');
  }
}

interface ClassInfoBody {
  'sf:Name': string;
  'sf:ApiVersion': number;
  'sf:Body': string;
}

interface ClassInfoId {
  Id: string;
}
