# apexlink-gulp

Salesforce metadata download library. Pulls metadata from an org in a format that can be used with [apex-ls](https://github.com/apex-dev-tools/apex-ls) based tools to perform off-line semantics analysis of Apex code.

To start a download use update() from Gulp:

    async update(
      workspacePath: string,
      logger: Logger,
      connection: JSConnection | null,
      namespaces: string[],
      partialLoad: boolean
    ): Promise<void>

The workspacePath must be the directory where your sfdx-project.json file is located. The metadata is downloaded into a '.apexlink/gulp' directory relative to this.

If you have an open [jsforce](https://github.com/jsforce/jsforce) connection you can pass that, if you pass null a new connection will be created.

Metadata is download independently for each passed namespace. For orgs without a namespace you can use the pseudo namespace _unmanaged_. If partialLoad is false, existing downloaded metadata for namespaces not passed to update() will be removed automatically.

The library also supplies some helper functions that you may find useful.

To obtain the org's default namespace:

    async getOrgNamespace(
        workspacePath: string,
        connection: JSConnection | null
    ): Promise<string | null | undefined> {

This will return string | null on success or undefined if the Organization table can not be queried.

To obtain the namespace & package description for packages with namespaces on the org:

    async getOrgPackageNamespaces(
        workspacePath: string,
        connection: JSConnection | null
    ): Promise<NamespaceInfo[]>

### Building

    npm run build

### History

    2.2.0 - Support webpack of library by removing need for wsdl file
    2.1.0 - Update README and dependency versions
    2.0.0 - Move to https://github.com/apex-dev-tools/metadata-gulp
    1.3.0 - Remove illegal @WebService and @Invocable for bad quoting in descriptions
    1.2.0 - Fixes for class downloading, concurrent requests & memory usage
    1.1.1 - Fixes for SObject timeout and error on package without namespace
    1.1.0 - Fix handling for org aliases
    1.0.0 - Initial version

### License

All the source code included uses a 3-clause BSD license, see LICENSE for details.
