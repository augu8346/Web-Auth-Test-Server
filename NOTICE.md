# Third-party notices

Project software is provided under the existing [MIT license](LICENSE).
Dependencies and bundled tooling retain their own licenses.

| Component | License | Use |
|---|---|---|
| Express | MIT | HTTP routing and static/range file serving |
| cookie-parser | MIT | Request cookie parsing |
| node-forge | BSD-3-Clause OR GPL-2.0 | Test certificate generation; BSD option available |
| Playwright / @playwright/test | Apache-2.0 | Development-only browser tests |
| Node.js and Alpine base image | Their included component licenses | Container runtime |

This table lists direct dependencies, not every transitive component. The
lockfile identifies installed versions. `npm ci` retains dependency license files
inside `node_modules`; the Docker image includes those installed runtime packages
and their notices. Preserve those files and the base image's notices when
redistributing an image. Playwright downloads browser binaries separately for
testing; they are not installed in the production image.

The existing `data/cog.tif` is a test dataset. This notice does not establish
additional ownership or redistribution rights for raster data. Confirm the
fixture's provenance before distributing it separately or substituting another
dataset. Do not add third-party or customer data without permission.

GDAL, ArcGIS and standalone Brotli tools are optional external validation tools,
not bundled dependencies. The interface uses local system fonts and no externally
hosted images, fonts or scripts.
