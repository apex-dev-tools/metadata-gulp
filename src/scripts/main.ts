/*
 Copyright (c) 2023 Kevin Jones, All rights reserved.
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

import { Gulp, Logger, LoggerStage } from '../gulp';

class LocalLogger implements Logger {
  debug(message: string): void {
    console.debug(message);
  }
  complete(stage: LoggerStage): void {
    console.log(`${stage} Complete`);
  }
}

if (process.argv.length != 4) {
  console.log('gulp <dir> <namespace>');
} else {
  const gulp = new Gulp();
  const logger = new LocalLogger();
  console.log(process.argv[1]);

  gulp
    .update(process.argv[2], logger, null, [process.argv[3]], true)
    .then(() => {
      console.log('Complete');
    })
    .catch(err => {
      console.log(err);
    });
}
