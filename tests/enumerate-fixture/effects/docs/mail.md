# Mail

The app mails through one helper: call sendEmail(to, subject, body) from lib/mailer.mjs.

## Deploy

The release step runs `git push --tags` and then `docker run` on the host.
