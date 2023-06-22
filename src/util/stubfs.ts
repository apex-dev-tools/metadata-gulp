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

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { resolve } from 'path';
import { promisify } from 'util';
import rimraf from 'rimraf';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

export class StubFS {
  private storePath: string;
  private cachePath: string;
  private onlyNamespaces: string[];
  private newFiles = new Set<string>();

  public constructor(workspacePath: string, onlyNamespaces: string[]) {
    this.storePath = this.createStore(workspacePath);
    this.cachePath = fs.mkdtempSync(path.join(os.tmpdir(), 'gulp'));
    this.onlyNamespaces = onlyNamespaces;
  }

  public newFile(filePath: string, contents: string): void {
    const target = path.join(this.cachePath, filePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
    this.newFiles.add(filePath);
  }

  public async sync(): Promise<void> {
    // Overwrite files only if they have changed to reduce thrash
    const allFiles = new Set(await this.getFiles(this.storePath));
    this.newFiles.forEach(filePath => {
      const sourcePath = path.join(this.cachePath, filePath);
      const contents = fs.readFileSync(sourcePath, 'utf8');

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
      let keep = false;
      if (this.onlyNamespaces.length > 0) {
        const relative = path.relative(this.storePath, file);
        const first: string = relative.split(path.sep)[0];
        if (this.onlyNamespaces.find(ns => ns == first) == undefined)
          keep = true;
      }
      if (!keep) {
        fs.unlinkSync(file);
        directories.add(path.dirname(file));
      }
    });
    this.rmDirs(Array.from(directories.values()));
    this.newFiles.clear();

    // Reset cache
    rimraf.sync(this.cachePath, { glob: false });
    this.cachePath = fs.mkdtempSync(path.join(os.tmpdir(), 'gulp'));
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
