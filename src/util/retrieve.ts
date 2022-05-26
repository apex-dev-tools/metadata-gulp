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

import {
  Connection,
  Package,
  PackageTypeMembers,
  RetrieveRequest,
  RetrieveResult,
} from 'jsforce';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { ctxError } from './error';
import decompress from 'decompress';
import { promisify } from 'util';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

export async function retrieve(
  connection: Connection,
  requests: PackageTypeMembers[]
): Promise<string> {
  try {
    const retrievePackage: Package = {
      version: connection.version,
      types: requests,
    };

    const retrieveOptions: RetrieveRequest = {
      apiVersion: connection.version,
      unpackaged: retrievePackage,
    };
    const result = await connection.metadata
      .retrieve(retrieveOptions)
      .complete();

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gulp'));
    const zipBuffer = Buffer.from(
      (result as unknown as RetrieveResult).zipFile,
      'base64'
    );
    await decompress(zipBuffer, tmpDir);

    return tmpDir;
  } catch (err) {
    throw ctxError(err, 'retrieve');
  }
}

export async function retrievePackage(
  connection: Connection,
  packageName: string
): Promise<string> {
  try {
    let retrieveOptions: RetrieveRequest = {
      apiVersion: connection.version,
      packageNames: [packageName],
      singlePackage: true,
    };
    if (packageName == '') {
      retrieveOptions = {
        apiVersion: connection.version,
        unpackaged: {
          version: connection.version,
          types: [
            {
              members: ['*'],
              name: 'ApexClass',
            },
          ],
        },
      };
    }
    const result = await connection.metadata
      .retrieve(retrieveOptions)
      .complete();

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gulp'));
    const zipBuffer = Buffer.from(
      (result as unknown as RetrieveResult).zipFile,
      'base64'
    );
    await decompress(zipBuffer, tmpDir);

    return tmpDir;
  } catch (err) {
    throw ctxError(err, 'retrieve');
  }
}

export async function getFiles(dir: string): Promise<string[]> {
  try {
    const subdirs = await readdir(dir);
    const files = await Promise.all(
      subdirs.map(async subdir => {
        const res = path.resolve(dir, subdir);
        return (await stat(res)).isDirectory() ? getFiles(res) : [res];
      })
    );

    return files.reduce((a, b) => a.concat(b), []);
  } catch (err) {
    throw ctxError(err, 'file listing');
  }
}
