The CI deploy copies the exported web app (`app/dist`) here before building
the Docker image, and the server serves it next to the API. Everything else in
this folder is ignored by git.
