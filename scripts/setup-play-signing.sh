#!/usr/bin/env bash
# One-time setup for Play Store bundles. Run it in Google Cloud Shell
# (console.cloud.google.com → the >_ icon), signed in as the project owner.
#
# It creates CardVault's Play upload key inside YOUR Google Cloud project, so
# the key never passes through GitHub, CI logs or anyone else:
#   1. generates the upload keystore (RSA 4096, alias "upload") with a random password
#   2. stores both in Secret Manager; CI's deploy account may read only these two secrets
#   3. makes a private Cloud Storage bucket where CI drops each signed .aab
#      (no public access; files are deleted after 60 days)
#   4. prints the key's fingerprints
# Running it again changes nothing that already exists.
set -euo pipefail

PROJECT=project-1ca83d7c-09d0-46ec-800
DEPLOYER="cardvault-deployer@${PROJECT}.iam.gserviceaccount.com"
BUCKET="gs://${PROJECT}-cardvault-releases"
KEY_SECRET=cardvault-upload-keystore
PASS_SECRET=cardvault-upload-keystore-password
DIR="$HOME/cardvault-upload-key"

gcloud config set project "$PROJECT" >/dev/null
gcloud services enable secretmanager.googleapis.com storage.googleapis.com

if gcloud secrets describe "$KEY_SECRET" >/dev/null 2>&1; then
  echo "✓ Upload key already exists in Secret Manager; leaving it as is."
else
  mkdir -p "$DIR" && chmod 700 "$DIR"
  PASS=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32)
  keytool -genkeypair -noprompt -storetype PKCS12 -keystore "$DIR/upload-keystore.p12" -alias upload \
    -keyalg RSA -keysize 4096 -validity 10000 -storepass "$PASS" -keypass "$PASS" \
    -dname "CN=CardVault upload key, O=CardVault, C=IN"
  printf '%s' "$PASS" > "$DIR/password.txt" && chmod 600 "$DIR"/*
  gcloud secrets create "$KEY_SECRET" --replication-policy=automatic --data-file="$DIR/upload-keystore.p12"
  printf '%s' "$PASS" | gcloud secrets create "$PASS_SECRET" --replication-policy=automatic --data-file=-
  echo "✓ Upload key created and stored in Secret Manager. A copy is in $DIR (only you can read it)."
fi

for s in "$KEY_SECRET" "$PASS_SECRET"; do
  gcloud secrets add-iam-policy-binding "$s" --member="serviceAccount:${DEPLOYER}" \
    --role=roles/secretmanager.secretAccessor >/dev/null
done
echo "✓ CI can read the upload key (and nothing else in Secret Manager)."

if ! gcloud storage buckets describe "$BUCKET" >/dev/null 2>&1; then
  # us-central1 is inside Cloud Storage's always-free 5 GB.
  gcloud storage buckets create "$BUCKET" --location=us-central1 --uniform-bucket-level-access --public-access-prevention
fi
LIFECYCLE=$(mktemp)
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":60}}]}' > "$LIFECYCLE"
gcloud storage buckets update "$BUCKET" --lifecycle-file="$LIFECYCLE" >/dev/null
gcloud storage buckets add-iam-policy-binding "$BUCKET" --member="serviceAccount:${DEPLOYER}" \
  --role=roles/storage.objectAdmin >/dev/null
echo "✓ Private bucket ready: $BUCKET"

if [ -f "$DIR/upload-keystore.p12" ]; then
  echo
  echo "Upload key fingerprints (not secret; Play Console shows them too):"
  keytool -list -v -keystore "$DIR/upload-keystore.p12" -storepass "$(cat "$DIR/password.txt")" | grep -E 'SHA1:|SHA256:'
  echo
  echo "Keep a backup: run   cloudshell download $DIR/upload-keystore.p12 $DIR/password.txt"
  echo "and store both somewhere safe (a password manager). Don't commit or share them."
fi
echo
echo "Done. The next CardVault build puts a signed .aab in $BUCKET"
echo "Find it at https://console.cloud.google.com/storage/browser/${PROJECT}-cardvault-releases"
