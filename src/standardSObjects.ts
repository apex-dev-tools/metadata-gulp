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
import * as os from 'os';
import * as fs from 'fs';
import { promisify } from 'util';
import { resolve } from 'path';
import decompress = require('decompress');
import { Connection, Package, RetrieveResult } from 'jsforce';
import { XMLParser } from 'fast-xml-parser';
import { StubFS } from './stubfs';
import { wrapError } from './error';
import { EntityName, SObjectJSON } from './entity';
import rimraf = require('rimraf');

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

export class StandardSObjectReader {
  private connection: Connection;
  private orgNamespace: string | null;
  private namespaces: Set<string>;
  private stubFS: StubFS;

  public constructor(
    connection: Connection,
    orgNamespace: string | null,
    namespaces: string[],
    stubFS: StubFS
  ) {
    this.connection = connection;
    this.orgNamespace = orgNamespace;
    this.namespaces = new Set(namespaces);
    this.stubFS = stubFS;
  }

  public async run(): Promise<Error | void> {
    try {
      const results: Promise<void>[] = [];
      this.namespaces.forEach(namespace => {
        results.push(this.writeByNamespace(namespace));
      });
      await Promise.all(results);
    } catch (err) {
      return wrapError(err);
    }
  }

  private async writeByNamespace(namespace: string): Promise<void> {
    const standardObjectNames = await this.queryStandardObjects(namespace);
    const tmpDir = await this.retrieveCustomObjects(standardObjectNames);

    try {
      const files = await this.getFiles(tmpDir);

      files
        .filter(name => name.endsWith('.object'))
        .forEach(name => {
          const contents = fs.readFileSync(name, 'utf8');

          const fields = this.getFields(name, contents, namespace);
          fields.forEach((value, key) => {
            const fieldName = EntityName.applyField(key)?.defaultNamespace(
              this.orgNamespace
            );
            if (fieldName) {
              this.stubFS.newFile(
                path.join(
                  fieldName.namespace === null
                    ? 'unmanaged'
                    : fieldName.namespace,
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
      rimraf.sync(tmpDir);
    }
  }

  private getFields(
    sObjectName: string,
    contents: string,
    namespace: string
  ): Map<string, string> {
    const parser = new XMLParser();
    const objectContents = parser.parse(contents) as SObjectJSON;
    const fields = objectContents?.CustomObject?.fields;
    if (fields) {
      const isUnmanaged = namespace == 'unmanaged';
      const fieldArray = Array.isArray(fields) ? fields : [fields];
      const namespaceFields = fieldArray.filter(field => {
        const name = EntityName.applyField(field.fullName);
        if (name != null) {
          if (isUnmanaged) {
            return name.namespace === null;
          } else {
            name.defaultNamespace(this.orgNamespace);
            return name.namespace === namespace;
          }
        } else {
          return false;
        }
      });

      const fieldContents = new Map<string, string>();
      let updatedContent = contents;
      if (namespaceFields.length > 0) {
        for (const namespaceField of namespaceFields) {
          const re = new RegExp(
            `<fields>\\s*<fullName>${namespaceField.fullName}<[\\s\\S]*?<\\/fields>`
          );
          updatedContent = updatedContent.replace(re, matched => {
            fieldContents.set(namespaceField.fullName, matched);
            return '';
          });
        }
      }
      return fieldContents;
    } else {
      return new Map<string, string>();
    }
  }

  private async getFiles(dir: string): Promise<string[]> {
    const subdirs = await readdir(dir);
    const files = await Promise.all(
      subdirs.map(async subdir => {
        const res = resolve(dir, subdir);
        return (await stat(res)).isDirectory() ? this.getFiles(res) : [res];
      })
    );
    return files.reduce((a, b) => a.concat(b), []);
  }

  private async queryStandardObjects(namespace: string): Promise<string[]> {
    const clause =
      namespace === 'unmanaged'
        ? "ManageableState = 'unmanaged'"
        : `NamespacePrefix = '${namespace}'`;
    const standardObjects = await this.connection.tooling.query<AggCustomField>(
      `Select Count(Id), TableEnumOrId from CustomField where ${clause} Group By TableEnumOrId`
    );

    return standardObjects.records
      .map(standardObject => standardObject.TableEnumOrId)
      .filter(value => !this.isId(value));
  }

  private async retrieveCustomObjects(names: string[]): Promise<string> {
    const retrievePackage: Package = {
      version: this.connection.version,
      types: [
        {
          members: names,
          name: 'CustomObject',
        },
      ],
    };

    const retrieveOptions = {
      apiVersion: this.connection.version,
      unpackaged: retrievePackage,
    };
    const result = await this.connection.metadata
      .retrieve(retrieveOptions)
      .complete();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gulp'));

    const zipBuffer = Buffer.from(
      (result as unknown as RetrieveResult).zipFile,
      'base64'
    );
    await decompress(zipBuffer, tmpDir);
    return tmpDir;
  }

  private isId(value: string): boolean {
    return (value.length === 15 || value.length === 18) && value[5] === '0';
  }
}

interface AggCustomField {
  TableEnumOrId: string;
}
