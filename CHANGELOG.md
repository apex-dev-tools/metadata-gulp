# metadata-gulp - Changelog

## 3.0.1 - 2023-12-08

* Fix crash from `rimraf` no longer having default export.

## 3.0.0 - 2023-06-23

* Upgrades `@apexdevtools/sfdx-auth-helper` and other dependencies.
* Removes `getDefaultUsername` re-export. Use `AuthHelper` instance instead.
* Now targets `ES2020`.

## Previous Releases

* `2.2.0` - Support webpack of library by removing need for wsdl file
* `2.1.0` - Update README and dependency versions
* `2.0.0` - Move to <https://github.com/apex-dev-tools/metadata-gulp>
* `1.3.0` - Remove illegal @WebService and @Invocable for bad quoting in descriptions
* `1.2.0` - Fixes for class downloading, concurrent requests & memory usage
* `1.1.1` - Fixes for SObject timeout and error on package without namespace
* `1.1.0` - Fix handling for org aliases
* `1.0.0` - Initial version
