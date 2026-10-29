# checkov: a recorded run

`planted-iac.envelope.json` is the runner's envelope (`map/start.mjs` runAdapterInstrument)
from checkov 3.4.0, run by its adapter over three invented files, kept here as text rather
than as files so this tree carries no infrastructure of its own:

- `Dockerfile`: `FROM node:20`, `COPY . /app`, `CMD ["node","/app/server.js"]` (no
  USER, no HEALTHCHECK);
- `main.tf`: one `aws_s3_bucket` with only a `bucket` name (no encryption, versioning,
  logging or public-access block);
- `bad.tf`: an unterminated `aws_s3_bucket` block, which checkov cannot parse.
