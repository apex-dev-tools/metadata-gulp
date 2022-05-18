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

import * as fs from 'fs';
import * as path from 'path';
import { resolve } from 'path';
import { promisify } from 'util';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

export class StubFS {
  private ready: Promise<string[]>;
  private storePath: string;
  private newFiles: Map<string, string> = new Map();

  public constructor(workspacePath: string) {
    this.storePath = this.createStore(workspacePath);
    this.ready = this.getFiles(this.storePath);
  }

  public newFile(filePath: string, contents: string): void {
    this.newFiles.set(filePath, contents);
  }

  public async sync(): Promise<void> {
    // Overwrite files only if they have changed to reduce thrash
    const allFiles = new Set(await this.ready);
    this.newFiles.forEach((contents, filePath) => {
      const targetPath = path.join(this.storePath, filePath);
      const directory = path.dirname(targetPath);
      fs.mkdirSync(directory, { recursive: true });

      if (
        !fs.existsSync(targetPath) ||
        fs.readFileSync(targetPath, 'utf8') != contents
      ) {
        fs.writeFileSync(targetPath, contents);
      }
      allFiles.delete(targetPath);
    });

    // Remove any old files (and directories) we no longer need
    const directories = new Set<string>();
    allFiles.forEach(file => {
      fs.unlinkSync(file);
      directories.add(path.dirname(file));
    });
    this.rmDirs(Array.from(directories.values()));
    this.newFiles.clear();
  }

  private rmDirs(directories: string[]): void {
    const parents = new Set<string>();
    directories.forEach(dir => {
      try {
        fs.rmdirSync(dir);
        parents.add(path.dirname(dir));
      } catch (err) {
        // Not needed
      }
    });
    parents.delete(this.storePath);
    if (parents.size > 0) {
      this.rmDirs(Array.from(parents.values()));
    }
  }

  private createStore(workspacePath: string): string {
    const storeDirectory = path.join(workspacePath, '.apexlink', 'gulp');
    fs.mkdirSync(storeDirectory, { recursive: true });
    return storeDirectory;
  }

  private async getFiles(dir: string): Promise<string[]> {
    const subdirs = await readdir(dir);
    const files: string[][] = await Promise.all(
      subdirs.map(async subdir => {
        const res = resolve(dir, subdir);
        return (await stat(res)).isDirectory() ? this.getFiles(res) : [res];
      })
    );
    return files.reduce((a, b) => a.concat(b), []);
  }
}