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
import { ctxError } from '../util/error';
import { Logger, LoggerStage } from '../util/logger';

export class PageReader {
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

  public async run(): Promise<Error | void> {
    try {
      const conditions = this.query();
      if (conditions.length > 0) {
        const pages = await this.connection.tooling
          .sobject('ApexPage')
          .find<PageInfo>(conditions, 'Name, NamespacePrefix, Markup')
          .execute({ autoFetch: true, maxFetch: 100000 });

        this.write(pages);
      }
      this.logger.complete(LoggerStage.PAGES);
    } catch (err) {
      throw ctxError(err, 'Pages query');
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

  private write(pages: PageInfo[]): void {
    const byNamespace: Map<string, PageInfo[]> = new Map();

    for (const page of pages) {
      if (page.Markup != '(hidden)') {
        let namespacePages = byNamespace.get(page.NamespacePrefix);
        if (namespacePages == undefined) {
          namespacePages = [];
          byNamespace.set(page.NamespacePrefix, namespacePages);
        }
        namespacePages.push(page);
      }
    }

    byNamespace.forEach((namespacePages, namespace) => {
      const targetDirectory = namespace == null ? 'unmanaged' : namespace;
      for (const page of namespacePages) {
        this.stubFS.newFile(
          path.join(targetDirectory, 'pages', `${page.Name}.page`),
          page.Markup
        );
      }
    });
  }
}

interface PageInfo {
  Name: string;
  NamespacePrefix: string;
  Markup: string;
}
