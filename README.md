# apexlink-gulp

Salesforce metadata download library. Pulls metadata from an org in a format the can be used with [apex-link](https://github.com/nawforce/apex-link) to perform off-line semantics analysis of Apex code.

To start a download use update() from Gulp:

    async update(
        workspacePath: string, logger: Logger,
        connection: JSConnection | null,
        namespaces: string[] = []
    ): Promise<void>

The workspacePath must be the location of your sfdx-project.json file. The metadata is downloaded into a '.apexlink/gulp' directory relative to this.

If you have an open [jsforce](https://github.com/jsforce/jsforce) connection you can pass that, if you pass null a new connection will be created.

Metadata is download independently for each passed namespace. For orgs without a namespace you can use the pseudo namespace _unmanaged_. Existing downloaded metadata for namespaces not passed to update() is removed automatically. Passing no namespaces is equivalent to asking for all downloaded metadata to be removed.

To obtain the orgs namespaces you can use:

    async getOrgNamespace(
        workspacePath: string,
        connection: JSConnection | null
    ): Promise<string | null | undefined> {

This will return string | null on success or undefined if the Organization table can not be queried.

### Building

    npm run build

### History

    1.2.0 - Fixes for class downloading, concurrent requests & memory usage
    1.1.1 - Fixes for SObject timeout and error on package without namespace
    1.1.0 - Fix handling for org aliases
    1.0.0 - Initial version

### License

All the source code included uses a 3-clause BSD license, see LICENSE for details.
