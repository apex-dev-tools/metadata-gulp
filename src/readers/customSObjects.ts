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
import * as fs from 'fs';
import { Connection } from 'jsforce';
import { XMLParser } from 'fast-xml-parser';
import { StubFS } from '../util/stubfs';
import { ctxError } from '../util/error';
import { rimrafSync } from 'rimraf';
import { CustomObjectDetail, EntityName, SObjectJSON } from '../util/entity';
import { Logger, LoggerStage } from '../util/logger';
import { getFiles, retrieve } from '../util/retrieve';

export class CustomSObjectReader {
  private logger: Logger;
  private connection: Connection;
  private orgNamespace: string | null;
  private namespaces: Set<string>;
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
    this.namespaces = new Set(namespaces);
    this.stubFS = stubFS;
  }

  public async run(): Promise<void[]> {
    try {
      const results: Promise<void>[] = [];
      this.namespaces.forEach(namespace => {
        results.push(this.writeByNamespace(namespace));
      });
      return await Promise.all(results).finally(() => {
        this.logger.complete(LoggerStage.CUSTOM_SOBJECTS);
      });
    } catch (err) {
      throw ctxError(err, 'Custom SObject');
    }
  }

  private async writeByNamespace(namespace: string): Promise<void> {
    const customObjectNames = await this.queryCustomObjects(namespace);
    this.logger.debug(
      `Found ${customObjectNames.length} custom objects for namespace ${namespace} `
    );
    if (customObjectNames.length == 0) return;
    const tmpDir = await retrieve(this.connection, [
      {
        members: customObjectNames.map(name => name.fullName()),
        name: 'CustomObject',
      },
    ]);
    this.logger.debug(`Retrieved custom objects for namespace ${namespace} `);
    const alienNamespaces = new Set(this.namespaces);
    alienNamespaces.delete(namespace);

    try {
      const files = await getFiles(tmpDir);

      files
        .filter(name => name.endsWith('.object'))
        .forEach(name => {
          const contents = fs.readFileSync(name, 'utf8');

          const split = this.splitFields(contents, namespace, alienNamespaces);
          this.stubFS.newFile(
            path.join(namespace, 'objects', path.basename(name)),
            split[0]
          );
          split[1].forEach((value, key) => {
            const fieldName = EntityName.applyField(key)?.defaultNamespace(
              this.orgNamespace
            );
            if (fieldName) {
              this.stubFS.newFile(
                path.join(
                  fieldName.namespace as string,
                  'objects',
                  path.basename(name).replace(/.object$/, ''),
                  'fields',
                  fieldName.fullName() + '.field-meta.xml'
                ),
                `<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
${value.replace(/^<fields>\s/, '').replace(/\s<\/fields>$/, '')}
</CustomField>`
              );
            }
          });
        });
    } finally {
      rimrafSync(tmpDir, { glob: false });
    }
  }

  private splitFields(
    contents: string,
    namespace: string,
    alienNamespaces: Set<string>
  ): [string, Map<string, string>] {
    const ns = namespace == 'unmanaged' ? null : namespace;
    const parser = new XMLParser();
    const objectContents = parser.parse(contents) as SObjectJSON;
    const fields = objectContents?.CustomObject?.fields;
    if (fields) {
      const fieldArray = Array.isArray(fields) ? fields : [fields];
      const alienFields = fieldArray.filter(field => {
        const name = EntityName.applyField(field.fullName);
        if (name != null) {
          name.defaultNamespace(this.orgNamespace);
          return name.namespace != ns;
        } else {
          return false;
        }
      });

      const alienContent = new Map<string, string>();
      let updatedContent = contents;
      if (alienFields.length > 0) {
        for (const alienField of alienFields) {
          const name = EntityName.applyField(alienField.fullName);
          if (name != null) {
            name.defaultNamespace(this.orgNamespace);

            const re = new RegExp(
              `<fields>\\s*<fullName>${alienField.fullName}<[\\s\\S]*?<\\/fields>`
            );
            updatedContent = updatedContent.replace(re, matched => {
              if (alienNamespaces.has(name.namespace as string))
                alienContent.set(alienField.fullName, matched);
              return '';
            });
          }
        }
      }
      return [updatedContent, alienContent];
    } else {
      return [contents, new Map<string, string>()];
    }
  }

  private async queryCustomObjects(namespace: string): Promise<EntityName[]> {
    try {
      const customObjects = await this.connection.tooling
        .sobject('EntityDefinition')
        .find<CustomObjectDetail>(
          namespace == 'unmanaged'
            ? "Publisher.Name = '<local>'"
            : `NamespacePrefix = '${namespace}'`,
          'QualifiedApiName'
        )
        .execute({ autoFetch: true, maxFetch: 100000 });

      return customObjects
        .map(customObject =>
          EntityName.applySObject(customObject.QualifiedApiName)
        )
        .filter(sobjectName => sobjectName != null) as EntityName[];
    } catch (err) {
      throw ctxError(err, 'query');
    }
  }
}
