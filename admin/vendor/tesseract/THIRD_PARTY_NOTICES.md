# OCR third-party files

The files in this directory are self-hosted so the LeadersPro administrator page does not execute OCR code from a third-party CDN.

- `tesseract.js` 5.1.1 (`tesseract.min.js`, `worker.min.js`)
  - npm shasum: `7bfaca1c103ba0ce3ddf5e101f0692802a01f880`
  - license: Apache-2.0; see `LICENSE.tesseract-js.md`
- `tesseract.js-core` 5.1.1 (`core/*`)
  - npm shasum: `2b6f3ef28dd109bf4efdbc8fff70bd11adac8b85`
  - license: Apache-2.0; see `LICENSE.tesseract-core.txt`
- `@tesseract.js-data/kor` 1.0.0 (`lang/kor.traineddata.gz`)
  - npm shasum: `af4c18b31384e8979ba583496c0445132392fb96`
- `@tesseract.js-data/eng` 1.0.0 (`lang/eng.traineddata.gz`)
  - npm shasum: `285a3f1fb419e8e67bdee93ce288b02bb9097f0a`

Only package assets needed by the browser OCR workflow are deployed. Images selected by an administrator remain in that browser; the public snapshot stores reviewed rows and source filename/dimensions/SHA-256 metadata only.
