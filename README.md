# metadata-gulp

Salesforce metadata download library. Pulls metadata from an org in a format that can be used with [apex-ls](https://github.com/apex-dev-tools/apex-ls) based tools to perform off-line semantics analysis of Apex code.

## Usage

To start a download use update() from Gulp:

```ts
async update(
    workspacePath: string,
    logger: Logger,
    connection: JSConnection | null,
    namespaces: string[],
    partialLoad: boolean
): Promise<void>
```

The workspacePath must be the directory where your sfdx-project.json file is located. The metadata is downloaded into a '.apexlink/gulp' directory relative to this.

If you have an open [jsforce](https://github.com/jsforce/jsforce) connection you can pass that, if you pass null a new connection will be created.

Metadata is download independently for each passed namespace. For orgs without a namespace you can use the pseudo namespace _unmanaged_. If partialLoad is false, existing downloaded metadata for namespaces not passed to update() will be removed automatically.

The library also supplies some helper functions that you may find useful.

To obtain the org's default namespace:

```ts
async getOrgNamespace(
    workspacePath: string,
    connection: JSConnection | null
): Promise<string | null | undefined>
```

This will return string | null on success or undefined if the Organization table can not be queried.

To obtain the namespace & package description for packages with namespaces on the org:

```ts
async getOrgPackageNamespaces(
    workspacePath: string,
    connection: JSConnection | null
): Promise<NamespaceInfo[]>
```

## Development

### Building

This project uses the `pnpm` package manager.

```txt
  pnpm install
  pnpm build
```

To run unit tests:

```txt
  pnpm test
```

To test bundling using webpack:

```txt
  pnpm test:pack
  node test-bundle/bundle.js
```

This should execute without error.

Execute manual test script with [`ts-node`](https://github.com/TypeStrong/ts-node#usage) using the run script:

```txt
  # Run gulp on a project with an existing default org
  pnpm run:script -- ./src/scripts/main.ts <workspaceDir> <namespace | unmanaged>
```

## License

All the source code included uses a 3-clause BSD license, see LICENSE for details.
