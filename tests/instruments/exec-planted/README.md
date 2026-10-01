# exec-planted

Regression fixture for issue #47: a target that tries to run its own code on
the evaluator's machine through two doors: npm lifecycle scripts
(`preinstall`, `postinstall`, `prepare`) and a repo-local `.yarnrc` whose
`yarn-path` names `planted.cjs`. Every door runs the same inert payload, which
leaves a `planted-ran-*` marker beside itself. Nothing here is a secret.
